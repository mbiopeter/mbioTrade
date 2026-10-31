"use client";

import { useEffect, useMemo, useState } from "react";
import type { Candle } from "@/lib/types";
import { recentSignals } from "@/lib/signal-history";
import type { Setup } from "@/lib/v22/analysis";
import type { MarketPayload, MarketSymbol } from "@/lib/v22/market";
import {
  LEDGER_KEY,
  activate,
  closePending,
  emptyLedger,
  parseLedger,
  reconcile,
  seen,
  update,
  type Ledger,
} from "@/lib/v26-signals";

type SignalLedgerOptions = {
  symbol: MarketSymbol;
  provider: MarketPayload["provider"];
  setup: Setup;
  now: number;
  isLive: boolean;
  allowNewSignals: boolean;
  bars5: Candle[];
  bars15: Candle[];
  barsH1: Candle[];
  historyLoading: boolean;
};





export function useSignalLedger({
  symbol,
  provider,
  setup,
  now,
  isLive,
  allowNewSignals,
  bars5,
  bars15,
  barsH1,
  historyLoading,
}: SignalLedgerOptions) {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLedger(parseLedger(localStorage.getItem(LEDGER_KEY)));
    } catch {
      
    }
    setReady(true);

    const sync = (event: StorageEvent) => {
      if (event.key === LEDGER_KEY) {
        setLedger(parseLedger(event.newValue));
      }
    };

    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
      
    }
  }, [ledger, ready]);

  useEffect(() => {
    if (!ready || !now || !bars5.length) return;

    setLedger((previous) => {
      const current = previous.active[symbol];
      if (current) {
        const sourceChanged = current.provider !== provider;
        const missingHistory = bars5[0].time * 1000 > current.lastCheckedAt;

        if (sourceChanged || missingHistory) return previous;
        return update(previous, symbol, reconcile(current, bars5, now).signal);
      }

      if (!allowNewSignals) {
        return closePending(previous, symbol);
      }

      if (!isLive || !setup.dataCurrent || !setup.momentum.complete) {
        return previous;
      }

      const waiting = previous.pending[symbol];
      if (waiting) return closePending(previous, symbol);

      if (
        (setup.status !== "BUY" && setup.status !== "SELL") ||
        !setup.signalId || !setup.time ||
        setup.entry === null || setup.stop === null || setup.target === null ||
        now < setup.time || now - setup.time > 90_000 ||
        seen(previous, symbol, setup.signalId)
      ) {
        return previous;
      }

      const candidate = {
        id: setup.signalId,
        symbol,
        provider,
        direction: setup.status,
        entry: setup.entry,
        stop: setup.stop,
        target: setup.target,
        openedAt: setup.time,
        confidence: setup.score,
        status: "ACTIVE" as const,
        lastCheckedAt: setup.time,
        closedAt: null,
        exitPrice: null,
        resultR: null,
      };
      return activate(previous, candidate);
    });
  }, [
    ready,
    symbol,
    provider,
    setup.status,
    setup.signalId,
    setup.time,
    setup.entry,
    setup.score,
    setup.bias,
    setup.dataCurrent,
    setup.momentum.complete,
    now,
    isLive,
    allowNewSignals,
    bars5,
  ]);

  const active = ledger.active[symbol] ?? null;
  const warning = useMemo(() => {
    if (!active) return null;
    if (active.provider !== provider) {
      return `Source changed (${active.provider} → ${provider}); awaiting original provider to verify exit.`;
    }
    if (!bars5.length) return "Waiting for real candle data";
    if (bars5[0].time * 1000 > active.lastCheckedAt) {
      return historyLoading
        ? "Fetching earlier candles to reconcile saved signal"
        : "History gap — keeping signal active until missing candles become available";
    }
    return reconcile(active, bars5, now).reason;
  }, [active, provider, bars5, now, historyLoading]);

  return {
    active,
    pending: ledger.pending[symbol] ?? null,
    history: [...(ledger.history[symbol] ?? [])].reverse(),
    historyAll: recentSignals(ledger.history),
    warning,
    ready,
  };
}
