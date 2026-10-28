import {
  belongsToAccount,
  finiteBrokerNumber,
  isContractClosed,
  livePositionSnapshot,
  realizedProfit,
  tradeFromContract,
  tradeFromProfitRecord,
  transactionEvent,
  utcDayStart,
  type AccountIdentity,
} from "./deriv-reconciliation";
import type { DerivAccountSocket } from "./deriv-auth";
import type {
  AccountTradeEvent,
  DemoTrade,
  DerivBalance,
  DerivOpenContract,
  DerivPortfolioContract,
  DerivProfitTransaction,
  LivePositionSnapshot,
} from "./types";

export type AccountSyncState = {
  balance: number | null;
  currency: string;
  portfolio: DerivPortfolioContract[];
  trades: DemoTrade[];
  livePositions: Record<string, LivePositionSnapshot>;
  events: AccountTradeEvent[];
  synced: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  dailyRealizedPnl: number | null;
  historyComplete: boolean;
  lastTradeAt: number | null;
};

export function emptyAccountState(): AccountSyncState {
  return {
    balance: null,
    currency: "USD",
    portfolio: [],
    trades: [],
    livePositions: {},
    events: [],
    synced: false,
    syncError: null,
    lastSyncedAt: null,
    dailyRealizedPnl: null,
    historyComplete: false,
    lastTradeAt: null,
  };
}

export type AccountSyncSocket = Pick<
  DerivAccountSocket,
  | "balance"
  | "portfolio"
  | "openContract"
  | "profitHistory"
  | "recentTransactions"
  | "recentClosedHistory"
  | "subscribeBalance"
  | "subscribeTransactions"
  | "subscribeOpenContracts"
>;

/**
 * A broker-backed account session. Cached journals are metadata candidates only:
 * they never become active positions until Deriv confirms the contract.
 */
export class BrokerAccountSync {
  state = emptyAccountState();
  private disposed = false;
  private readonly metadata = new Map<number, DemoTrade>();
  private readonly confirmedClosed = new Set<number>();
  private readonly unverifiedSettlements = new Set<number>();
  private readonly unsubscribe: Array<() => void> = [];
  private refreshPromise: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityFetch = 0;
  private lastJournalFetch = 0;
  private lastRefreshStarted = 0;
  private historyRecords = new Map<number, DerivProfitTransaction>();
  private historyDay = utcDayStart();
  private networkRevision = 0;

  constructor(
    private readonly socket: AccountSyncSocket,
    readonly account: AccountIdentity,
    cachedMetadata: DemoTrade[],
    private readonly onChange: (state: AccountSyncState) => void,
    private readonly onSettled: (trade: DemoTrade) => void = () => undefined,
  ) {
    for (const trade of cachedMetadata) {
      if (trade.contractId && (!trade.accountId || belongsToAccount(trade, account))) {
        this.metadata.set(trade.contractId, trade);
      }
    }
  }

  private publish(): void {
    if (!this.disposed) this.onChange({ ...this.state });
  }

  private previous(id: number): DemoTrade | undefined {
    return (
      this.state.trades.find((trade) => trade.contractId === id) ??
      this.metadata.get(id)
    );
  }

  private upsert(trade: DemoTrade): void {
    if (!trade.contractId || !belongsToAccount(trade, this.account)) return;
    const existing = this.state.trades.find(
      (item) => item.contractId === trade.contractId,
    );
    if (this.confirmedClosed.has(trade.contractId) && trade.status !== "closed") return;
    if (trade.status === "closed") this.confirmedClosed.add(trade.contractId);
    this.metadata.set(trade.contractId, trade);
    this.state.lastTradeAt = Math.max(this.state.lastTradeAt ?? 0, trade.openedAt);
    const all = [
      trade,
      ...this.state.trades.filter((item) => item.contractId !== trade.contractId),
    ];
    this.state.trades = [
      ...all.filter((item) => item.status === "open"),
      ...all
        .filter((item) => item.status !== "open")
        .sort((a, b) => (b.closedAt ?? b.openedAt) - (a.closedAt ?? a.openedAt))
        .slice(0, 500),
    ];
    if (trade.status === "closed") {
      this.state.portfolio = this.state.portfolio.filter(
        (item) => Number(item.contract_id) !== trade.contractId,
      );
      const nextLive = { ...this.state.livePositions };
      delete nextLive[trade.id];
      this.state.livePositions = nextLive;
      if (existing?.status === "open") this.onSettled(trade);
    }
  }

  applyContract(contract: DerivOpenContract): void {
    if (this.disposed) return;
    const id = finiteBrokerNumber(contract.contract_id);
    if (!id) return;
    if (this.confirmedClosed.has(id) && !isContractClosed(contract)) return;
    const previousPortfolio = this.state.portfolio.find(
      (item) => Number(item.contract_id) === id,
    );
    if (previousPortfolio && !isContractClosed(contract)) {
      this.state.portfolio = this.state.portfolio.map((item) =>
        Number(item.contract_id) === id ? { ...item, ...contract } : item,
      );
    }
    const trade = tradeFromContract(contract, this.account, this.previous(id));
    if (!trade) {
      if (isContractClosed(contract)) {
        this.confirmedClosed.add(id);
        this.state.portfolio = this.state.portfolio.filter(
          (item) => Number(item.contract_id) !== id,
        );
        const buy = finiteBrokerNumber(
          contract.buy_price ?? previousPortfolio?.buy_price,
        );
        const profit = finiteBrokerNumber(contract.profit);
        const sold =
          finiteBrokerNumber(contract.sell_price) ??
          (buy !== undefined && profit !== undefined ? buy + profit : undefined);
        if (buy !== undefined && sold !== undefined) {
          this.unverifiedSettlements.delete(id);
          this.historyRecords.set(id, {
            contract_id: id,
            buy_price: buy,
            sell_price: sold,
            sell_time: finiteBrokerNumber(contract.sell_time) ?? Date.now() / 1000,
          });
          this.state.dailyRealizedPnl = realizedProfit(
            [...this.historyRecords.values()],
            utcDayStart(),
          );
        } else {
          this.unverifiedSettlements.add(id);
          this.state.synced = false;
          this.state.historyComplete = false;
        }
        this.scheduleRefresh();
      } else if (
        !this.state.portfolio.some((item) => Number(item.contract_id) === id)
      ) {
        // A newly observed unsupported contract still changes account exposure.
        this.state.portfolio = [...this.state.portfolio, { ...contract }];
        this.scheduleRefresh();
      }
      this.publish();
      return;
    }
    this.upsert(trade);
    if (trade.status === "open") {
      const snapshot = livePositionSnapshot(trade, contract);
      if (snapshot)
        this.state.livePositions = {
          ...this.state.livePositions,
          [trade.id]: snapshot,
        };
      if (!this.state.portfolio.some((item) => Number(item.contract_id) === id)) {
        this.state.portfolio = [...this.state.portfolio, { ...contract }];
      }
    } else {
      this.recordHistoryTrade(trade);
    }
    this.publish();
  }

  private recordHistoryTrade(trade: DemoTrade): void {
    if (trade.contractId && trade.soldFor !== undefined && trade.closedAt) {
      this.unverifiedSettlements.delete(trade.contractId);
      this.historyRecords.set(trade.contractId, {
        contract_id: trade.contractId,
        buy_price: trade.stake,
        sell_price: trade.soldFor,
        purchase_time: trade.openedAt / 1000,
        sell_time: trade.closedAt / 1000,
      });
      this.state.dailyRealizedPnl = realizedProfit(
        [...this.historyRecords.values()],
        utcDayStart(),
      );
    } else if (trade.contractId) {
      this.unverifiedSettlements.add(trade.contractId);
      this.state.synced = false;
      this.state.historyComplete = false;
      this.scheduleRefresh();
    }
  }

  recordPurchase(trade: DemoTrade): void {
    this.upsert(trade);
    if (
      trade.contractId &&
      !this.state.portfolio.some(
        (item) => Number(item.contract_id) === trade.contractId,
      )
    ) {
      this.state.portfolio = [
        ...this.state.portfolio,
        {
          contract_id: trade.contractId,
          underlying_symbol: trade.symbol,
          contract_type: trade.contractType,
          buy_price: trade.stake,
        },
      ];
    }
    this.publish();
    this.scheduleRefresh();
  }

  recordSale(trade: DemoTrade, soldFor: number): void {
    const closed: DemoTrade = {
      ...trade,
      ...this.account,
      status: "closed",
      soldFor,
      brokerProfit: soldFor - trade.stake,
      closedAt: Date.now(),
    };
    this.upsert(closed);
    this.recordHistoryTrade(closed);
    this.publish();
    this.scheduleRefresh();
  }

  disableLocalStops(contractId: number): void {
    if (this.disposed) return;
    const trade = this.previous(contractId);
    if (!trade || trade.status !== "open" || trade.localStops !== true) return;
    this.upsert({ ...trade, localStops: false });
    this.publish();
  }

  private applyBalance(balance: DerivBalance): void {
    const amount = finiteBrokerNumber(balance.balance ?? balance.amount);
    if (amount !== undefined) this.state.balance = amount;
    if (balance.currency) this.state.currency = balance.currency;
  }

  async start(): Promise<void> {
    const subscriptions = await Promise.allSettled([
      this.socket.subscribeBalance((balance) => {
        if (this.disposed) return;
        this.applyBalance(balance);
        this.publish();
      }),
      this.socket.subscribeOpenContracts((contract) => this.applyContract(contract)),
      this.socket.subscribeTransactions((transaction) => {
        if (this.disposed) return;
        const event = transactionEvent(transaction, this.account);
        this.state.events = [
          event,
          ...this.state.events.filter((item) => item.id !== event.id),
        ].slice(0, 1000);
        if (event.action === "sell" && event.contractId && event.amount !== undefined) {
          const previous = this.previous(Number(event.contractId));
          if (previous) this.recordSale(previous, event.amount);
          else {
            const position = this.state.portfolio.find(
              (item) => Number(item.contract_id) === Number(event.contractId),
            );
            this.applyContract({
              ...position,
              contract_id: Number(event.contractId),
              is_sold: 1,
              sell_price: event.amount,
              sell_time: event.time / 1000,
            });
          }
        }
        this.publish();
        this.scheduleRefresh();
      }),
    ]);
    for (const result of subscriptions) {
      if (result.status === "fulfilled") {
        if (this.disposed) result.value();
        else this.unsubscribe.push(result.value);
      }
    }
    await this.refresh();
  }

  markOffline(): void {
    this.networkRevision += 1;
    this.state.synced = false;
    this.state.livePositions = {};
    this.state.portfolio = this.state.portfolio.map((contract) => {
      const snapshot = { ...contract };
      delete snapshot.profit;
      delete snapshot.bid_price;
      delete snapshot.current_spot;
      return snapshot;
    });
    this.publish();
  }

  scheduleRefresh(): void {
    if (this.disposed || this.refreshTimer) return;
    const delay = Math.max(250, 5000 - (Date.now() - this.lastRefreshStarted));
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh().catch(() => undefined);
    }, delay);
  }

  refresh(force = false): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Account session ended."));
    if (this.refreshPromise) return this.refreshPromise;
    if (
      !force &&
      this.state.synced &&
      this.state.lastSyncedAt !== null &&
      Date.now() - this.state.lastSyncedAt < 2000
    ) {
      return Promise.resolve();
    }
    this.lastRefreshStarted = Date.now();
    this.refreshPromise = this.refreshNow().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refreshNow(): Promise<void> {
    const revision = this.networkRevision;
    try {
      const day = utcDayStart();
      const loadJournal = Date.now() - this.lastJournalFetch > 60_000;
      const [balance, portfolio, history, journal] = await Promise.all([
        this.socket.balance(),
        this.socket.portfolio(),
        this.socket.profitHistory(day / 1000 - 86_400),
        loadJournal
          ? this.socket.recentClosedHistory(500).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (this.disposed || revision !== this.networkRevision) return;
      if (
        finiteBrokerNumber(balance.balance ?? balance.amount) === undefined ||
        !balance.currency
      ) {
        throw new Error("Deriv balance and currency could not be verified.");
      }
      this.applyBalance(balance);
      if (journal) {
        this.lastJournalFetch = Date.now();
        for (const record of journal) {
          const id = finiteBrokerNumber(record.contract_id);
          if (!id || finiteBrokerNumber(record.sell_time) === undefined) continue;
          const trade = tradeFromProfitRecord(record, this.account, this.previous(id));
          if (trade) this.upsert(trade);
        }
      }
      if (day !== this.historyDay) {
        this.historyRecords.clear();
        this.historyDay = day;
      }
      for (const record of history.transactions) {
        const id = finiteBrokerNumber(record.contract_id);
        if (id) {
          this.historyRecords.set(id, record);
          if (
            finiteBrokerNumber(record.buy_price) !== undefined &&
            finiteBrokerNumber(record.sell_price) !== undefined &&
            finiteBrokerNumber(record.sell_time) !== undefined
          ) {
            this.unverifiedSettlements.delete(id);
          }
        }
      }
      this.state.historyComplete =
        history.complete &&
        history.transactions.every(
          (record) =>
            finiteBrokerNumber(record.contract_id) !== undefined &&
            finiteBrokerNumber(record.sell_time) !== undefined &&
            finiteBrokerNumber(record.buy_price) !== undefined &&
            finiteBrokerNumber(record.sell_price) !== undefined,
        );
      this.state.lastTradeAt = Math.max(
        this.state.lastTradeAt ?? 0,
        ...history.transactions.map(
          (record) => (finiteBrokerNumber(record.purchase_time) ?? 0) * 1000,
        ),
        ...portfolio.map(
          (record) => (finiteBrokerNumber(record.purchase_time) ?? 0) * 1000,
        ),
      );
      this.state.dailyRealizedPnl = realizedProfit(
        [...this.historyRecords.values()],
        day,
      );
      for (const record of history.transactions) {
        const id = finiteBrokerNumber(record.contract_id);
        if (!id) continue;
        const trade = tradeFromProfitRecord(record, this.account, this.previous(id));
        if (trade) this.upsert(trade);
      }
      this.state.portfolio = portfolio.filter(
        (item) => !this.confirmedClosed.has(Number(item.contract_id)),
      );
      const openIds = new Set<number>();
      for (const contract of this.state.portfolio) {
        const id = finiteBrokerNumber(contract.contract_id);
        if (!id) continue;
        openIds.add(id);
        const trade = tradeFromContract(contract, this.account, this.previous(id));
        if (trade) this.upsert(trade);
      }
      // Query both currently open contracts and previously confirmed open ones
      // missing from the portfolio. Omission alone is never proof of a sale.
      const missingIds = [
        ...new Set([
          ...this.state.trades
            .filter((trade) => trade.status === "open")
            .map((trade) => trade.contractId),
          ...[...this.metadata.values()]
            .filter(
              (trade) =>
                trade.status === "open" && belongsToAccount(trade, this.account),
            )
            .map((trade) => trade.contractId),
        ]),
      ].filter((id): id is number =>
        Boolean(id && !openIds.has(id) && !this.confirmedClosed.has(id)),
      );
      const ids = [...new Set([...openIds, ...missingIds])];
      let unresolved = false;
      for (let offset = 0; offset < ids.length; offset += 8) {
        if (this.disposed || revision !== this.networkRevision) return;
        const batch = ids.slice(offset, offset + 8);
        const contracts = await Promise.allSettled(
          batch.map((id) => this.socket.openContract(id)),
        );
        if (this.disposed || revision !== this.networkRevision) return;
        contracts.forEach((result, index) => {
          if (result.status === "fulfilled") this.applyContract(result.value);
          else if (missingIds.includes(batch[index])) unresolved = true;
        });
      }
      if (Date.now() - this.lastActivityFetch > 60_000) {
        try {
          const activity = await this.socket.recentTransactions();
          if (this.disposed || revision !== this.networkRevision) return;
          const byId = new Map(this.state.events.map((event) => [event.id, event]));
          for (const item of activity) {
            const event = transactionEvent(item, this.account);
            byId.set(event.id, event);
            if (event.action === "buy")
              this.state.lastTradeAt = Math.max(
                this.state.lastTradeAt ?? 0,
                event.time,
              );
          }
          this.state.events = [...byId.values()]
            .sort((a, b) => b.time - a.time)
            .slice(0, 1000);
          this.lastActivityFetch = Date.now();
        } catch {
          /* Portfolio and contract streams still supply live positions. */
        }
      }
      if (unresolved)
        throw new Error(
          "Some missing contracts could not be verified. Automatic entries are paused until Deriv confirms their status.",
        );
      if (!this.state.historyComplete || this.unverifiedSettlements.size > 0)
        throw new Error(
          "Account history is incomplete. Automatic entries are paused until the daily loss total can be verified.",
        );
      this.state.synced = true;
      this.state.syncError = null;
      this.state.lastSyncedAt = Date.now();
      this.publish();
    } catch (error) {
      if (this.disposed || revision !== this.networkRevision) return;
      this.state.synced = false;
      this.state.syncError =
        error instanceof Error ? error.message : "Account synchronization failed.";
      this.publish();
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.networkRevision += 1;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.unsubscribe.length = 0;
  }
}
