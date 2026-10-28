"use client";

import { FlaskConical, ShieldAlert, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Field, Input, SearchSelect, Segmented } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";
import { runBacktest } from "@/lib/backtest";
import { TREND_MIN_CANDLES } from "@/lib/strategies";
import { confirmedMarketCandles } from "@/lib/strategy-engine/candles";
import type { BacktestResult, MarketClass, Timeframe } from "@/lib/types";
import { useMarketFeed } from "@/lib/use-market";

const TIMEFRAMES: Array<{ value: Timeframe; label: string }> = [
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 900, label: "15m" },
  { value: 1800, label: "30m" },
  { value: 3600, label: "1h" },
  { value: 14400, label: "4h" },
  { value: 86400, label: "1D" },
];

const MARKET_OPTIONS = [
  { value: "forex" as MarketClass, label: "Forex" },
  { value: "cryptocurrency" as MarketClass, label: "Crypto" },
  { value: "metals" as MarketClass, label: "Gold" },
];

function EquityCurve({ trades }: { trades: BacktestResult["trades"] }) {
  if (trades.length < 2) {
    return <div className="empty-block">Not enough trades for an equity curve.</div>;
  }

  const balances = [
    trades[0].balanceAfter - trades[0].pnl,
    ...trades.map((trade) => trade.balanceAfter),
  ];
  const minimum = Math.min(...balances);
  const maximum = Math.max(...balances);
  const span = Math.max(1e-9, maximum - minimum);
  const path = balances
    .map((balance, index) => {
      const command = index ? "L" : "M";
      const x = (index / (balances.length - 1)) * 100;
      const y = 90 - ((balance - minimum) / span) * 80;
      return `${command} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg
      className="equity-curve"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-label="Backtest balance curve"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.7"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function BacktestPage() {
  const { preferences, updatePreferences, activeCombo } = useApp();
  const feed = useMarketFeed(
    preferences.symbol,
    preferences.timeframe,
    preferences.marketClass,
  );

  const [atrStop, setAtrStop] = useState(preferences.risk.atrStop);
  const [riskReward, setRiskReward] = useState(preferences.risk.riskReward);
  const [maximumHoldBars, setMaximumHoldBars] = useState(12);
  const [startingBalance, setStartingBalance] = useState(1000);
  const [commissionPercent, setCommissionPercent] = useState(0.1);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [runtimeMs, setRuntimeMs] = useState(0);
  const confirmed = confirmedMarketCandles(
    feed.candles,
    preferences.timeframe,
    Date.now(),
    Infinity,
  );

  useEffect(() => {
    if (
      !feed.loading &&
      feed.resolvedSymbol &&
      feed.resolvedSymbol !== preferences.symbol
    ) {
      updatePreferences({ symbol: feed.resolvedSymbol });
    }
  }, [feed.loading, feed.resolvedSymbol, preferences.symbol, updatePreferences]);

  const runReplay = () => {
    const startedAt = performance.now();
    const nextResult = runBacktest(
      confirmed,
      preferences.symbol,
      preferences.timeframe,
      activeCombo,
      {
        atrStop,
        rr: riskReward,
        maxHoldBars: maximumHoldBars,
        stake: preferences.risk.stake,
        multiplier: preferences.risk.multiplier,
        startingBalance,
        commissionRate: commissionPercent / 100,
      },
    );
    setResult(nextResult);
    setRuntimeMs(performance.now() - startedAt);
  };

  const resetResult = () => setResult(null);

  return (
    <>
      <PageHeader
        eyebrow="Accelerated replay"
        title="Three-month multiplier backtest"
        description={
          "Replay confirmed candles with the same trend and entry rules used by the browser and worker. " +
          "The first 205 bars establish the trend; results are simulated and do not prove future profitability."
        }
        actions={
          <button
            type="button"
            className="btn primary slim"
            onClick={runReplay}
            disabled={
              feed.loading ||
              feed.historyLoading ||
              confirmed.length < TREND_MIN_CANDLES + 2
            }
          >
            <Zap size={16} />
            Run replay
          </button>
        }
      />

      <div className="backtest-marketbar">
        <Segmented
          value={preferences.marketClass}
          ariaLabel="Backtest market"
          options={MARKET_OPTIONS}
          onChange={(marketClass) => {
            updatePreferences({ marketClass });
            resetResult();
          }}
        />
        <div className="tf-strip" aria-label="Backtest timeframe">
          {TIMEFRAMES.map((timeframe) => (
            <button
              type="button"
              key={timeframe.value}
              className={preferences.timeframe === timeframe.value ? "active" : ""}
              onClick={() => {
                updatePreferences({ timeframe: timeframe.value });
                resetResult();
              }}
            >
              {timeframe.label}
            </button>
          ))}
        </div>
      </div>

      <div className="backtest-controls card v2">
        <Field label="Instrument">
          <SearchSelect
            value={preferences.symbol}
            options={feed.symbols.map((symbol) => ({
              value: symbol.symbol,
              label: symbol.name,
              meta: symbol.symbol,
            }))}
            onChange={(symbol) => {
              updatePreferences({ symbol });
              resetResult();
            }}
          />
        </Field>
        <Field label="Starting balance">
          <Input
            type="number"
            min={10}
            max={1_000_000}
            value={startingBalance}
            onChange={(event) =>
              setStartingBalance(Math.max(10, Number(event.target.value) || 1000))
            }
          />
        </Field>
        <Field label="ATR stop">
          <Input
            type="number"
            min={0.3}
            max={10}
            step={0.1}
            value={atrStop}
            onChange={(event) =>
              setAtrStop(Math.max(0.3, Math.min(10, Number(event.target.value) || 1.5)))
            }
          />
        </Field>
        <Field label="Risk : reward">
          <Input
            type="number"
            min={0.5}
            max={10}
            step={0.1}
            value={riskReward}
            onChange={(event) =>
              setRiskReward(
                Math.max(0.5, Math.min(10, Number(event.target.value) || 1.8)),
              )
            }
          />
        </Field>
        <Field label="Maximum hold bars">
          <Input
            type="number"
            min={2}
            max={200}
            value={maximumHoldBars}
            onChange={(event) =>
              setMaximumHoldBars(
                Math.max(
                  2,
                  Math.min(200, Math.round(Number(event.target.value) || 12)),
                ),
              )
            }
          />
        </Field>
        <Field label="Commission estimate %">
          <Input
            type="number"
            min={0}
            max={2}
            step={0.01}
            value={commissionPercent}
            onChange={(event) =>
              setCommissionPercent(
                Math.max(0, Math.min(2, Number(event.target.value) || 0)),
              )
            }
          />
        </Field>
      </div>

      {feed.historyLoading && (
        <div className="history-progress">
          <span style={{ width: `${Math.max(4, feed.historyProgress * 100)}%` }} />
          <small>
            Loading the three-month replay window…{" "}
            {Math.round(feed.historyProgress * 100)}%
          </small>
        </div>
      )}

      {feed.error && (
        <div className="inline-alert error">
          <ShieldAlert size={17} />
          {feed.error}
        </div>
      )}

      {result ? (
        <>
          <section className="stats-grid six">
            <StatCard
              label="Trades"
              value={result.totalTrades}
              meta={`${runtimeMs.toFixed(0)} ms replay`}
            />
            <StatCard
              label="Ending balance"
              value={result.endingBalance.toFixed(2)}
              meta={`${result.returnPct >= 0 ? "+" : ""}${result.returnPct.toFixed(2)}%`}
              icon={<FlaskConical />}
            />
            <StatCard
              label="Net P/L"
              value={result.netPnl.toFixed(2)}
              meta="Approximate multiplier path"
              icon={result.netPnl >= 0 ? <TrendingUp /> : <TrendingDown />}
            />
            <StatCard
              label="Win rate"
              value={`${result.winRate.toFixed(1)}%`}
              meta={`${result.wins} wins / ${result.losses} losses`}
            />
            <StatCard
              label="Profit factor"
              value={
                Number.isFinite(result.profitFactor)
                  ? result.profitFactor.toFixed(2)
                  : "∞"
              }
              meta="R-based gross gain / loss"
            />
            <StatCard
              label="Maximum drawdown"
              value={result.maxDrawdownMoney.toFixed(2)}
              meta={`${result.maxDrawdownR.toFixed(2)}R`}
            />
          </section>

          <section className="backtest-grid equal-grid">
            <div className="card">
              <div className="card-head">
                <div>
                  <span>Accelerated account replay</span>
                  <h2>Simulated balance</h2>
                </div>
              </div>
              <EquityCurve trades={result.trades} />
              <div className="inline-alert warn">
                <ShieldAlert size={16} />
                P/L uses a direction-and-percentage multiplier approximation. Exact
                historical proposals, slippage and fees cannot be reconstructed from
                OHLC candles alone.
              </div>
            </div>

            <div className="card trade-table-card">
              <div className="card-head">
                <div>
                  <span>Replay journal</span>
                  <h2>Latest simulated trades</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>P/L</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades
                      .slice(-30)
                      .reverse()
                      .map((trade, index) => (
                        <tr key={`${trade.entryTime}-${index}`}>
                          <td>
                            <span className={`dir ${trade.direction.toLowerCase()}`}>
                              {trade.direction}
                            </span>
                          </td>
                          <td>{trade.entry.toFixed(5)}</td>
                          <td>{trade.exit.toFixed(5)}</td>
                          <td className={trade.pnl >= 0 ? "positive" : "negative"}>
                            {trade.pnl.toFixed(2)}
                          </td>
                          <td>{trade.balanceAfter.toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : (
        !feed.loading &&
        !feed.historyLoading && (
          <div className="card empty-block">
            {confirmed.length < TREND_MIN_CANDLES + 2
              ? `Replay needs at least ${TREND_MIN_CANDLES + 2} confirmed candles, including the trend warmup. This timeframe currently has ${confirmed.length}.`
              : "History is ready. Run the accelerated replay to inspect this setup, then validate it with demo forward testing."}
          </div>
        )
      )}
    </>
  );
}
