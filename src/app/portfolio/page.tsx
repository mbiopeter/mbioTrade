"use client";

import { RefreshCw, ShieldAlert, WalletCards } from "lucide-react";
import { useState } from "react";
import { PositionProtectionEditor } from "@/components/trading/PositionProtectionEditor";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useAccount } from "@/context/account-context";
import { useToast } from "@/context/toast-context";
import { positionMetrics } from "@/lib/position-metrics";
import type { DerivPortfolioContract } from "@/lib/types";

function contractSymbol(contract: DerivPortfolioContract): string {
  return String(
    contract.underlying_symbol ?? contract.underlying ?? contract.symbol ?? "—",
  );
}

export default function PortfolioPage() {
  const account = useAccount();
  const { toast } = useToast();
  const [closingId, setClosingId] = useState<string | null>(null);

  const closeTrade = async (tradeId: string) => {
    if (closingId) return;
    setClosingId(tradeId);
    try {
      await account.sellDemo(tradeId);
    } catch (error) {
      toast({
        title: "Could not close position",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      setClosingId(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Portfolio and trades"
        description="Live positions and settlements come from your connected Deriv account, including trades opened on other devices."
        actions={
          <button
            type="button"
            className="btn secondary slim"
            onClick={() =>
              void account.refresh().catch((error: unknown) =>
                toast({
                  title: "Account refresh failed",
                  message: error instanceof Error ? error.message : "Unknown error",
                  tone: "error",
                }),
              )
            }
            disabled={!account.connected}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <section className="stats-grid four">
        <StatCard
          label="Connection"
          value={
            account.connectionStatus === "connected"
              ? `${account.credentials?.accountMode} connected`
              : account.connected
                ? "Reconnecting"
                : "Public"
          }
          meta={account.credentials?.accountId ?? "No account selected"}
        />
        <StatCard
          label="Balance"
          value={
            account.balance !== null
              ? `${account.balance.toFixed(2)} ${account.currency}`
              : "—"
          }
          meta="Authenticated Deriv socket"
          icon={<WalletCards />}
        />
        <StatCard
          label="Deriv open contracts"
          value={account.portfolio.length}
          meta={
            account.accountSynced
              ? "Synchronized with Deriv"
              : "Awaiting account synchronization"
          }
        />
        <StatCard
          label="Account trade log"
          value={account.demoTrades.length}
          meta={`${account.demoTrades.filter((trade) => trade.status === "open").length} open`}
        />
      </section>

      {account.syncError && (
        <div className="inline-alert warn">
          <ShieldAlert size={17} />
          {account.syncError}
        </div>
      )}

      <section className="portfolio-grid equal-grid">
        <div className="card trade-table-card">
          <div className="card-head">
            <div>
              <span>Deriv account</span>
              <h2>Open portfolio</h2>
            </div>
          </div>

          {account.portfolio.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Symbol</th>
                    <th>Buy price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {account.portfolio.map((contract, index) => (
                    <tr key={String(contract.contract_id ?? index)}>
                      <td>{String(contract.contract_id ?? "—")}</td>
                      <td>{contractSymbol(contract)}</td>
                      <td>{String(contract.buy_price ?? "—")}</td>
                      <td>{String(contract.status ?? "open")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-block">
              {account.connected
                ? "No open Deriv contracts returned."
                : "Connect an account in Settings to view portfolio data."}
            </div>
          )}
        </div>

        <div className="card trade-table-card">
          <div className="card-head">
            <div>
              <span>Selected Deriv account</span>
              <h2>Multiplier trade log</h2>
            </div>
          </div>

          {account.demoTrades.length ? (
            <div className="demo-log">
              {account.demoTrades.slice(0, 30).map((trade) => {
                const metrics = positionMetrics(trade, account.livePositions[trade.id]);
                const pnl =
                  trade.status === "closed"
                    ? (trade.brokerProfit ??
                      (trade.soldFor !== undefined
                        ? trade.soldFor - trade.stake
                        : null))
                    : metrics.pnl;

                return (
                  <div className="demo-row" key={trade.id}>
                    <span className={`dir ${trade.direction.toLowerCase()}`}>
                      {trade.direction}
                    </span>
                    <div>
                      <strong>
                        {trade.symbol}
                        {trade.multiplier > 0 ? ` · ×${trade.multiplier}` : ""}
                      </strong>
                      <small>
                        {new Date(trade.openedAt).toLocaleString()} · amount{" "}
                        {trade.stake.toFixed(2)} ·{" "}
                        {trade.source === "external"
                          ? "Deriv / another device"
                          : trade.source}
                      </small>
                    </div>
                    <div className="demo-status">
                      {(trade.status === "open" || trade.status === "closed") && (
                        <strong
                          className={
                            pnl === null
                              ? "neutral"
                              : pnl >= 0
                                ? "positive"
                                : "negative"
                          }
                        >
                          {pnl === null
                            ? "P/L —"
                            : `${trade.status === "closed" ? "Realized" : "Live"} P/L ${pnl > 0 ? "+" : ""}${pnl.toFixed(2)} ${account.currency}`}
                        </strong>
                      )}
                      <b>{trade.status}</b>
                      {trade.status === "open" && trade.contractId && (
                        <button
                          type="button"
                          className="btn secondary tiny"
                          disabled={
                            Boolean(closingId) ||
                            account.connectionStatus !== "connected" ||
                            account.livePositions[trade.id]?.isValidToSell === false
                          }
                          onClick={() => void closeTrade(trade.id)}
                        >
                          {closingId === trade.id
                            ? "Closing…"
                            : account.livePositions[trade.id]?.isValidToSell === false
                              ? "Not sellable"
                              : "Close position"}
                        </button>
                      )}
                    </div>
                    {trade.status === "open" && trade.contractId && (
                      <PositionProtectionEditor
                        trade={trade}
                        account={account}
                        disabled={closingId === trade.id}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-block">
              Connect your account to load its open multiplier positions and recent
              settlements.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
