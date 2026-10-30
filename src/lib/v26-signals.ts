import { atr } from "./indicators.ts";
import type { Candle } from "./types.ts";
import type { MarketSymbol } from "./v22/market.ts";

export type Direction = "BUY" | "SELL";
export type TrackedSignal = {
  id: string;
  symbol: MarketSymbol;
  provider: "deriv" | "twelvedata";
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  openedAt: number;
  confidence: number;
  status: "ACTIVE" | "SL" | "TP";
  lastCheckedAt: number;
  closedAt: number | null;
  exitPrice: number | null;
  resultR: number | null;
};
export type Pending = {
  id: string;
  symbol: MarketSymbol;
  direction: Direction;
  level: number;
  createdAt: number;
  confidence: number;
};
export type Ledger = {
  version: 26;
  active: Partial<Record<MarketSymbol, TrackedSignal>>;
  pending: Partial<Record<MarketSymbol, Pending>>;
  history: Partial<Record<MarketSymbol, TrackedSignal[]>>;
  seen: Partial<Record<MarketSymbol, string[]>>;
};


export const LEDGER_KEY = "mbiotraders-signals-v26";
export const emptyLedger = (): Ledger => ({
  version: 26,
  active: {},
  pending: {},
  history: {},
  seen: {},
});

const markets = [
  "XAUUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
] as const;

function valid(value: unknown): value is TrackedSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<TrackedSignal>;
  const validPrices = [signal.entry, signal.stop, signal.target].every(
    (number) => typeof number === "number" && Number.isFinite(number) && number > 0,
  );
  const validDirection = signal.direction === "BUY" || signal.direction === "SELL";
  const orderedPrices =
    validPrices &&
    (signal.direction === "BUY"
      ? signal.stop! < signal.entry! && signal.entry! < signal.target!
      : signal.target! < signal.entry! && signal.entry! < signal.stop!);

  return (
    typeof signal.id === "string" &&
    markets.includes(signal.symbol as MarketSymbol) &&
    (signal.provider === "deriv" || signal.provider === "twelvedata") &&
    validDirection &&
    ["ACTIVE", "SL", "TP"].includes(signal.status ?? "") &&
    Number.isSafeInteger(signal.openedAt) &&
    Number.isSafeInteger(signal.lastCheckedAt) &&
    orderedPrices
  );
}


export function parseLedger(raw: string | null): Ledger {
  try {
    const data = JSON.parse(raw ?? "null");
    if (data?.version !== 26) return emptyLedger();

    const result = emptyLedger();
    for (const market of markets) {
      const active = data.active?.[market];
      if (valid(active) && active.status === "ACTIVE") {
        result.active[market] = active;
      }
      result.history[market] = (
        Array.isArray(data.history?.[market]) ? data.history[market] : []
      )
        .filter(
          (value: unknown) =>
            valid(value) && value.symbol === market && value.status !== "ACTIVE",
        )
        .slice(-50);
      result.seen[market] = (
        Array.isArray(data.seen?.[market]) ? data.seen[market] : []
      )
        .filter((value: unknown): value is string => typeof value === "string")
        .slice(-100);

      const pending = data.pending?.[market];
      if (
        pending &&
        typeof pending.id === "string" &&
        pending.symbol === market &&
        ["BUY", "SELL"].includes(pending.direction) &&
        Number.isFinite(pending.level) &&
        Number.isFinite(pending.createdAt)
      ) {
        result.pending[market] = pending;
      }
    }
    return result;
  } catch {
    return emptyLedger();
  }
}

export function seen(book: Ledger, symbol: MarketSymbol, id: string) {
  return (
    (book.seen[symbol] ?? []).includes(id) ||
    book.active[symbol]?.id === id ||
    (book.history[symbol] ?? []).some((item) => item.id === id) ||
    book.pending[symbol]?.id === id
  );
}

function remember(book: Ledger, symbol: MarketSymbol, id: string) {
  return [...new Set([...(book.seen[symbol] ?? []), id])].slice(-100);
}

export function activate(book: Ledger, signal: TrackedSignal): Ledger {
  if (book.active[signal.symbol] || seen(book, signal.symbol, signal.id)) {
    return book;
  }
  return {
    ...book,
    active: { ...book.active, [signal.symbol]: signal },
    pending: { ...book.pending, [signal.symbol]: undefined },
    seen: {
      ...book.seen,
      [signal.symbol]: remember(book, signal.symbol, signal.id),
    },
  };
}

export function setPending(book: Ledger, pending: Pending): Ledger {
  if (book.active[pending.symbol] || seen(book, pending.symbol, pending.id)) {
    return book;
  }
  return {
    ...book,
    pending: { ...book.pending, [pending.symbol]: pending },
    seen: {
      ...book.seen,
      [pending.symbol]: remember(book, pending.symbol, pending.id),
    },
  };
}

export function closePending(book: Ledger, symbol: MarketSymbol): Ledger {
  return book.pending[symbol]
    ? { ...book, pending: { ...book.pending, [symbol]: undefined } }
    : book;
}

type PlanOptions = {
  id: string;
  symbol: MarketSymbol;
  provider: "deriv" | "twelvedata";
  direction: Direction;
  entry: number;
  openedAt: number;
  confidence: number;
  five: Candle[];
  fifteen: Candle[];
  hourly: Candle[];
};


export function plan(args: PlanOptions): TrackedSignal | null {
  const { id, symbol, provider, direction, entry, openedAt, confidence } = args;
  const completed = (bars: Candle[], timeframe: number) =>
    bars.filter((bar) => (bar.time + timeframe) * 1000 <= openedAt);

  const five = completed(args.five, 300);
  const fifteen = completed(args.fifteen, 900);
  const hourly = completed(args.hourly, 3600);
  if (
    five.length < 35 ||
    fifteen.length < 25 ||
    hourly.length < 25 ||
    entry <= 0
  ) {
    return null;
  }

  const atr5 = atr(five.slice(-60), 14).at(-1) ?? NaN;
  const atr15 = atr(fifteen.slice(-50), 14).at(-1) ?? NaN;
  const atrH1 = atr(hourly.slice(-50), 14).at(-1) ?? NaN;
  if (![atr5, atr15, atrH1].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }

  const swingExtreme =
    direction === "BUY"
      ? Math.min(...five.slice(-20).map((bar) => bar.low))
      : Math.max(...five.slice(-20).map((bar) => bar.high));
  const swingDistance =
    direction === "BUY"
      ? entry - swingExtreme + 0.35 * atr5
      : swingExtreme - entry + 0.35 * atr5;
  const distance = Math.max(swingDistance, 2.6 * atr5, 1.4 * atr15, 0.55 * atrH1);

  if (!Number.isFinite(distance) || distance <= 0 || distance > 2 * atrH1) {
    return null;
  }

  const sign = direction === "BUY" ? 1 : -1;
  const stop = entry - sign * distance;
  const target = entry + sign * distance * 2;
  if (stop <= 0 || target <= 0) return null;

  return {
    id,
    symbol,
    provider,
    direction,
    entry,
    stop,
    target,
    openedAt,
    confidence,
    status: "ACTIVE",
    lastCheckedAt: openedAt,
    closedAt: null,
    exitPrice: null,
    resultR: null,
  };
}

export function oppositeLevel(
  bars: Candle[],
  direction: Direction,
  at: number,
) {
  const completed = bars
    .filter((bar) => (bar.time + 300) * 1000 < at)
    .slice(-72);
  if (completed.length < 24) return null;
  return direction === "BUY"
    ? Math.max(...completed.map((bar) => bar.high))
    : Math.min(...completed.map((bar) => bar.low));
}

export function nearbyBarrier(
  bars: Candle[],
  direction: Direction,
  entry: number,
  at: number,
) {
  const level = oppositeLevel(bars, direction, at);
  const volatility =
    atr(
      bars.filter((bar) => (bar.time + 300) * 1000 <= at).slice(-55),
      14,
    ).at(-1) ?? 0;
  if (level === null || volatility <= 0) return null;

  const gap = direction === "BUY" ? level - entry : entry - level;
  return gap >= -0.18 * volatility && gap <= 1.25 * volatility
    ? level
    : null;
}

export function confirmedBreakout(
  pending: Pending,
  bars: Candle[],
  at: number,
) {
  if (at - pending.createdAt > 6 * 3_600_000) return null;
  const completed = bars.filter(
    (bar) =>
      (bar.time + 300) * 1000 <= at &&
      (bar.time + 300) * 1000 > pending.createdAt,
  );
  if (completed.length < 2) return null;

  const [first, second] = completed.slice(-2);
  if (second.time - first.time !== 300) return null;

  const volatility =
    atr(
      bars.filter((bar) => (bar.time + 300) * 1000 <= at).slice(-55),
      14,
    ).at(-1) ?? 0;
  if (volatility <= 0) return null;

  const beyond = (close: number) =>
    pending.direction === "BUY"
      ? close > pending.level + 0.18 * volatility
      : close < pending.level - 0.18 * volatility;

  return beyond(first.close) && beyond(second.close)
    ? (second.time + 300) * 1000
    : null;
}


export function reconcile(signal: TrackedSignal, bars: Candle[], at: number) {
  if (signal.status !== "ACTIVE") {
    return { signal, blocked: false, reason: null };
  }

  const ordered = bars
    .filter(
      (bar) =>
        (bar.time + 300) * 1000 <= at &&
        (bar.time + 300) * 1000 > signal.lastCheckedAt,
    )
    .sort((first, second) => first.time - second.time);

  let cursor = signal.lastCheckedAt;
  for (const bar of ordered) {
    if (bar.time * 1000 < cursor) continue;
    if (bar.time * 1000 > cursor) {
      return {
        signal:
          cursor !== signal.lastCheckedAt
            ? { ...signal, lastCheckedAt: cursor }
            : signal,
        blocked: true,
        reason: "Missing real 5-minute candles; signal kept active until history is complete.",
      };
    }

    const sign = signal.direction === "BUY" ? 1 : -1;
    const stopHit = sign === 1
      ? bar.low <= signal.stop
      : bar.high >= signal.stop;
    const targetHit = sign === 1
      ? bar.high >= signal.target
      : bar.low <= signal.target;
    cursor = (bar.time + 300) * 1000;

    if (stopHit || targetHit) {
      const gapStopped = sign * (bar.open - signal.stop) <= 0;
      const exitPrice = stopHit
        ? gapStopped
          ? bar.open
          : signal.stop
        : signal.target;

      return {
        signal: {
          ...signal,
          status: (stopHit ? "SL" : "TP") as "SL" | "TP",
          closedAt: cursor,
          exitPrice,
          lastCheckedAt: cursor,
          resultR: (sign * (exitPrice - signal.entry)) /
            Math.abs(signal.entry - signal.stop),
        },
        blocked: false,
        reason: null,
      };
    }
  }

  return {
    signal:
      cursor !== signal.lastCheckedAt
        ? { ...signal, lastCheckedAt: cursor }
        : signal,
    blocked: false,
    reason: null,
  };
}

export function update(
  ledger: Ledger,
  symbol: MarketSymbol,
  next: TrackedSignal,
): Ledger {
  const previous = ledger.active[symbol];
  if (
    !previous ||
    previous.id !== next.id ||
    (previous.status === next.status &&
      previous.lastCheckedAt === next.lastCheckedAt)
  ) {
    return ledger;
  }

  if (next.status === "ACTIVE") {
    return {
      ...ledger,
      active: { ...ledger.active, [symbol]: next },
    };
  }

  return {
    ...ledger,
    active: { ...ledger.active, [symbol]: undefined },
    history: {
      ...ledger.history,
      [symbol]: [...(ledger.history[symbol] ?? []), next].slice(-50),
    },
  };
}
