import { normalizeStrategySymbol, STRATEGY_PROFILES } from "./profiles";

export type StrategyMetadata = {
  id: string;
  name: string;
  family: string;
  description: string;
  how: string;
  bestFor: string;
  watch: string;
};

export const STRATEGY_CATALOG = [
  ...STRATEGY_PROFILES.map((profile) => ({
    id: profile.id,
    name: profile.name,
    family: "Configured trend strategy",
    description: profile.summary,
    how: profile.entryRules.join(" "),
    bestFor: profile.symbol
      ? `${normalizeStrategySymbol(profile.symbol)} with a clear EMA50/200 trend. Recommended timeframe: ${profile.timeframe / 3600}h.`
      : "Any supported market with a clear EMA50/200 trend and a completed pullback. Recommended timeframe: 1h.",
    watch:
      "These are rule-based starting settings, not verified profit forecasts. Validate the chosen market and timeframe in replay and demo trading.",
  })),
  {
    id: "smart-trend",
    name: "Smart Trend",
    family: "Trend following",
    description: "Multi-EMA trend structure with momentum and slope confirmation.",
    how: "Aligns EMA9, EMA20 and EMA50, checks their slope, then confirms that RSI supports the same direction without being fully exhausted.",
    bestFor: "Established intraday trends in liquid Forex, Gold and crypto markets.",
    watch:
      "Like every trend model, it can react late after a sharp move or whipsaw in a flat market.",
  },
  {
    id: "liquidity-sweep",
    name: "Liquidity Sweep",
    family: "Market structure",
    description:
      "Wick beyond a recent swing followed by a close back inside the range.",
    how: "Looks for price to run a prior high or low, reject that level, and close back through it.",
    bestFor: "Session opens, range edges and pullbacks into obvious swing levels.",
    watch:
      "A sweep can become a genuine breakout; use confluence rather than the pattern alone.",
  },
  {
    id: "ema-confluence",
    name: "EMA Confluence",
    family: "Technical",
    description: "EMA9/20/50 alignment with price confirmation.",
    how: "Requires the three moving averages to be ordered, the fast average to be moving, and price to remain on the trend side of EMA20.",
    bestFor: "Orderly directional moves and trend-continuation entries.",
    watch: "Moving averages lag and are least reliable when compressed.",
  },
  {
    id: "ema-trend",
    name: "EMA Trend",
    family: "Trend",
    description: "EMA20/50 alignment and slope.",
    how: "Compares fast and slow exponential moving averages, then checks whether the fast EMA is moving in the same direction.",
    bestFor: "Established directional markets and pullback continuation.",
    watch: "Late entries after an extended trend can whipsaw.",
  },
  {
    id: "rsi-momentum",
    name: "RSI Momentum",
    family: "Momentum",
    description: "Momentum bias without chasing extremes.",
    how: "Uses RSI to confirm directional momentum while avoiding the most stretched overbought and oversold readings.",
    bestFor: "Liquid intraday Forex and crypto momentum.",
    watch: "RSI can stay extreme during strong trends.",
  },
  {
    id: "macd-flow",
    name: "MACD Flow",
    family: "Momentum",
    description: "MACD direction, histogram flow and EMA context.",
    how: "Combines MACD line/signal alignment with histogram acceleration and price location relative to EMA20.",
    bestFor: "Trend continuation and momentum confirmation.",
    watch: "MACD is lagging and can flip repeatedly in choppy conditions.",
  },
  {
    id: "macd-momentum",
    name: "MACD Momentum (legacy)",
    family: "Momentum",
    description: "Compatibility alias for older saved combinations.",
    how: "Uses the same directional logic as MACD Flow.",
    bestFor: "Older workspaces and momentum confirmation.",
    watch: "Prefer MACD Flow for new combinations.",
  },
  {
    id: "breakout",
    name: "Volatility Breakout",
    family: "Breakout",
    description: "Donchian breakout confirmed by range expansion.",
    how: "Looks for a close beyond the previous 20-bar range and checks for meaningful candle expansion.",
    bestFor: "GBPUSD, XAUUSD and crypto when volatility expands.",
    watch: "False breakouts are common around thin liquidity and news spikes.",
  },
  {
    id: "structure-shift",
    name: "Structure Shift",
    family: "Price action",
    description: "Close beyond a recent swing with directional body strength.",
    how: "Tracks the prior local range and requires price to close through a swing boundary with a meaningful body.",
    bestFor:
      "Trend reversals, continuation after consolidation and breakout confirmation.",
    watch: "A single break is weak when price immediately closes back into the range.",
  },
  {
    id: "support-resistance",
    name: "Support / Resistance",
    family: "Price action",
    description: "Rejection from recent range boundaries.",
    how: "Measures recent highs and lows, then checks for wick rejection and a close away from the boundary.",
    bestFor: "Range trades and confirmation for liquidity-sweep setups.",
    watch:
      "Horizontal levels are zones, not exact prices; trends can break them cleanly.",
  },
  {
    id: "pullback",
    name: "Trend Pullback",
    family: "Trend",
    description: "Retracement toward EMA20 inside an established trend.",
    how: "Confirms EMA trend structure, then waits for price to retrace near EMA20 and close back with the trend.",
    bestFor: "EURUSD and other orderly trending markets.",
    watch: "Avoid when the fast and slow EMA structure is flat.",
  },
  {
    id: "bollinger-reversion",
    name: "Bollinger Reversion",
    family: "Mean reversion",
    description: "Band excursion plus RSI exhaustion.",
    how: "Combines a close outside a Bollinger Band with RSI exhaustion to identify stretched range moves.",
    bestFor: "Sideways and range regimes.",
    watch: "It can fight strong trends if used without regime confirmation.",
  },
  {
    id: "adaptive-regime",
    name: "Adaptive Regime",
    family: "Adaptive",
    description: "Switches bias using trend strength and normalized volatility.",
    how: "Measures EMA separation in ATR units and normalized volatility, then changes behavior for trend, range and elevated-volatility conditions.",
    bestFor: "Mixed watchlists where market conditions change frequently.",
    watch:
      "It is a selector and filter, not a guarantee that the detected regime persists.",
  },
  {
    id: "stochastic-reversal",
    name: "Stochastic Reversal",
    family: "Mean reversion",
    description: "Stochastic exhaustion with a reversal candle.",
    how: "Finds stochastic extremes and requires the latest candle to reverse in the opposite direction.",
    bestFor: "Range reversals and short-term exhaustion.",
    watch: "Extreme readings can persist in trends.",
  },
  {
    id: "supertrend",
    name: "ATR Supertrend",
    family: "Trend",
    description: "ATR trend state with directional follow-through.",
    how: "Uses ATR-derived dynamic support and resistance with EMA structure to confirm a trend state.",
    bestFor: "XAUUSD, crypto and higher-volatility trends.",
    watch: "ATR widens after shocks, which can make entries late.",
  },
  {
    id: "price-action",
    name: "Price Action",
    family: "Price action",
    description: "Engulfing and rejection structure near recent extremes.",
    how: "Looks for bullish or bearish engulfing candles near recent local highs or lows.",
    bestFor: "Confirmation around support/resistance and breakout retests.",
    watch: "Single-candle patterns are weak without context.",
  },
  {
    id: "news-guard",
    name: "High-impact News Guard",
    family: "News",
    description:
      "Blocks new Forex and metal signals around high-impact calendar events.",
    how: "Matches high-impact events to currencies related to the selected market and vetoes entries inside the risk window.",
    bestFor: "Forex and XAUUSD around macro releases.",
    watch: "It reduces event exposure; it does not predict news direction.",
  },
] as const satisfies readonly StrategyMetadata[];
