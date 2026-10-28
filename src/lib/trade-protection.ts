import {
  belongsToAccount,
  brokerBoolean,
  brokerLimitAmount,
  isContractClosed,
  type AccountIdentity,
} from "./deriv-reconciliation";
import type { DemoTrade, DerivOpenContract } from "./types";
import { isRecord } from "./validation";

/** Positive cash P/L amounts in the contract's account currency, not spot prices. */
export type ProtectionUpdate = {
  stopLoss?: number;
  takeProfit?: number;
};

/** Null records an absent limit; omitted sides do not participate in conflict checks. */
export type ProtectionBaseline = {
  stopLoss?: number | null;
  takeProfit?: number | null;
};

export type ProtectionLimitOrder = {
  stop_loss?: number;
  take_profit?: number;
};

export function validateProtectionUpdate(
  updates: ProtectionUpdate,
  stake: number,
): ProtectionUpdate {
  if (!Number.isFinite(stake) || stake <= 0)
    throw new Error("Deriv must confirm the contract's stake before protection can be edited.");
  const valid: ProtectionUpdate = {};
  for (const field of ["stopLoss", "takeProfit"] as const) {
    const amount = updates[field];
    if (amount === undefined) continue;
    const label = field === "stopLoss" ? "Stop loss" : "Take profit";
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)
      throw new Error(`${label} must be a positive cash amount in the account currency.`);
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7)
      throw new Error(`${label} must use at most two decimal places.`);
    if (field === "stopLoss" && amount >= stake)
      throw new Error(`Stop loss must be less than the contract's ${stake.toFixed(2)} stake.`);
    valid[field] = amount;
  }
  if (valid.stopLoss === undefined && valid.takeProfit === undefined)
    throw new Error("Change at least one stop loss or take profit amount.");
  return valid;
}

export function protectionLimitOrder(
  updates: ProtectionUpdate,
  stake: number,
): ProtectionLimitOrder {
  const valid = validateProtectionUpdate(updates, stake);
  return {
    ...(valid.stopLoss === undefined ? {} : { stop_loss: valid.stopLoss }),
    ...(valid.takeProfit === undefined ? {} : { take_profit: valid.takeProfit }),
  };
}

export function assertEditableProtection(
  trade: DemoTrade | undefined,
  account: AccountIdentity,
): asserts trade is DemoTrade & { contractId: number } {
  if (
    !trade ||
    !Number.isSafeInteger(trade.contractId) ||
    !trade.contractId ||
    trade.contractId <= 0 ||
    !belongsToAccount(trade, account)
  )
    throw new Error("This contract is unavailable on the connected account.");
  if (trade.status !== "open")
    throw new Error("Only an open contract can have its stop loss or take profit changed.");
  if (trade.contractType && !["MULTUP", "MULTDOWN"].includes(trade.contractType))
    throw new Error("Stop loss and take profit editing is available for multiplier contracts.");
}

function assertOpenContract(contract: DerivOpenContract, contractId: number): void {
  if (Number(contract.contract_id) !== contractId)
    throw new Error("Deriv did not return the requested contract.");
  if (isContractClosed(contract) || brokerBoolean(contract.is_expired))
    throw new Error("This contract has closed or expired at Deriv. Its protection cannot be changed.");
  if (
    String(contract.status ?? "").toLowerCase() !== "open" &&
    contract.is_sold !== false &&
    contract.is_sold !== 0
  )
    throw new Error("Deriv has not confirmed that this contract is still open. Refresh and try again.");
}

/** Check the fresh payload itself; cached amounts cannot confirm a mutation. */
export function protectionMatchesContract(
  contract: DerivOpenContract,
  updates: ProtectionUpdate,
): boolean {
  if (!isRecord(contract.limit_order)) return false;
  return (
    (updates.stopLoss === undefined ||
      brokerLimitAmount(contract.limit_order.stop_loss, "stop_loss") === updates.stopLoss) &&
    (updates.takeProfit === undefined ||
      brokerLimitAmount(contract.limit_order.take_profit, "take_profit") === updates.takeProfit)
  );
}

function assertProtectionBaseline(
  current: ProtectionBaseline,
  updates: ProtectionUpdate,
  expected: ProtectionBaseline,
): void {
  for (const field of ["stopLoss", "takeProfit"] as const) {
    if (updates[field] === undefined || !Object.prototype.hasOwnProperty.call(expected, field)) continue;
    if ((current[field] ?? null) !== (expected[field] ?? null))
      throw new Error(
        `${field === "stopLoss" ? "Stop loss" : "Take profit"} changed at Deriv while this edit was open. ` +
        "Review the current broker limits and enter your change again.",
      );
  }
}

export type ProtectionSession = {
  account: AccountIdentity;
  getTrade: () => DemoTrade | undefined;
  /** Throws if this account/socket generation has been replaced or disconnected. */
  assertCurrent: () => void;
  readContract: (contractId: number) => Promise<DerivOpenContract>;
  sendUpdate: (
    contractId: number,
    updates: ProtectionUpdate,
    stake: number,
    beforeSend: () => void,
  ) => Promise<void>;
  applyContract: (contract: DerivOpenContract) => void;
  /** Stop an old price plan from issuing a sell while the broker outcome is uncertain. */
  disableLocalStops: (contractId: number) => void;
};

/**
 * Read, update once, then read back the broker's current limits. This deliberately
 * does not depend on account history or balance: protective edits are not entries.
 * A dropped update response must never cause the financial request to be replayed.
 */
export async function updateTradeProtection(
  session: ProtectionSession,
  updates: ProtectionUpdate,
  expected?: ProtectionBaseline,
): Promise<void> {
  session.assertCurrent();
  const initial = session.getTrade();
  assertEditableProtection(initial, session.account);
  const requested = validateProtectionUpdate(updates, initial.stake);
  const baseline = expected ? { ...expected } : undefined;
  const contractId = initial.contractId;
  const snapshot = await session.readContract(contractId);
  session.assertCurrent();
  if (Number(snapshot.contract_id) !== contractId)
    throw new Error("Deriv did not return the requested contract.");
  session.applyContract(snapshot);
  assertOpenContract(snapshot, contractId);
  const current = session.getTrade();
  assertEditableProtection(current, session.account);
  if (current.contractId !== contractId)
    throw new Error("The selected contract changed before the update was sent.");
  validateProtectionUpdate(requested, current.stake);
  const preflightLimits = isRecord(snapshot.limit_order) ? snapshot.limit_order : {};
  const preflightBaseline: ProtectionBaseline = {
    stopLoss: brokerLimitAmount(preflightLimits.stop_loss, "stop_loss") ?? null,
    takeProfit: brokerLimitAmount(preflightLimits.take_profit, "take_profit") ?? null,
  };
  if (baseline) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, "limit_order"))
      throw new Error("Deriv's current protection could not be verified. Review the current broker limits before editing.");
    assertProtectionBaseline(preflightBaseline, requested, baseline);
  }
  if (protectionMatchesContract(snapshot, requested)) return;

  const permitted = snapshot.is_valid_to_update;
  if (isRecord(permitted)) {
    if (requested.stopLoss !== undefined && permitted.stop_loss === 0)
      throw new Error("Deriv does not currently allow the stop loss to be changed on this contract.");
    if (requested.takeProfit !== undefined && permitted.take_profit === 0)
      throw new Error("Deriv does not currently allow the take profit to be changed on this contract.");
  }

  let requestError: unknown;
  try {
    await session.sendUpdate(contractId, requested, current.stake, () => {
      session.assertCurrent();
      const latest = session.getTrade();
      assertEditableProtection(latest, session.account);
      if (latest.contractId !== contractId)
        throw new Error("The selected contract changed before the update was sent.");
      if (Object.prototype.hasOwnProperty.call(snapshot, "limit_order")) {
        assertProtectionBaseline({
          stopLoss: latest.brokerStopLoss ?? null,
          takeProfit: latest.brokerTakeProfit ?? null,
        }, requested, preflightBaseline);
      }
      // This changes only local exit permission, never the displayed broker limits.
      // Once an update may be in flight, the old local plan must not close the trade.
      session.disableLocalStops(contractId);
    });
  } catch (error) {
    requestError = error;
  }

  session.assertCurrent();
  let verified: DerivOpenContract;
  try {
    verified = await session.readContract(contractId);
  } catch (error) {
    session.assertCurrent();
    const reason = requestError instanceof Error ? requestError.message :
      error instanceof Error ? error.message : "The current contract could not be read.";
    throw new Error(
      `The protection update could not be verified at Deriv. ${reason} ` +
      "The update was not resent. Wait for the connection to recover and check the current broker limits before trying again.",
    );
  }
  session.assertCurrent();
  if (Number(verified.contract_id) !== contractId)
    throw new Error("Deriv did not return the requested contract while verifying the update.");
  session.applyContract(verified);
  assertOpenContract(verified, contractId);
  assertEditableProtection(session.getTrade(), session.account);
  if (protectionMatchesContract(verified, requested)) return;
  const reason = requestError instanceof Error ? ` ${requestError.message}` : "";
  throw new Error(
    `Deriv's latest contract does not confirm the requested protection.${reason} ` +
    "The displayed limits come from Deriv. The update was not resent; review the current limits before trying again.",
  );
}
