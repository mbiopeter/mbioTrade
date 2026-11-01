import type { Candle } from "../types.ts";

export type TradeDirection = "BUY" | "SELL";
export const ENTRY_OPEN_GRACE_MS = 90_000;
const FRAME_SECONDS = 300;
const SWING_WING = 2;

export type FiveMinuteEntry = {
  pullback: boolean;
  twoStrong: boolean;
  continuous: boolean;
  timely: boolean;
  thirdOpenTime: number | null;
  entry: number | null;
  swing: Candle | null;
  stop: number | null;
  target: number | null;
  risk: number | null;
  confirmedFirst: Candle | null;
  confirmedSecond: Candle | null;
  reason: string;
};

export function strongCandle(candle: Candle, direction: TradeDirection): boolean {
  const range = candle.high - candle.low;
  return range > 0 && Number.isFinite(range) &&
    (direction === "BUY" ? candle.close > candle.open : candle.close < candle.open) &&
    Math.abs(candle.close - candle.open) / range >= 0.6 - 1e-12;
}

export function previousSwing(bars: Candle[], direction: TradeDirection): Candle | null {
  const latestCandidate = bars.length - 3 - SWING_WING;
  const earliest = Math.max(SWING_WING, bars.length - 90);
  for (let i = latestCandidate; i >= earliest; i -= 1) {
    const candidate = bars[i];
    const nearby = bars.slice(i - SWING_WING, i + SWING_WING + 1);
    if (nearby.length !== SWING_WING * 2 + 1 ||
      nearby.some((bar, j) => bar.time !== candidate.time + (j - SWING_WING) * FRAME_SECONDS)) {
      continue;
    }
    const confirmed = direction === "BUY"
      ? nearby.every((bar, j) => j === SWING_WING || candidate.low < bar.low)
      : nearby.every((bar, j) => j === SWING_WING || candidate.high > bar.high);
    if (confirmed) return candidate;
  }
  return null;
}

export function inspectFiveMinuteEntry(
  candles: Candle[], direction: TradeDirection, at: number,
): FiveMinuteEntry {
  const closed = candles
    .filter((bar) => Number.isSafeInteger(bar.time) && (bar.time + FRAME_SECONDS) * 1000 <= at)
    .sort((a, b) => a.time - b.time);
  const second = closed.at(-1) ?? null;
  const first = closed.at(-2) ?? null;
  const thirdOpenTime = second ? second.time + FRAME_SECONDS : null;
  const base: FiveMinuteEntry = {
    pullback: false, twoStrong: false, continuous: false, timely: false,
    thirdOpenTime, entry: null, swing: null, stop: null, target: null,
    risk: null, confirmedFirst: first, confirmedSecond: second,
    reason: "Waiting for completed 5-minute candles.",
  };
  if (closed.length < 12 || !first || !second || thirdOpenTime === null) return base;

  const tail = closed.slice(-10);
  const continuous = tail.every((bar, i) => i === 0 || bar.time - tail[i - 1].time === FRAME_SECONDS);
  const priorPullback = closed.slice(-8, -2);
  const pullback = priorPullback.some((bar) => direction === "BUY" ? bar.close < bar.open : bar.close > bar.open);
  const twoStrong = strongCandle(first, direction) && strongCandle(second, direction) &&
    second.time - first.time === FRAME_SECONDS;
  const openedAt = thirdOpenTime * 1000;
  const timely = at >= openedAt && at - openedAt <= ENTRY_OPEN_GRACE_MS;
  const openingBar = candles.find((bar) => bar.time === thirdOpenTime);
  const entry = openingBar && Number.isFinite(openingBar.open) && openingBar.open > 0
    ? openingBar.open : null;
  const swing = previousSwing(closed, direction);
  const stop = swing ? (direction === "BUY" ? swing.low : swing.high) : null;
  const distance = entry !== null && stop !== null
    ? (direction === "BUY" ? entry - stop : stop - entry) : null;
  const risk = distance !== null && Number.isFinite(distance) && distance > 0 ? distance : null;
  const target = entry !== null && risk !== null
    ? entry + (direction === "BUY" ? 2 : -2) * risk : null;
  const parts = { ...base, pullback, twoStrong, continuous, timely, entry, swing, stop, risk, target };

  if (!continuous) return { ...parts, reason: "Recent 5-minute candles are missing or not consecutive." };
  if (!pullback) return { ...parts, reason: `Waiting for a ${direction === "BUY" ? "bearish" : "bullish"} 5-minute pullback.` };
  if (!twoStrong) return { ...parts, reason: `Waiting for two consecutive strong ${direction === "BUY" ? "bullish" : "bearish"} candles (body at least 60% each).` };
  if (!timely) return { ...parts, reason: at < openedAt
    ? "Waiting for the third 5-minute candle to open."
    : "The third-candle entry window has passed; waiting for a new setup." };
  if (entry === null) return { ...parts, reason: "Waiting for the third candle's actual opening price from the feed." };
  if (!swing) return { ...parts, reason: `Waiting for an earlier confirmed 5-minute swing ${direction === "BUY" ? "low" : "high"}.` };
  if (risk === null) return { ...parts, reason: "The earlier swing stop is not on the correct side of entry." };
  return { ...parts, reason: "Two 60%+ candles confirmed; entry at the third candle open, stop at an earlier 5m swing, TP at 2R." };
}
