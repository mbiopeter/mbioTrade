import type { DemoTrade, DerivPortfolioContract, Signal } from "./types";

export type AutoTradeGate = {
  ok: boolean;
  reason?: string;
};

export type TradeRiskOptions = {
  /** Authoritative realized P/L for this account's current UTC day. */
  realizedPnl?: number | null;
  now?: number;
  /** Latest Deriv purchase across all supported contract types. */
  latestTradeAt?: number | null;
};

export function utcDayStart(now = Date.now()): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Include every broker position in exposure, even contract types that cannot be
 * drawn as multiplier trades. A portfolio entry with an unknown stake blocks
 * new automatic orders until its exposure is known.
 */
export function collectAccountOpenTrades(
  trades: DemoTrade[],
  portfolio: DerivPortfolioContract[],
): DemoTrade[] {
  const open = trades.filter((trade) => trade.status === "open");
  const represented = new Set(open.map((trade) => String(trade.contractId)));
  for (const contract of portfolio) {
    const id = String(contract.contract_id ?? "");
    if (represented.has(id)) continue;
    represented.add(id);
    const stake = contract.buy_price == null ? NaN : Number(contract.buy_price);
    open.push({
      id: `portfolio-risk-${id}`,
      contractId: Number(contract.contract_id) || undefined,
      symbol: String(contract.underlying ?? contract.symbol ?? "contract"),
      direction: contract.contract_type === "MULTDOWN" ? "DOWN" : "UP",
      entry: 0,
      stopLoss: 0,
      takeProfit: 0,
      stake,
      multiplier: 100,
      openedAt: Number(contract.purchase_time ?? 0) * 1000,
      status: "open",
      source: "external",
      localStops: false,
    });
  }
  return open;
}

export function canAutoTrade(
  signal: Signal,
  openTrades: DemoTrade[],
  accountTrades: DemoTrade[],
  maximumOpenTrades: number,
  marginBudget: number,
  proposedStake: number,
  maximumDailyLoss: number,
  cooldownMinutes: number,
  options: TradeRiskOptions = {},
): AutoTradeGate {
  if (signal.direction === "WAIT") {
    return { ok: false, reason: "No directional signal." };
  }
  if (
    !Number.isFinite(proposedStake) ||
    proposedStake <= 0 ||
    !Number.isFinite(marginBudget) ||
    marginBudget <= 0 ||
    !Number.isFinite(maximumOpenTrades) ||
    maximumOpenTrades < 1 ||
    !Number.isFinite(maximumDailyLoss) ||
    maximumDailyLoss <= 0 ||
    !Number.isFinite(cooldownMinutes) ||
    cooldownMinutes < 0
  ) {
    return { ok: false, reason: "Trading risk settings are invalid." };
  }

  const currentlyOpen = openTrades.filter((trade) => trade.status === "open");
  if (currentlyOpen.length >= maximumOpenTrades) {
    return { ok: false, reason: "Maximum open trades reached." };
  }
  if (currentlyOpen.some((trade) => !Number.isFinite(trade.stake) || trade.stake < 0)) {
    return { ok: false, reason: "Waiting for Deriv position exposure." };
  }
  const exposure = currentlyOpen.reduce((sum, trade) => sum + trade.stake, 0);
  if (exposure + proposedStake > marginBudget) {
    return {
      ok: false,
      reason: "Configured margin / exposure budget would be exceeded.",
    };
  }

  const now = options.now ?? Date.now();
  const dayStart = utcDayStart(now);
  const localPnl = accountTrades
    .filter(
      (trade) =>
        trade.status === "closed" && (trade.closedAt ?? trade.openedAt) >= dayStart,
    )
    .reduce((sum, trade) => {
      const profit = Number.isFinite(trade.brokerProfit)
        ? trade.brokerProfit!
        : typeof trade.soldFor === "number"
          ? trade.soldFor - trade.stake
          : 0;
      return sum + profit;
    }, 0);
  const realizedPnl =
    options.realizedPnl === undefined ? localPnl : options.realizedPnl;
  if (realizedPnl === null || !Number.isFinite(realizedPnl)) {
    return { ok: false, reason: "Waiting for Deriv daily realized P/L." };
  }
  if (realizedPnl <= -maximumDailyLoss) {
    return { ok: false, reason: "Daily loss limit reached." };
  }

  const latestOpenedAt = Math.max(
    0,
    Number.isFinite(options.latestTradeAt) ? Number(options.latestTradeAt) : 0,
    ...currentlyOpen.map((trade) => trade.openedAt),
    ...accountTrades.map((trade) => trade.openedAt),
  );
  if (latestOpenedAt > 0 && now - latestOpenedAt < cooldownMinutes * 60_000) {
    return { ok: false, reason: "Trade cooldown is active." };
  }

  return { ok: true };
}

/** Retained for old integrations; demo and real accounts use the same gate. */
export const canAutoDemoTrade = canAutoTrade;
