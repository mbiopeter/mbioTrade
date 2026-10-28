import { DEFAULT_COMBOS } from "./defaults";
import { strategyProfile } from "./strategies";
import type { Preferences, StrategyCombo } from "./types";

export type PresetSelection = {
  preferences: Preferences;
  combos: StrategyCombo[];
  activeComboId: string;
  preservedCustomCopy: boolean;
};

function comboDefinition(combo: StrategyCombo): string {
  return JSON.stringify({
    name: combo.name,
    minConfidence: combo.minConfidence,
    minAgreement: combo.minAgreement,
    strategies: [...combo.strategies].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  });
}

/** Apply documented preset settings while preserving account limits and user edits. */
export function buildPresetSelection(
  profileId: string,
  preferences: Preferences,
  combos: StrategyCombo[],
  savedCopyId: string,
  now = Date.now(),
): PresetSelection | null {
  const profile = strategyProfile(profileId);
  const factory = DEFAULT_COMBOS.find((combo) => combo.id === profileId);
  if (!profile || !factory) return null;

  const existing = combos.find((combo) => combo.id === factory.id);
  const preservedCustomCopy = Boolean(
    existing && comboDefinition(existing) !== comboDefinition(factory),
  );
  if (preservedCustomCopy && combos.some((combo) => combo.id === savedCopyId)) {
    throw new Error(
      "A unique combination ID is required to preserve your edited preset.",
    );
  }
  const restored: StrategyCombo = {
    ...factory,
    strategies: factory.strategies.map((strategy) => ({ ...strategy })),
  };
  const nextCombos = existing
    ? combos.map((combo) => (combo.id === factory.id ? restored : combo))
    : [...combos, restored];
  if (preservedCustomCopy && existing) {
    nextCombos.push({
      ...existing,
      id: savedCopyId,
      name: `${existing.name.slice(0, 47)} (saved copy)`,
      strategies: existing.strategies.map((strategy) => ({ ...strategy })),
      createdAt: now,
    });
  }

  return {
    preferences: {
      ...preferences,
      symbol: profile.symbol ?? preferences.symbol,
      marketClass: profile.marketClass ?? preferences.marketClass,
      timeframe: profile.timeframe,
      executionMode: "signals",
      risk: {
        ...preferences.risk,
        atrStop: profile.atrStop,
        riskReward: profile.riskReward,
      },
    },
    combos: nextCombos,
    activeComboId: restored.id,
    preservedCustomCopy,
  };
}
