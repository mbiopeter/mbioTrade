import { atr, bollinger, donchian, ema, macd, rsi } from "../indicators";
import type { Candle, Direction, StrategyVote } from "../types";
import {
  evaluateConfiguredStrategy,
  type StrategyEvaluationContext,
} from "./configured";

function vote(
  id: string,
  name: string,
  direction: Direction,
  score: number,
  reason: string,
): StrategyVote {
  return {
    id,
    name,
    direction,
    score: Math.max(0, Math.min(100, score)),
    reason,
  };
}

function stochastic(candles: Candle[], period = 14): number[] {
  const output = new Array<number>(candles.length).fill(Number.NaN);
  for (let index = period - 1; index < candles.length; index += 1) {
    const window = candles.slice(index - period + 1, index + 1);
    const low = Math.min(...window.map((candle) => candle.low));
    const high = Math.max(...window.map((candle) => candle.high));
    output[index] =
      high === low ? 50 : ((candles[index].close - low) / (high - low)) * 100;
  }
  return output;
}

function isBullishEngulfing(candles: Candle[]): boolean {
  const previous = candles.at(-2);
  const current = candles.at(-1);
  return Boolean(
    previous &&
    current &&
    previous.close < previous.open &&
    current.close > current.open &&
    current.open <= previous.close &&
    current.close >= previous.open,
  );
}

function isBearishEngulfing(candles: Candle[]): boolean {
  const previous = candles.at(-2);
  const current = candles.at(-1);
  return Boolean(
    previous &&
    current &&
    previous.close > previous.open &&
    current.close < current.open &&
    current.open >= previous.close &&
    current.close <= previous.open,
  );
}

export function evaluateStrategy(
  id: string,
  candles: Candle[],
  context: StrategyEvaluationContext = {},
): StrategyVote {
  const configured = evaluateConfiguredStrategy(id, candles, context);
  if (configured) return configured;
  const last = candles.at(-1);
  if (!last || candles.length < 60) {
    return vote(id, id, "WAIT", 0, "Need at least 60 candles.");
  }

  const closes = candles.map((candle) => candle.close);
  const ema9 = ema(closes, 9);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsiValues = rsi(closes, 14);
  const macdValues = macd(closes);
  const atrValues = atr(candles, 14);
  const index = candles.length - 1;
  const atrValue =
    atrValues[index] || Math.max(last.high - last.low, Math.abs(last.close) * 0.001);
  const body = Math.abs(last.close - last.open);
  const range = Math.max(last.high - last.low, 1e-9);

  if (id === "smart-trend") {
    const bullish =
      ema9[index] > ema20[index] &&
      ema20[index] > ema50[index] &&
      ema9[index] > ema9[index - 3] &&
      last.close > ema20[index] &&
      rsiValues[index] > 52 &&
      rsiValues[index] < 75;
    const bearish =
      ema9[index] < ema20[index] &&
      ema20[index] < ema50[index] &&
      ema9[index] < ema9[index - 3] &&
      last.close < ema20[index] &&
      rsiValues[index] < 48 &&
      rsiValues[index] > 25;
    const spread = Math.abs(ema9[index] - ema50[index]) / Math.max(atrValue, 1e-9);
    if (bullish) {
      return vote(
        id,
        "Smart Trend",
        "UP",
        68 + Math.min(24, spread * 9),
        "EMA9/20/50, price and RSI align bullishly.",
      );
    }
    if (bearish) {
      return vote(
        id,
        "Smart Trend",
        "DOWN",
        68 + Math.min(24, spread * 9),
        "EMA9/20/50, price and RSI align bearishly.",
      );
    }
    return vote(
      id,
      "Smart Trend",
      "WAIT",
      38,
      "The multi-EMA trend stack is not aligned.",
    );
  }

  if (id === "liquidity-sweep") {
    const prior = candles.slice(-22, -1);
    const high = Math.max(...prior.map((candle) => candle.high));
    const low = Math.min(...prior.map((candle) => candle.low));
    if (last.low < low && last.close > low && last.close > last.open) {
      return vote(
        id,
        "Liquidity Sweep",
        "UP",
        79,
        "Price swept the recent low and closed back above it.",
      );
    }
    if (last.high > high && last.close < high && last.close < last.open) {
      return vote(
        id,
        "Liquidity Sweep",
        "DOWN",
        79,
        "Price swept the recent high and closed back below it.",
      );
    }
    return vote(
      id,
      "Liquidity Sweep",
      "WAIT",
      34,
      "No confirmed sweep-and-reclaim pattern.",
    );
  }

  if (id === "ema-confluence") {
    const bullish =
      ema9[index] > ema20[index] &&
      ema20[index] > ema50[index] &&
      last.close > ema20[index] &&
      ema9[index] > ema9[index - 2];
    const bearish =
      ema9[index] < ema20[index] &&
      ema20[index] < ema50[index] &&
      last.close < ema20[index] &&
      ema9[index] < ema9[index - 2];
    if (bullish) {
      return vote(
        id,
        "EMA Confluence",
        "UP",
        75,
        "EMA9, EMA20 and EMA50 are stacked bullishly.",
      );
    }
    if (bearish) {
      return vote(
        id,
        "EMA Confluence",
        "DOWN",
        75,
        "EMA9, EMA20 and EMA50 are stacked bearishly.",
      );
    }
    return vote(
      id,
      "EMA Confluence",
      "WAIT",
      36,
      "The three EMAs are compressed or disagree.",
    );
  }

  if (id === "ema-trend") {
    const spread = Math.abs(ema20[index] - ema50[index]) / Math.max(atrValue, 1e-9);
    const slope = ema20[index] - ema20[Math.max(0, index - 3)];
    if (ema20[index] > ema50[index] && slope > 0) {
      return vote(
        id,
        "EMA Trend",
        "UP",
        58 + Math.min(32, spread * 12),
        "EMA20 is above EMA50 and rising.",
      );
    }
    if (ema20[index] < ema50[index] && slope < 0) {
      return vote(
        id,
        "EMA Trend",
        "DOWN",
        58 + Math.min(32, spread * 12),
        "EMA20 is below EMA50 and falling.",
      );
    }
    return vote(id, "EMA Trend", "WAIT", 35, "EMA structure is not aligned.");
  }

  if (id === "rsi-momentum") {
    const value = rsiValues[index];
    if (value >= 54 && value <= 72) {
      return vote(
        id,
        "RSI Momentum",
        "UP",
        55 + Math.min(30, (value - 54) * 1.5),
        `RSI ${value.toFixed(1)} supports bullish momentum.`,
      );
    }
    if (value <= 46 && value >= 28) {
      return vote(
        id,
        "RSI Momentum",
        "DOWN",
        55 + Math.min(30, (46 - value) * 1.5),
        `RSI ${value.toFixed(1)} supports bearish momentum.`,
      );
    }
    return vote(
      id,
      "RSI Momentum",
      "WAIT",
      38,
      `RSI ${value.toFixed(1)} is neutral or stretched.`,
    );
  }

  if (id === "macd-flow" || id === "macd-momentum") {
    const histogram = macdValues.histogram[index];
    const previousHistogram = macdValues.histogram[index - 1] ?? 0;
    const name = id === "macd-flow" ? "MACD Flow" : "MACD Momentum";
    if (
      macdValues.line[index] > macdValues.signal[index] &&
      histogram > 0 &&
      histogram >= previousHistogram &&
      last.close > ema20[index]
    ) {
      return vote(
        id,
        name,
        "UP",
        73,
        "MACD and histogram flow are bullish above EMA20.",
      );
    }
    if (
      macdValues.line[index] < macdValues.signal[index] &&
      histogram < 0 &&
      histogram <= previousHistogram &&
      last.close < ema20[index]
    ) {
      return vote(
        id,
        name,
        "DOWN",
        73,
        "MACD and histogram flow are bearish below EMA20.",
      );
    }
    return vote(id, name, "WAIT", 40, "MACD flow lacks price confirmation.");
  }

  if (id === "breakout") {
    const channel = donchian(candles.slice(0, -1), 20);
    const previousHigh = channel.high.at(-1);
    const previousLow = channel.low.at(-1);
    if (
      Number.isFinite(previousHigh) &&
      last.close > Number(previousHigh) &&
      range > atrValue * 0.8
    ) {
      return vote(
        id,
        "Volatility Breakout",
        "UP",
        77,
        "Close broke the prior 20-bar high with range expansion.",
      );
    }
    if (
      Number.isFinite(previousLow) &&
      last.close < Number(previousLow) &&
      range > atrValue * 0.8
    ) {
      return vote(
        id,
        "Volatility Breakout",
        "DOWN",
        77,
        "Close broke the prior 20-bar low with range expansion.",
      );
    }
    return vote(id, "Volatility Breakout", "WAIT", 32, "No confirmed 20-bar breakout.");
  }

  if (id === "structure-shift") {
    const prior = candles.slice(-15, -1);
    const high = Math.max(...prior.map((candle) => candle.high));
    const low = Math.min(...prior.map((candle) => candle.low));
    if (last.close > high && body / range > 0.52) {
      return vote(
        id,
        "Structure Shift",
        "UP",
        78,
        "A strong close broke the recent swing high.",
      );
    }
    if (last.close < low && body / range > 0.52) {
      return vote(
        id,
        "Structure Shift",
        "DOWN",
        78,
        "A strong close broke the recent swing low.",
      );
    }
    return vote(
      id,
      "Structure Shift",
      "WAIT",
      35,
      "Recent swing structure remains intact.",
    );
  }

  if (id === "support-resistance") {
    const prior = candles.slice(-30, -1);
    const high = Math.max(...prior.map((candle) => candle.high));
    const low = Math.min(...prior.map((candle) => candle.low));
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    if (
      last.low <= low + atrValue * 0.2 &&
      lowerWick > body * 0.8 &&
      last.close > last.open
    ) {
      return vote(
        id,
        "Support / Resistance",
        "UP",
        72,
        "Bullish rejection formed at recent support.",
      );
    }
    if (
      last.high >= high - atrValue * 0.2 &&
      upperWick > body * 0.8 &&
      last.close < last.open
    ) {
      return vote(
        id,
        "Support / Resistance",
        "DOWN",
        72,
        "Bearish rejection formed at recent resistance.",
      );
    }
    return vote(
      id,
      "Support / Resistance",
      "WAIT",
      34,
      "No strong rejection at a recent boundary.",
    );
  }

  if (id === "pullback") {
    const bullishTrend = ema20[index] > ema50[index] && ema20[index] > ema20[index - 3];
    const bearishTrend = ema20[index] < ema50[index] && ema20[index] < ema20[index - 3];
    const nearEma = Math.abs(last.close - ema20[index]) <= atrValue * 0.8;
    if (bullishTrend && nearEma && last.close > last.open) {
      return vote(
        id,
        "Trend Pullback",
        "UP",
        73,
        "Bullish trend pulled back near EMA20 and closed positive.",
      );
    }
    if (bearishTrend && nearEma && last.close < last.open) {
      return vote(
        id,
        "Trend Pullback",
        "DOWN",
        73,
        "Bearish trend pulled back near EMA20 and closed negative.",
      );
    }
    return vote(id, "Trend Pullback", "WAIT", 35, "No clean trend-pullback setup.");
  }

  if (id === "bollinger-reversion") {
    const bands = bollinger(closes, 20, 2);
    const value = rsiValues[index];
    if (last.close < bands.lower[index] && value < 32) {
      return vote(
        id,
        "Bollinger Reversion",
        "UP",
        76,
        "Price is below the lower band with oversold RSI.",
      );
    }
    if (last.close > bands.upper[index] && value > 68) {
      return vote(
        id,
        "Bollinger Reversion",
        "DOWN",
        76,
        "Price is above the upper band with overbought RSI.",
      );
    }
    return vote(id, "Bollinger Reversion", "WAIT", 30, "No band-exhaustion setup.");
  }

  if (id === "stochastic-reversal") {
    const value = stochastic(candles, 14)[index];
    if (value < 18 && last.close > last.open) {
      return vote(
        id,
        "Stochastic Reversal",
        "UP",
        72,
        `Stochastic ${value.toFixed(1)} is oversold with bullish reversal.`,
      );
    }
    if (value > 82 && last.close < last.open) {
      return vote(
        id,
        "Stochastic Reversal",
        "DOWN",
        72,
        `Stochastic ${value.toFixed(1)} is overbought with bearish reversal.`,
      );
    }
    return vote(
      id,
      "Stochastic Reversal",
      "WAIT",
      34,
      "No stochastic reversal confirmation.",
    );
  }

  if (id === "supertrend") {
    const midpoint = (last.high + last.low) / 2;
    const upper = midpoint + 2.5 * atrValue;
    const lower = midpoint - 2.5 * atrValue;
    const previous = candles[index - 1];
    if (
      last.close > ema20[index] &&
      previous.close > lower &&
      ema20[index] > ema50[index]
    ) {
      return vote(
        id,
        "ATR Supertrend",
        "UP",
        74,
        `Price holds above ATR trend support (${lower.toFixed(5)}).`,
      );
    }
    if (
      last.close < ema20[index] &&
      previous.close < upper &&
      ema20[index] < ema50[index]
    ) {
      return vote(
        id,
        "ATR Supertrend",
        "DOWN",
        74,
        `Price holds below ATR trend resistance (${upper.toFixed(5)}).`,
      );
    }
    return vote(id, "ATR Supertrend", "WAIT", 36, "ATR trend state is not clean.");
  }

  if (id === "price-action") {
    const recent = candles.slice(-12, -1);
    const high = Math.max(...recent.map((candle) => candle.high));
    const low = Math.min(...recent.map((candle) => candle.low));
    if (isBullishEngulfing(candles) && last.low <= low + atrValue * 0.35) {
      return vote(
        id,
        "Price Action",
        "UP",
        75,
        "Bullish engulfing rejection near a recent low.",
      );
    }
    if (isBearishEngulfing(candles) && last.high >= high - atrValue * 0.35) {
      return vote(
        id,
        "Price Action",
        "DOWN",
        75,
        "Bearish engulfing rejection near a recent high.",
      );
    }
    return vote(
      id,
      "Price Action",
      "WAIT",
      33,
      "No strong engulfing or rejection setup.",
    );
  }

  if (id === "adaptive-regime") {
    const trendStrength =
      Math.abs(ema20[index] - ema50[index]) / Math.max(atrValue, 1e-9);
    const normalizedVolatility =
      atrValue / Math.max(Math.abs(last.close) * 0.001, 1e-9);
    if (trendStrength > 1.1) {
      return vote(
        id,
        "Adaptive Regime",
        ema20[index] > ema50[index] ? "UP" : "DOWN",
        65 + Math.min(25, trendStrength * 8),
        `Trend regime detected (${trendStrength.toFixed(2)} ATR EMA spread).`,
      );
    }
    if (normalizedVolatility > 2.5) {
      return vote(
        id,
        "Adaptive Regime",
        "WAIT",
        45,
        "Volatility is elevated; waiting for structure.",
      );
    }
    const bands = bollinger(closes, 20, 2);
    if (last.close <= bands.lower[index] && rsiValues[index] < 38) {
      return vote(
        id,
        "Adaptive Regime",
        "UP",
        68,
        "Range regime: lower-band rejection candidate.",
      );
    }
    if (last.close >= bands.upper[index] && rsiValues[index] > 62) {
      return vote(
        id,
        "Adaptive Regime",
        "DOWN",
        68,
        "Range regime: upper-band rejection candidate.",
      );
    }
    return vote(
      id,
      "Adaptive Regime",
      "WAIT",
      42,
      "Regime is mixed; no high-quality edge.",
    );
  }

  return vote(id, id, "WAIT", 0, "Unknown strategy.");
}
