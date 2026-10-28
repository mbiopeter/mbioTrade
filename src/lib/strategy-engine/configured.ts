import { atr, ema, macd } from "../indicators";
import type { Candle, StrategyVote, Timeframe, TradeDirection } from "../types";
import {
  normalizeStrategySymbol,
  strategyProfile,
  type StrategyProfile,
} from "./profiles";
import { getTrendState } from "./trend";

export interface StrategyEvaluationContext {
  symbol?: string;
  timeframe?: Timeframe;
}

interface PatternContext {
  candles: Candle[];
  index: number;
  last: Candle;
  previous: Candle;
  direction: TradeDirection;
  sign: 1 | -1;
  ema20: number[];
  ema50: number[];
  atrValues: number[];
  referenceAtr: number;
}

function result(
  profile: StrategyProfile,
  direction: StrategyVote["direction"],
  reason: string,
  score = 0,
): StrategyVote {
  return { id: profile.id, name: profile.name, direction, score, reason };
}

function directionalBody(candle: Candle, sign: number): boolean {
  return sign * (candle.close - candle.open) > 0;
}

function breaksPreviousEdge(candle: Candle, previous: Candle, sign: number): boolean {
  return sign * (candle.close - (sign === 1 ? previous.high : previous.low)) > 0;
}

function touchesZone(
  candle: Candle,
  first: number,
  second: number,
  tolerance: number,
): boolean {
  return (
    candle.low <= Math.max(first, second) + tolerance &&
    candle.high >= Math.min(first, second) - tolerance
  );
}

function findPullback(context: PatternContext, ema20Only: boolean): number {
  const { candles, index, sign, ema20, ema50, atrValues } = context;
  const lookback = ema20Only ? 5 : 6;
  for (let cursor = index - 1; cursor >= index - lookback; cursor -= 1) {
    const candle = candles[cursor];
    const tolerance = atrValues[cursor - 1] * (ema20Only ? 0.2 : 0.25);
    const inZone = touchesZone(
      candle,
      ema20[cursor],
      ema20Only ? ema20[cursor] : ema50[cursor],
      tolerance,
    );
    const adverseClose = sign * (candle.close - candles[cursor - 1].close) < 0;
    const heldSlowAverage =
      sign * (candle.close - ema50[cursor]) >= -atrValues[cursor - 1] * 0.3;
    if (adverseClose && inZone && heldSlowAverage) return cursor;
  }
  return -1;
}

function isResumption(context: PatternContext, index: number): boolean {
  const { candles, sign, ema20 } = context;
  const candle = candles[index];
  return (
    directionalBody(candle, sign) &&
    sign * (candle.close - ema20[index]) > 0 &&
    breaksPreviousEdge(candle, candles[index - 1], sign)
  );
}

function evaluatePullback(
  profile: StrategyProfile,
  context: PatternContext,
): StrategyVote {
  const { index, last, sign, direction, ema20, ema50, referenceAtr } = context;
  const gold = profile.id === "v14-xauusd-pullback";
  const pullbackIndex = findPullback(context, profile.id === "v14-eurusd-pullback");
  if (pullbackIndex < 0) {
    return result(
      profile,
      "WAIT",
      "Trend is aligned; wait for an adverse price pullback into the EMA area.",
    );
  }
  if (!isResumption(context, index)) {
    return result(
      profile,
      "WAIT",
      "Pullback detected; wait for a directional close through EMA20 and the preceding candle's extreme.",
    );
  }
  for (let cursor = pullbackIndex + 1; cursor < index; cursor += 1) {
    if (isResumption(context, cursor)) {
      return result(
        profile,
        "WAIT",
        "This pullback has already resumed; wait for a new pullback rather than chasing it.",
      );
    }
  }
  if (sign * (last.close - ema20[index]) > referenceAtr * 1.5) {
    return result(
      profile,
      "WAIT",
      "The resumption close is more than 1.5 ATR from EMA20; wait for a less extended entry.",
    );
  }
  if (gold) {
    const body = Math.abs(last.close - last.open);
    const rejectionWick =
      sign === 1
        ? Math.min(last.open, last.close) - last.low
        : last.high - Math.max(last.open, last.close);
    if (
      rejectionWick < body * 0.6 ||
      !touchesZone(last, ema20[index], ema50[index], referenceAtr * 0.25)
    ) {
      return result(
        profile,
        "WAIT",
        "Gold needs a rejection wick at the EMA20/50 area of at least 0.6 times the directional body.",
      );
    }
  }
  return result(
    profile,
    direction,
    gold
      ? "EMA50/200 trend, EMA-area pullback and rejection-wick resumption all agree; the volatility guard is clear."
      : "EMA50/200 trend, a genuine EMA-area pullback and the first directional resumption close all agree.",
    gold ? 84 : profile.id === "v14-eurusd-pullback" ? 82 : 80,
  );
}

function channelBoundary(candles: Candle[], before: number, sign: number): number {
  const window = candles.slice(before - 20, before);
  return sign === 1
    ? Math.max(...window.map((candle) => candle.high))
    : Math.min(...window.map((candle) => candle.low));
}

function isRetest(
  candle: Candle,
  boundary: number,
  volatility: number,
  sign: number,
): boolean {
  const wick = sign === 1 ? candle.low : candle.high;
  const penetration = sign * (wick - boundary);
  const extension = sign * (candle.close - boundary);
  return (
    penetration <= volatility * 0.25 &&
    penetration >= -volatility * 0.75 &&
    extension > 0 &&
    extension <= volatility * 1.5 &&
    directionalBody(candle, sign)
  );
}

function evaluateRetest(
  profile: StrategyProfile,
  context: PatternContext,
): StrategyVote {
  const { candles, index, last, direction, sign, atrValues, referenceAtr } = context;
  for (let cursor = index - 1; cursor >= index - 5; cursor -= 1) {
    const boundary = channelBoundary(candles, cursor, sign);
    const breakout =
      sign * (candles[cursor].close - boundary) > atrValues[cursor - 1] * 0.05;
    if (!breakout) continue;
    const invalidated = candles.slice(cursor + 1, index).some(
      // Keep the threshold known before that close. Later volatility must not
      // retrospectively make an already-failed breakout valid again.
      (candle, offset) =>
        sign * (candle.close - boundary) < -atrValues[cursor + offset] * 0.5,
    );
    if (invalidated || !isRetest(last, boundary, referenceAtr, sign)) continue;
    const alreadyRetested = candles
      .slice(cursor + 1, index)
      .some((candle, offset) =>
        isRetest(candle, boundary, atrValues[cursor + offset], sign),
      );
    if (alreadyRetested) continue;
    return result(
      profile,
      direction,
      "The EMA50/200 trend agrees with a completed 20-bar breakout and the first confirmed retest of its boundary.",
      83,
    );
  }
  return result(
    profile,
    "WAIT",
    "Wait for a trend-direction 20-bar channel breakout followed within five candles by a valid boundary retest.",
  );
}

function evaluateMomentum(
  profile: StrategyProfile,
  context: PatternContext,
): StrategyVote {
  const { candles, index, last, previous, direction, sign, ema20 } = context;
  const momentum = macd(candles.map((candle) => candle.close));
  const hasPullback = candles
    .slice(index - 8, index)
    .some(
      (candle, offset) => sign * (candle.close - candles[index - 9 + offset].close) < 0,
    );
  const restart =
    sign * momentum.histogram[index] > 0 && sign * momentum.histogram[index - 1] <= 0;
  const reset = momentum.histogram
    .slice(index - 8, index)
    .some((value) => sign * value < 0);
  if (!hasPullback || !reset || !restart) {
    return result(
      profile,
      "WAIT",
      "Wait for a price pullback, a MACD histogram reset, and its first zero-cross back in the trend direction.",
    );
  }
  if (
    sign * momentum.line[index] <= 0 ||
    sign * (last.close - ema20[index]) <= 0 ||
    sign * (last.close - previous.close) <= 0 ||
    !directionalBody(last, sign)
  ) {
    return result(
      profile,
      "WAIT",
      "MACD has turned, but its line, EMA20 and the confirming price candle must still agree with the established trend.",
    );
  }
  return result(
    profile,
    direction,
    "EMA50/200 trend and MACD-line bias agree; a price pullback reset the histogram and this candle restarted momentum.",
    82,
  );
}

function evaluateChannel(
  profile: StrategyProfile,
  context: PatternContext,
): StrategyVote {
  const { candles, index, last, direction, sign, ema20, referenceAtr } = context;
  const boundary = channelBoundary(candles, index, sign);
  const extension = sign * (last.close - boundary);
  if (
    extension <= 0 ||
    extension > referenceAtr ||
    last.high - last.low < referenceAtr * 0.8 ||
    !directionalBody(last, sign) ||
    sign * (last.close - ema20[index]) <= 0
  ) {
    return result(
      profile,
      "WAIT",
      "Wait for a directional close through the prior 20-bar channel, with 0.8–2.5 ATR range and no more than 1 ATR extension.",
    );
  }
  return result(
    profile,
    direction,
    "Price closed through the preceding 20-bar channel in the EMA50/200 trend direction, with controlled range expansion.",
    82,
  );
}

export function evaluateConfiguredStrategy(
  id: string,
  candles: Candle[],
  evaluationContext: StrategyEvaluationContext = {},
): StrategyVote | undefined {
  const profile = strategyProfile(id);
  if (!profile) return undefined;
  if (
    profile.symbol &&
    (!evaluationContext.symbol ||
      normalizeStrategySymbol(evaluationContext.symbol) !==
        normalizeStrategySymbol(profile.symbol))
  ) {
    return result(
      profile,
      "WAIT",
      `This setup is configured for ${normalizeStrategySymbol(profile.symbol)}; choose that market or the General Trend Pullback profile.`,
    );
  }
  const trend = getTrendState(candles);
  if (trend.direction === "WAIT") return result(profile, "WAIT", trend.reason);
  const index = candles.length - 1;
  const last = candles[index];
  const closes = candles.map((candle) => candle.close);
  const atrValues = atr(candles, 14);
  const referenceAtr = atrValues[index - 1];
  if (referenceAtr <= 0 || last.high - last.low > referenceAtr * 2.5) {
    return result(
      profile,
      "WAIT",
      "Entry candle exceeds 2.5 times the preceding ATR14; wait for volatility to settle.",
    );
  }
  const context: PatternContext = {
    candles,
    index,
    last,
    previous: candles[index - 1],
    direction: trend.direction,
    sign: trend.direction === "UP" ? 1 : -1,
    ema20: ema(closes, 20),
    ema50: ema(closes, 50),
    atrValues,
    referenceAtr,
  };
  if (context.sign * (context.ema20[index] - context.ema50[index]) <= 0) {
    return result(
      profile,
      "WAIT",
      "EMA20 has not aligned with the established EMA50/200 trend yet.",
    );
  }
  if (id === "v14-gbpusd-retest") return evaluateRetest(profile, context);
  if (id === "v14-usdjpy-momentum") return evaluateMomentum(profile, context);
  if (id === "v14-audusd-channel") return evaluateChannel(profile, context);
  return evaluatePullback(profile, context);
}
