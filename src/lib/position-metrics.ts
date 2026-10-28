import type { DemoTrade, LivePositionSnapshot } from "./types";
import { MAX_TICK_AGE_MS } from "./market-freshness";

export type PositionMetricSource = "broker" | "chart" | "unavailable";

export type PositionMetrics = {
  currentPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  source: PositionMetricSource;
  updatedAt?: number;
};

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Estimates multiplier P/L from the chart when the broker stream has not yet
 * returned a proposal_open_contract update. The downside is capped at the
 * amount at risk because a multiplier contract cannot lose more than its stake.
 */
export function estimatePositionPnl(
  trade: DemoTrade,
  currentPrice: number,
): number | null {
  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(trade.entry) ||
    trade.entry <= 0 ||
    !Number.isFinite(trade.stake) ||
    trade.stake <= 0 ||
    !Number.isFinite(trade.multiplier) ||
    trade.multiplier <= 0
  ) {
    return null;
  }

  const priceReturn =
    trade.direction === "UP"
      ? (currentPrice - trade.entry) / trade.entry
      : (trade.entry - currentPrice) / trade.entry;
  const raw = trade.stake * trade.multiplier * priceReturn;

  return Math.max(-trade.stake, raw);
}

/**
 * Prefer Deriv's live proposal_open_contract profit. Fall back to a transparent
 * chart estimate while a broker update is unavailable or reconnecting.
 */
export function positionMetrics(
  trade: DemoTrade,
  live: LivePositionSnapshot | undefined,
  chartPrice?: number | null,
): PositionMetrics {
  const freshLive =
    live && Date.now() - live.updatedAt <= MAX_TICK_AGE_MS ? live : undefined;
  const brokerProfit = finiteOrNull(freshLive?.profit);
  const brokerSpot = finiteOrNull(freshLive?.currentSpot);
  const fallbackPrice = finiteOrNull(chartPrice);

  if (brokerProfit !== null) {
    return {
      currentPrice: brokerSpot ?? fallbackPrice,
      pnl: brokerProfit,
      pnlPercent: trade.stake > 0 ? (brokerProfit / trade.stake) * 100 : null,
      source: "broker",
      updatedAt: live?.updatedAt,
    };
  }

  const price = fallbackPrice;
  if (price !== null) {
    const pnl = estimatePositionPnl(trade, price);
    return {
      currentPrice: price,
      pnl,
      pnlPercent: pnl !== null && trade.stake > 0 ? (pnl / trade.stake) * 100 : null,
      source: "chart",
      updatedAt: Date.now(),
    };
  }

  return {
    currentPrice: brokerSpot,
    pnl: null,
    pnlPercent: null,
    source: "unavailable",
    updatedAt: live?.updatedAt,
  };
}
