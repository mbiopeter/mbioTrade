export type MarketTick = { epoch: number; quote: number; receivedAt: number };
export const MAX_TICK_AGE_MS = 120_000;

/** A connected socket or an old history candle is not evidence of a live price. */
export function isFreshMarketTick(
  tick: MarketTick | null | undefined,
  now = Date.now(),
): tick is MarketTick {
  if (!tick || ![tick.epoch, tick.quote, tick.receivedAt].every(Number.isFinite))
    return false;
  return (
    tick.quote > 0 &&
    tick.epoch > 0 &&
    now - tick.receivedAt <= MAX_TICK_AGE_MS &&
    tick.receivedAt <= now + 1000 &&
    now - tick.epoch * 1000 <= MAX_TICK_AGE_MS &&
    tick.epoch * 1000 <= now + 30_000
  );
}
