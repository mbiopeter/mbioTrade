/** A rejected preflight is known not to have submitted a purchase. */
export class OrderFundingError extends Error {
  readonly buySubmitted = false;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OrderFundingError";
  }
}

function finiteAmount(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function formatOrderMoney(amount: number, currency: string): string {
  const value = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
    useGrouping: false,
  }).format(amount);
  return `${value} ${currency}`;
}

/** Use the returned purchase quote, never a guessed price or an automatic top-up. */
export function assertQuotedOrderCost(
  quotedPrice: unknown,
  selectedAmount: number,
  currency: string,
): number {
  const required = finiteAmount(quotedPrice);
  const selected = formatOrderMoney(selectedAmount, currency);
  if (required === null || required <= 0) {
    throw new OrderFundingError(
      `Order not placed. Deriv did not provide a valid purchase price. Selected amount: ${selected}. Request a fresh quote.`,
    );
  }
  if (required > selectedAmount) {
    throw new OrderFundingError(
      `Order not placed. These settings require ${formatOrderMoney(required, currency)}, ` +
      `but the selected amount is ${selected} ` +
      `(${formatOrderMoney(required - selectedAmount, currency)} short). Update the amount and request a new quote.`,
    );
  }
  return required;
}

/** Balance must be verified; a missing balance is never treated as enough funds. */
export function assertOrderBalance(
  requiredAmount: number,
  availableBalance: unknown,
  currency: string,
  selectedAmount = requiredAmount,
): void {
  if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
    throw new OrderFundingError("Order not placed. The required purchase amount could not be verified.");
  }
  const required = formatOrderMoney(requiredAmount, currency);
  const selected = formatOrderMoney(selectedAmount, currency);
  const available = finiteAmount(availableBalance);
  if (available === null) {
    throw new OrderFundingError(
      `Order not placed. Required: ${required}; selected: ${selected}. The available Deriv balance could not be verified.`,
    );
  }
  if (requiredAmount > available) {
    throw new OrderFundingError(
      `Order not placed. Required: ${required}; selected: ${selected}; ` +
      `available: ${formatOrderMoney(available, currency)}; ` +
      `shortfall: ${formatOrderMoney(requiredAmount - available, currency)}.`,
    );
  }
}

type AmountRequirement = { amount: number; kind: "minimum" | "required" };

function brokerAmountRequirement(error: Error, currency: string): AmountRequirement | null {
  // Error details vary between endpoints. Only explicitly named monetary
  // requirements are interpreted; a generic `min` may refer to a stop or duration.
  const description = `${"code" in error ? String(error.code) : ""} ${error.message}`;
  if (/stop[_ -]?loss|take[_ -]?profit|limit[_ -]?order/i.test(description)) return null;
  for (const detail of [
    "details" in error ? error.details : null,
    "data" in error ? error.data : null,
  ]) {
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) continue;
    const record = detail as Record<string, unknown>;
    if (typeof record.currency === "string" && record.currency !== currency) continue;
    const keys: Array<[string, AmountRequirement["kind"]]> = [
      ["minimum_stake", "minimum"],
      ["min_stake", "minimum"],
    ];
    if (/stake|amount|price|balance/i.test(description)) {
      keys.push(
        ["minimum_amount", "minimum"],
        ["min_amount", "minimum"],
        ["required_amount", "required"],
      );
    }
    for (const [key, kind] of keys) {
      const amount = finiteAmount(record[key]);
      if (amount !== null && amount > 0) return { amount, kind };
    }
  }
  return null;
}

/** Only call before `buy` is sent. Preserve the broker's exact rejection reason. */
export function orderPreflightError(
  error: unknown,
  selectedAmount: number,
  currency: string,
): OrderFundingError {
  if (error instanceof OrderFundingError) return error;
  const message = error instanceof Error ? error.message : "The order could not be verified.";
  const selected = Number.isFinite(selectedAmount)
    ? ` Selected amount: ${formatOrderMoney(selectedAmount, currency)}.`
    : "";
  const requirement = error instanceof Error ? brokerAmountRequirement(error, currency) : null;
  const reported = requirement
    ? ` Deriv ${requirement.kind} amount: ${formatOrderMoney(requirement.amount, currency)}.` +
      (requirement.amount > selectedAmount && Number.isFinite(selectedAmount)
        ? ` Difference: ${formatOrderMoney(requirement.amount - selectedAmount, currency)}.`
        : "")
    : "";
  return new OrderFundingError(`Order not placed. ${message}${selected}${reported}`, { cause: error });
}
