import { isRecord } from "../validation/common";
import type { DerivAccountSummary } from "../types";

function explicitBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false")
    return false;
  return undefined;
}

export function normalizeDerivAccounts(payload: unknown): DerivAccountSummary[] {
  const data = isRecord(payload) ? payload.data : undefined;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.accounts)
        ? data.accounts
        : isRecord(payload) && Array.isArray(payload.accounts)
          ? payload.accounts
          : [];
  const byId = new Map<string, DerivAccountSummary>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const accountId = String(
      row.account_id ?? row.accountId ?? row.loginid ?? row.id ?? "",
    );
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(accountId)) continue;
    const accountType = String(row.account_type ?? row.type ?? "").toLowerCase();
    const isDemo =
      explicitBoolean(row.is_virtual) ??
      explicitBoolean(row.is_demo) ??
      (accountType === "demo" || accountType === "virtual"
        ? true
        : accountType === "real"
          ? false
          : undefined);
    // Never infer real-money mode from an unrecognized or missing account flag.
    if (isDemo === undefined) continue;
    byId.set(accountId, {
      accountId,
      accountType,
      isDemo,
      currency: String(row.currency ?? ""),
    });
  }
  return [...byId.values()];
}

export function isDerivAccountUrl(url: string, mode: "demo" | "real"): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "wss:" &&
      parsed.hostname === "api.derivws.com" &&
      parsed.port === "" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === `/trading/v1/options/ws/${mode}`
    );
  } catch {
    return false;
  }
}
