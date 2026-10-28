/**
 * Deriv multiplier contracts use a monetary stake amount rather than a
 * conventional CFD lot size. Keep the rules in one module so Settings,
 * automatic execution, manual execution, migrations, and tests agree.
 */
export const MIN_TRADE_AMOUNT = 1;
export const DEFAULT_TRADE_AMOUNT = 20;
export const TRADE_AMOUNT_STEP = 1;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isValidTradeAmount(value: unknown): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= MIN_TRADE_AMOUNT;
}

export function sanitizeTradeAmount(
  value: unknown,
  fallback = DEFAULT_TRADE_AMOUNT,
): number {
  const amount = Number(value);
  if (!isValidTradeAmount(amount)) {
    return roundCurrency(
      isValidTradeAmount(fallback) ? fallback : DEFAULT_TRADE_AMOUNT,
    );
  }

  return roundCurrency(amount);
}

export function assertTradeAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < MIN_TRADE_AMOUNT) {
    throw new Error(
      `Please enter a stake amount which is at least ${MIN_TRADE_AMOUNT.toFixed(2)}.`,
    );
  }

  return roundCurrency(amount);
}
