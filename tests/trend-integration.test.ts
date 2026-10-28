import assert from "node:assert/strict";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import {
  automaticSettingsKey,
  manualSettingsStillMatch,
} from "../src/lib/execution-guard";
import { buildManualTradePlan } from "../src/lib/manual-trade";
import { getTrendState } from "../src/lib/strategies";
import {
  confirmedMarketCandles,
  isConfirmedHistoryCurrent,
} from "../src/lib/strategy-engine/candles";
import type { Candle, Preferences } from "../src/lib/types";

const start = 1_700_000_000;
const candles: Candle[] = Array.from({ length: 601 }, (_, index) => {
  const close = 100 + index * 0.1;
  return {
    time: start + index * 60,
    open: close - 0.04,
    high: close + 0.1,
    low: close - 0.1,
    close,
  };
});
const current = candles.at(-1)!;
const duringBar = (current.time + 30) * 1000;
const confirmed = confirmedMarketCandles(candles, 60, duringBar);
assert.equal(isConfirmedHistoryCurrent(confirmed, 60, duringBar), true);
assert.equal(isConfirmedHistoryCurrent(confirmed, 60, duringBar + 60_000), false);
const gapRows = [...candles.slice(0, -1), { ...current, time: current.time + 86_400 }];
assert.equal(
  buildManualTradePlan(
    gapRows,
    "frxEURUSD",
    60,
    "UP",
    DEFAULT_PREFERENCES.risk,
    duringBar + 86_400_000,
  ),
  null,
  "a current tick cannot revive yesterday's trend entry",
);
assert.equal(confirmed.length, 600);
assert.equal(confirmed.at(-1)?.time, candles[599].time);
assert.equal(
  confirmedMarketCandles(candles, 60, (current.time + 60) * 1000).at(-1)?.time,
  current.time,
);
assert.equal(confirmedMarketCandles(candles, 60, duringBar, Infinity).length, 600);
assert.deepEqual(confirmedMarketCandles(candles, 60, NaN), []);
assert.equal(getTrendState(confirmed).direction, "UP");
const unfinishedCrash = [
  ...candles.slice(0, -1),
  { ...current, open: current.close, high: current.close + 0.1, low: 1, close: 1 },
];
assert.deepEqual(
  getTrendState(confirmedMarketCandles(unfinishedCrash, 60, duringBar)),
  getTrendState(confirmed),
  "an unfinished candle cannot rewrite the confirmed trend",
);
assert.equal(
  buildManualTradePlan(
    candles.slice(0, 205),
    "frxEURUSD",
    60,
    "UP",
    DEFAULT_PREFERENCES.risk,
    (candles[204].time + 30) * 1000,
  ),
  null,
  "manual entry requires 205 completed candles, not 204 plus the current bar",
);
const plan = buildManualTradePlan(
  candles,
  "frxEURUSD",
  60,
  "UP",
  DEFAULT_PREFERENCES.risk,
  duringBar,
);
assert.ok(plan);
assert.equal(plan.entry, current.close, "manual entry still uses the live price");
assert.equal(
  buildManualTradePlan(
    candles,
    "frxEURUSD",
    60,
    "DOWN",
    DEFAULT_PREFERENCES.risk,
    duringBar,
  ),
  null,
);
const preferences: Preferences = {
  ...DEFAULT_PREFERENCES,
  executionMode: "manual",
  timeframe: 60,
};
const combo = DEFAULT_COMBOS[0];
const captured = automaticSettingsKey(preferences, combo);
const matches = (next: Preferences) =>
  manualSettingsStillMatch(
    next,
    combo,
    captured,
    plan,
    preferences.risk.stake,
    preferences.risk.multiplier,
  );
assert.equal(matches(preferences), true);
assert.equal(matches({ ...preferences, executionMode: "signals" }), false);
assert.equal(matches({ ...preferences, symbol: "frxXAUUSD" }), false);
assert.equal(matches({ ...preferences, timeframe: 300 }), false);
assert.equal(
  matches({ ...preferences, risk: { ...preferences.risk, multiplier: 200 } }),
  false,
);
assert.equal(
  matches({ ...preferences, risk: { ...preferences.risk, stake: 30 } }),
  false,
);
assert.equal(
  manualSettingsStillMatch(
    preferences,
    { ...combo, minConfidence: 99 },
    captured,
    plan,
    preferences.risk.stake,
    preferences.risk.multiplier,
  ),
  false,
);
console.log("Confirmed-bar boundaries and manual pre-buy settings guards passed.");
