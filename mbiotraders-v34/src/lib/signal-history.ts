import type { TrackedSignal } from "./v26-signals.ts";
import type { MarketSymbol } from "./v22/market.ts";

export const RECENT_SIGNAL_LIMIT = 100;
export const SIGNALS_PER_PAGE = 2;

export type SignalHistory = Partial<Record<MarketSymbol, TrackedSignal[]>>;

function isCompleted(signal: TrackedSignal): boolean {
  return (
    (signal.status === "TP" || signal.status === "SL") &&
    Number.isSafeInteger(signal.closedAt) &&
    signal.closedAt !== null &&
    signal.closedAt >= signal.openedAt &&
    signal.resultR !== null &&
    Number.isFinite(signal.resultR)
  );
}

export function recentSignals(
  history: SignalHistory,
  limit = RECENT_SIGNAL_LIMIT,
): TrackedSignal[] {
  const unique = new Map<string, TrackedSignal>();

  for (const records of Object.values(history)) {
    for (const signal of records ?? []) {
      if (!isCompleted(signal)) continue;
      const key = `${signal.symbol}:${signal.id}`;
      const previous = unique.get(key);
      if (!previous || (signal.closedAt ?? 0) > (previous.closedAt ?? 0)) {
        unique.set(key, signal);
      }
    }
  }

  return [...unique.values()]
    .sort((first, second) =>
      (second.closedAt ?? 0) - (first.closedAt ?? 0) ||
      second.openedAt - first.openedAt ||
      first.symbol.localeCompare(second.symbol) ||
      first.id.localeCompare(second.id),
    )
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function retainRecentSignals(
  history: SignalHistory,
  limit = RECENT_SIGNAL_LIMIT,
): SignalHistory {
  const remaining: SignalHistory = {};
  const recent = recentSignals(history, limit);

  for (const signal of [...recent].reverse()) {
    const records = remaining[signal.symbol] ?? [];
    remaining[signal.symbol] = [...records, signal];
  }

  return remaining;
}

export function signalPage(
  signals: TrackedSignal[],
  page: number,
  size = SIGNALS_PER_PAGE,
) {
  const perPage = Math.max(1, Math.floor(size));
  const pageCount = Math.max(1, Math.ceil(signals.length / perPage));
  const selectedPage = Math.min(
    Math.max(0, Math.floor(Number.isFinite(page) ? page : 0)),
    pageCount - 1,
  );
  const first = selectedPage * perPage;

  return {
    items: signals.slice(first, first + perPage),
    page: selectedPage,
    pageCount,
    total: signals.length,
    from: signals.length ? first + 1 : 0,
    to: Math.min(first + perPage, signals.length),
  };
}

export function formatSignalResult(signal: TrackedSignal): string {
  const amount = signal.resultR;
  if (amount === null || !Number.isFinite(amount)) return signal.status;
  return `${signal.status} ${amount > 0 ? "+" : ""}${amount.toFixed(2)}R`;
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function exportSignalsCsv(signals: TrackedSignal[]): string {
  const header = "Time,Direction,Pair,Result";
  const records = signals.map((signal) =>
    [
      new Date(signal.openedAt).toISOString(),
      signal.direction,
      signal.symbol,
      formatSignalResult(signal),
    ].map(csvCell).join(","),
  );

  return [header, ...records].join("\r\n") + "\r\n";
}
