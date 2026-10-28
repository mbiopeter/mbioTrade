import { DERIV_PUBLIC_WS_URL, MARKET_HISTORY_DAYS } from "./app-config";
import {
  DerivWebSocketClient,
  type WebSocketConnectionState,
} from "./deriv/websocket-client";
import { isRecord } from "./validation";
import type { Candle, MarketClass, MarketSymbol, Timeframe } from "./types";

interface ActiveSymbolsResponse {
  active_symbols?: unknown[];
}

interface CandleHistoryResponse {
  candles?: unknown[];
  history?: { candles?: unknown[] };
}

interface TickResponse {
  tick?: {
    epoch?: number;
    quote?: number;
    symbol?: string;
    underlying_symbol?: string;
  };
  echo_req?: { ticks?: string };
  subscription?: { id?: string };
}

export class DerivPublicClient {
  private readonly client = new DerivWebSocketClient();
  private closed = false;

  async connect(): Promise<void> {
    if (this.closed) throw new Error("The market connection was explicitly closed.");
    await this.client.connect(DERIV_PUBLIC_WS_URL);
  }

  async request<TResponse>(body: Record<string, unknown>): Promise<TResponse> {
    await this.connect();
    return this.client.request<TResponse>(body);
  }

  onConnectionState(handler: (state: WebSocketConnectionState) => void): () => void {
    return this.client.onConnectionState(handler);
  }

  async subscribe(
    body: Record<string, unknown>,
    messageType: string,
    handler: (payload: Record<string, unknown>) => void,
  ): Promise<() => void> {
    // Install a managed subscription even if the first connection failed.
    // The transport restores it after its next successful retry.
    await this.connect().catch(() => undefined);
    if (this.closed) throw new Error("The market connection was explicitly closed.");
    return this.client.subscribe(body, messageType, handler);
  }

  close(): void {
    this.closed = true;
    this.client.close();
  }
}

function marketMatches(symbol: MarketSymbol, marketClass?: MarketClass): boolean {
  const isGold =
    symbol.market === "commodities" &&
    /(XAU|GOLD)/i.test(`${symbol.symbol} ${symbol.name}`);

  if (marketClass === "forex") {
    return symbol.market === "forex";
  }
  if (marketClass === "cryptocurrency") {
    return symbol.market === "cryptocurrency";
  }
  if (marketClass === "metals") {
    return isGold;
  }

  return symbol.market === "forex" || symbol.market === "cryptocurrency" || isGold;
}

export async function fetchSymbols(
  client: DerivPublicClient,
  marketClass?: MarketClass,
): Promise<MarketSymbol[]> {
  const response = await client.request<ActiveSymbolsResponse>({
    active_symbols: "brief",
  });
  const rows = Array.isArray(response.active_symbols) ? response.active_symbols : [];

  return rows
    .filter(isRecord)
    .map((row): MarketSymbol => {
      const symbol = String(row.underlying_symbol ?? row.symbol ?? "");
      const name = String(
        row.underlying_symbol_name ??
          row.display_name ??
          row.underlying_symbol ??
          row.symbol ??
          "Unknown",
      );

      return {
        symbol,
        name,
        market: String(row.market ?? ""),
        submarket: typeof row.submarket === "string" ? row.submarket : undefined,
        type: String(row.underlying_symbol_type ?? row.symbol_type ?? ""),
        pipSize: Number(row.pip_size ?? row.pip) || undefined,
        open: row.exchange_is_open !== 0 && row.is_trading_suspended !== 1,
      };
    })
    .filter((symbol) => Boolean(symbol.symbol) && marketMatches(symbol, marketClass))
    .sort((first, second) => first.name.localeCompare(second.name));
}

function normalizeCandles(response: CandleHistoryResponse): Candle[] {
  const rows = Array.isArray(response.candles)
    ? response.candles
    : Array.isArray(response.history?.candles)
      ? response.history.candles
      : [];

  return rows
    .filter(isRecord)
    .map((row): Candle => ({
      time: Number(row.epoch ?? row.time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }))
    .filter((candle) =>
      [candle.time, candle.open, candle.high, candle.low, candle.close].every(
        Number.isFinite,
      ),
    )
    .sort((first, second) => first.time - second.time);
}

export type CandlePageOptions = {
  count?: number;
  start?: number;
  end?: number | "latest";
};

export async function fetchCandlePage(
  client: DerivPublicClient,
  symbol: string,
  timeframe: Timeframe,
  options: CandlePageOptions = {},
): Promise<Candle[]> {
  const request: Record<string, unknown> = {
    ticks_history: symbol,
    count: Math.max(80, Math.min(5000, options.count ?? 1500)),
    end: options.end ?? "latest",
    style: "candles",
    granularity: timeframe,
    adjust_start_time: 1,
  };

  if (Number.isFinite(options.start)) {
    request.start = options.start;
  }

  const response = await client.request<CandleHistoryResponse>(request);
  return normalizeCandles(response);
}

export async function backfillThreeMonths(
  client: DerivPublicClient,
  symbol: string,
  timeframe: Timeframe,
  seed: Candle[],
  onPage: (candles: Candle[], progress: number) => void,
  cancelled: () => boolean,
): Promise<Candle[]> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const historyStart = Math.floor(
    (Date.now() - MARKET_HISTORY_DAYS * 24 * 60 * 60 * 1000) / 1000,
  );

  let merged = [...seed];
  let end = (merged[0]?.time ?? nowSeconds) - timeframe;
  let pageCount = 0;
  const maxPages = 36;

  while (end > historyStart && pageCount < maxPages && !cancelled()) {
    const page = await fetchCandlePage(client, symbol, timeframe, {
      count: 5000,
      start: historyStart,
      end,
    });

    if (page.length === 0) {
      break;
    }

    const byTime = new Map<number, Candle>();
    for (const candle of page) {
      byTime.set(candle.time, candle);
    }
    for (const candle of merged) {
      byTime.set(candle.time, candle);
    }

    merged = [...byTime.values()].sort((first, second) => first.time - second.time);
    end = (page[0]?.time ?? end) - timeframe;
    pageCount += 1;

    const oldest = merged[0]?.time ?? end;
    const totalRange = Math.max(1, nowSeconds - historyStart);
    const progress = Math.max(0, Math.min(1, (nowSeconds - oldest) / totalRange));
    onPage(merged, progress);

    if (page[0].time <= historyStart || page.length < 50) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 35));
  }

  return merged.filter((candle) => candle.time >= historyStart);
}

export async function subscribeTicks(
  client: DerivPublicClient,
  symbol: string,
  onTick: (tick: { epoch: number; quote: number }) => void,
): Promise<() => void> {
  return client.subscribe({ ticks: symbol }, "tick", (raw) => {
    const response = raw as TickResponse;
    const tickSymbol = response.tick?.underlying_symbol ?? response.tick?.symbol;

    if (tickSymbol !== symbol && response.echo_req?.ticks !== symbol) {
      return;
    }

    const epoch = Number(response.tick?.epoch);
    const quote = Number(response.tick?.quote);
    if (Number.isFinite(epoch) && Number.isFinite(quote)) {
      onTick({ epoch, quote });
    }
  });
}
