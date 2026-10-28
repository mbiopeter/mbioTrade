import type { Direction, ExecutionMode, Timeframe } from "../types";

export const TIMEFRAMES: readonly Timeframe[] = [
  60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400,
];

export const EXECUTION_MODES: readonly ExecutionMode[] = [
  "signals",
  "manual",
  "automatic",
];

export const SIGNAL_REGIMES = new Set(["trend", "range", "volatile", "mixed"]);

export const DIRECTIONS = new Set<Direction>(["UP", "DOWN", "WAIT"]);
export const TRADE_DIRECTIONS = new Set<Direction>(["UP", "DOWN"]);
export const TRADE_STATUSES = new Set(["pending", "open", "closed", "error"]);
export const TRADE_SOURCES = new Set(["manual", "auto"]);

export const ALLOWED_STRATEGY_IDS = new Set([
  "v14-eurusd-pullback",
  "v14-gbpusd-retest",
  "v14-usdjpy-momentum",
  "v14-audusd-channel",
  "v14-xauusd-pullback",
  "v14-general-pullback",
  "smart-trend",
  "liquidity-sweep",
  "ema-confluence",
  "ema-trend",
  "rsi-momentum",
  "macd-flow",
  "macd-momentum",
  "breakout",
  "structure-shift",
  "support-resistance",
  "pullback",
  "bollinger-reversion",
  "adaptive-regime",
  "stochastic-reversal",
  "supertrend",
  "price-action",
  "news-guard",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

export function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanText(value: unknown, maxLength = 120): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function safeId(value: unknown, fallbackPrefix = "item"): string {
  const raw = cleanText(value, 160);

  if (/^[A-Za-z0-9._:-]{1,160}$/.test(raw)) {
    return raw;
  }

  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function safeHex(value: unknown, fallback = "#20e58b"): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback;
}
