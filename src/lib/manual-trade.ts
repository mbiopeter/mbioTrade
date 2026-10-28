import { atr, lastFinite } from "./indicators";
import { getTrendState } from "./strategies";
import {
  confirmedMarketCandles,
  isConfirmedHistoryCurrent,
} from "./strategy-engine/candles";
import type { Candle, RiskSettings, Signal, Timeframe, TradeDirection } from "./types";

const MINIMUM_PRICE_DISTANCE_RATIO = 0.0002;

function fallbackVolatility(candles: Candle[], entry: number): number {
  const recent = candles.slice(-20);
  const averageRange =
    recent.length > 0
      ? recent.reduce((sum, candle) => sum + (candle.high - candle.low), 0) /
        recent.length
      : 0;

  return Math.max(averageRange, Math.abs(entry) * MINIMUM_PRICE_DISTANCE_RATIO);
}

/**
 * Builds a transparent user-directed trade plan when no strategy signal exists.
 * Confirmed candles must support the selected trend direction. The live close
 * supplies the entry; a manual plan never claims a qualified pattern signal.
 */
export function buildManualTradePlan(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  direction: TradeDirection,
  risk: Pick<RiskSettings, "atrStop" | "riskReward">,
  atMs = Date.now(),
): Signal | null {
  const latest = candles.at(-1);
  if (!latest || !Number.isFinite(latest.close) || latest.close <= 0) {
    return null;
  }

  const confirmed = confirmedMarketCandles(candles, timeframe, atMs);
  if (!isConfirmedHistoryCurrent(confirmed, timeframe, atMs)) return null;
  const trend = getTrendState(confirmed);
  if (trend.direction === "WAIT" || trend.direction !== direction) return null;

  const entry = latest.close;
  const measuredAtr = lastFinite(atr(confirmed, 14), 0);
  const volatility =
    measuredAtr > 0 ? measuredAtr : fallbackVolatility(confirmed, entry);
  const stopDistance = Math.max(
    volatility * Math.max(0.5, risk.atrStop),
    Math.abs(entry) * MINIMUM_PRICE_DISTANCE_RATIO,
  );
  const rewardDistance = stopDistance * Math.max(0.5, risk.riskReward);

  return {
    id: `manual-${symbol}-${timeframe}-${direction}-${latest.time}`,
    symbol,
    timeframe,
    direction,
    entry,
    stopLoss: direction === "UP" ? entry - stopDistance : entry + stopDistance,
    takeProfit: direction === "UP" ? entry + rewardDistance : entry - rewardDistance,
    confidence: 0,
    riskReward: Math.max(0.5, risk.riskReward),
    createdAt: atMs,
    votes: [
      {
        id: "manual-entry",
        name: "Manual entry",
        direction,
        score: 0,
        reason: `User-directed entry aligned with the confirmed ${direction === "UP" ? "uptrend" : "downtrend"}; no pattern qualification claimed.`,
      },
    ],
    regime: "trend",
    comboId: "manual-entry",
    comboName: "Manual entry",
  };
}
