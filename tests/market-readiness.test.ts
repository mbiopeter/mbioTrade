import assert from "node:assert/strict";
import { isFreshMarketTick } from "../src/lib/market-freshness";
import { estimatePositionPnl, positionMetrics } from "../src/lib/position-metrics";
import type { DemoTrade } from "../src/lib/types";
import { newsAllowsAutomaticEntry } from "../src/lib/news-guard";

const now = Date.now();
const tick = { epoch: Math.floor(now / 1000), quote: 1.12, receivedAt: now };
assert.equal(
  isFreshMarketTick(null, now),
  false,
  "History without a real tick cannot authorize live trading.",
);
assert.equal(isFreshMarketTick(tick, now), true);
assert.equal(
  isFreshMarketTick(tick, now + 121_000),
  false,
  "An open socket cannot keep a stalled quote live.",
);
assert.equal(isFreshMarketTick({ ...tick, epoch: tick.epoch - 180 }, now), false);
assert.equal(isFreshMarketTick({ ...tick, quote: 0 }, now), false);
assert.equal(isFreshMarketTick({ ...tick, epoch: tick.epoch + 60 }, now), false);

const trade: DemoTrade = {
  id: "external",
  contractId: 999,
  symbol: "frxEURUSD",
  direction: "UP",
  entry: 1.1,
  stopLoss: 0,
  takeProfit: 0,
  stake: 20,
  multiplier: 0,
  openedAt: now,
  status: "open",
  source: "external",
  localStops: false,
};
assert.equal(
  estimatePositionPnl(trade, 1.12),
  null,
  "Unknown multiplier must not produce a fabricated zero P/L.",
);
assert.equal(
  estimatePositionPnl({ ...trade, multiplier: 100, stake: NaN }, 1.12),
  null,
);
const stale = positionMetrics(trade, {
  tradeId: trade.id,
  contractId: 999,
  isSold: false,
  profit: 5,
  updatedAt: now - 180_000,
});
assert.equal(stale.source, "unavailable");
assert.equal(stale.pnl, null);
const current = positionMetrics(trade, {
  tradeId: trade.id,
  contractId: 999,
  isSold: false,
  profit: 5,
  updatedAt: now,
});
assert.equal(current.source, "broker");
assert.equal(current.pnl, 5);
const imminentNews = [
  {
    id: "news",
    title: "USD event",
    currency: "USD",
    impact: "high" as const,
    time: now + 5 * 60_000,
  },
];
assert.equal(
  newsAllowsAutomaticEntry(true, true, "frxEURUSD", imminentNews, now),
  false,
  "Hourly/daily candle start must not hide a news event imminent at current time.",
);
assert.equal(newsAllowsAutomaticEntry(true, false, "frxEURUSD", [], now), false);
assert.equal(
  newsAllowsAutomaticEntry(false, false, "frxEURUSD", imminentNews, now),
  true,
);
assert.equal(newsAllowsAutomaticEntry(true, true, "frxEURUSD", [], now), true);
console.log("MbioTrade v10 market freshness and unknown-value regressions passed.");
