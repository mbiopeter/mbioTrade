import { DerivAccountSocket } from "../src/lib/deriv-auth";
import {
  belongsToAccount,
  finiteBrokerNumber,
  realizedProfit,
  tradeFromContract,
  tradeFromProfitRecord,
  utcDayStart,
} from "../src/lib/deriv-reconciliation";
import { localExitReached } from "../src/lib/execution";
import { fetchDerivJson } from "../src/lib/server/deriv-rest";
import { isDerivAccountUrl } from "../src/lib/server/deriv-accounts";
import { isRecord } from "../src/lib/validation";
import type {
  AcceptedMultiplier,
  DemoTrade,
  DerivCredentials,
  DerivPortfolioContract,
  Signal,
} from "../src/lib/types";

export type BrokerSnapshot = {
  portfolio: DerivPortfolioContract[];
  trades: DemoTrade[];
  balance: number | null;
  currency: string;
  dailyRealizedPnl: number | null;
  latestTradeAt: number;
  complete: boolean;
};

export interface WorkerAccountPort {
  connected: boolean;
  refresh(): Promise<BrokerSnapshot>;
  buy(
    signal: Signal,
    stake: number,
    multiplier: AcceptedMultiplier,
    currency: string,
    beforeBuy?: () => void,
  ): Promise<DemoTrade>;
  sell(trade: DemoTrade, localExit?: { symbol: string; price: number }): Promise<void>;
}

export class WorkerAccount implements WorkerAccountPort {
  readonly socket: DerivAccountSocket;
  connected = false;
  private trades: DemoTrade[] = [];
  private closing = false;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly credentials: DerivCredentials) {
    this.socket = new DerivAccountSocket(credentials.accountMode);
  }

  async connect(): Promise<void> {
    if (this.closing) throw new Error("The worker account has been explicitly closed.");
    this.unsubscribe?.();
    this.unsubscribe = this.socket.onConnectionState((state) => {
      this.connected = state === "connected";
    });
    await this.socket.connect(async () => {
      const { response, payload } = await fetchDerivJson(
        `/trading/v1/options/accounts/${encodeURIComponent(this.credentials.accountId)}/otp`,
        this.credentials,
        { method: "POST" },
      );
      if (!response.ok || !isRecord(payload))
        throw new Error(`Deriv authentication failed (${response.status}).`);
      const data = isRecord(payload.data) ? payload.data : payload;
      if (typeof data.url !== "string")
        throw new Error("Deriv did not return an authenticated WebSocket URL.");
      if (!isDerivAccountUrl(data.url, this.credentials.accountMode)) {
        throw new Error("Deriv returned an unexpected account endpoint.");
      }
      return data.url;
    });
  }

  async refresh(): Promise<BrokerSnapshot> {
    if (!this.connected || this.closing)
      throw new Error("The worker is waiting for Deriv account reconnection.");
    const now = Date.now();
    // Include yesterday for cooldowns, but daily P/L always resets at UTC midnight.
    const historyStart = utcDayStart(now) - 86_400_000;
    const [portfolio, history, balance, activity] = await Promise.all([
      this.socket.portfolio(),
      this.socket.profitHistory(Math.floor(historyStart / 1000)),
      this.socket.balance(),
      this.socket.recentTransactions(),
    ]);
    if (!this.connected || this.closing)
      throw new Error("Deriv connection changed during synchronization.");
    const verifiedBalance = finiteBrokerNumber(balance.balance ?? balance.amount);
    if (verifiedBalance === undefined || !balance.currency) {
      throw new Error("Deriv balance and account currency could not be verified.");
    }
    const previous = new Map(this.trades.map((trade) => [trade.contractId, trade]));
    const openTrades: DemoTrade[] = [];
    // Serial contract reads keep API load bounded. Unknown/unsupported contracts
    // still remain in the raw portfolio used by the shared risk gate.
    for (const item of portfolio) {
      const id = finiteBrokerNumber(item.contract_id);
      if (!id || !Number.isSafeInteger(id)) continue;
      const detail = await this.socket.openContract(id);
      const trade = tradeFromContract(
        { ...item, ...detail },
        this.credentials,
        previous.get(id),
      );
      if (trade) openTrades.push(trade);
    }
    const closedTrades = history.transactions
      .map((item) =>
        tradeFromProfitRecord(
          item,
          this.credentials,
          previous.get(Number(item.contract_id)),
        ),
      )
      .filter((trade): trade is DemoTrade => trade !== null);
    this.trades = [...openTrades, ...closedTrades];
    return {
      portfolio,
      trades: this.trades,
      balance: verifiedBalance,
      currency: balance.currency,
      dailyRealizedPnl: history.complete
        ? realizedProfit(history.transactions, utcDayStart(now))
        : null,
      latestTradeAt: Math.max(
        0,
        ...portfolio.map(
          (item) => (finiteBrokerNumber(item.purchase_time) ?? 0) * 1000,
        ),
        ...history.transactions.map(
          (item) => (finiteBrokerNumber(item.purchase_time) ?? 0) * 1000,
        ),
        ...activity
          .filter(
            (item) => String(item.action ?? item.action_type).toLowerCase() === "buy",
          )
          .map((item) => (finiteBrokerNumber(item.transaction_time) ?? 0) * 1000),
      ),
      complete: history.complete,
    };
  }

  async buy(
    signal: Signal,
    stake: number,
    multiplier: AcceptedMultiplier,
    currency: string,
    beforeBuy?: () => void,
  ): Promise<DemoTrade> {
    if (!this.connected || this.closing)
      throw new Error("The account is not ready to buy.");
    const trade = await this.socket.executeDemo(
      signal,
      stake,
      multiplier,
      currency,
      "auto",
      beforeBuy,
    );
    const enriched = {
      ...trade,
      accountId: this.credentials.accountId,
      accountMode: this.credentials.accountMode,
    };
    this.trades = [enriched, ...this.trades];
    return enriched;
  }

  async sell(trade: DemoTrade, localExit?: { symbol: string; price: number }): Promise<void> {
    if (!trade.contractId || !belongsToAccount(trade, this.credentials) || !this.connected || this.closing)
      throw new Error("The account is not ready to close this position.");
    // Worker snapshots are periodic. Re-read this contract before acting on a
    // local plan so an edit from the browser/Deriv invalidates its old stop.
    const contract = await this.socket.openContract(trade.contractId);
    const latest = tradeFromContract(
      contract,
      this.credentials,
      this.trades.find((item) => item.contractId === trade.contractId) ?? trade,
    );
    if (!latest || latest.contractId !== trade.contractId)
      throw new Error("Deriv could not confirm this worker position.");
    this.trades = [latest, ...this.trades.filter((item) => item.contractId !== trade.contractId)];
    if (latest.status === "closed") return;
    if (!Object.prototype.hasOwnProperty.call(contract, "limit_order"))
      throw new Error("Deriv's current protection could not be verified before the local exit.");
    const assertCurrentExit = () => {
      if (!this.connected || this.closing)
        throw new Error("The account connection changed before this exit.");
      const current = this.trades.find((item) => item.contractId === trade.contractId);
      if (!current || current.localStops !== true || (localExit && !localExitReached(current, localExit.symbol, localExit.price)))
        throw new Error("Protection changed at Deriv. The old worker price exit was cancelled.");
    };
    assertCurrentExit();
    await this.socket.sellDemo(trade.contractId, assertCurrentExit);
    // The next snapshot confirms settlement; never invent a local closed state.
  }

  close(): void {
    this.closing = true;
    this.connected = false;
    this.unsubscribe?.();
    this.socket.close();
  }
}
