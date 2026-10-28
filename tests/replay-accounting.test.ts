import assert from "node:assert/strict";
import { runBacktest } from "../src/lib/backtest";
import type { Candle, StrategyCombo } from "../src/lib/types";

const candles: Candle[] = Array.from({ length: 300 }, (_, index) => {
  const close = 100 + index * 0.1;
  return {
    time: 1_700_000_000 + index * 60,
    open: close - 0.04,
    high: close + 0.1,
    low: close - 0.1,
    close,
  };
});
const combo: StrategyCombo = {
  id: "causal-replay",
  name: "Trend accounting fixture",
  createdAt: 0,
  minConfidence: 1,
  minAgreement: 1,
  strategies: [{ id: "ema-trend", enabled: true, weight: 1 }],
};
const options = {
  atrStop: 50,
  rr: 10,
  maxHoldBars: 12,
  stake: 20,
  multiplier: 100,
  commissionRate: 0,
};
const result = runBacktest(candles, "frxEURUSD", 60, combo, options);
assert.ok(
  result.trades.length > 2,
  "the fixture exercises several sequential settlements",
);
assert.equal(
  result.trades[0].entryTime,
  candles[204].time + 60,
  "entry is timestamped when the signal candle closes",
);
assert.equal(
  result.trades[0].exitTime,
  candles[216].time + 60,
  "timeout settlement is timestamped at the exit candle close",
);
let balance = 1000;
for (let index = 0; index < result.trades.length; index += 1) {
  const trade = result.trades[index];
  assert.ok(trade.exitTime > trade.entryTime);
  if (index > 0)
    assert.ok(
      trade.entryTime >= result.trades[index - 1].exitTime,
      "future settlement cannot fund an earlier overlapping entry",
    );
  balance = Math.max(0, balance + trade.pnl);
  assert.ok(Math.abs(trade.balanceAfter - balance) < 1e-8);
}
assert.equal(result.endingBalance, balance);
assert.equal(
  runBacktest(candles.slice(0, 204), "frxEURUSD", 60, combo, options).totalTrades,
  0,
);
console.log(
  "Sequential replay accounting, closed-bar entry times and trend warmup passed.",
);
