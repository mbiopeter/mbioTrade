import type { Candle, Timeframe } from "../types";

export const MAX_ANALYSIS_CANDLES = 600;

/** A new live tick must not revive a pattern from before a market/history gap. */
export function isConfirmedHistoryCurrent(
  confirmed: Candle[],
  timeframe: Timeframe,
  atMs = Date.now(),
): boolean {
  const last = confirmed.at(-1);
  if (!last) return false;
  const age = atMs - (last.time + timeframe) * 1000;
  return Number.isFinite(age) && age >= 0 && age <= timeframe * 1000;
}

/** A bar may confirm an entry only after its full timeframe has elapsed. */
export function confirmedMarketCandles(
  candles: Candle[],
  timeframe: Timeframe,
  atMs = Date.now(),
  maximum = MAX_ANALYSIS_CANDLES,
): Candle[] {
  if (!Number.isFinite(atMs) || !Number.isFinite(timeframe) || timeframe <= 0)
    return [];
  const closed = candles.filter(
    (candle) =>
      Number.isFinite(candle.time) &&
      candle.time >= 0 &&
      (candle.time + timeframe) * 1000 <= atMs,
  );
  return maximum === Infinity
    ? closed
    : closed.slice(-Math.max(1, Math.floor(maximum)));
}
