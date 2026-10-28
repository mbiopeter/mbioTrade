import assert from "node:assert/strict";
import { runBacktest } from "../src/lib/backtest";
import { positionForwardBars, resolveEntryCandleTime } from "../src/lib/chart-position";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import { DERIV_APP_ID_EXAMPLE, isValidDerivAppId } from "../src/lib/deriv-app-id";
import { atr, ema, rsi } from "../src/lib/indicators";
import {
  ACCEPTED_MULTIPLIERS,
  assertAcceptedMultiplier,
  isAcceptedMultiplier,
  sanitizeMultiplier,
} from "../src/lib/multipliers";
import { buildManualTradePlan } from "../src/lib/manual-trade";
import { estimatePositionPnl, positionMetrics } from "../src/lib/position-metrics";
import {
  assertTradeAmount,
  DEFAULT_TRADE_AMOUNT,
  isValidTradeAmount,
  MIN_TRADE_AMOUNT,
  sanitizeTradeAmount,
} from "../src/lib/trade-amount";
import { canAutoDemoTrade } from "../src/lib/risk";
import {
  detectRegime,
  evaluateStrategy,
  generateSignal,
  recommendComboId,
  STRATEGY_CATALOG,
} from "../src/lib/strategies";
import {
  sanitizePreferences,
  sanitizeWorkspace,
  validateCredentials,
} from "../src/lib/validation";
import type { Candle, DemoTrade, MarketClass } from "../src/lib/types";

function isMarketClass(value: string): value is MarketClass {
  return value === "forex" || value === "cryptocurrency" || value === "metals";
}

const candles: Candle[] = Array.from({ length: 260 }, (_, index) => {
  const base = 100 + index * 0.12 + Math.sin(index / 6) * 0.8;
  const close = base + Math.sin(index / 2) * 0.12;
  return {
    time: 1_700_000_000 + index * 300,
    open: base - 0.05,
    high: Math.max(base, close) + 0.2,
    low: Math.min(base, close) - 0.2,
    close,
  };
});

assert.equal(ema([1, 2, 3, 4, 5], 3).length, 5);
assert.equal(rsi(candles.map((candle) => candle.close)).length, candles.length);
assert.equal(atr(candles).length, candles.length);

assert.deepEqual(ACCEPTED_MULTIPLIERS, [100, 200, 300, 500, 800]);
for (const multiplier of ACCEPTED_MULTIPLIERS) {
  assert.equal(isAcceptedMultiplier(multiplier), true);
  assert.doesNotThrow(() => assertAcceptedMultiplier(multiplier));
}
assert.equal(isAcceptedMultiplier(7), false);
assert.throws(() => assertAcceptedMultiplier(7), /Accepts 100,200,300,500,800/);
assert.equal(sanitizeMultiplier(7), 100);

assert.equal(DEFAULT_TRADE_AMOUNT, 20);
assert.equal(MIN_TRADE_AMOUNT, 1);
assert.equal(isValidTradeAmount(20), true);
assert.equal(isValidTradeAmount(1), true);
assert.equal(isValidTradeAmount(0.35), false);
assert.equal(sanitizeTradeAmount(0.35), 20);
assert.equal(sanitizeTradeAmount("25.75"), 25.75);
assert.equal(assertTradeAmount(1), 1);
assert.throws(() => assertTradeAmount(0.99), /at least 1\.00/);

const manualLong = buildManualTradePlan(
  candles,
  "frxEURUSD",
  300,
  "UP",
  DEFAULT_PREFERENCES.risk,
  (candles.at(-1)!.time + 300) * 1000,
);
assert.ok(manualLong);
assert.equal(manualLong.direction, "UP");
assert.equal(manualLong.confidence, 0);
assert.ok(manualLong.stopLoss < manualLong.entry);
assert.ok(manualLong.takeProfit > manualLong.entry);
assert.equal(manualLong.comboId, "manual-entry");

const manualShort = buildManualTradePlan(
  candles.map((candle) => ({
    ...candle,
    open: 300 - candle.open,
    high: 300 - candle.low,
    low: 300 - candle.high,
    close: 300 - candle.close,
  })),
  "frxEURUSD",
  300,
  "DOWN",
  DEFAULT_PREFERENCES.risk,
  (candles.at(-1)!.time + 300) * 1000,
);
assert.ok(manualShort);
assert.ok(manualShort.stopLoss > manualShort.entry);
assert.ok(manualShort.takeProfit < manualShort.entry);
assert.equal(
  buildManualTradePlan(candles, "frxEURUSD", 300, "DOWN", DEFAULT_PREFERENCES.risk),
  null,
  "a manual short cannot bypass the confirmed uptrend",
);
assert.equal(
  buildManualTradePlan([], "frxEURUSD", 300, "UP", DEFAULT_PREFERENCES.risk),
  null,
);

const entryTrade: DemoTrade = {
  id: "entry-anchor",
  symbol: "frxEURUSD",
  direction: "UP",
  entry: candles[120].close,
  stopLoss: candles[120].close - 1,
  takeProfit: candles[120].close + 2,
  stake: 20,
  multiplier: 500,
  openedAt: (candles[120].time + 120) * 1000,
  status: "open",
  source: "manual",
};
assert.equal(resolveEntryCandleTime(candles, entryTrade), candles[120].time);
assert.equal(positionForwardBars(1), 10);
assert.ok(positionForwardBars(300) > positionForwardBars(1));
assert.equal(positionForwardBars(10_000), 36);

const estimatedProfit = estimatePositionPnl(entryTrade, entryTrade.entry * 1.001);
assert.ok(estimatedProfit !== null && estimatedProfit > 0);
const brokerMetrics = positionMetrics(
  entryTrade,
  {
    tradeId: entryTrade.id,
    contractId: 123,
    currentSpot: entryTrade.entry * 1.001,
    profit: 4.25,
    isSold: false,
    updatedAt: Date.now(),
  },
  entryTrade.entry * 1.002,
);
assert.equal(brokerMetrics.source, "broker");
assert.equal(brokerMetrics.pnl, 4.25);
const chartMetrics = positionMetrics(entryTrade, undefined, entryTrade.entry * 1.001);
assert.equal(chartMetrics.source, "chart");
assert.ok(chartMetrics.pnl !== null && chartMetrics.pnl > 0);

const signal = generateSignal(candles, "frxEURUSD", 300, DEFAULT_COMBOS[0], 1.5, 2);
assert.ok(signal === null || ["UP", "DOWN"].includes(signal.direction));
if (signal) {
  assert.equal(signal.comboId, DEFAULT_COMBOS[0].id);
  assert.equal(signal.comboName, DEFAULT_COMBOS[0].name);
}

for (const strategyId of [
  "smart-trend",
  "liquidity-sweep",
  "ema-confluence",
  "macd-flow",
  "structure-shift",
  "support-resistance",
]) {
  const evaluation = evaluateStrategy(strategyId, candles);
  assert.equal(evaluation.id, strategyId);
  assert.ok(["UP", "DOWN", "WAIT"].includes(evaluation.direction));
}
assert.ok(STRATEGY_CATALOG.length >= 16);

const backtest = runBacktest(candles, "TEST", 300, DEFAULT_COMBOS[0], {
  atrStop: 1.5,
  rr: 2,
  maxHoldBars: 12,
  stake: 5,
  multiplier: 500,
  startingBalance: 1000,
  commissionRate: 0,
});
assert.ok(Number.isFinite(backtest.netR));
assert.ok(backtest.totalTrades >= 0);
assert.ok(Number.isFinite(backtest.endingBalance));

assert.equal(isValidDerivAppId(DERIV_APP_ID_EXAMPLE), true);
assert.equal(isValidDerivAppId("1089"), false);
assert.equal(
  sanitizePreferences(
    { ...DEFAULT_PREFERENCES, derivAppId: DERIV_APP_ID_EXAMPLE },
    DEFAULT_PREFERENCES,
  ).derivAppId,
  DERIV_APP_ID_EXAMPLE,
);

const migratedMarket = sanitizePreferences(
  { ...DEFAULT_PREFERENCES, marketClass: "synthetic" as MarketClass },
  DEFAULT_PREFERENCES,
).marketClass;
assert.equal(isMarketClass(migratedMarket), true);
assert.equal(
  sanitizePreferences(
    { ...DEFAULT_PREFERENCES, marketClass: "metals" },
    DEFAULT_PREFERENCES,
  ).marketClass,
  "metals",
);

const safePreferences = sanitizePreferences(
  {
    ...DEFAULT_PREFERENCES,
    derivAppId: "abc",
    risk: {
      ...DEFAULT_PREFERENCES.risk,
      stake: -5,
      multiplier: 7 as 100,
    },
  },
  DEFAULT_PREFERENCES,
);
assert.equal(safePreferences.risk.stake, 20);
assert.equal(safePreferences.risk.multiplier, 100);
assert.equal(safePreferences.derivAppId, "");
assert.equal(safePreferences.compactSidebar, false);

const restored = sanitizeWorkspace(
  {
    preferences: {
      ...DEFAULT_PREFERENCES,
      risk: { ...DEFAULT_PREFERENCES.risk, multiplier: 10 },
    },
    combos: DEFAULT_COMBOS,
    signals: [],
    demoTrades: [
      {
        id: "x",
        symbol: "frxEURUSD",
        direction: "UP",
        entry: 1.08,
        stopLoss: 1.07,
        takeProfit: 1.1,
        stake: 0.35,
        multiplier: 10,
        openedAt: Date.now(),
        status: "open",
        source: "manual",
      },
    ],
    tradeEvents: [],
    activeComboId: DEFAULT_COMBOS[0].id,
  },
  DEFAULT_PREFERENCES,
  DEFAULT_COMBOS,
);
assert.equal(restored.version, 10);
assert.equal(restored.activeComboId, DEFAULT_COMBOS[0].id);
assert.deepEqual(restored.tradeEvents, []);
assert.equal(restored.preferences.risk.multiplier, 100);
assert.equal(restored.preferences.executionMode, "signals");
assert.equal(restored.demoTrades[0].multiplier, 10);
assert.equal(restored.demoTrades.length, 1);

assert.equal(
  validateCredentials({
    appId: DERIV_APP_ID_EXAMPLE,
    token: "abcdefghijklmnop",
    accountId: "VRTC123",
    accountMode: "demo",
    rememberSession: false,
  }).ok,
  true,
);
assert.equal(
  validateCredentials({
    appId: "1089",
    token: "abcdefghijklmnop",
    accountId: "VRTC123",
    accountMode: "demo",
    rememberSession: false,
  }).ok,
  false,
);
assert.equal(
  validateCredentials({
    appId: "",
    token: "short",
    accountId: "",
    accountMode: "demo",
    rememberSession: false,
  }).ok,
  false,
);

assert.equal(
  recommendComboId("frxXAUUSD", 900, "trend", DEFAULT_COMBOS),
  "v14-xauusd-pullback",
);
assert.equal(
  recommendComboId("frxEURUSD", 300, detectRegime(candles), DEFAULT_COMBOS),
  "v14-eurusd-pullback",
);

if (signal) {
  const gate = canAutoDemoTrade(signal, [], [], 1, 5, 10, 20, 15);
  assert.equal(gate.ok, false);
  assert.match(gate.reason ?? "", /margin|budget/i);
}

console.log("MbioTrade v14 core tests passed.");
