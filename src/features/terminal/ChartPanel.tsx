"use client";

import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { RefObject } from "react";
import { MarketChart } from "@/components/charts/MarketChart";
import { MARKET_HISTORY_DAYS } from "@/lib/app-config";
import type { Candle, DemoTrade, Timeframe } from "@/lib/types";

export type ChartPanelProps = {
  chartRef: RefObject<HTMLElement | null>;
  symbol: string;
  symbolName: string;
  timeframe: Timeframe;
  candles: Candle[];
  currentTrade: DemoTrade | null;
  currentPrice: number | null;
  livePnl: number | null;
  currency: string;
  historyLoading: boolean;
  historyProgress: number;
  error: string | null;
  executionNotice: string | null;
  accent: string;
  onDismissNotice: () => void;
};

export function ChartPanel({
  chartRef,
  symbol,
  symbolName,
  timeframe,
  candles,
  currentTrade,
  currentPrice,
  livePnl,
  currency,
  historyLoading,
  historyProgress,
  error,
  executionNotice,
  accent,
  onDismissNotice,
}: ChartPanelProps) {
  return (
    <>
      {historyLoading && (
        <div className="history-progress v8-progress">
          <span style={{ width: `${Math.max(4, historyProgress * 100)}%` }} />
          <small>
            Loading {MARKET_HISTORY_DAYS}-day history ·{" "}
            {Math.round(historyProgress * 100)}%
          </small>
        </div>
      )}

      {error && (
        <div className="inline-alert error">
          <ShieldAlert size={16} />
          {error}
        </div>
      )}

      <section ref={chartRef} className="terminal-chart-v8 card">
        <div className="chart-meta">
          <div>
            <span>{symbolName}</span>
            <small>{candles.length.toLocaleString()} candles · 3M</small>
          </div>
          <span className="chart-mode">Candlesticks only</span>
        </div>

        {executionNotice && (
          <div className="execution-banner">
            <CheckCircle2 size={21} />
            <div>
              <strong>Trade opened successfully</strong>
              <span>{executionNotice}</span>
            </div>
            <button
              type="button"
              onClick={onDismissNotice}
              aria-label="Dismiss execution notification"
            >
              ×
            </button>
          </div>
        )}

        {candles.length > 0 ? (
          <MarketChart
            dataKey={`${symbol}-${timeframe}`}
            candles={candles}
            position={currentTrade?.symbol === symbol ? currentTrade : null}
            currentPrice={currentPrice}
            livePnl={livePnl}
            currency={currency}
            accent={accent}
          />
        ) : (
          <div className="chart-placeholder">Loading market history…</div>
        )}
      </section>
    </>
  );
}
