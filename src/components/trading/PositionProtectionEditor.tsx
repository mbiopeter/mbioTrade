"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { AccountContextValue } from "@/context/account-context";
import { chartPositionLevels } from "@/lib/chart-position";
import { belongsToAccount } from "@/lib/deriv-reconciliation";
import { formatOrderMoney } from "@/lib/order-funding";
import {
  validateProtectionUpdate,
  type ProtectionBaseline,
  type ProtectionUpdate,
} from "@/lib/trade-protection";
import type { DemoTrade } from "@/lib/types";

type ProtectionKind = keyof ProtectionUpdate;
type DraftField = { input: string; baseline: number | undefined };
type ProtectionDraft = Partial<Record<ProtectionKind, DraftField>>;
type ProtectionAccount = Pick<
  AccountContextValue,
  "credentials" | "connected" | "connectionStatus" | "currency" | "updateProtection"
>;

type PositionProtectionEditorProps = {
  trade: DemoTrade;
  account: ProtectionAccount;
  disabled?: boolean;
};

const protectionFields: Array<{ kind: ProtectionKind; label: string }> = [
  { kind: "stopLoss", label: "Stop loss" },
  { kind: "takeProfit", label: "Take profit" },
];

function cashAmount(value: number | undefined, loss = false): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const amount = loss ? Math.abs(value) : value;
  return amount > 0 ? amount : undefined;
}

function inputAmount(input: string): number {
  return input.trim() === "" ? Number.NaN : Number(input);
}

function inputValue(amount: number | undefined): string {
  return amount === undefined ? "" : String(amount);
}

/** Remount drafts when the selected account or contract changes. */
export function PositionProtectionEditor(props: PositionProtectionEditorProps) {
  const { trade, account } = props;
  const identity = [
    account.credentials?.accountMode ?? "none",
    account.credentials?.accountId ?? "none",
    trade.contractId ?? trade.id,
    trade.status,
  ].join(":");

  return <ProtectionEditorForm key={identity} {...props} />;
}

function ProtectionEditorForm({
  trade,
  account,
  disabled = false,
}: PositionProtectionEditorProps) {
  const id = useId();
  const mountedRef = useRef(false);
  const pendingRef = useRef(false);
  const [draft, setDraft] = useState<ProtectionDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currency = trade.currency ?? account.currency;
  const current: ProtectionUpdate = {
    stopLoss: cashAmount(trade.brokerStopLoss, true),
    takeProfit: cashAmount(trade.brokerTakeProfit),
  };
  const accountMatches = Boolean(
    account.credentials && belongsToAccount(trade, account.credentials),
  );
  const canEdit = Boolean(
    trade.status === "open" &&
    trade.contractId &&
    accountMatches &&
    account.connected &&
    account.connectionStatus === "connected" &&
    !disabled,
  );
  const updates: ProtectionUpdate = {};
  const conflicts: string[] = [];
  for (const { kind, label } of protectionFields) {
    const field = draft?.[kind];
    if (!field) continue;
    const amount = inputAmount(field.input);
    if (amount !== current[kind]) updates[kind] = amount;
    if (field.baseline !== current[kind] && amount !== current[kind]) {
      conflicts.push(label.toLowerCase());
    }
  }
  const changed = Object.keys(updates).length > 0;
  let validationError: string | null = null;
  if (changed) {
    try {
      validateProtectionUpdate(updates, trade.stake);
    } catch (cause) {
      validationError =
        cause instanceof Error ? cause.message : "Enter valid cash limits.";
    }
  }

  const preview = chartPositionLevels({
    ...trade,
    localStops: false,
    brokerLimitsKnown: true,
    brokerStopLoss:
      updates.stopLoss !== undefined ? updates.stopLoss : current.stopLoss,
    brokerTakeProfit:
      updates.takeProfit !== undefined ? updates.takeProfit : current.takeProfit,
    brokerStopLossPrice:
      updates.stopLoss !== undefined ? undefined : trade.brokerStopLossPrice,
    brokerTakeProfitPrice:
      updates.takeProfit !== undefined ? undefined : trade.brokerTakeProfitPrice,
  });

  const resetDraft = () => {
    setDraft({});
    setError(null);
    setSuccess(false);
  };

  const changeField = (kind: ProtectionKind, input: string) => {
    setDraft((previous) => ({
      ...previous,
      [kind]: {
        input,
        // Only the edited field is pinned. The other field continues following Deriv.
        baseline: previous?.[kind] ? previous[kind].baseline : current[kind],
      },
    }));
    setError(null);
    setSuccess(false);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !canEdit ||
      pendingRef.current ||
      !changed ||
      validationError ||
      conflicts.length > 0
    )
      return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      const expected: ProtectionBaseline = {};
      for (const { kind } of protectionFields) {
        if (updates[kind] !== undefined)
          expected[kind] = draft?.[kind]?.baseline ?? null;
      }
      await account.updateProtection(trade.id, updates, expected);
      if (!mountedRef.current) return;
      setDraft(null);
      setSuccess(true);
    } catch (cause) {
      if (!mountedRef.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Deriv could not confirm the changed limits.",
      );
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  };

  if (trade.status !== "open" || !trade.contractId) return null;

  return (
    <div className="position-protection-editor" data-contract-id={trade.contractId}>
      {draft === null ? (
        <button
          type="button"
          className="btn secondary full protection-toggle"
          disabled={!canEdit}
          aria-expanded={false}
          aria-controls={`${id}-form`}
          onClick={resetDraft}
        >
          <ShieldCheck size={15} />
          Edit SL / TP
        </button>
      ) : (
        <form
          id={`${id}-form`}
          className="protection-form"
          onSubmit={(event) => void save(event)}
          noValidate
        >
          <div className="protection-heading">
            <ShieldCheck size={15} />
            <strong>Position protection</strong>
          </div>
          <p className="protection-intro">
            Set the cash loss limit and profit target in {currency}. Deriv applies
            confirmed changes to this open position across devices.
          </p>
          <div className="protection-fields">
            {protectionFields.map(({ kind, label }) => {
              const price = preview?.[kind] ?? null;
              const source =
                preview?.[kind === "stopLoss" ? "stopLossSource" : "takeProfitSource"];
              const currentAmount = current[kind];
              return (
                <div className="field protection-field" key={kind}>
                  <label className="field-label" htmlFor={`${id}-${kind}`}>
                    {label} ({currency})
                  </label>
                  <span className="protection-current">
                    Current:{" "}
                    {currentAmount !== undefined
                      ? formatOrderMoney(currentAmount, currency)
                      : trade.brokerLimitsKnown
                        ? "Not set"
                        : "Not reported yet"}
                  </span>
                  <input
                    id={`${id}-${kind}`}
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    placeholder="Not set"
                    aria-label={`${label} (${currency})`}
                    aria-describedby={`${id}-${kind}-hint`}
                    disabled={pending || !canEdit}
                    value={draft[kind]?.input ?? inputValue(currentAmount)}
                    onChange={(event) => changeField(kind, event.target.value)}
                  />
                  <span className="field-hint" id={`${id}-${kind}-hint`}>
                    {kind === "stopLoss"
                      ? `Cash loss limit, below the ${formatOrderMoney(trade.stake, currency)} stake.`
                      : "Cash profit target."}
                  </span>
                  {price !== null && (
                    <span className="protection-price">
                      {source === "broker" ? "Broker price" : "Approx. price"}:{" "}
                      {price.toFixed(5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="protection-note">
            Save sends only the cash limits you change. Price levels are read-only
            references
            {preview?.excludesCommission ? "; estimates exclude fees" : ""}.
          </p>
          {trade.localStops && (
            <p className="protection-note">
              Saving uses Deriv&apos;s limits in place of this position&apos;s local
              exit plan.
            </p>
          )}
          {conflicts.length > 0 && (
            <div className="protection-conflict" role="alert">
              <p>
                Deriv changed {conflicts.join(" and ")} while you were editing. Review
                the current limits before saving.
              </p>
              <button
                type="button"
                className="btn secondary tiny"
                disabled={pending}
                onClick={resetDraft}
              >
                Use current limits
              </button>
            </div>
          )}
          {validationError && (
            <p className="protection-error" role="alert">
              {validationError}
            </p>
          )}
          {error && (
            <p className="protection-error" role="alert">
              {error}
            </p>
          )}
          <div className="protection-actions">
            <button
              type="submit"
              className="btn primary slim"
              disabled={
                pending ||
                !canEdit ||
                !changed ||
                Boolean(validationError) ||
                conflicts.length > 0
              }
            >
              {pending ? "Saving on Deriv…" : "Save changes"}
            </button>
            <button
              type="button"
              className="btn secondary slim"
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {pending && (
            <p className="protection-note" role="status">
              Waiting for Deriv to confirm the new limits…
            </p>
          )}
        </form>
      )}
      {!canEdit && (
        <p className="protection-note">
          {disabled
            ? "This position is closing."
            : !accountMatches
              ? "Connect this position's Deriv account to edit its limits."
              : "Waiting for the Deriv connection before you can edit limits."}
        </p>
      )}
      {success && (
        <p className="protection-success" role="status">
          SL / TP updated on Deriv.
        </p>
      )}
    </div>
  );
}
