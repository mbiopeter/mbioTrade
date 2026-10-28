import { DERIV_ACCOUNT_WS_PREFIX, REQUEST_TIMEOUT_MS } from "./app-config";
import {
  DerivWebSocketClient,
  type WebSocketConnectionState,
  type WebSocketUrlProvider,
} from "./deriv/websocket-client";
import { assertAcceptedMultiplier } from "./multipliers";
import { assertTradeAmount } from "./trade-amount";
import { priceWithinTradePlan } from "./execution-guard";
import {
  assertOrderBalance,
  assertQuotedOrderCost,
  OrderFundingError,
  orderPreflightError,
} from "./order-funding";
import { finiteBrokerNumber, multiplierLimitOrder } from "./deriv-reconciliation";
import { isRecord } from "./validation";
import { protectionLimitOrder, type ProtectionUpdate } from "./trade-protection";
import type {
  AcceptedMultiplier,
  ConnectedAccountMode,
  DemoTrade,
  DerivBalance,
  DerivOpenContract,
  DerivPortfolioContract,
  DerivProfitTransaction,
  DerivTransaction,
  Signal,
  TradeDirection,
} from "./types";

interface BalanceResponse {
  balance?: DerivBalance | number;
}

interface PortfolioResponse {
  portfolio?: { contracts?: DerivPortfolioContract[] };
}

interface ProfitTableResponse {
  profit_table?: { transactions?: DerivProfitTransaction[]; count?: number };
}

interface StatementResponse {
  statement?: { transactions?: DerivTransaction[] };
}

interface SubscriptionResponse {
  subscription?: { id?: string };
}

interface ProposalResponse {
  proposal?: {
    id?: string;
    ask_price?: number | string;
    spot?: number;
  };
}

interface BuyResponse {
  buy?: {
    contract_id?: number;
    start_time?: number;
    purchase_time?: number;
    start_spot?: number;
    buy_price?: number;
  };
}

interface OpenContractResponse {
  proposal_open_contract?: DerivOpenContract;
  subscription?: { id?: string | number };
}

interface SellResponse {
  sell?: { sold_for?: number };
}

function normalizeBalance(value: unknown): DerivBalance {
  if (typeof value === "number") {
    return { balance: value };
  }

  if (!isRecord(value)) {
    return {};
  }

  return {
    balance: finiteBrokerNumber(value.balance),
    amount: finiteBrokerNumber(value.amount),
    currency: typeof value.currency === "string" ? value.currency : undefined,
  };
}

export class DerivAccountSocket {
  private readonly client = new DerivWebSocketClient();
  private closed = false;

  constructor(private readonly mode: ConnectedAccountMode) {}

  async connect(provider: WebSocketUrlProvider): Promise<void> {
    this.closed = false;
    const validatedProvider = async () => {
      const url = typeof provider === "string" ? provider : await provider();
      const parsed = new URL(url);
      const expected = new URL(`${DERIV_ACCOUNT_WS_PREFIX}${this.mode}`);
      if (
        parsed.protocol !== expected.protocol ||
        parsed.host !== expected.host ||
        parsed.pathname !== expected.pathname ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        parsed.hash !== ""
      ) {
        throw new Error("Unexpected Deriv WebSocket URL.");
      }
      return url;
    };

    await this.client.connect(validatedProvider);
  }

  onConnectionState(handler: (state: WebSocketConnectionState) => void): () => void {
    return this.client.onConnectionState(handler);
  }

  onConnectionError(handler: (message: string | null) => void): () => void {
    return this.client.onConnectionError(handler);
  }

  async balance(): Promise<DerivBalance> {
    const response = await this.client.request<BalanceResponse>(
      { balance: 1 },
      REQUEST_TIMEOUT_MS,
    );
    return normalizeBalance(response.balance);
  }

  async portfolio(): Promise<DerivPortfolioContract[]> {
    const response = await this.client.request<PortfolioResponse>(
      { portfolio: 1 },
      REQUEST_TIMEOUT_MS,
    );
    if (!Array.isArray(response.portfolio?.contracts)) {
      throw new Error(
        "Deriv returned an incomplete portfolio. Trading is paused until account sync succeeds.",
      );
    }
    return response.portfolio.contracts;
  }

  async openContract(contractId: number): Promise<DerivOpenContract> {
    const response = await this.client.request<OpenContractResponse>({
      proposal_open_contract: 1,
      contract_id: contractId,
    });
    if (
      !response.proposal_open_contract ||
      Number(response.proposal_open_contract.contract_id) !== contractId
    ) {
      throw new Error("Deriv did not return the requested contract.");
    }
    return response.proposal_open_contract;
  }

  async profitHistory(
    dateFrom: number,
    maxPages = 10,
  ): Promise<{ transactions: DerivProfitTransaction[]; complete: boolean }> {
    // Identify sales by their transaction timestamp first. Profit-table date
    // filters must not accidentally omit positions bought before midnight.
    const sales = new Map<number, { amount: number; time: number }>();
    let statementComplete = false;
    const limit = 100;
    const dateTo = Math.floor(Date.now() / 1000);
    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.client.request<StatementResponse>({
        statement: 1,
        action_type: "sell",
        date_from: Math.floor(dateFrom),
        date_to: dateTo,
        limit,
        offset: page * limit,
      });
      const records = response.statement?.transactions;
      if (!Array.isArray(records))
        throw new Error("Deriv did not return the account's sale history.");
      for (const record of records) {
        const id = finiteBrokerNumber(record.contract_id);
        const amount = finiteBrokerNumber(record.amount);
        const time = finiteBrokerNumber(record.transaction_time);
        if (id === undefined || amount === undefined || time === undefined) {
          return { transactions: [], complete: false };
        }
        sales.set(id, { amount, time });
      }
      if (records.length < limit) {
        statementComplete = true;
        break;
      }
    }
    if (!sales.size) return { transactions: [], complete: statementComplete };
    const transactions = new Map<number, DerivProfitTransaction>();
    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.client.request<ProfitTableResponse>({
        profit_table: 1,
        description: 1,
        sort: "DESC",
        limit,
        offset: page * limit,
      });
      const records = response.profit_table?.transactions;
      if (!Array.isArray(records))
        throw new Error("Deriv did not return trade history.");
      for (const record of records) {
        const id = finiteBrokerNumber(record.contract_id);
        const sale = id === undefined ? undefined : sales.get(id);
        if (
          id !== undefined &&
          sale &&
          finiteBrokerNumber(record.buy_price) !== undefined
        ) {
          transactions.set(id, {
            ...record,
            sell_price: sale.amount,
            sell_time: sale.time,
          });
        }
      }
      if (transactions.size === sales.size)
        return {
          transactions: [...transactions.values()],
          complete: statementComplete,
        };
      if (records.length < limit) break;
    }
    return { transactions: [...transactions.values()], complete: false };
  }

  async recentTransactions(limit = 100): Promise<DerivTransaction[]> {
    const response = await this.client.request<StatementResponse>({
      statement: 1,
      description: 1,
      limit,
    });
    if (!Array.isArray(response.statement?.transactions))
      throw new Error("Deriv did not return account activity.");
    return response.statement.transactions;
  }

  async recentClosedHistory(limit = 500): Promise<DerivProfitTransaction[]> {
    const response = await this.client.request<ProfitTableResponse>({
      profit_table: 1,
      description: 1,
      sort: "DESC",
      limit: Math.min(500, Math.max(1, Math.floor(limit))),
    });
    if (!Array.isArray(response.profit_table?.transactions)) {
      throw new Error("Deriv did not return the recent closed-contract journal.");
    }
    return response.profit_table.transactions;
  }

  async subscribeOpenContracts(
    onUpdate: (contract: DerivOpenContract) => void,
  ): Promise<() => void> {
    return this.client.subscribe<OpenContractResponse>(
      { proposal_open_contract: 1 },
      "proposal_open_contract",
      (payload) => {
        if (isRecord(payload.proposal_open_contract))
          onUpdate(payload.proposal_open_contract as DerivOpenContract);
      },
    );
  }

  async subscribeBalance(
    onBalance: (balance: DerivBalance) => void,
  ): Promise<() => void> {
    return this.client.subscribe<SubscriptionResponse>(
      { balance: 1 },
      "balance",
      (payload) => onBalance(normalizeBalance(payload.balance)),
    );
  }

  async subscribeTransactions(
    onTransaction: (transaction: DerivTransaction) => void,
  ): Promise<() => void> {
    return this.client.subscribe<SubscriptionResponse>(
      { transaction: 1 },
      "transaction",
      (payload) => {
        if (isRecord(payload.transaction)) {
          onTransaction(payload.transaction as DerivTransaction);
        }
      },
    );
  }

  async subscribeOpenContract(
    contractId: number,
    onUpdate: (contract: DerivOpenContract) => void,
  ): Promise<() => void> {
    return this.client.subscribe<OpenContractResponse>(
      {
        proposal_open_contract: 1,
        contract_id: contractId,
      },
      "proposal_open_contract",
      (payload) => {
        if (!isRecord(payload.proposal_open_contract)) {
          return;
        }

        const contract = payload.proposal_open_contract as DerivOpenContract;
        if (Number(contract.contract_id) !== contractId) {
          return;
        }

        onUpdate(contract);
      },
    );
  }

  async executeDemo(
    signal: Signal,
    stake: number,
    multiplier: AcceptedMultiplier,
    currency = "USD",
    source: "manual" | "auto" = "manual",
    beforeBuy?: () => void,
  ): Promise<DemoTrade> {
    let tradeAmount: number;
    let direction: TradeDirection;
    let limitOrder: { stop_loss: number; take_profit: number };
    let proposal: ProposalResponse;
    let proposalId: string;
    let askPrice: number;
    try {
      assertAcceptedMultiplier(multiplier);
      if (signal.direction !== "UP" && signal.direction !== "DOWN") {
        throw new Error("Signal has no trade direction.");
      }
      tradeAmount = assertTradeAmount(stake);
      limitOrder = multiplierLimitOrder(signal, tradeAmount, multiplier, currency);
      direction = signal.direction;
      proposal = await this.client.request<ProposalResponse>({
        proposal: 1,
        amount: tradeAmount,
        basis: "stake",
        contract_type: direction === "UP" ? "MULTUP" : "MULTDOWN",
        currency,
        duration_unit: "s",
        multiplier,
        underlying_symbol: signal.symbol,
        limit_order: limitOrder,
      });

      const returnedId = proposal.proposal?.id;
      if (typeof returnedId !== "string" || !returnedId.trim()) {
        throw new Error("Deriv did not return a proposal id.");
      }
      proposalId = returnedId;
      askPrice = assertQuotedOrderCost(
        proposal.proposal?.ask_price,
        tradeAmount,
        currency,
      );
      const quotedSpot = finiteBrokerNumber(proposal.proposal?.spot);
      if (quotedSpot !== undefined && !priceWithinTradePlan(signal, quotedSpot)) {
        throw new Error(
          "The quoted market price has reached or passed this plan's SL/TP. Wait for a new setup or refresh the manual ticket.",
        );
      }

      // The account may have spent funds on another device while the quote was
      // being requested. Verify a new broker balance immediately before buying.
      const available = await this.balance();
      if (available.currency && available.currency !== currency) {
        throw new OrderFundingError(
          `Order not placed. The quote uses ${currency}, but the account reports ${available.currency}. Reconnect the intended account.`,
        );
      }
      assertOrderBalance(
        askPrice,
        available.balance ?? available.amount,
        currency,
        tradeAmount,
      );
      if (this.closed || this.client.connectionState !== "connected") {
        throw new Error("Account connection changed before the order was submitted.");
      }
      beforeBuy?.();
    } catch (error) {
      // This boundary contains no buy call. Known preflight failures can display
      // their requirement without being mistaken for an ambiguous submitted order.
      throw orderPreflightError(error, stake, currency);
    }

    const purchase = await this.client.request<BuyResponse>({
      buy: proposalId,
      price: askPrice,
    });
    const contractId = Number(purchase.buy?.contract_id);
    if (!Number.isSafeInteger(contractId) || contractId <= 0) {
      throw new Error(
        "Deriv did not confirm the contract ID. Refresh positions before trying another order.",
      );
    }
    const proposalSpot = Number(proposal.proposal?.spot);
    const purchaseSpot = Number(purchase.buy?.start_spot);
    const entry = Number.isFinite(purchaseSpot)
      ? purchaseSpot
      : Number.isFinite(proposalSpot)
        ? proposalSpot
        : signal.entry;
    const purchaseTime = Number(
      purchase.buy?.start_time ?? purchase.buy?.purchase_time,
    );
    const entryTime = Number.isFinite(purchaseTime)
      ? Math.floor(purchaseTime)
      : Math.floor(signal.createdAt / 1000);

    return {
      id: crypto.randomUUID(),
      contractId,
      symbol: signal.symbol,
      direction,
      entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      stake: finiteBrokerNumber(purchase.buy?.buy_price) ?? tradeAmount,
      multiplier,
      openedAt: entryTime * 1000,
      entryTime,
      status: "open",
      source,
      accountMode: this.mode,
      currency,
      contractType: direction === "UP" ? "MULTUP" : "MULTDOWN",
      localStops: true,
      brokerStopLoss: limitOrder.stop_loss,
      brokerTakeProfit: limitOrder.take_profit,
      signalId: signal.id,
    };
  }

  async updateProtection(
    contractId: number,
    updates: ProtectionUpdate,
    stake: number,
    beforeSend?: () => void,
  ): Promise<void> {
    if (!Number.isSafeInteger(contractId) || contractId <= 0)
      throw new Error("A valid Deriv contract is required to edit protection.");
    const limitOrder = protectionLimitOrder(updates, stake);
    if (this.closed || !this.client.connected)
      throw new Error("Wait for the Deriv connection before changing protection.");
    // Omitted sides are left unchanged. An update response can be partial, so it
    // is never applied as a full limit snapshot; the caller reads the contract.
    await this.client.request(
      { contract_update: 1, contract_id: contractId, limit_order: limitOrder },
      REQUEST_TIMEOUT_MS,
      () => {
        if (this.closed)
          throw new Error("The Deriv account was disconnected before the update.");
        beforeSend?.();
      },
    );
  }

  async sellDemo(contractId: number, beforeSend?: () => void): Promise<number> {
    const response = await this.client.request<SellResponse>(
      { sell: contractId, price: 0 },
      undefined,
      beforeSend,
    );

    const soldFor = finiteBrokerNumber(response.sell?.sold_for);
    if (soldFor === undefined)
      throw new Error(
        "Deriv did not confirm the sale. Refresh the contract status before retrying.",
      );
    return soldFor;
  }

  close(): void {
    this.closed = true;
    this.client.close();
  }
}
