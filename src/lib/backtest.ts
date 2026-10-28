import { generateSignal, TREND_MIN_CANDLES } from "./strategies";
import { DEFAULT_MULTIPLIER } from "./multipliers";
import { MAX_ANALYSIS_CANDLES } from "./strategy-engine/candles";
import type {
  BacktestResult,
  BacktestTrade,
  Candle,
  StrategyCombo,
  Timeframe,
} from "./types";

export type ReplayOptions = {
  atrStop: number;
  rr: number;
  maxHoldBars: number;
  stake: number;
  multiplier: number;
  startingBalance: number;
  commissionRate: number;
};

const DEFAULT_REPLAY_OPTIONS: ReplayOptions = {
  atrStop: 1.5,
  rr: 1.8,
  maxHoldBars: 12,
  stake: 5,
  multiplier: DEFAULT_MULTIPLIER,
  startingBalance: 1000,
  commissionRate: 0.001,
};

type ExitResult = Pick<BacktestTrade, "outcome" | "exit" | "exitTime" | "r"> & {
  exitIndex: number;
};

function resolveExit(
  candles: Candle[],
  entryIndex: number,
  maxHoldBars: number,
  direction: BacktestTrade["direction"],
  entry: number,
  stopLoss: number,
  takeProfit: number,
  rewardRatio: number,
  timeframe: Timeframe,
): ExitResult {
  const lastIndex = Math.min(candles.length - 1, entryIndex + maxHoldBars);
  const fallback = candles[lastIndex];
  const risk = Math.abs(entry - stopLoss);

  let result: ExitResult = {
    outcome: "timeout",
    exit: fallback.close,
    exitTime: fallback.time + timeframe,
    exitIndex: lastIndex,
    r: 0,
  };

  for (let index = entryIndex + 1; index <= lastIndex; index += 1) {
    const candle = candles[index];
    const hitStop =
      direction === "UP" ? candle.low <= stopLoss : candle.high >= stopLoss;
    const hitTarget =
      direction === "UP" ? candle.high >= takeProfit : candle.low <= takeProfit;

    // Historical OHLC cannot reveal which level was touched first. Use the
    // pessimistic stop-first assumption when both are inside one candle.
    if (hitStop) {
      return {
        outcome: "loss",
        exit: stopLoss,
        exitTime: candle.time + timeframe,
        exitIndex: index,
        r: -1,
      };
    }

    if (hitTarget) {
      return {
        outcome: "win",
        exit: takeProfit,
        exitTime: candle.time + timeframe,
        exitIndex: index,
        r: rewardRatio,
      };
    }

    if (index === lastIndex) {
      const signedMove = direction === "UP" ? result.exit - entry : entry - result.exit;
      result = {
        ...result,
        r: risk > 0 ? signedMove / risk : 0,
      };
    }
  }

  return result;
}

function multiplierPnl(
  direction: BacktestTrade["direction"],
  entry: number,
  exit: number,
  stake: number,
  multiplier: number,
  commissionRate: number,
): number {
  const directionFactor = direction === "UP" ? 1 : -1;
  const signedPercent =
    ((exit - entry) / Math.max(Math.abs(entry), 1e-12)) * directionFactor;
  const commission = Math.max(0, stake * multiplier * commissionRate);
  const rawPnl = stake * multiplier * signedPercent - commission;
  return Math.max(-stake, rawPnl);
}

export function runBacktest(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  combo: StrategyCombo,
  options: Partial<ReplayOptions> = {},
): BacktestResult {
  const config: ReplayOptions = {
    ...DEFAULT_REPLAY_OPTIONS,
    ...options,
  };
  const trades: BacktestTrade[] = [];

  let balance = config.startingBalance;
  let candleIndex = TREND_MIN_CANDLES - 1;
  let moneyPeak = balance;
  let maxDrawdownMoney = 0;
  let equityR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;

  while (candleIndex < candles.length - 2 && balance > 0) {
    const analysisWindow = candles.slice(
      Math.max(0, candleIndex - MAX_ANALYSIS_CANDLES + 1),
      candleIndex + 1,
    );
    const signal = generateSignal(
      analysisWindow,
      symbol,
      timeframe,
      combo,
      config.atrStop,
      config.rr,
      [],
    );

    if (!signal || signal.direction === "WAIT") {
      candleIndex += 1;
      continue;
    }

    const exit = resolveExit(
      candles,
      candleIndex,
      config.maxHoldBars,
      signal.direction,
      signal.entry,
      signal.stopLoss,
      signal.takeProfit,
      config.rr,
      timeframe,
    );
    const pnl = multiplierPnl(
      signal.direction,
      signal.entry,
      exit.exit,
      config.stake,
      config.multiplier,
      config.commissionRate,
    );

    balance = Math.max(0, balance + pnl);
    equityR += exit.r;
    peakR = Math.max(peakR, equityR);
    maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR);
    moneyPeak = Math.max(moneyPeak, balance);
    maxDrawdownMoney = Math.max(maxDrawdownMoney, moneyPeak - balance);

    trades.push({
      direction: signal.direction,
      entryTime: candles[candleIndex].time + timeframe,
      exitTime: exit.exitTime,
      entry: signal.entry,
      exit: exit.exit,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      r: exit.r,
      pnl,
      balanceAfter: balance,
      outcome: exit.outcome,
    });

    // Settlement becomes available only at this exit bar's close. Replay is
    // sequential: never fund an overlapping entry with a future trade result.
    candleIndex = Math.max(candleIndex + 1, exit.exitIndex);
  }

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const losses = trades.filter((trade) => trade.pnl < 0).length;
  const netR = trades.reduce((sum, trade) => sum + trade.r, 0);
  const grossR = trades
    .filter((trade) => trade.r > 0)
    .reduce((sum, trade) => sum + trade.r, 0);
  const lossR = Math.abs(
    trades.filter((trade) => trade.r < 0).reduce((sum, trade) => sum + trade.r, 0),
  );

  return {
    trades,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    netR,
    avgR: trades.length ? netR / trades.length : 0,
    profitFactor: lossR > 0 ? grossR / lossR : grossR > 0 ? Infinity : 0,
    maxDrawdownR,
    expectancyR: trades.length ? netR / trades.length : 0,
    startingBalance: config.startingBalance,
    endingBalance: balance,
    netPnl: balance - config.startingBalance,
    returnPct: config.startingBalance
      ? ((balance - config.startingBalance) / config.startingBalance) * 100
      : 0,
    maxDrawdownMoney,
  };
}
