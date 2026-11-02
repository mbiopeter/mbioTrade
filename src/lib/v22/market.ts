import type { Candle } from "../types.ts";


export const INSTRUMENTS = [
  { symbol: "XAUUSD", label: "Gold", sub: "XAU / USD", deriv: "frxXAUUSD", twelve: "XAU/USD", precision: 2 },
  { symbol: "BTCUSD", label: "Bitcoin", sub: "BTC / USD · Crypto", deriv: "", twelve: "BTC/USD", precision: 4 },
  { symbol: "EURUSD", label: "EUR/USD", sub: "Euro / Dollar", deriv: "frxEURUSD", twelve: "EUR/USD", precision: 5 },
  { symbol: "GBPUSD", label: "GBP/USD", sub: "Pound / Dollar", deriv: "frxGBPUSD", twelve: "GBP/USD", precision: 5 },
  { symbol: "USDJPY", label: "USD/JPY", sub: "Dollar / Yen", deriv: "frxUSDJPY", twelve: "USD/JPY", precision: 3 },
  { symbol: "AUDUSD", label: "AUD/USD", sub: "Aussie / Dollar", deriv: "frxAUDUSD", twelve: "AUD/USD", precision: 5 },
  { symbol: "USDCAD", label: "USD/CAD", sub: "Dollar / Loonie", deriv: "frxUSDCAD", twelve: "USD/CAD", precision: 5 },
] as const;
export type MarketSymbol = (typeof INSTRUMENTS)[number]["symbol"];
export const FRAMES = [300, 900, 1800, 3600, 14400, 86400] as const;
export type Frame = (typeof FRAMES)[number];
export const FRAME_LABELS: Record<Frame,string> = {
  300: "5m", 900: "15m", 1800: "30m", 3600: "1H", 14400: "4H", 86400: "1D",
};
export type FrameSeries = Partial<Record<Frame,Candle[]>>;
export type MarketPayload = {
  symbol: MarketSymbol;
  provider: "twelvedata" | "deriv" | "kraken";
  providerName: string;
  sourceNote: string;
  fetchedAt: number;
  frames: FrameSeries;
  warnings: string[];
  streamSymbol: string | null;
};
export function resolveSymbol(value: string | null): (typeof INSTRUMENTS)[number] | null {
  return INSTRUMENTS.find(item => item.symbol === value) ?? null;
}
export function isFrame(value: number): value is Frame {
  return FRAMES.includes(value as Frame);
}
function num(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return NaN;
  return Number(value);
}
export function parseCandles(rows: unknown, frame: Frame, timeKey: "epoch" | "datetime", minBars = 60): Candle[] {
  if (!Array.isArray(rows)) throw new Error(`Missing ${FRAME_LABELS[frame]} OHLC candles`);
  const seen = new Set<number>();
  const bars: Candle[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string,unknown>;
    const time = timeKey === "epoch" ? num(r.epoch) :
      typeof r.datetime === "string" ? Math.floor(Date.parse(r.datetime.replace(" ","T") + (/[Z+]/.test(r.datetime) ? "" : "Z")) / 1000) : NaN;
    const [open,high,low,close] = [num(r.open),num(r.high),num(r.low),num(r.close)];

    if (!Number.isSafeInteger(time) || time < 0 || time % frame !== 0 || seen.has(time) ||
      ![open,high,low,close].every(v => Number.isFinite(v) && v > 0) ||
      low > Math.min(open,close) || high < Math.max(open,close) || high < low) continue;
    seen.add(time);
    bars.push({time,open,high,low,close});
  }
  bars.sort((a,b)=>a.time-b.time);
  if (bars.length < minBars) throw new Error(`${FRAME_LABELS[frame]} data has fewer than 60 valid actual bars`);
  return bars;
}

export function parseKrakenRows(rows: unknown, frame: Frame, minBars = 60): Candle[] {
  if (!Array.isArray(rows)) throw new Error(`Missing Kraken ${FRAME_LABELS[frame]} candles`);
  const normalized = rows.map((row) => {
    if (!Array.isArray(row) || row.length < 5) return null;
    return { epoch: row[0], open: row[1], high: row[2], low: row[3], close: row[4] };
  });
  return parseCandles(normalized, frame, "epoch", minBars);
}

export function parseKrakenTicker(payload: unknown, at = Date.now(), symbol = "BTC/USD"):
  { price: number; at: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { channel?: unknown; data?: unknown };
  if (value.channel !== "ticker" || !Array.isArray(value.data)) return null;
  const tick = value.data.find((entry) => !!entry && typeof entry === "object" &&
    (entry as { symbol?: unknown }).symbol === symbol) as
    { last?: unknown; timestamp?: unknown } | undefined;
  if (!tick || typeof tick.timestamp !== "string") return null;
  const price = Number(tick.last);
  const time = Date.parse(tick.timestamp);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(time) ||
      Math.abs(time - at) > 120_000) return null;
  return { price, at: time };
}

export async function fetchKraken(
  symbol: "BTCUSD", fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<MarketPayload> {
  const frames: FrameSeries = {};
  const intervals: Record<Frame, number> = {
    300: 5, 900: 15, 1800: 30, 3600: 60, 14400: 240, 86400: 1440,
  };
  for (const [index, frame] of FRAMES.entries()) {
    if (index > 0) await pause(1_100);
    const url = new URL("https://api.kraken.com/0/public/OHLC");
    url.searchParams.set("pair", "XBTUSD");
    url.searchParams.set("interval", String(intervals[frame]));
    const response = await fetcher(url.toString(), {
      cache: "no-store", signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Kraken OHLC HTTP ${response.status}`);
    const data = await response.json() as {
      error?: unknown; result?: Record<string, unknown>;
    };
    if (!Array.isArray(data.error) || data.error.length || !data.result ||
        typeof data.result !== "object") {
      throw new Error(`Kraken OHLC unavailable for ${FRAME_LABELS[frame]}`);
    }
    const rows = Object.entries(data.result).find(([key, values]) =>
      key !== "last" && Array.isArray(values))?.[1];
    frames[frame] = parseKrakenRows(rows, frame);
  }
  validateFrames(frames);
  return {
    symbol,
    provider: "kraken",
    providerName: "Kraken · BTC/USD spot",
    sourceNote: "Kraken public spot BTC/USD, 24/7. Up to 720 recent candles per timeframe (older bars cannot be requested from this feed). Latest candle is in-progress; confirmation uses completed candles only. Quotes stream via Kraken public ticker.",
    fetchedAt: Date.now(), frames, warnings: [], streamSymbol: "BTC/USD",
  };
}

function validateFrames(frames: FrameSeries): void {
  for (const frame of FRAMES) if (!frames[frame] || frames[frame]!.length < 60)
    throw new Error(`Missing ${FRAME_LABELS[frame]} timeframe; full alignment cannot be checked`);
}


export async function fetchTwelveData(symbol: MarketSymbol, key: string, fetcher: typeof fetch = fetch): Promise<MarketPayload> {
  const instrument = resolveSymbol(symbol)!;
  const intervals: Record<Frame,string> = {300:"5min",900:"15min",1800:"30min",3600:"1h",14400:"4h",86400:"1day"};
  const frames: FrameSeries = {};
  const results = await Promise.all(FRAMES.map(async frame => {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol",instrument.twelve);
    url.searchParams.set("interval",intervals[frame]);
    url.searchParams.set("outputsize","260");
    url.searchParams.set("timezone","UTC");
    url.searchParams.set("apikey",key);

    const response = await fetcher(url.toString(), {cache:"no-store",signal:AbortSignal.timeout(10_000)});
    if (!response.ok) throw new Error(`Twelve Data HTTP ${response.status}`);
    const payload = await response.json() as {values?:unknown; status?:string; code?:number; message?:string};
    if (payload.status === "error" || !payload.values) throw new Error(`Twelve Data ${payload.code ?? "unavailable"}`);
    return [frame,parseCandles(payload.values,frame,"datetime")] as const;
  }));
  for (const [frame,bars] of results) frames[frame]=bars;
  validateFrames(frames);
  return {
    symbol,provider:"twelvedata",providerName:"Twelve Data · OHLC snapshots",
    sourceNote:"Twelve Data timestamps are UTC. Updated by polling; free-tier feeds may be delayed or rate-limited. This is not a tick stream.",
    fetchedAt:Date.now(),frames,warnings:[],streamSymbol:null,
  };
}

type WebSocketLike = {
  addEventListener: (name:string, handler:(event: {data?:unknown})=>void) => void;
  send: (message:string)=>void;
  close:()=>void;
};
type SocketFactory = (url:string)=>WebSocketLike;


export async function fetchDeriv(symbol: MarketSymbol, socketFactory?: SocketFactory): Promise<MarketPayload> {
  const instrument = resolveSymbol(symbol)!;
  const factory = socketFactory ?? ((url:string)=> new WebSocket(url) as unknown as WebSocketLike);
  const url = "wss://api.derivws.com/trading/v1/options/ws/public";
  const frames: FrameSeries = {};
  const warnings: string[] = [];
  await new Promise<void>((resolve,reject)=>{
    let settled = false;
    let socket: WebSocketLike | undefined;
    let sendTimer: ReturnType<typeof setTimeout> | undefined;
    const answered = new Set<number>();
    const timer = setTimeout(()=>finish(new Error("Deriv public market feed timed out before all six timeframes arrived")),16000);
    function finish(error?:Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sendTimer !== undefined) clearTimeout(sendTimer);
      try { socket?.close(); } catch { }
      error ? reject(error) : resolve();
    }
    try { socket = factory(url); }
    catch(error) { finish(error instanceof Error ? error : new Error("Deriv WebSocket unavailable")); return; }
    socket.addEventListener("open",()=> {
      let index = 0;
      const sendNext = () => {
        if (settled || !socket || index >= FRAMES.length) return;
        const frame = FRAMES[index];
        try {
          socket.send(JSON.stringify({
            ticks_history:instrument.deriv,
            style:"candles",
            granularity:frame,
            count:260,
            end:"latest",
            adjust_start_time:1,
            req_id:100+index,
          }));
        } catch { finish(new Error(`Deriv ${FRAME_LABELS[frame]} candle request failed`)); return; }
        index++;
        if (index < FRAMES.length) sendTimer = setTimeout(sendNext, 140);
      };
      sendNext();
    });
    socket.addEventListener("message",event=>{
      if (settled) return;
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const payload = JSON.parse(raw) as {
          req_id?:number;
          error?:{message?:string;code?:string};
          candles?:unknown;
        };
        const index = (payload.req_id ?? 0) - 100;
        if (!Number.isInteger(index) || index < 0 || index >= FRAMES.length) {
          if (payload.error) {
            const message = String(payload.error.message ?? payload.error.code ?? "Deriv request rejected");
            finish(new Error(`Deriv: ${message.slice(0,160)}`));
          }
          return;
        }
        if (answered.has(index)) return;
        const frame = FRAMES[index];
        if (payload.error) {
          const message = String(payload.error.message ?? payload.error.code ?? "Deriv data unavailable");
          finish(new Error(`Deriv: ${FRAME_LABELS[frame]}: ${message.slice(0,160)}`));
          return;
        }
        try { frames[frame] = parseCandles(payload.candles,frame,"epoch"); }
        catch(error) {
          const reason = error instanceof Error ? error.message : "Invalid candles";
          finish(new Error(`Deriv: ${FRAME_LABELS[frame]} history invalid: ${reason.slice(0,160)}`));
          return;
        }
        answered.add(index);
        if (answered.size === FRAMES.length) {
          try { validateFrames(frames); finish(); }
          catch(error) { finish(error instanceof Error ? error : new Error("Incomplete timeframe data")); }
        }
      } catch { }
    });
    socket.addEventListener("error",()=>finish(new Error("Deriv public WebSocket connection failed")));
    socket.addEventListener("close",()=>{
      if (!settled) finish(new Error(`Deriv socket closed with ${answered.size} of 6 verified timeframes`));
    });
  });
  return {
    symbol, provider:"deriv", providerName:"Deriv · public streaming market",
    sourceNote:"Public Deriv market data, no account or API key. Candles are refreshed and live quotes stream through a separate public connection. Quotes may differ from other brokers.",
    fetchedAt:Date.now(), frames, warnings, streamSymbol:instrument.deriv,
  };
}


export async function fetchMarket(symbol: MarketSymbol): Promise<MarketPayload> {
  if (symbol === "BTCUSD") return fetchKraken(symbol);
  return fetchDeriv(symbol);
}
