import assert from "node:assert/strict";
import { tradeFromContract } from "../src/lib/deriv-reconciliation";
import { sanitizeDemoTrades } from "../src/lib/validation";
import type { DerivOpenContract } from "../src/lib/types";

const account = { accountId: "VRTC12001", accountMode: "demo" as const };
const payload: DerivOpenContract = {
  contract_id: 12001,
  contract_type: "MULTUP",
  underlying_symbol: "frxEURUSD",
  buy_price: "20",
  entry_spot: "1.1259",
  multiplier: "100",
  purchase_time: 1_798_000_000,
  commission: "0.15",
  limit_order: {
    stop_loss: { order_amount: "10", value: "1.1203549425" },
    take_profit: { order_amount: "15", value: "1.1344286925" },
  },
};

const restored = tradeFromContract(payload, account);
assert.ok(restored);
assert.equal(restored.brokerLimitsKnown, true);
assert.equal(restored.brokerStopLoss, 10);
assert.equal(restored.brokerTakeProfit, 15);
assert.equal(restored.brokerStopLossPrice, 1.1203549425);
assert.equal(restored.brokerTakeProfitPrice, 1.1344286925);
assert.equal(restored.brokerCommission, 0.15);
assert.equal(restored.localStops, false, "chart restoration cannot enable local exits");
assert.equal(restored.stopLoss, 0);
assert.equal(restored.takeProfit, 0);

const cached = sanitizeDemoTrades([restored])[0];
assert.equal(cached.brokerStopLossPrice, restored.brokerStopLossPrice);
assert.equal(cached.brokerTakeProfitPrice, restored.brokerTakeProfitPrice);
assert.equal(cached.brokerLimitsKnown, true);
assert.equal(cached.brokerCommission, 0.15);

const partial = tradeFromContract({ contract_id: 12001, profit: "3.25" }, account, restored);
assert.ok(partial);
assert.equal(partial.brokerTakeProfitPrice, restored.brokerTakeProfitPrice);
assert.equal(partial.brokerStopLoss, 10);
assert.equal(partial.brokerLimitsKnown, true);

const changed = tradeFromContract(
  { contract_id: 12001, limit_order: { take_profit: { order_amount: "18", value: "1.14" } } },
  account,
  restored,
);
assert.ok(changed);
assert.equal(changed.brokerTakeProfit, 18);
assert.equal(changed.brokerTakeProfitPrice, 1.14);
assert.equal(changed.brokerStopLoss, undefined);
assert.equal(changed.brokerStopLossPrice, undefined);

for (const limit_order of [{}, null]) {
  const removed = tradeFromContract({ contract_id: 12001, limit_order }, account, restored);
  assert.ok(removed);
  assert.equal(removed.brokerLimitsKnown, true);
  assert.equal(removed.brokerTakeProfit, undefined);
  assert.equal(removed.brokerStopLoss, undefined);
  assert.equal(removed.brokerTakeProfitPrice, undefined);
  assert.equal(removed.brokerStopLossPrice, undefined);
}

const malformed = tradeFromContract(
  {
    ...payload,
    commission: null,
    limit_order: { stop_loss: { order_amount: 10, value: "NaN" }, take_profit: { value: -1 } },
  },
  account,
);
assert.ok(malformed);
assert.equal(malformed.brokerCommission, undefined, "unknown commission is not zero");
assert.equal(malformed.brokerStopLossPrice, undefined);
assert.equal(malformed.brokerTakeProfitPrice, undefined);
assert.equal(malformed.brokerStopLoss, 10, "cash values remain distinct from spot barriers");

console.log("Broker chart barrier restoration, persistence and removal regressions passed.");
