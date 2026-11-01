import type { TrackedSignal } from "../v26-signals.ts";

export const BROWSER_ALERT_HISTORY_KEY = "mbiotraders-browser-alerts-v31";
export const BROWSER_ALERT_HISTORY_LIMIT = 200;

export function browserAlertFor(signal: TrackedSignal) {
  return {
    id: `${signal.symbol}:${signal.id}:open`,
    title: `${signal.direction === "BUY" ? "🟢 BUY" : "🔴 SELL"} ${signal.symbol} · mbioTraders`,
    body: `Entry ${signal.entry.toFixed(4)} · SL ${signal.stop.toFixed(4)} · TP ${signal.target.toFixed(4)} · Risk/Reward 1:2`,
    tag: `mbiotraders-${signal.symbol}-${signal.id}`,
    url: "/",
  };
}

export function parseAlertHistory(input: string | null): string[] {
  if (!input) return [];
  try {
    const parsed: unknown = JSON.parse(input);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length <= 200))]
        .slice(-BROWSER_ALERT_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberBrowserAlert(history: string[], id: string): string[] | null {
  if (history.includes(id)) return null;
  return [...history, id].slice(-BROWSER_ALERT_HISTORY_LIMIT);
}

export function eligibleForNewAlert(signal: TrackedSignal | null, now: number, enabled: boolean): boolean {
  return Boolean(enabled && signal && signal.status === "ACTIVE" &&
    now >= signal.openedAt && now - signal.openedAt <= 90_000);
}
