import type {
  AccountTradeEvent,
  ConnectedAccountMode,
  DemoTrade,
  DerivOpenContract,
  DerivPortfolioContract,
  DerivProfitTransaction,
  DerivTransaction,
  LivePositionSnapshot,
  Signal,
} from "./types";

export type AccountIdentity = {
  accountId: string;
  accountMode: ConnectedAccountMode;
};

type ContractPayload = DerivOpenContract | DerivPortfolioContract;

export function finiteBrokerNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function brokerBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function accountStorageSuffix(account: AccountIdentity): string {
  return `${account.accountMode}.${account.accountId}`;
}

export function belongsToAccount(
  trade: Pick<DemoTrade, "accountId" | "accountMode">,
  account: AccountIdentity,
): boolean {
  return (
    trade.accountId === account.accountId && trade.accountMode === account.accountMode
  );
}

export function utcDayStart(now = Date.now()): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isContractClosed(contract: ContractPayload): boolean {
  return (
    brokerBoolean(contract.is_sold) ||
    ["sold", "won", "lost", "cancelled", "canceled"].includes(
      String(contract.status ?? "").toLowerCase(),
    )
  );
}

function contractType(contract: ContractPayload): string {
  return String(
    contract.contract_type ?? String(contract.shortcode ?? "").split("_")[0] ?? "",
  );
}

function contractSymbol(contract: ContractPayload): string {
  const explicit = contract.underlying_symbol ?? contract.underlying ?? contract.symbol;
  if (typeof explicit === "string" && explicit) return explicit;
  const shortcode = String(contract.shortcode ?? "");
  // Restore the terminal's forex/crypto/metals symbols and common index names
  // from records whose broker payload supplies only a compact description.
  const knownSymbol = shortcode.match(
    /^(?:MULTUP|MULTDOWN)_((?:frx|cry)[A-Za-z0-9]+|R_[0-9]+|1HZ[0-9]+V)_/,
  );
  if (knownSymbol) return knownSymbol[1];
  // Profit table records often only include a shortcode. Symbols may themselves
  // contain underscores (for example R_100), so stop at the currency component.
  const match = shortcode.match(/^(?:MULTUP|MULTDOWN)_(.+?)_[A-Z]{3}_/);
  return match?.[1] ?? "";
}

export function brokerLimitAmount(
  value: unknown,
  kind: "stop_loss" | "take_profit",
): number | undefined {
  const number = (input: unknown): number | undefined => {
    if (
      (typeof input !== "number" && typeof input !== "string") ||
      (typeof input === "string" && !input.trim())
    ) return undefined;
    return finiteBrokerNumber(input);
  };
  let amount: number | undefined;
  if (typeof value === "object" && value !== null) {
    const order = value as Record<string, unknown>;
    amount = number(order.display_order_amount) ?? number(order.order_amount);
  } else {
    amount = number(value);
  }
  if (amount === undefined) return undefined;
  // Deriv represents stop-loss P/L as a negative order_amount in responses;
  // the editor and contract_update request both use the positive loss allowance.
  const positive = kind === "stop_loss" ? Math.abs(amount) : amount;
  return positive > 0 ? positive : undefined;
}

function limitPrice(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null || !("value" in value))
    return undefined;
  // Deriv's open-contract schema defines this as the pip-sized spot barrier.
  const price = finiteBrokerNumber(value.value);
  return price !== undefined && price > 0 ? price : undefined;
}

function nonnegativeBrokerNumber(value: unknown): number | undefined {
  const number = finiteBrokerNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

/** Convert only multiplier contracts into the terminal's directional trade model. */
export function tradeFromContract(
  contract: ContractPayload,
  account: AccountIdentity,
  previous?: DemoTrade,
): DemoTrade | null {
  const id = finiteBrokerNumber(contract.contract_id);
  if (!id || !Number.isSafeInteger(id) || id <= 0) return null;
  const sameContract =
    previous?.contractId === id &&
    (!previous.accountId || belongsToAccount(previous, account));
  const prior = sameContract ? previous : undefined;
  const type =
    contractType(contract) ||
    prior?.contractType ||
    (prior ? (prior.direction === "UP" ? "MULTUP" : "MULTDOWN") : "");
  if (type !== "MULTUP" && type !== "MULTDOWN") return null;
  const symbol = contractSymbol(contract) || prior?.symbol || "";
  if (!/^[A-Za-z0-9_]{2,30}$/.test(symbol)) return null;
  const stake = finiteBrokerNumber(contract.buy_price) ?? prior?.stake;
  if (stake === undefined || stake <= 0) return null;
  const openedSeconds =
    finiteBrokerNumber(contract.purchase_time) ??
    finiteBrokerNumber(contract.date_start) ??
    (prior ? prior.openedAt / 1000 : undefined);
  const entry =
    finiteBrokerNumber(contract.entry_spot) ??
    finiteBrokerNumber(contract.entry_tick) ??
    prior?.entry ??
    0;
  const closed = isContractClosed(contract);
  const profit = finiteBrokerNumber(contract.profit);
  const soldFor =
    finiteBrokerNumber(contract.sell_price) ??
    (closed && profit !== undefined ? stake + profit : undefined) ??
    (closed ? prior?.soldFor : undefined);
  const limits = contract.limit_order;
  const hasLimitSnapshot =
    Object.prototype.hasOwnProperty.call(contract, "limit_order") &&
    (limits === null ||
      (typeof limits === "object" && !Array.isArray(limits)));
  const order =
    typeof limits === "object" && limits !== null
      ? (limits as Record<string, unknown>)
      : {};
  const brokerTakeProfit = hasLimitSnapshot
    ? brokerLimitAmount(order.take_profit, "take_profit")
    : brokerLimitAmount(prior?.brokerTakeProfit, "take_profit");
  const brokerStopLoss = hasLimitSnapshot
    ? brokerLimitAmount(order.stop_loss, "stop_loss")
    : brokerLimitAmount(prior?.brokerStopLoss, "stop_loss");
  const brokerTakeProfitPrice = hasLimitSnapshot
    ? limitPrice(order.take_profit)
    : prior?.brokerTakeProfitPrice;
  const brokerStopLossPrice = hasLimitSnapshot
    ? limitPrice(order.stop_loss)
    : prior?.brokerStopLossPrice;
  const protectionChanged = hasLimitSnapshot && prior !== undefined && (
    brokerTakeProfit !== brokerLimitAmount(prior.brokerTakeProfit, "take_profit") ||
    brokerStopLoss !== brokerLimitAmount(prior.brokerStopLoss, "stop_loss") ||
    (prior.brokerLimitsKnown === true && (
      brokerTakeProfitPrice !== prior.brokerTakeProfitPrice ||
      brokerStopLossPrice !== prior.brokerStopLossPrice
    ))
  );
  return {
    id: prior?.id ?? `deriv-${accountStorageSuffix(account)}-${id}`,
    contractId: id,
    symbol,
    direction: type === "MULTUP" ? "UP" : "DOWN",
    entry,
    stopLoss: prior?.stopLoss ?? 0,
    takeProfit: prior?.takeProfit ?? 0,
    stake,
    // Unknown broker values remain unknown (0), never a fabricated default.
    multiplier: finiteBrokerNumber(contract.multiplier) ?? prior?.multiplier ?? 0,
    openedAt: (openedSeconds ?? 0) * 1000,
    entryTime: openedSeconds === undefined ? undefined : Math.floor(openedSeconds),
    status: closed ? "closed" : "open",
    source: prior?.source ?? "external",
    accountId: account.accountId,
    accountMode: account.accountMode,
    contractType: type,
    currency:
      typeof contract.currency === "string" ? contract.currency : prior?.currency,
    // A broker-side edit (including another device or removed protection) makes
    // the old saved chart-price plan obsolete. Never let that plan issue a sell.
    localStops: prior?.localStops === true && !protectionChanged,
    brokerProfit:
      profit ??
      (closed
        ? soldFor !== undefined
          ? soldFor - stake
          : undefined
        : prior?.brokerProfit),
    brokerTakeProfit,
    brokerStopLoss,
    brokerTakeProfitPrice,
    brokerStopLossPrice,
    brokerLimitsKnown: hasLimitSnapshot || prior?.brokerLimitsKnown === true,
    brokerCommission:
      nonnegativeBrokerNumber(contract.commission) ?? prior?.brokerCommission,
    signalId: prior?.signalId,
    soldFor: closed ? soldFor : undefined,
    closedAt: closed
      ? (finiteBrokerNumber(contract.sell_time) ??
          finiteBrokerNumber(contract.exit_spot_time) ??
          Date.now() / 1000) * 1000
      : undefined,
    comboId: prior?.comboId,
    comboName: prior?.comboName,
    confidence: prior?.confidence,
  };
}

export function tradeFromProfitRecord(
  record: DerivProfitTransaction,
  account: AccountIdentity,
  previous?: DemoTrade,
): DemoTrade | null {
  return tradeFromContract({ ...record, is_sold: 1 }, account, previous);
}

export function livePositionSnapshot(
  trade: DemoTrade,
  contract: DerivOpenContract,
): LivePositionSnapshot | null {
  if (!trade.contractId) return null;
  return {
    tradeId: trade.id,
    contractId: trade.contractId,
    currentSpot: finiteBrokerNumber(contract.current_spot),
    profit: finiteBrokerNumber(contract.profit),
    profitPercentage: finiteBrokerNumber(contract.profit_percentage),
    bidPrice: finiteBrokerNumber(contract.bid_price),
    buyPrice: finiteBrokerNumber(contract.buy_price),
    status: typeof contract.status === "string" ? contract.status : undefined,
    isSold: isContractClosed(contract),
    isValidToSell:
      contract.is_valid_to_sell === undefined
        ? undefined
        : brokerBoolean(contract.is_valid_to_sell),
    updatedAt: Date.now(),
  };
}

export function transactionEvent(
  transaction: DerivTransaction,
  account: AccountIdentity,
): AccountTradeEvent {
  const rawAction = String(
    transaction.action ?? transaction.action_type ?? "activity",
  ).toLowerCase();
  const action = rawAction === "buy" || rawAction === "sell" ? rawAction : "activity";
  const contractId = String(transaction.contract_id ?? transaction.contractId ?? "");
  const time = finiteBrokerNumber(transaction.transaction_time);
  return {
    id: String(
      transaction.transaction_id ??
        transaction.id ??
        `${time ?? 0}-${action}-${contractId}-${transaction.amount ?? ""}`,
    ),
    action,
    symbol: String(transaction.underlying_symbol ?? transaction.symbol ?? "contract"),
    amount: finiteBrokerNumber(transaction.amount),
    contractId: contractId || undefined,
    time: time === undefined ? Date.now() : time * 1000,
    accountId: account.accountId,
    accountMode: account.accountMode,
  };
}

/** Broker limits are currency P/L amounts, not underlying chart prices. */
export function multiplierLimitOrder(
  signal: Signal,
  stake: number,
  multiplier: number,
  currency = "USD",
): { stop_loss: number; take_profit: number } {
  if (signal.entry <= 0 || !Number.isFinite(signal.entry))
    throw new Error("A valid entry price is required.");
  const up = signal.direction === "UP";
  if (
    (up && !(signal.stopLoss < signal.entry && signal.takeProfit > signal.entry)) ||
    (!up && !(signal.stopLoss > signal.entry && signal.takeProfit < signal.entry))
  ) {
    throw new Error("Trade stop loss and take profit must surround the entry price.");
  }
  const loss =
    (Math.abs(signal.entry - signal.stopLoss) / signal.entry) * stake * multiplier;
  const profit =
    (Math.abs(signal.takeProfit - signal.entry) / signal.entry) * stake * multiplier;
  const round = (value: number) => Math.round(value * 100) / 100;
  if (!Number.isFinite(loss) || loss >= stake - 1e-8 || round(loss) >= stake) {
    const requiredLoss = Number.isFinite(loss) ? `${round(loss).toFixed(2)} ${currency}` : "an invalid amount";
    throw new Error(
      `The selected stop distance at ×${multiplier} requires a loss allowance of ${requiredLoss}, ` +
      `but the selected stake is ${stake.toFixed(2)} ${currency}. ` +
      "The stop cannot be reached within this stake. Use a closer stop or a lower multiplier; " +
      "increasing the stake alone scales the same risk and does not fix these settings.",
    );
  }
  const stopLoss = round(loss);
  const takeProfit = round(profit);
  if (
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(takeProfit) ||
    stopLoss <= 0 ||
    takeProfit <= 0
  ) {
    throw new Error(
      "This trade's broker protection amounts are too small. Adjust the amount or stop distances.",
    );
  }
  return { stop_loss: stopLoss, take_profit: takeProfit };
}

export function realizedProfit(
  records: DerivProfitTransaction[],
  from: number,
): number {
  let total = 0;
  for (const record of records) {
    const time = finiteBrokerNumber(record.sell_time);
    const buy = finiteBrokerNumber(record.buy_price);
    const sell = finiteBrokerNumber(record.sell_price);
    if (
      time !== undefined &&
      time * 1000 >= from &&
      buy !== undefined &&
      sell !== undefined
    )
      total += sell - buy;
  }
  return total;
}
