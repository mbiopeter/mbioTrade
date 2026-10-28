import assert from "node:assert/strict";
import {
  chartPositionLevels,
  positionAnnotationLayout,
  positionOpenedAt,
  positionOverlayBounds,
  resolveEntryCandleTime,
} from "../src/lib/chart-position";
import { tradeFromContract } from "../src/lib/deriv-reconciliation";
import type { Candle, DemoTrade } from "../src/lib/types";

// This is a fresh-browser broker restore: no local trade or saved plan exists.
const restored = tradeFromContract(
  {
    contract_id: 11001,
    contract_type: "MULTUP",
    underlying_symbol: "frxEURUSD",
    buy_price: 20,
    entry_spot: "1.1259",
    purchase_time: 1_798_000_120,
    multiplier: 100,
    profit: "3.25",
    limit_order: {
      stop_loss: { order_amount: 10 },
      take_profit: { order_amount: 15 },
    },
    is_sold: 0,
  },
  { accountId: "VRTC11001", accountMode: "demo" },
);
assert.ok(restored);
assert.equal(restored.source, "external");
assert.equal(restored.localStops, false);
const estimated = chartPositionLevels(restored);
assert.ok(estimated);
assert.equal(estimated.entry, 1.1259);
assert.equal(estimated.takeProfitSource, "estimate");
assert.equal(estimated.stopLossSource, "estimate");
assert.equal(estimated.excludesCommission, true);
assert.ok(Math.abs(estimated.takeProfit! - 1.1259 * (1 + 15 / 2000)) < 1e-12);
assert.ok(Math.abs(estimated.stopLoss! - 1.1259 * (1 - 10 / 2000)) < 1e-12);
assert.ok(Math.abs(estimated.riskReward! - 1.5) < 1e-10);
assert.notEqual(estimated.takeProfit, restored.brokerTakeProfit, "cash amounts are not plotted as spot prices");
assert.equal(restored.localStops, false, "a display estimate never enables local exit execution");

const feeAdjusted = chartPositionLevels({ ...restored, brokerCommission: 0.5 });
assert.ok(feeAdjusted);
assert.equal(feeAdjusted.excludesCommission, false);
assert.ok(Math.abs(feeAdjusted.takeProfit! - 1.1259 * (1 + 15.5 / 2000)) < 1e-12);
assert.ok(Math.abs(feeAdjusted.stopLoss! - 1.1259 * (1 - 9.5 / 2000)) < 1e-12);

const brokerBarriers = chartPositionLevels({
  ...restored,
  brokerLimitsKnown: true,
  brokerTakeProfitPrice: 1.137,
  brokerStopLossPrice: 1.121,
});
assert.equal(brokerBarriers?.takeProfit, 1.137);
assert.equal(brokerBarriers?.stopLoss, 1.121);
assert.equal(brokerBarriers?.takeProfitSource, "broker");
assert.equal(brokerBarriers?.stopLossSource, "broker");
assert.equal(brokerBarriers?.excludesCommission, false);
assert.equal(chartPositionLevels({
  ...restored,
  multiplier: 0,
  brokerTakeProfitPrice: 1.137,
})?.takeProfit, 1.137, "actual broker barriers do not require a price estimate");
assert.equal(restored.stopLoss, 0, "drawing must not invent local exit levels");
assert.equal(restored.brokerStopLoss, 10, "cash limits remain broker metadata");

const candles: Candle[] = [0, 300, 600].map((offset) => ({
  time: 1_798_000_000 + offset,
  open: 1.125,
  high: 1.126,
  low: 1.124,
  close: 1.1259,
}));
assert.equal(resolveEntryCandleTime(candles, restored), candles[0].time);
assert.equal(
  resolveEntryCandleTime(candles, { ...restored, entryTime: 1_798_000_420 }),
  candles[1].time,
  "the same broker entry maps to the selected timeframe's candle",
);
assert.equal(
  resolveEntryCandleTime(candles, { ...restored, entryTime: 1_797_000_000 }),
  candles[0].time,
  "positions older than loaded history remain drawable at its left boundary",
);
assert.equal(resolveEntryCandleTime([], restored), null);
assert.equal(positionOpenedAt({ openedAt: 0 }), null);
assert.equal(resolveEntryCandleTime(candles, { openedAt: 0 }), null);
assert.equal(
  positionOpenedAt({ openedAt: Number.NaN, entryTime: 1_798_000_120 }),
  1_798_000_120_000,
);
assert.equal(
  resolveEntryCandleTime(candles, {
    openedAt: restored.openedAt,
    entryTime: Number.NaN,
  }),
  candles[0].time,
  "an unusable candle timestamp can fall back to the broker opening time",
);

const local: DemoTrade = {
  ...restored,
  source: "manual",
  localStops: true,
  takeProfit: 1.13,
  stopLoss: 1.12,
};
const localLevels = chartPositionLevels({ ...local, brokerLimitsKnown: false });
assert.equal(localLevels?.takeProfit, 1.13);
assert.equal(localLevels?.stopLoss, 1.12);
assert.equal(localLevels?.takeProfitSource, "local");
assert.equal(localLevels?.stopLossSource, "local");
const partiallyKnown = chartPositionLevels({
  ...local,
  brokerLimitsKnown: false,
  stopLoss: Number.NaN,
});
assert.equal(partiallyKnown?.takeProfit, 1.13);
assert.equal(partiallyKnown?.stopLossSource, "estimate");
assert.equal(chartPositionLevels({
  ...local,
  brokerTakeProfitPrice: 1.14,
  brokerStopLossPrice: 1.11,
})?.takeProfit, 1.14, "broker barriers take priority over the old saved plan");

const removed = chartPositionLevels({
  ...local,
  brokerLimitsKnown: true,
  brokerTakeProfit: undefined,
  brokerStopLoss: undefined,
});
assert.equal(removed?.takeProfit, null, "removed broker orders must not resurrect local zones");
assert.equal(removed?.stopLoss, null);
assert.equal(removed?.riskReward, null);
const targetOnly = chartPositionLevels({
  ...restored,
  brokerStopLoss: undefined,
  brokerTakeProfitPrice: 1.14,
});
assert.equal(targetOnly?.takeProfit, 1.14);
assert.equal(targetOnly?.stopLoss, null);

const short = chartPositionLevels({ ...restored, direction: "DOWN", brokerCommission: 0.5 });
assert.ok(short);
assert.ok(Math.abs(short.takeProfit! - 1.1259 * (1 - 15.5 / 2000)) < 1e-12);
assert.ok(Math.abs(short.stopLoss! - 1.1259 * (1 + 9.5 / 2000)) < 1e-12);
assert.ok(short.takeProfit! < short.entry && short.stopLoss! > short.entry);
for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(chartPositionLevels({ ...restored, multiplier: invalid })?.takeProfit, null);
  assert.equal(chartPositionLevels({ ...restored, stake: invalid })?.stopLoss, null);
}
assert.equal(chartPositionLevels({
  ...restored,
  brokerTakeProfit: Number.NaN,
  brokerStopLoss: -10,
})?.takeProfit, null);
assert.equal(chartPositionLevels({
  ...restored,
  direction: "DOWN",
  brokerTakeProfit: 10000,
})?.takeProfit, null, "a cash limit that implies a nonpositive spot is not drawn");
for (const entry of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(chartPositionLevels({ ...restored, entry }), null);
}
for (const status of ["closed", "pending", "error"] as const) {
  assert.equal(chartPositionLevels({ ...restored, status }), null);
}
assert.equal(chartPositionLevels(null), null);

assert.deepEqual(positionOverlayBounds(100, 700, 600), {
  left: 100,
  width: 500,
  anchorOffset: 0,
});
assert.deepEqual(positionOverlayBounds(-300, 700, 600), {
  left: 0,
  width: 600,
  anchorOffset: -300,
});
assert.equal(positionOverlayBounds(700, 900, 600), null);
assert.equal(positionOverlayBounds(-500, -100, 600), null);
assert.equal(positionOverlayBounds(Number.NaN, 100, 600), null);

// On a full-history chart the three prices can occupy just a few pixels.
// Annotation layout must keep their text readable without moving price lines.
for (const [entry, target, stop, height, cardHeight] of [
  [56, 45, 58, 540, 72],
  [56, 60, 45, 540, 92],
  [310, 308, 315, 364, 118],
  [190, 70, 310, 364, 112],
]) {
  const layout = positionAnnotationLayout(entry, target, stop, height, cardHeight);
  const badges = [layout.entry, layout.takeProfit!, layout.stopLoss!].sort((a, b) => a - b);
  assert.ok(badges[0] - 10 >= 52, "badges clear the existing chart header");
  assert.ok(badges[2] + 10 <= height - 12, "badges stay in the chart");
  assert.ok(badges[1] - badges[0] >= 26 && badges[2] - badges[1] >= 26);
  assert.ok(layout.pnlTop >= 52 && layout.pnlTop + cardHeight <= height - 12);
  for (const badge of badges) {
    assert.ok(
      layout.pnlTop + cardHeight <= badge - 10 || layout.pnlTop >= badge + 10,
      "P/L card never covers a price badge",
    );
  }
}
const entryOnlyLayout = positionAnnotationLayout(40, null, null, 520, 65);
assert.equal(entryOnlyLayout.takeProfit, null);
assert.equal(entryOnlyLayout.stopLoss, null);
assert.ok(entryOnlyLayout.pnlTop >= entryOnlyLayout.entry + 20);

console.log("Chart position regression checks passed.");
