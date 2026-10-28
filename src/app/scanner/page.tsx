"use client";

import { Plus, Radar, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchSelect, Segmented } from "@/components/ui/controls";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { DerivPublicClient, fetchCandlePage } from "@/lib/deriv-public";
import { generateSignal } from "@/lib/strategies";
import {
  confirmedMarketCandles,
  isConfirmedHistoryCurrent,
} from "@/lib/strategy-engine/candles";
import type { MarketClass, Signal } from "@/lib/types";
import { useMarketFeed } from "@/lib/use-market";

type ScanStatus = "waiting" | "scanning" | "done" | "error";

type ScanRow = {
  symbol: string;
  name: string;
  price: number | null;
  signal: Signal | null;
  status: ScanStatus;
  error?: string;
};

const MARKET_OPTIONS = [
  { value: "forex" as MarketClass, label: "Forex" },
  { value: "cryptocurrency" as MarketClass, label: "Crypto" },
  { value: "metals" as MarketClass, label: "Gold" },
];

export default function ScannerPage() {
  const { preferences, activeCombo, updatePreferences } = useApp();
  const { toast } = useToast();
  const feed = useMarketFeed(
    preferences.symbol,
    preferences.timeframe,
    preferences.marketClass,
    false,
  );

  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([
    preferences.symbol,
  ]);
  const [candidateSymbol, setCandidateSymbol] = useState(preferences.symbol);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [running, setRunning] = useState(false);

  const symbolNames = useMemo(
    () => new Map(feed.symbols.map((symbol) => [symbol.symbol, symbol.name])),
    [feed.symbols],
  );

  useEffect(() => {
    if (
      feed.symbols.length > 0 &&
      !feed.symbols.some((symbol) => symbol.symbol === candidateSymbol)
    ) {
      setCandidateSymbol(feed.symbols[0].symbol);
    }

    setSelectedSymbols((current) =>
      current.filter((selected) =>
        feed.symbols.some((symbol) => symbol.symbol === selected),
      ),
    );
  }, [candidateSymbol, feed.symbols]);

  const addCandidate = () => {
    if (
      !candidateSymbol ||
      !feed.symbols.some((symbol) => symbol.symbol === candidateSymbol)
    ) {
      toast({ title: "Choose a valid market", tone: "info" });
      return;
    }
    if (selectedSymbols.includes(candidateSymbol)) {
      return;
    }
    if (selectedSymbols.length >= 6) {
      toast({
        title: "Scanner limit reached",
        message: "Scan up to six markets at a time.",
        tone: "info",
      });
      return;
    }
    setSelectedSymbols((current) => [...current, candidateSymbol]);
  };

  const updateRow = (symbol: string, patch: Partial<ScanRow>) => {
    setRows((current) =>
      current.map((row) => (row.symbol === symbol ? { ...row, ...patch } : row)),
    );
  };

  const runScan = async () => {
    setRunning(true);
    setRows(
      selectedSymbols.map((symbol) => ({
        symbol,
        name: symbolNames.get(symbol) ?? symbol,
        price: null,
        signal: null,
        status: "scanning",
      })),
    );

    const client = new DerivPublicClient();
    try {
      for (const symbol of selectedSymbols) {
        try {
          const candles = await fetchCandlePage(client, symbol, preferences.timeframe, {
            count: 601,
            end: "latest",
          });
          const confirmed = confirmedMarketCandles(candles, preferences.timeframe);
          const signal = isConfirmedHistoryCurrent(confirmed, preferences.timeframe)
            ? generateSignal(
                confirmed,
                symbol,
                preferences.timeframe,
                activeCombo,
                preferences.risk.atrStop,
                preferences.risk.riskReward,
                [],
              )
            : null;
          updateRow(symbol, {
            price: candles.at(-1)?.close ?? null,
            signal,
            status: "done",
          });
        } catch (error) {
          updateRow(symbol, {
            status: "error",
            error: error instanceof Error ? error.message : "Scan failed",
          });
        }
      }
    } finally {
      client.close();
      setRunning(false);
    }
  };

  const sortedRows = [...rows].sort(
    (left, right) => (right.signal?.confidence ?? 0) - (left.signal?.confidence ?? 0),
  );

  return (
    <>
      <PageHeader
        eyebrow="Multi-market"
        title="Forex, crypto and gold scanner"
        description="Evaluate the active strategy combination across up to six supported Deriv markets."
        actions={
          <button
            type="button"
            className="btn primary slim"
            onClick={() => void runScan()}
            disabled={running || selectedSymbols.length === 0}
          >
            <RefreshCw size={16} />
            {running ? "Scanning…" : "Scan now"}
          </button>
        }
      />

      <div className="card scanner-control ">
        <Segmented
          value={preferences.marketClass}
          ariaLabel="Scanner market"
          options={MARKET_OPTIONS}
          onChange={(marketClass) => {
            updatePreferences({ marketClass });
            setSelectedSymbols([]);
            setRows([]);
          }}
        />

        <div className="scanner-add mt-2">
          <SearchSelect
            value={candidateSymbol}
            options={feed.symbols.map((symbol) => ({
              value: symbol.symbol,
              label: symbol.name,
              meta: symbol.symbol,
            }))}
            onChange={setCandidateSymbol}
          />
          <button type="button" className="btn secondary " onClick={addCandidate}>
            <Plus size={16} />
            Add market
          </button>
        </div>

        <div className="scanner-chips">
          {selectedSymbols.map((symbol) => (
            <span key={symbol}>
              {symbolNames.get(symbol) ?? symbol}
              <button
                type="button"
                aria-label={`Remove ${symbol}`}
                onClick={() =>
                  setSelectedSymbols((current) =>
                    current.filter((item) => item !== symbol),
                  )
                }
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <section className="scanner-grid">
        {sortedRows.length ? (
          sortedRows.map((row) => (
            <article
              key={row.symbol}
              className={`card scan-card ${row.signal ? "qualified" : ""}`}
            >
              <div className="scan-head">
                <div>
                  <span>{row.name}</span>
                  <h3>{row.symbol}</h3>
                </div>
                <Radar size={18} />
              </div>

              <div className="scan-price">{row.price?.toFixed(5) ?? "—"}</div>

              {row.status === "error" ? (
                <p className="negative">{row.error}</p>
              ) : row.signal ? (
                <>
                  <div className="scan-signal">
                    <span className={`dir ${row.signal.direction.toLowerCase()}`}>
                      {row.signal.direction}
                    </span>
                    <strong>{row.signal.confidence}%</strong>
                    <small>{row.signal.regime} regime</small>
                  </div>
                  <div className="scan-levels">
                    <span>
                      TP <b>{row.signal.takeProfit.toFixed(5)}</b>
                    </span>
                    <span>
                      SL <b>{row.signal.stopLoss.toFixed(5)}</b>
                    </span>
                  </div>
                </>
              ) : (
                <div className="empty-scan">
                  {row.status === "scanning" ? "Evaluating…" : "No qualified entry"}
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="card empty-block scanner-empty">
            <Radar size={28} />
            <strong>Run a market scan</strong>
            <span>Select up to six Forex, Crypto or Gold markets.</span>
          </div>
        )}
      </section>
    </>
  );
}
