"use client";

import { Activity, BarChart3, Layers3, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Segmented } from "@/components/ui/controls";
import { useAccount } from "@/context/account-context";
import type { DemoTrade } from "@/lib/types";

type AnalysisTab = "overview" | "performance" | "strategies" | "activity";

type StrategyPerformance = {
  id: string;
  name: string;
  trades: number;
  wins: number;
  pnl: number;
};

const ANALYSIS_TABS = [
  { value: "overview" as AnalysisTab, label: "Overview" },
  { value: "performance" as AnalysisTab, label: "Performance" },
  { value: "strategies" as AnalysisTab, label: "Strategies" },
  { value: "activity" as AnalysisTab, label: "Activity" },
];

function tradePnl(trade: DemoTrade): number {
  return (trade.soldFor ?? 0) - trade.stake;
}

function EquityCurve({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="empty-block">
        Close at least two trades to build an equity curve.
      </div>
    );
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1e-9, maximum - minimum);
  const path = values
    .map((value, index) => {
      const command = index ? "L" : "M";
      const x = (index / (values.length - 1)) * 100;
      const y = 90 - ((value - minimum) / span) * 80;
      return `${command} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg
      className="equity-curve analysis-equity"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="Cumulative closed-trade profit and loss"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function AnalysisPage() {
  const account = useAccount();
  const [activeTab, setActiveTab] = useState<AnalysisTab>("overview");

  const closedTrades = useMemo(
    () =>
      account.demoTrades
        .filter(
          (trade) => trade.status === "closed" && typeof trade.soldFor === "number",
        )
        .sort((left, right) => (left.closedAt ?? 0) - (right.closedAt ?? 0)),
    [account.demoTrades],
  );

  const metrics = useMemo(() => {
    let equity = 0;
    let peak = 0;
    let maximumDrawdown = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let wins = 0;
    const curve = [0];

    for (const trade of closedTrades) {
      const pnl = tradePnl(trade);
      equity += pnl;
      curve.push(equity);
      peak = Math.max(peak, equity);
      maximumDrawdown = Math.max(maximumDrawdown, peak - equity);

      if (pnl > 0) {
        wins += 1;
        grossWin += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }
    }

    return {
      net: equity,
      wins,
      losses: closedTrades.length - wins,
      winRate: closedTrades.length ? (wins / closedTrades.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      maximumDrawdown,
      curve,
    };
  }, [closedTrades]);

  const strategyPerformance = useMemo<StrategyPerformance[]>(() => {
    const rows = new Map<string, StrategyPerformance>();

    for (const trade of closedTrades) {
      const id = trade.comboId ?? "legacy";
      const row = rows.get(id) ?? {
        id,
        name: trade.comboName ?? "External / unknown",
        trades: 0,
        wins: 0,
        pnl: 0,
      };
      const pnl = tradePnl(trade);
      row.trades += 1;
      row.pnl += pnl;
      if (pnl > 0) {
        row.wins += 1;
      }
      rows.set(id, row);
    }

    return [...rows.values()].sort((left, right) => right.pnl - left.pnl);
  }, [closedTrades]);

  return (
    <>
      <PageHeader
        eyebrow="Trade review"
        title="Trade analysis"
        description="Review Deriv-confirmed closed trades, strategy attribution and connected-account activity."
      />

      <div className="analysis-tabs">
        <Segmented
          value={activeTab}
          ariaLabel="Trade analysis tabs"
          options={ANALYSIS_TABS}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === "overview" && (
        <>
          <section className="stats-grid five">
            <StatCard
              label="Closed trades"
              value={closedTrades.length}
              meta="Connected Deriv account"
              icon={<Activity />}
            />
            <StatCard
              label="Win rate"
              value={`${metrics.winRate.toFixed(1)}%`}
              meta={`${metrics.wins} wins / ${metrics.losses} losses`}
            />
            <StatCard
              label="Net P/L"
              value={metrics.net.toFixed(2)}
              meta="Sold value minus trade amount"
              icon={metrics.net >= 0 ? <TrendingUp /> : <TrendingDown />}
            />
            <StatCard
              label="Profit factor"
              value={
                Number.isFinite(metrics.profitFactor)
                  ? metrics.profitFactor.toFixed(2)
                  : "∞"
              }
              meta="Gross wins / gross losses"
            />
            <StatCard
              label="Maximum drawdown"
              value={metrics.maximumDrawdown.toFixed(2)}
              meta="Closed-trade equity"
              icon={<BarChart3 />}
            />
          </section>

          <section className="analysis-grid equal-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <span>Closed-trade equity</span>
                  <h2>Cumulative P/L</h2>
                </div>
              </div>
              <EquityCurve values={metrics.curve} />
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <span>Execution mix</span>
                  <h2>Execution sources</h2>
                </div>
              </div>
              <div className="analysis-bars">
                {(["manual", "auto", "external"] as const).map((mode) => {
                  const count = closedTrades.filter(
                    (trade) => trade.source === mode,
                  ).length;
                  const percent = closedTrades.length
                    ? (count / closedTrades.length) * 100
                    : 0;
                  return (
                    <div key={mode}>
                      <span>{mode}</span>
                      <div>
                        <i style={{ width: `${percent}%` }} />
                      </div>
                      <b>{count}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === "performance" && (
        <section className="card trade-table-card">
          <div className="card-head">
            <div>
              <span>Closed positions</span>
              <h2>Performance journal</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Direction</th>
                  <th>Amount</th>
                  <th>Multiplier</th>
                  <th>Confidence</th>
                  <th>P/L</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades
                  .slice()
                  .reverse()
                  .map((trade) => {
                    const pnl = tradePnl(trade);
                    return (
                      <tr key={trade.id}>
                        <td>{trade.symbol}</td>
                        <td>
                          <span className={`dir ${trade.direction.toLowerCase()}`}>
                            {trade.direction}
                          </span>
                        </td>
                        <td>{trade.stake.toFixed(2)}</td>
                        <td>{trade.multiplier > 0 ? `×${trade.multiplier}` : "—"}</td>
                        <td>{trade.confidence ? `${trade.confidence}%` : "—"}</td>
                        <td className={pnl >= 0 ? "positive" : "negative"}>
                          {pnl.toFixed(2)}
                        </td>
                        <td>
                          {trade.closedAt
                            ? new Date(trade.closedAt).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "strategies" && (
        <section className="analysis-strategy-grid">
          {strategyPerformance.length ? (
            strategyPerformance.map((row) => (
              <article className="card analysis-strategy-card" key={row.id}>
                <Layers3 size={18} />
                <span>Combination</span>
                <h3>{row.name}</h3>
                <div>
                  <b>{row.trades}</b>
                  <small>trades</small>
                </div>
                <div>
                  <b>
                    {row.trades ? ((row.wins / row.trades) * 100).toFixed(1) : "0.0"}%
                  </b>
                  <small>win rate</small>
                </div>
                <div>
                  <b className={row.pnl >= 0 ? "positive" : "negative"}>
                    {row.pnl.toFixed(2)}
                  </b>
                  <small>net P/L</small>
                </div>
              </article>
            ))
          ) : (
            <div className="card empty-block">
              No strategy-attributed closed trades yet. MbioTrade orders save the active
              combination automatically.
            </div>
          )}
        </section>
      )}

      {activeTab === "activity" && (
        <section className="card trade-table-card">
          <div className="card-head">
            <div>
              <span>Connected account stream</span>
              <h2>Buy and sell activity</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Account</th>
                  <th>Action</th>
                  <th>Market</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {account.tradeEvents.length ? (
                  account.tradeEvents.map((event, index) => (
                    <tr key={index}>
                      <td>{new Date(event.time).toLocaleString()}</td>
                      <td>{event.accountMode}</td>
                      <td>{event.action}</td>
                      <td>{event.symbol}</td>
                      <td>
                        {typeof event.amount === "number"
                          ? event.amount.toFixed(2)
                          : "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      No connected-account transaction events stored yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
