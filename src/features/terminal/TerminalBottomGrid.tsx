"use client";

import Link from "next/link";
import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { positionMetrics } from "@/lib/position-metrics";
import { STRATEGY_CATALOG } from "@/lib/strategies";

function strategyName(id: string): string {
  return (
    STRATEGY_CATALOG.find((strategy) => strategy.id === id)?.name ??
    id.replaceAll("-", " ")
  );
}

export type TerminalBottomGridProps = {
  currentSymbol: string;
  currentPrice: number | null;
};

function signedMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

export function TerminalBottomGrid({
  currentSymbol,
  currentPrice,
}: TerminalBottomGridProps) {
  const { preferences, activeCombo, signals } = useApp();
  const account = useAccount();

  const openTrades = account.demoTrades
    .filter((trade) => trade.status === "open")
    .slice(0, 4);
  const activeStrategies = activeCombo.strategies
    .filter((strategy) => strategy.enabled)
    .slice(0, 8);

  return (
    <section className="terminal-bottom-grid">
      <article className="card bottom-terminal-card">
        <div className="mini-card-head">
          <div>
            <span>Open position summary</span>
            <strong>{openTrades.length} active</strong>
          </div>
          <Link href="/portfolio">View all →</Link>
        </div>

        {openTrades.length > 0 ? (
          <div className="mini-position-table">
            {openTrades.map((trade) => {
              const metrics = positionMetrics(
                trade,
                account.livePositions[trade.id],
                trade.symbol === currentSymbol ? currentPrice : null,
              );

              return (
                <div key={trade.id}>
                  <span>{trade.symbol}</span>
                  <b className={trade.direction === "UP" ? "positive" : "negative"}>
                    {trade.direction === "UP" ? "Buy" : "Sell"}
                  </b>
                  <span>{trade.stake.toFixed(2)}</span>
                  <span>{trade.entry > 0 ? trade.entry.toFixed(5) : "—"}</span>
                  <strong
                    className={
                      metrics.pnl === null
                        ? "neutral"
                        : metrics.pnl >= 0
                          ? "positive"
                          : "negative"
                    }
                  >
                    {metrics.pnl === null
                      ? "—"
                      : signedMoney(metrics.pnl, account.currency)}
                  </strong>
                  <em>{trade.multiplier > 0 ? `${trade.multiplier}×` : "—"}</em>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bottom-empty">No open positions yet.</div>
        )}
      </article>

      <article className="card bottom-terminal-card">
        <div className="mini-card-head">
          <div>
            <span>Strategy signals</span>
            <strong>Recent qualified entries</strong>
          </div>
          <Link href="/alerts">View all →</Link>
        </div>

        <div className="signal-tape">
          {signals.slice(0, 5).map((signal) => (
            <div key={signal.id}>
              <span className="symbol-dot">
                {signal.symbol.replace(/^frx/, "").slice(0, 3)}
              </span>
              <div>
                <b>{signal.symbol.replace(/^frx/, "")}</b>
                <small>{signal.comboName ?? "Strategy"}</small>
              </div>
              <em className={signal.direction === "UP" ? "positive" : "negative"}>
                {signal.direction === "UP" ? "Buy" : "Sell"}
              </em>
              <time>
                {new Date(signal.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
          {signals.length === 0 && (
            <div className="bottom-empty">
              Signals appear when strategy agreement reaches the threshold.
            </div>
          )}
        </div>
      </article>

      <article className="card bottom-terminal-card">
        <div className="mini-card-head">
          <div>
            <span>Active strategies</span>
            <strong>{activeCombo.name}</strong>
          </div>
          <Link href="/strategies">Edit →</Link>
        </div>

        <div className="active-strategy-list">
          {activeStrategies.map((strategy, index) => {
            const catalogItem = STRATEGY_CATALOG.find(
              (item) => item.id === strategy.id,
            );

            return (
              <div key={strategy.id}>
                <span className={`strategy-glyph g${index % 5}`}>↗</span>
                <div>
                  <b>{strategyName(strategy.id)}</b>
                  <small>{catalogItem?.family ?? "Technical"}</small>
                </div>
                <em>
                  <i />
                  Live
                </em>
              </div>
            );
          })}
        </div>
      </article>

      <article className="card bottom-terminal-card connection-card">
        <div className="mini-card-head">
          <div>
            <span>Deriv connection</span>
            <strong>
              {account.connectionStatus === "connected"
                ? "API ready"
                : account.connectionStatus === "reconnecting"
                  ? "Reconnecting"
                  : account.connectionStatus === "offline"
                    ? "Waiting for network"
                    : "Optional connection"}
            </strong>
          </div>
          <Link href="/settings">Settings →</Link>
        </div>

        <p>No MbioTrade account is needed. Public market analysis works immediately.</p>

        <div className="connection-facts">
          <div>
            <span>App ID</span>
            <b>{preferences.derivAppId || "Not set"}</b>
          </div>
          <div>
            <span>API key</span>
            <b>
              {account.connectionStatus === "connected"
                ? "Connected"
                : account.connected
                  ? "Reconnecting"
                  : "Not connected"}
            </b>
          </div>
          <div>
            <span>Account</span>
            <b>{account.credentials?.accountMode ?? "Public"}</b>
          </div>
        </div>

        <Link
          className={`connection-status ${
            account.connectionStatus === "connected" ? "ok" : ""
          }`}
          href="/settings"
        >
          <span className="status-dot" />
          <div>
            <b>
              {account.connectionStatus === "connected"
                ? "Connected"
                : account.connectionStatus === "reconnecting"
                  ? "Reconnecting automatically"
                  : account.connectionStatus === "offline"
                    ? "Network offline"
                    : "Set up Deriv"}
            </b>
            <small>
              {account.connected
                ? `${account.credentials?.accountId} · ${account.balance?.toFixed(2) ?? "—"} ${account.currency}`
                : "Enter App ID and API key"}
            </small>
          </div>
        </Link>
      </article>
    </section>
  );
}
