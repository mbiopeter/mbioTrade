import type { MarketClass, StrategyCombo, Timeframe } from "../types";

export interface StrategyProfile {
  id: string;
  name: string;
  symbol: string | null;
  marketClass: MarketClass | null;
  timeframe: Timeframe;
  atrStop: number;
  riskReward: number;
  minConfidence: number;
  summary: string;
  entryRules: readonly string[];
}

const trendRule =
  "Use at least 205 completed candles. Price must be above EMA50 above EMA200 for a long, or below both for a short. " +
  "EMA50 slope over 3 bars and EMA200 slope over 5 bars must agree; EMA separation is at least 0.25 ATR and EMA200 slope at least 0.02 ATR.";

const fastAlignmentRule =
  "EMA20 must also remain on the trend side of EMA50. Entry-pattern tolerances use the preceding candle's ATR14; " +
  "the application's existing stop calculation uses the current completed candle's ATR14.";

// These are explicit engineering defaults, not optimized or proven profitable
// settings. Each profile is one complete entry pattern, not a vote for trend alone.
export const STRATEGY_PROFILES: readonly StrategyProfile[] = [
  {
    id: "v14-eurusd-pullback",
    name: "EURUSD · EMA Pullback",
    symbol: "frxEURUSD",
    marketClass: "forex",
    timeframe: 3600,
    atrStop: 1.5,
    riskReward: 2,
    minConfidence: 78,
    summary: "Trend-aligned EURUSD pullback to EMA20 followed by a confirmed reclaim.",
    entryRules: [
      trendRule,
      fastAlignmentRule,
      "Within the previous five candles, an adverse close must touch EMA20 within 0.20 ATR while holding the EMA50 area.",
      "The first resumption candle must close beyond EMA20 and the previous candle's high for a long or low for a short, with a body in the trend direction.",
      "Reject an entry more than 1.5 ATR from EMA20 or a candle larger than 2.5 times the preceding ATR14.",
      "Default: H1, stop distance 1.5 ATR and target 2R. The News Guard blocks supplied high-impact events within 30 minutes.",
    ],
  },
  {
    id: "v14-gbpusd-retest",
    name: "GBPUSD · Breakout Retest",
    symbol: "frxGBPUSD",
    marketClass: "forex",
    timeframe: 3600,
    atrStop: 1.8,
    riskReward: 2,
    minConfidence: 80,
    summary:
      "Trend-aligned GBPUSD close through a 20-bar channel, followed by a retest of the broken level.",
    entryRules: [
      trendRule,
      fastAlignmentRule,
      "A completed candle within the previous five bars must close at least 0.05 ATR beyond the preceding 20-bar high or low in the trend direction.",
      "Wait for a later candle to retest the broken boundary within 0.25 ATR, then close on the trend side with a directional body.",
      "Reject a retest that pierces the boundary by more than 0.75 ATR, closes more than 1.5 ATR beyond it, " +
        "follows an intervening close more than 0.5 ATR against the breakout, or spans more than 2.5 preceding ATR.",
      "Default: H1, stop distance 1.8 ATR, target 2R and News Guard enabled. A breakout alone is insufficient.",
    ],
  },
  {
    id: "v14-usdjpy-momentum",
    name: "USDJPY · Momentum Restart",
    symbol: "frxUSDJPY",
    marketClass: "forex",
    timeframe: 3600,
    atrStop: 1.5,
    riskReward: 2,
    minConfidence: 78,
    summary:
      "Trend-aligned USDJPY momentum restart after a price pullback and MACD reset.",
    entryRules: [
      trendRule,
      fastAlignmentRule,
      "Require an adverse price close within the previous eight candles and a MACD(12,26,9) histogram reset against the trend.",
      "Enter only on the completed histogram cross back through zero with the trend, while the MACD line remains on the trend side of zero.",
      "Price must close on the trend side of EMA20, beyond the previous close, with a directional body. Reject a candle larger than 2.5 preceding ATR.",
      "Default: H1, stop distance 1.5 ATR, target 2R and News Guard enabled.",
    ],
  },
  {
    id: "v14-audusd-channel",
    name: "AUDUSD · Channel Continuation",
    symbol: "frxAUDUSD",
    marketClass: "forex",
    timeframe: 14400,
    atrStop: 2,
    riskReward: 2.5,
    minConfidence: 78,
    summary:
      "Trend-aligned AUDUSD continuation through the previous 20-bar Donchian boundary.",
    entryRules: [
      trendRule,
      fastAlignmentRule,
      "A completed candle must close beyond the preceding 20-bar high for a long or low for a short; a wick alone does not qualify.",
      "Require a directional body and a close on the trend side of EMA20.",
      "The breakout candle must span 0.8 to 2.5 times the preceding ATR14, and close no more than 1 ATR beyond the broken channel.",
      "Default: H4, stop distance 2 ATR, target 2.5R and News Guard enabled.",
    ],
  },
  {
    id: "v14-xauusd-pullback",
    name: "XAUUSD · Pullback Rejection",
    symbol: "frxXAUUSD",
    marketClass: "metals",
    timeframe: 3600,
    atrStop: 2,
    riskReward: 2,
    minConfidence: 80,
    summary:
      "Trend-aligned Gold pullback into the EMA20/50 area, confirmed by a rejection candle and an ATR guard.",
    entryRules: [
      trendRule,
      fastAlignmentRule,
      "Within the previous six candles, an adverse close must enter the EMA20/50 area, allowing 0.25 ATR around the zone.",
      "The first resumption close must clear EMA20 and the previous candle's high or low with the trend; the rejection wick must be at least 0.6 times the body.",
      "The confirming wick must touch the EMA20/50 area. Reject a candle larger than 2.5 preceding ATR or a close more than 1.5 ATR from EMA20.",
      "Default: H1, stop distance 2 ATR, target 2R and USD News Guard enabled.",
    ],
  },
  {
    id: "v14-general-pullback",
    name: "General · Trend Pullback",
    symbol: null,
    marketClass: null,
    timeframe: 3600,
    atrStop: 1.5,
    riskReward: 2,
    minConfidence: 76,
    summary:
      "On any supported market, establish the trend, wait for a pullback, then enter only when the trend resumes.",
    entryRules: [
      trendRule,
      fastAlignmentRule,
      "Wait for an adverse close into the EMA20/50 area within the previous six candles, allowing 0.25 ATR around the zone.",
      "Enter on the first directional resumption candle closing beyond EMA20 and the previous candle's high for a long or low for a short.",
      "Reject an entry more than 1.5 ATR from EMA20 or a candle larger than 2.5 times the preceding ATR14.",
      "Default: H1, stop distance 1.5 ATR, target 2R and News Guard enabled where supplied currency events apply.",
    ],
  },
];

export function strategyProfile(id: string): StrategyProfile | undefined {
  return STRATEGY_PROFILES.find((profile) => profile.id === id);
}

export function profileForCombo(combo: StrategyCombo): StrategyProfile | undefined {
  const profiles = combo.strategies
    .filter((strategy) => strategy.enabled)
    .map((strategy) => strategyProfile(strategy.id))
    .filter((profile): profile is StrategyProfile => Boolean(profile));
  return profiles.length === 1 ? profiles[0] : undefined;
}

export function normalizeStrategySymbol(symbol: string): string {
  return symbol.replace(/^frx/i, "").toUpperCase();
}
