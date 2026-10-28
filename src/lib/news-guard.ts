import { hasNewsRisk } from "./strategy-engine/signal";
import type { NewsEvent } from "./types";

/** Live execution checks wall-clock time; backtests retain candle-time semantics. */
export function newsAllowsAutomaticEntry(
  enabled: boolean,
  ready: boolean,
  symbol: string,
  events: NewsEvent[],
  now = Date.now(),
): boolean {
  return !enabled || (ready && !hasNewsRisk(symbol, events, now));
}
