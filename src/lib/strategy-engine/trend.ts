import { atr, ema } from "../indicators";
import type { Candle, Direction } from "../types";

export const TREND_MIN_CANDLES = 205;

export interface TrendState {
  direction: Direction;
  reason: string;
  ema50: number | null;
  ema200: number | null;
  atr: number | null;
  confirmedAt: number | null;
  requiredCandles: number;
}

/** Shared gate for confirmed candles. Callers must remove an unfinished bar. */
export function getTrendState(candles: Candle[]): TrendState {
  const state: TrendState = {
    direction: "WAIT",
    reason: `Need at least ${TREND_MIN_CANDLES} completed candles for the EMA50/200 trend filter.`,
    ema50: null,
    ema200: null,
    atr: null,
    confirmedAt: candles.at(-1)?.time ?? null,
    requiredCandles: TREND_MIN_CANDLES,
  };
  if (candles.length < TREND_MIN_CANDLES) return state;

  const valid = candles.every(
    (candle, index) =>
      [candle.time, candle.open, candle.high, candle.low, candle.close].every(
        (value) => Number.isFinite(value) && value > 0,
      ) &&
      candle.high >= Math.max(candle.open, candle.close) &&
      candle.low <= Math.min(candle.open, candle.close) &&
      candle.low <= candle.high &&
      (index === 0 || candle.time > candles[index - 1].time),
  );
  if (!valid) {
    return {
      ...state,
      reason: "Trend unavailable: candle data is invalid or out of order.",
    };
  }

  const index = candles.length - 1;
  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, 50);
  const slow = ema(closes, 200);
  const volatility = atr(candles, 14)[index];
  state.ema50 = fast[index];
  state.ema200 = slow[index];
  state.atr = volatility;

  if (!Number.isFinite(volatility) || volatility <= 0) {
    return { ...state, reason: "No usable ATR: wait for meaningful price movement." };
  }

  const separation = (fast[index] - slow[index]) / volatility;
  const fastSlope = (fast[index] - fast[index - 3]) / volatility;
  const slowSlope = (slow[index] - slow[index - 5]) / volatility;
  if (Math.abs(separation) < 0.25 || Math.abs(slowSlope) < 0.02) {
    return {
      ...state,
      reason:
        "Trend is flat or compressed: EMA separation or EMA200 slope is too small.",
    };
  }

  if (
    closes[index] > fast[index] &&
    separation >= 0.25 &&
    fastSlope > 0 &&
    slowSlope >= 0.02
  ) {
    return {
      ...state,
      direction: "UP",
      reason: "Uptrend: close above EMA50 above EMA200, with both averages rising.",
    };
  }
  if (
    closes[index] < fast[index] &&
    separation <= -0.25 &&
    fastSlope < 0 &&
    slowSlope <= -0.02
  ) {
    return {
      ...state,
      direction: "DOWN",
      reason: "Downtrend: close below EMA50 below EMA200, with both averages falling.",
    };
  }
  return {
    ...state,
    reason: "Trend is not aligned: wait for price, EMA50, EMA200 and slopes to agree.",
  };
}
