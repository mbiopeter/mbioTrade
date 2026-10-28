"use client";

import Link from "next/link";
import { Copy, Minus, Plus, ShieldAlert, Zap } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import { PositionProtectionEditor } from "@/components/trading/PositionProtectionEditor";
import { Segmented } from "@/components/ui/controls";
import type { AccountContextValue } from "@/context/account-context";
import { useToast } from "@/context/toast-context";
import { ACCEPTED_MULTIPLIERS } from "@/lib/multipliers";
import { canAutoTrade, collectAccountOpenTrades } from "@/lib/risk";
import { positionMetrics } from "@/lib/position-metrics";
import {
  isValidTradeAmount,
  MIN_TRADE_AMOUNT,
  sanitizeTradeAmount,
  TRADE_AMOUNT_STEP,
} from "@/lib/trade-amount";
import type { MarketFeedState } from "@/lib/use-market";
import type { Direction, NewsEvent, Preferences, Signal } from "@/lib/types";
import { timeframeLabel, type TicketTab } from "./config";

function formatSignedMoney(value: number, currency: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

export type TradePanelProps = {
  tab: TicketTab;
  setTab: Dispatch<SetStateAction<TicketTab>>;
  preferences: Preferences;
  updatePreferences: (patch: Partial<Preferences>) => void;
  account: AccountContextValue;
  feed: MarketFeedState;
  signal: Signal | null;
  plan: Signal | null;
  planSource: "signal" | "manual";
  ticketDirection: Exclude<Direction, "WAIT">;
  setTicketDirection: (direction: Exclude<Direction, "WAIT">) => void;
  activeComboName: string;
  nearbyEvents: NewsEvent[];
  submitting: boolean;
  trendDirection: Direction;
  trendReason: string;
  entryBlockReason?: string;
  automaticBlockReason?: string;
  onExecute: () => void;
  onCopyPlan: () => void;
};

export function TradePanel({
  tab,
  setTab,
  preferences,
  updatePreferences,
  account,
  feed,
  signal,
  plan,
  planSource,
  ticketDirection,
  setTicketDirection,
  activeComboName,
  nearbyEvents,
  submitting,
  trendDirection,
  trendReason,
  entryBlockReason,
  automaticBlockReason,
  onExecute,
  onCopyPlan,
}: TradePanelProps) {
  const { toast } = useToast();
  const [closingId, setClosingId] = useState<string | null>(null);
  const openTrades = account.demoTrades.filter((trade) => trade.status === "open");
  const executionEnabled = preferences.executionMode !== "signals";
  const marketReady =
    feed.live &&
    !feed.loading &&
    feed.dataKey === `${preferences.symbol}:${preferences.timeframe}`;
  const canExecute = Boolean(
    plan &&
    !entryBlockReason &&
    executionEnabled &&
    account.connected &&
    account.connectionStatus === "connected" &&
    account.credentials &&
    account.accountSynced &&
    marketReady &&
    !submitting &&
    isValidTradeAmount(preferences.risk.stake),
  );

  const executeLabel = submitting
    ? "Submitting to Deriv…"
    : !account.connected
      ? "Connect Deriv account"
      : account.connectionStatus !== "connected"
        ? "Reconnecting to Deriv"
        : !account.accountSynced
          ? "Syncing Deriv positions"
          : !executionEnabled
            ? "Select a trading mode"
            : !marketReady
              ? "Waiting for live market"
              : entryBlockReason || !plan
                ? "Waiting for a trend-aligned entry"
                : !isValidTradeAmount(preferences.risk.stake)
                  ? `Set amount ≥ ${MIN_TRADE_AMOUNT.toFixed(2)}`
                  : preferences.executionMode === "automatic"
                    ? "Place additional manual order"
                    : planSource === "manual"
                      ? "Execute manual trade"
                      : "Execute signal trade";

  const automaticGate = signal
    ? canAutoTrade(
        signal,
        collectAccountOpenTrades(account.demoTrades, account.portfolio),
        account.demoTrades,
        preferences.risk.maxOpenDemoTrades,
        preferences.risk.marginBudget,
        preferences.risk.stake,
        preferences.risk.maxDailyDemoLoss,
        preferences.risk.cooldownMinutes,
        { realizedPnl: account.dailyRealizedPnl, latestTradeAt: account.lastTradeAt },
      )
    : null;
  const automaticStatus =
    preferences.automationExecutor === "worker"
      ? "Browser entries are paused. The separately configured worker owns automatic trading."
      : !account.connected
        ? "Waiting for your Deriv account connection."
        : !account.accountSynced
          ? "Waiting for positions and trade history to synchronize."
          : !marketReady
            ? "Waiting for live market data."
            : automaticBlockReason
              ? automaticBlockReason
              : !signal
                ? "Waiting for a qualified strategy signal."
                : automaticGate && !automaticGate.ok
                  ? automaticGate.reason
                  : "Qualified signals execute automatically. No manual confirmation is needed.";

  const closePosition = async (id: string) => {
    if (closingId) return;
    setClosingId(id);
    try {
      await account.sellDemo(id);
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

  const adjustTradeAmount = (delta: number) => {
    const stake = sanitizeTradeAmount(
      preferences.risk.stake + delta,
      preferences.risk.stake,
    );
    updatePreferences({ risk: { ...preferences.risk, stake } });
  };

  const symbolName =
    feed.symbols.find((item) => item.symbol === preferences.symbol)?.name ??
    preferences.symbol;

  return (
    <aside className="trade-panel card">
      <div className="trade-tabs">
        <button
          type="button"
          className={tab === "ticket" ? "active" : ""}
          onClick={() => setTab("ticket")}
        >
          Trade ticket
        </button>
        <button
          type="button"
          className={tab === "open" ? "active" : ""}
          onClick={() => setTab("open")}
        >
          Open trades ({openTrades.length})
        </button>
        <button
          type="button"
          className={tab === "market" ? "active" : ""}
          onClick={() => setTab("market")}
        >
          Market info
        </button>
      </div>

      {tab === "ticket" && (
        <div className="ticket-body">
          <div className="ticket-symbol">
            <div className="symbol-orb">
              {preferences.marketClass === "forex"
                ? "FX"
                : preferences.marketClass === "metals"
                  ? "AU"
                  : "₿"}
            </div>
            <div>
              <strong>{preferences.symbol.replace(/^frx/, "")}</strong>
              <span>{symbolName}</span>
            </div>
            <span className={`ticket-account ${account.connected ? "connected" : ""}`}>
              {account.credentials?.accountMode === "demo"
                ? "Demo trading"
                : account.connected
                  ? "Real trading"
                  : "Public mode"}
            </span>
          </div>

          <label className="ticket-label">Direction</label>
          <Segmented
            value={ticketDirection}
            ariaLabel="Direction"
            options={[
              { value: "UP" as const, label: "Buy / Long" },
              { value: "DOWN" as const, label: "Sell / Short" },
            ]}
            onChange={setTicketDirection}
          />
          <div className="ticket-summary" aria-label="Confirmed trend">
            <span>Confirmed trend</span>
            <strong>
              {trendDirection === "UP"
                ? "Uptrend · long entries"
                : trendDirection === "DOWN"
                  ? "Downtrend · short entries"
                  : "Waiting"}
            </strong>
          </div>
          <p className="accepted-note" role="status">
            {entryBlockReason ?? trendReason}
          </p>

          <label className="ticket-label">
            Trade amount <small>Deriv stake</small>
          </label>
          <div className="stepper">
            <button
              type="button"
              onClick={() => adjustTradeAmount(-TRADE_AMOUNT_STEP)}
              aria-label="Decrease trade amount"
            >
              <Minus size={16} />
            </button>
            <strong>
              {account.currency} {preferences.risk.stake.toFixed(2)}
            </strong>
            <button
              type="button"
              onClick={() => adjustTradeAmount(TRADE_AMOUNT_STEP)}
              aria-label="Increase trade amount"
            >
              <Plus size={16} />
            </button>
          </div>

          <label className="ticket-label">
            Multiplier <small>Price sensitivity</small>
          </label>
          <div className="multiplier-grid">
            {ACCEPTED_MULTIPLIERS.map((value) => (
              <button
                type="button"
                key={value}
                className={preferences.risk.multiplier === value ? "active" : ""}
                aria-pressed={preferences.risk.multiplier === value}
                onClick={() =>
                  updatePreferences({
                    risk: { ...preferences.risk, multiplier: value },
                  })
                }
              >
                {value}×
              </button>
            ))}
          </div>
          <p className="accepted-note multiplier-help">
            Lower multipliers reduce the profit or loss from each price move.
            Deriv&apos;s quote confirms availability and the required amount for your
            settings.
          </p>

          <div className="ticket-summary">
            <span>Margin / exposure limit</span>
            <strong>
              {preferences.risk.marginBudget.toFixed(2)} {account.currency}
            </strong>
          </div>
          <div className="ticket-summary">
            <span>Strategy</span>
            <strong>
              {planSource === "signal" ? activeComboName : "Manual order"}
            </strong>
          </div>
          <div className="ticket-summary">
            <span>Order basis</span>
            <strong>
              {planSource === "signal"
                ? `Qualified signal · ${plan?.confidence ?? 0}%`
                : "Manual entry · confirmed trend required"}
            </strong>
          </div>

          <div className="ticket-summary">
            <span>Execution</span>
            <strong>
              {preferences.executionMode === "automatic"
                ? preferences.automationExecutor === "worker"
                  ? "Background worker selected"
                  : "Automatic · qualified signals"
                : preferences.executionMode === "manual"
                  ? "Manual trading"
                  : "Signals only"}
            </strong>
          </div>

          {preferences.executionMode === "automatic" && (
            <p className="accepted-note">{automaticStatus}</p>
          )}

          <button
            type="button"
            className="execute-btn"
            disabled={!canExecute}
            onClick={onExecute}
          >
            <Zap size={17} />
            {executeLabel}
            <span>→</span>
          </button>

          {!canExecute &&
            !(
              account.connected &&
              account.accountSynced &&
              marketReady &&
              executionEnabled &&
              entryBlockReason
            ) && (
              <Link className="ticket-connect-note" href="/settings">
                <ShieldAlert size={14} />
                No MbioTrade login is required.{" "}
                {!executionEnabled
                  ? "Select Manual or Automatic in Settings."
                  : account.connectionStatus !== "connected" && account.connected
                    ? "Deriv is reconnecting automatically."
                    : account.connected && !account.accountSynced
                      ? (account.syncError ??
                        "Waiting for Deriv account synchronization.")
                      : account.connected && !marketReady
                        ? "Waiting for live prices for the selected market."
                        : "Connect your Deriv account in Settings to trade."}
              </Link>
            )}

          <button
            type="button"
            className="copy-plan"
            disabled={!plan}
            onClick={onCopyPlan}
          >
            <Copy size={15} />
            Copy current trade plan
          </button>
        </div>
      )}

      {tab === "open" && (
        <div className="ticket-body open-ticket">
          <div className="panel-heading">
            <div>
              <span>Synced from your Deriv account</span>
              <h3>Open positions</h3>
            </div>
          </div>

          {openTrades.length > 0 ? (
            openTrades.map((trade) => {
              const metrics = positionMetrics(
                trade,
                account.livePositions[trade.id],
                marketReady && trade.symbol === preferences.symbol
                  ? feed.candles.at(-1)?.close
                  : undefined,
              );
              const pnlTone =
                metrics.pnl === null
                  ? "neutral"
                  : metrics.pnl >= 0
                    ? "positive"
                    : "negative";

              return (
                <div className="open-trade-card" key={trade.id}>
                  <div className="open-trade-head">
                    <div>
                      <span className={`dir ${trade.direction.toLowerCase()}`}>
                        {trade.direction}
                      </span>
                      <strong>{trade.symbol}</strong>
                    </div>
                    <div className={`live-position-pnl ${pnlTone}`}>
                      <span>Live P/L</span>
                      <strong>
                        {metrics.pnl === null
                          ? "Waiting…"
                          : formatSignedMoney(metrics.pnl, account.currency)}
                      </strong>
                      <small>
                        {metrics.source === "broker"
                          ? "Deriv live"
                          : metrics.source === "chart"
                            ? "Chart estimate"
                            : "No live quote"}
                      </small>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Entry</dt>
                      <dd>{trade.entry > 0 ? trade.entry.toFixed(5) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Current</dt>
                      <dd>
                        {metrics.currentPrice === null
                          ? "—"
                          : metrics.currentPrice.toFixed(5)}
                      </dd>
                    </div>
                    <div>
                      <dt>TP</dt>
                      <dd>
                        {trade.localStops && trade.takeProfit > 0
                          ? trade.takeProfit.toFixed(5)
                          : trade.brokerTakeProfit !== undefined
                            ? `${trade.brokerTakeProfit.toFixed(2)} ${account.currency}`
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>SL</dt>
                      <dd>
                        {trade.localStops && trade.stopLoss > 0
                          ? trade.stopLoss.toFixed(5)
                          : trade.brokerStopLoss !== undefined
                            ? `${trade.brokerStopLoss.toFixed(2)} ${account.currency}`
                            : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Multiplier</dt>
                      <dd>{trade.multiplier > 0 ? `${trade.multiplier}×` : "—"}</dd>
                    </div>
                    <div>
                      <dt>Opened</dt>
                      <dd>
                        {new Date(trade.openedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </dd>
                    </div>
                  </dl>
                  {trade.contractId && (
                    <PositionProtectionEditor
                      trade={trade}
                      account={account}
                      disabled={closingId === trade.id}
                    />
                  )}
                  {trade.contractId && (
                    <button
                      type="button"
                      className="btn secondary full"
                      disabled={
                        Boolean(closingId) ||
                        account.connectionStatus !== "connected" ||
                        account.livePositions[trade.id]?.isValidToSell === false
                      }
                      onClick={() => void closePosition(trade.id)}
                    >
                      {closingId === trade.id
                        ? "Closing on Deriv…"
                        : account.livePositions[trade.id]?.isValidToSell === false
                          ? "Not currently sellable"
                          : "Close position"}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="ticket-empty">
              No open multiplier positions in this Deriv account.
            </div>
          )}
        </div>
      )}

      {tab === "market" && (
        <div className="ticket-body">
          <div className="market-info-list">
            <div>
              <span>Feed</span>
              <strong>
                {feed.live
                  ? "Live Deriv ticks"
                  : feed.connectionStatus === "reconnecting"
                    ? "Reconnecting"
                    : feed.connectionStatus === "offline"
                      ? "Network offline"
                      : "Connecting"}
              </strong>
            </div>
            <div>
              <span>History</span>
              <strong>Approximately 92 days</strong>
            </div>
            <div>
              <span>Timeframe</span>
              <strong>{timeframeLabel(preferences.timeframe)}</strong>
            </div>
            <div>
              <span>Regime</span>
              <strong>{signal?.regime ?? "Waiting"}</strong>
            </div>
            <div>
              <span>Confirmed trend</span>
              <strong>
                {trendDirection === "UP"
                  ? "Uptrend"
                  : trendDirection === "DOWN"
                    ? "Downtrend"
                    : "Waiting"}
              </strong>
            </div>
            <div>
              <span>Qualified setup</span>
              <strong>
                {signal ? `${signal.direction} · ${signal.confidence}%` : "None"}
              </strong>
            </div>
          </div>

          {nearbyEvents.length > 0 && (
            <>
              <div className="panel-heading compact">
                <div>
                  <span>News guard</span>
                  <h3>High-impact events</h3>
                </div>
              </div>
              {nearbyEvents.map((event) => (
                <div className="news-row" key={event.id}>
                  <strong>{event.currency || event.country || "FX"}</strong>
                  <span>{event.title}</span>
                  <time>
                    {new Date(event.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
