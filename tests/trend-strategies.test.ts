import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import {
  evaluateStrategy,
  generateSignal,
  getTrendState,
  profileForCombo,
  recommendComboId,
  STRATEGY_CATALOG,
  STRATEGY_PROFILES,
  strategyProfile,
  TREND_MIN_CANDLES,
} from "../src/lib/strategies";
import { sanitizeCombo } from "../src/lib/validation";
import type { Candle, StrategyCombo, TradeDirection } from "../src/lib/types";

// Deterministic price paths test entry rules, not profitability. Prices are
// normalized so the same observable setup can also be mirrored into a short.
function risingHistory(): Candle[] {
  return Array.from({ length: 300 }, (_, index) => {
    const close = 100 + index * 0.04;
    return {
      time: 1_700_000_000 + index * 3600,
      open: close - 0.03,
      high: close + 0.12,
      low: close - 0.15,
      close,
    };
  });
}

function append(
  candles: Candle[],
  open: number,
  high: number,
  low: number,
  close: number,
): void {
  candles.push({ time: candles.at(-1)!.time + 3600, open, high, low, close });
}

function mirror(candles: Candle[]): Candle[] {
  return candles.map((candle) => ({
    ...candle,
    open: 250 - candle.open,
    high: 250 - candle.low,
    low: 250 - candle.high,
    close: 250 - candle.close,
  }));
}

function pullbackFixture(confirm = true): Candle[] {
  const candles = risingHistory();
  const top = candles.at(-1)!.close;
  append(candles, top, top + 0.04, top - 0.24, top - 0.16);
  append(candles, top - 0.16, top - 0.12, top - 0.4, top - 0.32);
  append(candles, top - 0.32, top - 0.28, top - 0.48, top - 0.42);
  if (confirm) append(candles, top - 0.4, top - 0.03, top - 0.65, top - 0.08);
  return candles;
}

function retestFixture(confirm = true): Candle[] {
  const candles = risingHistory();
  const top = candles.at(-1)!.close;
  append(candles, top + 0.05, top + 0.65, top, top + 0.6);
  if (confirm) append(candles, top + 0.18, top + 0.45, top + 0.03, top + 0.4);
  return candles;
}

function channelFixture(): Candle[] {
  const candles = risingHistory();
  const top = candles.at(-1)!.close;
  append(candles, top - 0.05, top + 0.4, top - 0.1, top + 0.35);
  return candles;
}

function momentumFixture(confirm = true): Candle[] {
  const candles = pullbackFixture(false);
  // Momentum recovers gradually; only the fourth resumption candle crosses the
  // MACD histogram through zero, after the adverse price movement reset it.
  for (let index = 0; index < (confirm ? 4 : 3); index += 1) {
    const previous = candles.at(-1)!.close;
    const close = previous + 0.2;
    append(candles, previous, close + 0.07, previous - 0.07, close);
  }
  return candles;
}

const fixtures: Record<string, () => Candle[]> = {
  "v14-eurusd-pullback": pullbackFixture,
  "v14-gbpusd-retest": retestFixture,
  "v14-usdjpy-momentum": momentumFixture,
  "v14-audusd-channel": channelFixture,
  "v14-xauusd-pullback": pullbackFixture,
  "v14-general-pullback": pullbackFixture,
};

function factoryCombo(id: string): StrategyCombo {
  const combo = DEFAULT_COMBOS.find((candidate) => candidate.id === id);
  assert.ok(combo, `Missing factory combo ${id}`);
  return structuredClone(combo);
}

function legacyCombo(id: string): StrategyCombo {
  return {
    id: `saved-${id}`,
    name: "Saved custom combination",
    minConfidence: 50,
    minAgreement: 1,
    strategies: [{ id, enabled: true, weight: 1 }],
    createdAt: 1,
  };
}

for (const profile of STRATEGY_PROFILES) {
  for (const direction of ["UP", "DOWN"] satisfies TradeDirection[]) {
    test(`${profile.id} confirms a complete ${direction} setup and preserves stop/target geometry`, () => {
      const rising = fixtures[profile.id]();
      const candles = direction === "UP" ? rising : mirror(rising);
      const symbol = profile.symbol ?? "cryBTCUSD";
      assert.equal(getTrendState(candles).direction, direction);
      const vote = evaluateStrategy(profile.id, candles, {
        symbol,
        timeframe: profile.timeframe,
      });
      assert.equal(vote.direction, direction, vote.reason);
      const signal = generateSignal(
        candles,
        symbol,
        profile.timeframe,
        factoryCombo(profile.id),
        profile.atrStop,
        profile.riskReward,
      );
      assert.ok(signal);
      assert.equal(signal.direction, direction);
      assert.equal(signal.entry, candles.at(-1)!.close);
      const sign = direction === "UP" ? 1 : -1;
      const stopDistance = sign * (signal.entry - signal.stopLoss);
      const targetDistance = sign * (signal.takeProfit - signal.entry);
      assert.ok(stopDistance > 0);
      assert.ok(targetDistance > 0);
      assert.ok(Math.abs(targetDistance / stopDistance - profile.riskReward) < 1e-9);
      assert.equal(signal.comboId, profile.id);
      assert.ok(signal.confidence >= profile.minConfidence);
    });
  }

  if (profile.symbol) {
    test(`${profile.id} cannot trade another pair or silently assume a missing symbol`, () => {
      const candles = fixtures[profile.id]();
      const symbol = profile.symbol === "frxEURUSD" ? "frxGBPUSD" : "frxEURUSD";
      assert.equal(evaluateStrategy(profile.id, candles).direction, "WAIT");
      assert.equal(evaluateStrategy(profile.id, candles, { symbol }).direction, "WAIT");
      assert.equal(
        generateSignal(candles, symbol, 3600, factoryCombo(profile.id)),
        null,
      );
    });
  }
}

test("all six factory combinations contain one complete setup plus News Guard and survive validation", () => {
  assert.equal(STRATEGY_PROFILES.length, 6);
  assert.equal(DEFAULT_COMBOS.length, 6);
  assert.equal(DEFAULT_PREFERENCES.symbol, "frxEURUSD");
  assert.equal(DEFAULT_PREFERENCES.timeframe, 3600);
  for (const combo of DEFAULT_COMBOS) {
    assert.equal(combo.minAgreement, 1);
    assert.deepEqual(
      combo.strategies.map((config) => config.id),
      [combo.id, "news-guard"],
    );
    assert.deepEqual(sanitizeCombo(combo), combo);
    assert.equal(profileForCombo(combo)?.id, combo.id);
    assert.ok(STRATEGY_CATALOG.some((method) => method.id === combo.id));
    assert.equal(strategyProfile(combo.id)?.id, combo.id);
  }
});

test("profile discovery supports custom clones and avoids ambiguous mixed profiles", () => {
  const clone = {
    ...factoryCombo("v14-eurusd-pullback"),
    id: "custom-copy",
    name: "My settings",
  };
  assert.equal(profileForCombo(clone)?.id, "v14-eurusd-pullback");
  clone.strategies.push({ id: "v14-general-pullback", enabled: true, weight: 1 });
  assert.equal(profileForCombo(clone), undefined);
});

test("shared trend gate waits for sufficient valid data and rejects flat or compressed markets", () => {
  assert.equal(TREND_MIN_CANDLES, 205);
  const candles = risingHistory();
  assert.equal(getTrendState(candles.slice(0, 204)).direction, "WAIT");
  assert.equal(getTrendState(candles.slice(0, 205)).direction, "UP");
  assert.equal(getTrendState(mirror(candles)).direction, "DOWN");
  const flat = candles.map((candle) => ({
    ...candle,
    open: 100,
    high: 100.2,
    low: 99.8,
    close: 100,
  }));
  assert.equal(getTrendState(flat).direction, "WAIT");
  assert.match(getTrendState(flat).reason, /flat|compressed/i);
  const invalid = structuredClone(candles);
  invalid.at(-1)!.high = invalid.at(-1)!.close - 1;
  assert.equal(getTrendState(invalid).direction, "WAIT");
  assert.match(getTrendState(invalid).reason, /invalid/i);
  const outOfOrder = [...candles, candles.at(-2)!];
  assert.equal(getTrendState(outOfOrder).direction, "WAIT");
  const state = getTrendState(candles);
  assert.ok(state.ema50 && state.ema200 && state.atr);
  assert.equal(state.confirmedAt, candles.at(-1)!.time);
});

test("all configured methods and saved custom combinations wait in a flat market", () => {
  const flat = risingHistory().map((candle) => ({
    ...candle,
    open: 100,
    high: 100.2,
    low: 99.8,
    close: 100,
  }));
  for (const profile of STRATEGY_PROFILES) {
    const symbol = profile.symbol ?? "frxEURUSD";
    assert.equal(
      generateSignal(flat, symbol, profile.timeframe, factoryCombo(profile.id)),
      null,
    );
  }
  assert.equal(generateSignal(flat, "frxEURUSD", 3600, legacyCombo("ema-trend")), null);
});

for (const id of [
  "v14-eurusd-pullback",
  "v14-xauusd-pullback",
  "v14-general-pullback",
]) {
  test(`${id} waits for a real pullback and its first completed resumption`, () => {
    const symbol = strategyProfile(id)?.symbol ?? "frxEURUSD";
    for (const candles of [risingHistory(), pullbackFixture(false)]) {
      assert.equal(getTrendState(candles).direction, "UP");
      assert.equal(evaluateStrategy(id, candles, { symbol }).direction, "WAIT");
      assert.equal(generateSignal(candles, symbol, 3600, factoryCombo(id)), null);
    }
    const resumed = pullbackFixture();
    const close = resumed.at(-1)!.close;
    append(resumed, close, close + 0.15, close - 0.1, close + 0.1);
    assert.match(evaluateStrategy(id, resumed, { symbol }).reason, /already resumed/i);
    assert.equal(generateSignal(resumed, symbol, 3600, factoryCombo(id)), null);
  });
}

test("GBPUSD waits after a breakout until the boundary is actually retested", () => {
  const candles = retestFixture(false);
  assert.equal(getTrendState(candles).direction, "UP");
  assert.equal(
    evaluateStrategy("v14-gbpusd-retest", candles, { symbol: "frxGBPUSD" }).direction,
    "WAIT",
  );
  const top = candles[299].close;
  append(candles, top + 0.6, top + 0.9, top + 0.5, top + 0.8);
  assert.equal(
    evaluateStrategy("v14-gbpusd-retest", candles, { symbol: "frxGBPUSD" }).direction,
    "WAIT",
  );
});

test("later ATR expansion cannot revive a GBPUSD breakout invalidated by an earlier close", () => {
  const candles = retestFixture(false);
  const top = candles[299].close;
  // The broken boundary is top+0.12. This close is 0.20 below it, beyond
  // half of the preceding ATR (~0.321), so the breakout has already failed.
  append(candles, top + 0.5, top + 0.55, top - 0.14, top - 0.08);
  // A later wide red candle increases ATR to ~0.473 without qualifying as a
  // retest. Using that later ATR would retrospectively forgive the failed close.
  append(candles, top + 0.2, top + 0.9, top - 0.2, top + 0.15);
  append(candles, top + 0.14, top + 0.35, top + 0.05, top + 0.3);
  for (const path of [candles, mirror(candles)]) {
    assert.notEqual(getTrendState(path).direction, "WAIT");
    assert.equal(
      evaluateStrategy("v14-gbpusd-retest", path, { symbol: "frxGBPUSD" }).direction,
      "WAIT",
    );
    assert.equal(
      generateSignal(path, "frxGBPUSD", 3600, factoryCombo("v14-gbpusd-retest")),
      null,
    );
  }
});

test("AUDUSD requires a close beyond the old channel, not a wick through it", () => {
  const candles = channelFixture();
  candles.at(-1)!.close = candles[299].close + 0.1;
  assert.equal(getTrendState(candles).direction, "UP");
  assert.equal(
    evaluateStrategy("v14-audusd-channel", candles, { symbol: "frxAUDUSD" }).direction,
    "WAIT",
  );
});

test("USDJPY waits until momentum crosses back and does not repeat the same restart", () => {
  const id = "v14-usdjpy-momentum";
  const symbol = "frxUSDJPY";
  assert.equal(evaluateStrategy(id, risingHistory(), { symbol }).direction, "WAIT");
  assert.equal(
    evaluateStrategy(id, momentumFixture(false), { symbol }).direction,
    "WAIT",
  );
  const candles = momentumFixture();
  assert.equal(evaluateStrategy(id, candles, { symbol }).direction, "UP");
  const close = candles.at(-1)!.close;
  append(candles, close, close + 0.27, close - 0.07, close + 0.2);
  assert.equal(evaluateStrategy(id, candles, { symbol }).direction, "WAIT");
});

test("Gold requires a rejection wick and rejects a volatility shock before accepting its pattern", () => {
  const id = "v14-xauusd-pullback";
  const symbol = "frxXAUUSD";
  const withoutWick = pullbackFixture();
  withoutWick.at(-1)!.low = withoutWick.at(-1)!.open - 0.01;
  assert.match(evaluateStrategy(id, withoutWick, { symbol }).reason, /rejection wick/i);
  const shock = pullbackFixture();
  shock.at(-1)!.low -= 2;
  assert.equal(getTrendState(shock).direction, "UP");
  assert.match(evaluateStrategy(id, shock, { symbol }).reason, /exceeds 2.5/i);
  assert.equal(generateSignal(shock, symbol, 3600, factoryCombo(id)), null);
});

test("saved reversal combinations retain raw votes but cannot generate countertrend entries in either direction", () => {
  const candles = risingHistory();
  const close = candles.at(-1)!.close;
  append(candles, close, close + 1.1, close - 0.1, close + 1);
  for (const path of [candles, mirror(candles)]) {
    const trend = getTrendState(path).direction;
    const reversal = evaluateStrategy("bollinger-reversion", path);
    assert.notEqual(trend, "WAIT");
    assert.notEqual(reversal.direction, "WAIT");
    assert.notEqual(reversal.direction, trend);
    assert.equal(
      generateSignal(path, "frxEURUSD", 3600, legacyCombo("bollinger-reversion")),
      null,
    );
  }
});

test("aligned legacy methods still generate entries after the shared trend gate", () => {
  for (const candles of [risingHistory(), mirror(risingHistory())]) {
    const signal = generateSignal(candles, "frxEURUSD", 3600, legacyCombo("ema-trend"));
    assert.ok(signal);
    assert.equal(signal.direction, getTrendState(candles).direction);
  }
});

test("strong extra EMA votes cannot bypass an incomplete configured pullback", () => {
  const combo = factoryCombo("v14-general-pullback");
  combo.minConfidence = 50;
  combo.strategies[0].weight = 0.1;
  combo.strategies.push({ id: "ema-trend", enabled: true, weight: 5 });
  const candles = risingHistory();
  assert.equal(evaluateStrategy("ema-trend", candles).direction, "UP");
  assert.equal(generateSignal(candles, "frxEURUSD", 3600, combo), null);
});

test("News Guard checks the completed candle's decision time, including the USD leg of Gold", () => {
  const candles = pullbackFixture();
  const combo = factoryCombo("v14-xauusd-pullback");
  const event = {
    id: "test-calendar-event",
    title: "High-impact USD event",
    currency: "USD",
    impact: "high" as const,
    // 10 minutes after candle close, but 70 minutes after candle open.
    time: (candles.at(-1)!.time + 3600 + 600) * 1000,
  };
  assert.ok(generateSignal(candles, "frxXAUUSD", 3600, combo));
  assert.equal(generateSignal(candles, "frxXAUUSD", 3600, combo, 2, 2, [event]), null);
  combo.strategies.find((config) => config.id === "news-guard")!.enabled = false;
  assert.ok(generateSignal(candles, "frxXAUUSD", 3600, combo, 2, 2, [event]));
});

test("recommendation selects each matching configured pair and the general profile for other markets", () => {
  for (const profile of STRATEGY_PROFILES.filter((candidate) => candidate.symbol)) {
    assert.equal(
      recommendComboId(profile.symbol!, profile.timeframe, "range", DEFAULT_COMBOS),
      profile.id,
    );
  }
  assert.equal(
    recommendComboId("cryBTCUSD", 3600, "trend", DEFAULT_COMBOS),
    "v14-general-pullback",
  );
  assert.equal(
    recommendComboId("frxEURGBP", 300, "range", DEFAULT_COMBOS),
    "v14-general-pullback",
  );
});
