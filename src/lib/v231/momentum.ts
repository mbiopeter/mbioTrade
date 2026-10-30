import type { Candle } from "../types.ts";
import type { Frame, FrameSeries } from "../v22/market.ts";

export const MOMENTUM_WINDOWS = [3, 5, 7] as const;
export type MomentumDays = (typeof MOMENTUM_WINDOWS)[number];
export const HIGHER_FRAMES = [3600, 14400, 86400] as const;
export type HigherFrame = (typeof HIGHER_FRAMES)[number];
export type MomentumDirection = "BUY" | "SELL" | "NEUTRAL";

export type MomentumReading = {
  direction: MomentumDirection;
  changePct: number | null;
  strength: number;
  bars: number;
  start: number | null;
  end: number | null;
  reason: string;
};
export type MomentumSummary = {
  days: MomentumDays;
  bias: MomentumDirection;
  complete: boolean;
  readings: Record<HigherFrame, MomentumReading>;
  start: number | null;
  end: number | null;
};

const DAY = 86_400;
const EMPTY = (reason: string): MomentumReading => ({
  direction: "NEUTRAL", changePct: null, strength: 0, bars: 0,
  start: null, end: null, reason,
});







export function analyzeHigherMomentum(
  frames: FrameSeries,
  at = Date.now(),
  days: MomentumDays = 5,
): MomentumSummary {
  if (!MOMENTUM_WINDOWS.includes(days)) throw new Error("Momentum window must be 3, 5 or 7 days");
  const closedDaily = (frames[86400] ?? [])
    .filter((bar) => Number.isSafeInteger(bar.time) && (bar.time + DAY) * 1000 <= at)
    .sort((a, b) => a.time - b.time);
  const sessions = closedDaily.slice(-days);
  const readings = {} as Record<HigherFrame, MomentumReading>;
  if (sessions.length !== days) {
    for (const frame of HIGHER_FRAMES) readings[frame] = EMPTY(`Need ${days} fully completed daily sessions`);
    return { days, bias: "NEUTRAL", complete: false, readings, start: null, end: null };
  }
  const start = sessions[0].time;
  const end = sessions[sessions.length - 1].time + DAY;
  const selectedDates = new Set(sessions.map((s) => s.time));
  const dailyRanges = sessions.map((s) => s.high - s.low);
  const avgDailyRange = dailyRanges.reduce((sum, r) => sum + r, 0) / dailyRanges.length;

  for (const frame of HIGHER_FRAMES) {
    const bars = (frames[frame] ?? [])
      .filter((bar) => Number.isSafeInteger(bar.time) &&
        (bar.time + frame) * 1000 <= at &&
        bar.time >= start && bar.time + frame <= end &&
        selectedDates.has(Math.floor(bar.time / DAY) * DAY))
      .sort((a, b) => a.time - b.time);
    const minPerSession = frame === 3600 ? 16 : frame === 14400 ? 4 : 1;
    const enoughCoverage = sessions.every((session) =>
      bars.filter((bar) => bar.time >= session.time && bar.time + frame <= session.time + DAY).length >= minPerSession,
    );
    if (!enoughCoverage) {
      readings[frame] = EMPTY(`Incomplete ${frame === 3600 ? "H1" : frame === 14400 ? "H4" : "D1"} history across ${days} trading sessions`);
      continue;
    }
    const open = bars[0].open;
    const close = bars[bars.length - 1].close;
    const change = close - open;
    const changePct = open > 0 ? 100 * change / open : null;
    const closes = bars.map((bar) => bar.close);

    const midX = (closes.length - 1) / 2;
    const midY = closes.reduce((sum, n) => sum + n, 0) / closes.length;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < closes.length; i += 1) {
      numerator += (i - midX) * (closes[i] - midY);
      denominator += (i - midX) ** 2;
    }
    const slope = denominator > 0 ? numerator / denominator : 0;
    const significant = avgDailyRange > 0 && Math.abs(change) >= avgDailyRange * 0.28;
    const direction: MomentumDirection = significant && slope * change > 0
      ? change > 0 ? "BUY" : "SELL"
      : "NEUTRAL";
    readings[frame] = {
      direction,
      changePct,
      strength: avgDailyRange > 0 ? Math.min(100, Math.round(Math.abs(change) / avgDailyRange * 30)) : 0,
      bars: bars.length,
      start,
      end,
      reason: direction === "NEUTRAL"
        ? `No clear directional momentum across ${days} completed trading sessions`
        : `${direction === "BUY" ? "Rising" : "Falling"} closes and cumulative price change across ${days} completed trading sessions`,
    };
  }
  const complete = HIGHER_FRAMES.every((frame) => readings[frame].changePct !== null);
  const directions = HIGHER_FRAMES.map((frame) => readings[frame].direction);
  const bias = complete && directions.every((direction) => direction === "BUY") ? "BUY"
    : complete && directions.every((direction) => direction === "SELL") ? "SELL"
    : "NEUTRAL";
  return { days, bias, complete, readings, start, end };
}
