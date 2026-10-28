"use client";

import Link from "next/link";
import {
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Segmented } from "@/components/ui/controls";
import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import type { DerivPortfolioContract } from "@/lib/types";

const PROFILE_TABS = [
  { value: "overview" as const, label: "Overview" },
  { value: "positions" as const, label: "Positions" },
  { value: "session" as const, label: "Connection" },
];

type ProfileTab = (typeof PROFILE_TABS)[number]["value"];

function contractSymbol(contract: DerivPortfolioContract): string {
  return String(
    contract.underlying_symbol ?? contract.underlying ?? contract.symbol ?? "—",
  );
}

function numericValue(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export default function ProfilePage() {
  const account = useAccount();
  const { preferences } = useApp();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  if (!account.connected) {
    return (
      <>
        <PageHeader
          eyebrow="Account"
          title="Profile"
          description="Connect a Deriv account to view live account information."
        />
        <div className="card empty-block">
          <ShieldAlert size={28} />
          <strong>No connected account</strong>
          <span>Connect a Demo or Real account from Settings first.</span>
          <Link className="btn primary" href="/settings">
            Open settings
          </Link>
        </div>
      </>
    );
  }

  const tabs = PROFILE_TABS.map((tab) =>
    tab.value === "positions"
      ? { ...tab, label: `Positions (${account.portfolio.length})` }
      : tab,
  );

  return (
    <>
      <PageHeader
        eyebrow="Connected account"
        title="Profile and account"
        description="Live account identity, balance, open positions and session status from the connected Deriv account."
        actions={
          <button
            type="button"
            className="btn secondary slim"
            onClick={() =>
              void account.refresh().catch((error: unknown) =>
                toast({
                  title: "Account refresh needs attention",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Deriv could not be reached.",
                  tone: "error",
                }),
              )
            }
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        }
      />

      <div className="profile-tabs">
        <Segmented
          value={activeTab}
          ariaLabel="Profile section"
          options={tabs}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "overview" && (
        <>
          <section className="stats-grid four">
            <StatCard
              label="Account"
              value={account.credentials?.accountId ?? "—"}
              meta={account.credentials?.accountMode ?? "—"}
              icon={<UserRound />}
            />
            <StatCard
              label="Balance"
              value={
                account.balance !== null
                  ? `${account.balance.toFixed(2)} ${account.currency}`
                  : "—"
              }
              meta="Live balance subscription"
              icon={<WalletCards />}
            />
            <StatCard
              label="Open contracts"
              value={account.portfolio.length}
              meta="Deriv portfolio"
            />
            <StatCard
              label="Session"
              value={
                account.connectionStatus === "connected"
                  ? "Connected"
                  : account.connectionStatus === "offline"
                    ? "Offline — auto-retry"
                    : "Reconnecting"
              }
              meta={
                account.synced
                  ? "Positions synchronized with Deriv"
                  : "Waiting for account synchronization"
              }
              icon={<ShieldCheck />}
            />
          </section>

          <section className="card account-summary">
            <div className="card-head">
              <div>
                <span>Account snapshot</span>
                <h2>
                  {account.credentials?.accountMode === "demo"
                    ? "Demo account"
                    : "Real account"}
                </h2>
              </div>
            </div>
            <div className="account-detail-grid">
              <div>
                <span>Login ID</span>
                <strong>{account.credentials?.accountId ?? "—"}</strong>
              </div>
              <div>
                <span>Currency</span>
                <strong>{account.currency}</strong>
              </div>
              <div>
                <span>Live balance</span>
                <strong>
                  {account.balance !== null ? account.balance.toFixed(2) : "—"}
                </strong>
              </div>
              <div>
                <span>Execution policy</span>
                <strong>
                  {preferences.executionMode === "automatic"
                    ? `Automatic · ${preferences.automationExecutor === "worker" ? "server worker" : "browser"}`
                    : preferences.executionMode === "manual"
                      ? "Manual trading"
                      : "Signals only"}
                </strong>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === "positions" && (
        <section className="card trade-table-card">
          <div className="card-head">
            <div>
              <span>Portfolio</span>
              <h2>Open Deriv contracts</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Contract</th>
                  <th>Buy price</th>
                  <th>P/L</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {account.portfolio.length ? (
                  account.portfolio.map((contract, index) => {
                    const profit = numericValue(contract.profit);
                    return (
                      <tr key={String(contract.contract_id ?? index)}>
                        <td>{contractSymbol(contract)}</td>
                        <td>{String(contract.contract_type ?? "—")}</td>
                        <td>{numericValue(contract.buy_price).toFixed(2)}</td>
                        <td className={profit >= 0 ? "positive" : "negative"}>
                          {profit.toFixed(2)}
                        </td>
                        <td>{String(contract.contract_id ?? "—")}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5}>No open positions.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "session" && (
        <section className="card settings-section">
          <div className="settings-title">
            <div className="settings-icon">
              <ShieldCheck />
            </div>
            <div>
              <h2>Connection details</h2>
              <p>
                Credentials are not included in local workspace exports or Google Drive
                backups.
              </p>
            </div>
          </div>
          <div className="account-detail-grid">
            <div>
              <span>App ID</span>
              <strong>{account.credentials?.appId ?? "—"}</strong>
            </div>
            <div>
              <span>Account mode</span>
              <strong>{account.credentials?.accountMode ?? "—"}</strong>
            </div>
            <div>
              <span>API key storage</span>
              <strong>
                {account.credentials?.rememberSession
                  ? "Remembered on this device"
                  : "Memory only"}
              </strong>
            </div>
            <div>
              <span>Connection</span>
              <strong>Authenticated WebSocket</strong>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
