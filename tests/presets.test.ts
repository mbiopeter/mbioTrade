import assert from "node:assert/strict";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import { buildPresetSelection } from "../src/lib/strategy-presets";
import { profileForCombo, STRATEGY_PROFILES } from "../src/lib/strategies";
import type { Preferences, StrategyCombo } from "../src/lib/types";

const preferences: Preferences = {
  ...DEFAULT_PREFERENCES,
  symbol: "cryBTCUSD",
  marketClass: "cryptocurrency",
  timeframe: 900,
  executionMode: "automatic",
  automationExecutor: "worker",
  derivAppId: "saved-app-id",
  notifySignals: false,
  notifyMinConfidence: 83,
  compactSidebar: true,
  risk: {
    ...DEFAULT_PREFERENCES.risk,
    stake: 20,
    multiplier: 200,
    atrStop: 3.5,
    riskReward: 4,
    marginBudget: 40,
    maxDailyDemoLoss: 12,
    maxOpenDemoTrades: 2,
    cooldownMinutes: 30,
  },
  googleSync: {
    enabled: true,
    clientId: "saved-sync-client",
    autoSync: true,
    lastFileId: "saved-file",
    lastSyncAt: 123456,
  },
};
const custom: StrategyCombo = {
  id: "existing-custom",
  name: "Existing saved strategy",
  strategies: [{ id: "ema-trend", enabled: true, weight: 1.3 }],
  minAgreement: 1,
  minConfidence: 72,
  createdAt: 12345,
};
const originalPreferences = JSON.stringify(preferences);
const originalDefaults = JSON.stringify(DEFAULT_COMBOS);
const originalCustom = JSON.stringify(custom);

assert.equal(STRATEGY_PROFILES.length, 6);
for (const profile of STRATEGY_PROFILES) {
  const combos = [custom, ...DEFAULT_COMBOS];
  const result = buildPresetSelection(
    profile.id,
    preferences,
    combos,
    "unused-copy",
    99999,
  );
  assert.ok(result);
  assert.equal(result.activeComboId, profile.id);
  assert.equal(result.preferences.executionMode, "signals");
  assert.equal(result.preferences.symbol, profile.symbol ?? preferences.symbol);
  assert.equal(
    result.preferences.marketClass,
    profile.marketClass ?? preferences.marketClass,
  );
  assert.equal(result.preferences.timeframe, profile.timeframe);
  assert.deepEqual(result.preferences.risk, {
    ...preferences.risk,
    atrStop: profile.atrStop,
    riskReward: profile.riskReward,
  });
  const expected: Preferences = {
    ...preferences,
    executionMode: "signals",
    symbol: profile.symbol ?? preferences.symbol,
    marketClass: profile.marketClass ?? preferences.marketClass,
    timeframe: profile.timeframe,
    risk: {
      ...preferences.risk,
      atrStop: profile.atrStop,
      riskReward: profile.riskReward,
    },
  };
  assert.deepEqual(
    result.preferences,
    expected,
    "Only disclosed preference fields may change.",
  );
  assert.equal(
    result.preferences.automationExecutor,
    "worker",
    "Applying must not change the selected executor.",
  );
  assert.equal(result.preservedCustomCopy, false);
  assert.equal(result.combos.length, combos.length);
  assert.equal(result.combos[0], custom, "Existing custom combinations remain intact.");
  const restored = result.combos.find((combo) => combo.id === profile.id);
  const factory = DEFAULT_COMBOS.find((combo) => combo.id === profile.id);
  assert.ok(restored);
  assert.ok(factory);
  assert.deepEqual(restored, factory);
  assert.notEqual(restored.strategies, factory.strategies);
  assert.equal(restored.minConfidence, profile.minConfidence);
  assert.equal(restored.minAgreement, 1);
  assert.equal(profileForCombo(restored)?.id, profile.id);
}

const gold = DEFAULT_COMBOS.find((combo) => combo.id === "v14-xauusd-pullback");
assert.ok(gold);
const editedGold: StrategyCombo = {
  ...gold,
  name: "My gold settings",
  minConfidence: 85,
  strategies: gold.strategies.map((strategy) => ({ ...strategy, weight: 1.7 })),
};
const editedCombos = [
  custom,
  ...DEFAULT_COMBOS.map((combo) => (combo.id === gold.id ? editedGold : combo)),
];
const beforeRestore = JSON.stringify(editedCombos);
const restored = buildPresetSelection(
  gold.id,
  preferences,
  editedCombos,
  "preserved-gold",
  99999,
);
assert.ok(restored);
assert.equal(restored.preservedCustomCopy, true);
assert.deepEqual(
  restored.combos.find((combo) => combo.id === gold.id),
  gold,
);
const preserved = restored.combos.find((combo) => combo.id === "preserved-gold");
assert.ok(preserved);
assert.deepEqual(preserved, {
  ...editedGold,
  id: "preserved-gold",
  name: "My gold settings (saved copy)",
  createdAt: 99999,
});
assert.equal(
  profileForCombo(preserved)?.symbol,
  "frxXAUUSD",
  "A copied method retains its pair scope.",
);
assert.notEqual(preserved.strategies, editedGold.strategies);
assert.equal(
  JSON.stringify(editedCombos),
  beforeRestore,
  "Applying must not mutate loaded combinations.",
);

const appliedAgain = buildPresetSelection(
  gold.id,
  restored.preferences,
  restored.combos,
  "another-copy",
);
assert.ok(appliedAgain);
assert.equal(appliedAgain.preservedCustomCopy, false);
assert.equal(
  appliedAgain.combos.length,
  restored.combos.length,
  "Reapplying a canonical preset adds no copies.",
);
assert.throws(
  () => buildPresetSelection(gold.id, preferences, editedCombos, custom.id),
  /unique combination ID/,
  "A saved copy must not overwrite an existing custom combination.",
);

const missingFactory = buildPresetSelection(
  gold.id,
  preferences,
  [custom],
  "unused-copy",
);
assert.ok(missingFactory);
assert.deepEqual(missingFactory.combos, [custom, gold]);
assert.equal(missingFactory.activeComboId, gold.id);
assert.equal(
  buildPresetSelection("unknown-preset", preferences, [custom], "unused-copy"),
  null,
);
assert.equal(JSON.stringify(preferences), originalPreferences);
assert.equal(JSON.stringify(DEFAULT_COMBOS), originalDefaults);
assert.equal(JSON.stringify(custom), originalCustom);

console.log(
  "v14 preset configuration, preserved edits, account settings and pair scope tests passed.",
);
