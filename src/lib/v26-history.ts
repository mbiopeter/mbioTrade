import type { Candle } from "./types.ts";
import {
  parseCandles,
  resolveSymbol,
  type Frame,
  type MarketSymbol,
} from "./v22/market.ts";

export const TARGET_DAYS = 90;


export const merge = (first: Candle[], second: Candle[]): Candle[] =>
  [
    ...new Map(
      [...first, ...second]
        .filter((candle) => Number.isSafeInteger(candle.time))
        .map((candle) => [candle.time, candle] as const),
    ).values(),
  ].sort((left, right) => left.time - right.time);

export const coverage = (bars: Candle[], now = Date.now()) =>
  bars.length
    ? Math.min(
        TARGET_DAYS,
        Math.max(0, (now / 1000 - bars[0].time) / 86_400),
      )
    : 0;

export async function twelvePage(
  symbol: MarketSymbol,
  frame: Frame,
  before: number,
  key: string,
  count = 3_500,
  fetcher: typeof fetch = fetch,
): Promise<Candle[]> {
  const instrument = resolveSymbol(symbol);
  if (!instrument || !key) {
    throw new Error("Missing server-side Twelve Data API key");
  }

  const intervals: Record<Frame, string> = {
    300: "5min",
    900: "15min",
    1800: "30min",
    3600: "1h",
    14400: "4h",
    86400: "1day",
  };

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", instrument.twelve);
  url.searchParams.set("interval", intervals[frame]);
  url.searchParams.set("outputsize", String(Math.min(4_000, count)));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set(
    "end_date",
    new Date((before - 1) * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " "),
  );
  url.searchParams.set("apikey", key);

  const response = await fetcher(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Historical HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    status?: string;
    values?: unknown;
  };
  if (data.status === "error" || !data.values) {
    throw new Error("Historical source unavailable");
  }
  return parseCandles(data.values, frame, "datetime", 1).filter(
    (candle) => candle.time < before,
  );
}

type HistorySocket = {
  addEventListener: (
    kind: string,
    callback: (event: { data?: unknown }) => void,
  ) => void;
  send: (message: string) => void;
  close: () => void;
};

type SocketFactory = (url: string) => HistorySocket;


export function derivPage(
  symbol: MarketSymbol,
  frame: Frame,
  before: number,
  count = 3_500,
  socketFactory: SocketFactory = (url) =>
    new WebSocket(url) as unknown as HistorySocket,
): Promise<Candle[]> {
  const instrument = resolveSymbol(symbol);
  if (!instrument) throw new Error("Unsupported market");

  return new Promise<Candle[]>((resolve, reject) => {
    let socket: HistorySocket | undefined;
    let done = false;
    const timeout = setTimeout(
      () => finish(new Error("History timed out")),
      17_000,
    );

    function finish(error?: Error, candles: Candle[] = []) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try {
        socket?.close();
      } catch {

      }
      if (error) reject(error);
      else resolve(candles);
    }

    try {
      socket = socketFactory(
        "wss://api.derivws.com/trading/v1/options/ws/public",
      );
    } catch (error) {
      finish(error instanceof Error ? error : new Error("WebSocket failed"));
      return;
    }

    socket.addEventListener("open", () => {
      try {
        socket?.send(
          JSON.stringify({
            ticks_history: instrument.deriv,
            style: "candles",
            granularity: frame,
            count: Math.min(4_000, count),
            end: before - 1,
            req_id: 2601,
          }),
        );
      } catch {
        finish(new Error("History send failed"));
      }
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(String(event.data)) as {
          req_id?: number;
          error?: { message?: string };
          candles?: unknown;
        };
        if (data.req_id !== 2601) return;
        if (data.error) {
          throw new Error(data.error.message ?? "History feed unavailable");
        }

        const candles = parseCandles(
          data.candles ?? [],
          frame,
          "epoch",
          1,
        ).filter((candle) => candle.time < before);
        finish(undefined, candles);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Invalid history"));
      }
    });

    socket.addEventListener("error", () => {
      finish(new Error("Historical socket error"));
    });
    socket.addEventListener("close", () => {
      finish(new Error("Historical socket closed"));
    });
  });
}
