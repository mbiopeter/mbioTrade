import type { Preferences, Signal, StrategyCombo } from "./types";

export function priceWithinTradePlan(signal: Signal, price: number): boolean {
  return (
    Number.isFinite(price) &&
    price > Math.min(signal.stopLoss, signal.takeProfit) &&
    price < Math.max(signal.stopLoss, signal.takeProfit)
  );
}

/** Only settings that affect whether/how an order is authorized are captured. */
export function automaticSettingsKey(
  preferences: Preferences,
  combo: StrategyCombo,
): string {
  return JSON.stringify({
    executionMode: preferences.executionMode,
    executor: preferences.automationExecutor,
    symbol: preferences.symbol,
    timeframe: preferences.timeframe,
    risk: preferences.risk,
    combo,
  });
}

export function automaticSettingsStillMatch(
  preferences: Preferences,
  combo: StrategyCombo,
  capturedKey: string,
  signal: Signal,
  stake: number,
  multiplier: number,
): boolean {
  const age = Date.now() - signal.createdAt;
  return (
    preferences.executionMode === "automatic" &&
    preferences.automationExecutor === "browser" &&
    preferences.symbol === signal.symbol &&
    preferences.timeframe === signal.timeframe &&
    combo.id === signal.comboId &&
    preferences.risk.stake === stake &&
    preferences.risk.multiplier === multiplier &&
    Number.isFinite(age) &&
    age >= -5000 &&
    age <= 120_000 &&
    automaticSettingsKey(preferences, combo) === capturedKey
  );
}

export function manualSettingsStillMatch(
  preferences: Preferences,
  combo: StrategyCombo,
  capturedKey: string,
  signal: Signal,
  stake: number,
  multiplier: number,
): boolean {
  return (
    preferences.executionMode !== "signals" &&
    preferences.symbol === signal.symbol &&
    preferences.timeframe === signal.timeframe &&
    preferences.risk.stake === stake &&
    preferences.risk.multiplier === multiplier &&
    automaticSettingsKey(preferences, combo) === capturedKey
  );
}
