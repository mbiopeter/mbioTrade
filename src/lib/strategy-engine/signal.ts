import { atr, ema } from "../indicators";
import type {
  Candle,
  Direction,
  NewsEvent,
  Signal,
  StrategyCombo,
  StrategyVote,
  Timeframe,
} from "../types";
import { evaluateStrategy } from "./evaluate";
import {
  normalizeStrategySymbol,
  STRATEGY_PROFILES,
  strategyProfile,
} from "./profiles";
import { getTrendState } from "./trend";

function pairCurrencies(symbol: string): string[] {
  const normalized = symbol
    .replace(/^frx/i, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return normalized.length >= 6 ? [normalized.slice(0, 3), normalized.slice(3, 6)] : [];
}

export function detectRegime(candles: Candle[]): Signal["regime"] {
  if (candles.length < 55) {
    return "mixed";
  }

  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atrValues = atr(candles, 14);
  const index = candles.length - 1;
  const last = candles[index];
  const trendStrength =
    Math.abs(ema20[index] - ema50[index]) / Math.max(atrValues[index] || 1e-9, 1e-9);
  const normalizedVolatility =
    (atrValues[index] || 0) / Math.max(Math.abs(last.close) * 0.001, 1e-9);

  if (normalizedVolatility > 3) return "volatile";
  if (trendStrength > 1.2) return "trend";
  if (trendStrength < 0.65) return "range";
  return "mixed";
}

export function hasNewsRisk(
  symbol: string,
  events: NewsEvent[],
  atMs = Date.now(),
  windowMinutes = 30,
): boolean {
  const normalized = symbol.toUpperCase();
  const currencies = new Set(
    /(XAU|GOLD)/.test(normalized) ? ["USD"] : pairCurrencies(symbol),
  );
  if (!currencies.size) {
    return false;
  }

  return events.some(
    (event) =>
      event.impact === "high" &&
      Boolean(event.currency) &&
      currencies.has(String(event.currency).toUpperCase()) &&
      Math.abs(event.time - atMs) <= windowMinutes * 60_000,
  );
}

function newsGuardVote(): StrategyVote {
  return {
    id: "news-guard",
    name: "High-impact News Guard",
    direction: "WAIT",
    score: 90,
    reason: "No supplied high-impact event blocks this entry.",
  };
}

export function generateSignal(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  combo: StrategyCombo,
  atrStop = 1.5,
  riskReward = 2,
  newsEvents: NewsEvent[] = [],
): Signal | null {
  // Callers supply completed candles. This guard also governs all legacy and
  // custom combinations; raw indicator votes never authorize a countertrend entry.
  const trend = getTrendState(candles);
  if (trend.direction === "WAIT") return null;

  const newsGuardEnabled = combo.strategies.some(
    (strategy) => strategy.id === "news-guard" && strategy.enabled,
  );
  const last = candles.at(-1)!;
  if (
    newsGuardEnabled &&
    hasNewsRisk(symbol, newsEvents, (last.time + timeframe) * 1000, 30)
  ) {
    return null;
  }

  const activeStrategies = combo.strategies.filter(
    (strategy) => strategy.enabled && strategy.id !== "news-guard",
  );
  const evaluated = activeStrategies.map((config) => ({
    config,
    vote: evaluateStrategy(config.id, candles, { symbol, timeframe }),
  }));

  // A configured setup is a complete prerequisite. Mixing in other indicators
  // must not turn a missing pullback, retest or momentum restart into an entry.
  if (
    evaluated.some(
      ({ config, vote }) =>
        strategyProfile(config.id) && vote.direction !== trend.direction,
    )
  )
    return null;

  let bullishScore = 0;
  let bearishScore = 0;
  let totalWeight = 0;
  let bullishAgreement = 0;
  let bearishAgreement = 0;

  for (const { config, vote } of evaluated) {
    totalWeight += config.weight;
    if (vote.direction === "UP") {
      bullishScore += config.weight * (vote.score / 100);
      bullishAgreement += 1;
    } else if (vote.direction === "DOWN") {
      bearishScore += config.weight * (vote.score / 100);
      bearishAgreement += 1;
    }
  }

  if (!totalWeight) {
    return null;
  }

  const direction: Direction =
    bullishScore > bearishScore ? "UP" : bearishScore > bullishScore ? "DOWN" : "WAIT";
  const agreement =
    direction === "UP" ? bullishAgreement : direction === "DOWN" ? bearishAgreement : 0;
  const directionalStrength = Math.max(bullishScore, bearishScore) / totalWeight;
  const conflict = Math.min(bullishScore, bearishScore) / totalWeight;
  const confidence = Math.max(
    0,
    Math.min(
      99,
      Math.round((directionalStrength - conflict * 0.65) * 100 + agreement * 3),
    ),
  );

  if (
    direction === "WAIT" ||
    direction !== trend.direction ||
    agreement < combo.minAgreement ||
    confidence < combo.minConfidence
  ) {
    return null;
  }

  const atrValue =
    atr(candles, 14).at(-1) ||
    Math.max(last.high - last.low, Math.abs(last.close) * 0.001);
  const distance = Math.max(atrValue * atrStop, Math.abs(last.close) * 0.0005);
  const entry = last.close;
  const stopLoss = direction === "UP" ? entry - distance : entry + distance;
  const takeProfit =
    direction === "UP" ? entry + distance * riskReward : entry - distance * riskReward;

  return {
    id: `${symbol}-${timeframe}-${last.time}-${direction}`,
    symbol,
    timeframe,
    direction,
    entry,
    stopLoss,
    takeProfit,
    confidence,
    riskReward,
    createdAt: Date.now(),
    comboId: combo.id,
    comboName: combo.name,
    votes: [
      ...evaluated.map(({ vote }) => vote),
      ...(newsGuardEnabled ? [newsGuardVote()] : []),
    ],
    regime: detectRegime(candles),
  };
}

export function recommendComboId(
  symbol: string,
  _timeframe: Timeframe,
  _regime: Signal["regime"],
  combos: StrategyCombo[],
): string {
  const profile = STRATEGY_PROFILES.find(
    (candidate) =>
      candidate.symbol &&
      normalizeStrategySymbol(candidate.symbol) === normalizeStrategySymbol(symbol),
  );
  const preferred = profile?.id ?? "v14-general-pullback";
  if (combos.some((combo) => combo.id === preferred)) return preferred;
  if (combos.some((combo) => combo.id === "v14-general-pullback"))
    return "v14-general-pullback";
  return combos[0]?.id ?? "v14-general-pullback";
}
