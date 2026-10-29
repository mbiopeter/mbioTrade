import type { Candle } from "../types.ts";

/** All prices are provider-supplied, never fabricated or imputed. */
export const INSTRUMENTS = [
  { symbol: "XAUUSD", label: "Gold", sub: "XAU / USD", deriv: "frxXAUUSD", twelve: "XAU/USD", precision: 2 },
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
  provider: "twelvedata" | "deriv";
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
export function parseCandles(rows: unknown, frame: Frame, timeKey: "epoch" | "datetime"): Candle[] {
  if (!Array.isArray(rows)) throw new Error(`Missing ${FRAME_LABELS[frame]} OHLC candles`);
  const seen = new Set<number>();
  const bars: Candle[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string,unknown>;
    const time = timeKey === "epoch" ? num(r.epoch) :
      typeof r.datetime === "string" ? Math.floor(Date.parse(r.datetime.replace(" ","T") + (/[Z+]/.test(r.datetime) ? "" : "Z")) / 1000) : NaN;
    const [open,high,low,close] = [num(r.open),num(r.high),num(r.low),num(r.close)];
    // Reject non-aligned bars rather than rounding them into false timestamps.
    if (!Number.isSafeInteger(time) || time < 0 || time % frame !== 0 || seen.has(time) ||
      ![open,high,low,close].every(v => Number.isFinite(v) && v > 0) ||
      low > Math.min(open,close) || high < Math.max(open,close) || high < low) continue;
    seen.add(time);
    bars.push({time,open,high,low,close});
  }
  bars.sort((a,b)=>a.time-b.time);
  if (bars.length < 60) throw new Error(`${FRAME_LABELS[frame]} data has fewer than 60 valid actual bars`);
  return bars;
}

function validateFrames(frames: FrameSeries): void {
  for (const frame of FRAMES) if (!frames[frame] || frames[frame]!.length < 60)
    throw new Error(`Missing ${FRAME_LABELS[frame]} timeframe; full alignment cannot be checked`);
}

/** Optional preferred provider. API key only in the server environment, never in browser JS. */
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
    // No shared caching with credentials; do not log the URL, key, or upstream body.
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

/** One no-auth public connection requests six exact granularities, matching req_id. */
export async function fetchDeriv(symbol: MarketSymbol, socketFactory?: SocketFactory): Promise<MarketPayload> {
  const instrument = resolveSymbol(symbol)!;
  const factory = socketFactory ?? ((url:string)=> new WebSocket(url) as unknown as WebSocketLike);
  const url = "wss://api.derivws.com/trading/v1/options/ws/public";
  const frames: FrameSeries = {};
  const warnings:string[] = [];
  await new Promise<void>((resolve,reject)=>{
    let settled = false;
    let count = 0;
    let socket:WebSocketLike;
    const timer = setTimeout(()=>finish(new Error("Public market feed timed out")),16000);
    function finish(error?:Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {socket?.close();} catch { /* closed */ }
      error ? reject(error) : resolve();
    }
    try {socket = factory(url);} catch(e) {finish(e instanceof Error?e:new Error("WebSocket unavailable"));return;}
    socket.addEventListener("open",()=> {
      for (const [index,frame] of FRAMES.entries()) {
        try {socket.send(JSON.stringify({ticks_history:instrument.deriv,style:"candles",granularity:frame,count:260,end:"latest",req_id:100+index}));}
        catch {finish(new Error("Market-data WebSocket send failed"));return;}
      }
    });
    socket.addEventListener("message",(event)=>{
      if(settled)return;
      try {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const payload = JSON.parse(raw) as {req_id?:number;error?:{message?:string};candles?:unknown};
        const index= (payload.req_id ?? 0)-100;
        if (index<0 || index>=FRAMES.length) return;
        const frame = FRAMES[index];
        if (payload.error) warnings.push(`${FRAME_LABELS[frame]} feed unavailable`);
        else {
          try {frames[frame]=parseCandles(payload.candles,frame,"epoch");}
          catch {warnings.push(`${FRAME_LABELS[frame]} history invalid`);}
        }
        count++;
        if(count===FRAMES.length) {
          try {validateFrames(frames);finish();} catch(e) {finish(e as Error);}
        }
      } catch {/* Ignore unexpected/unrelated messages. */}
    });
    socket.addEventListener("error",()=>finish(new Error("Public market socket connection failed")));
    socket.addEventListener("close",()=>{if (!settled)finish(new Error("Market-data socket closed before replies"));});
  });
  return {
    symbol,provider:"deriv",providerName:"Deriv · public streaming market",
    sourceNote:"Public Deriv market data, no account or API key. Candles are refreshed and live quotes stream through a separate public connection. Quotes may differ from other brokers.",
    fetchedAt:Date.now(),frames,warnings,streamSymbol:instrument.deriv,
  };
}

/** Never mix providers within a signal; use Deriv only if Twelve Data is unavailable. */
export async function fetchMarket(symbol: MarketSymbol, key = process.env.TWELVE_DATA_API_KEY ?? ""): Promise<MarketPayload> {
  if (key.trim()) {
    try {return await fetchTwelveData(symbol,key.trim());}
    catch {const fallback=await fetchDeriv(symbol);fallback.warnings.push("Preferred provider unavailable; using public Deriv history. Configure or review TWELVE_DATA_API_KEY to restore Twelve Data.");return fallback;}
  }
  const fallback=await fetchDeriv(symbol);
  fallback.warnings.push("No Twelve Data key configured. Using the free unauthenticated market feed.");
  return fallback;
}
