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
  confirmedBreakout,
  emptyLedger,
  nearbyBarrier,
  parseLedger,
  plan,
  reconcile,
  seen,
  setPending,
  update,
  type Ledger,
} from "@/lib/v26-signals";

type SignalLedgerOptions = {
  symbol: MarketSymbol;
  provider: MarketPayload["provider"];
  setup: Setup;
  now: number;
  isLive: boolean;
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

      if (!isLive || !setup.dataCurrent || !setup.momentum.complete) {
        return previous;
      }

      const waiting = previous.pending[symbol];
      if (waiting) {
        if (now - waiting.createdAt > 6 * 3_600_000) {
          return closePending(previous, symbol);
        }
        if (setup.bias !== waiting.direction) return previous;

        const confirmedAt = confirmedBreakout(waiting, bars5, now);
        if (!confirmedAt || now - confirmedAt >= 300_000) return previous;

        const bar = bars5.find(
          (candle) => (candle.time + 300) * 1000 === confirmedAt,
        );
        if (!bar) return previous;

        const candidate = plan({
          id: `${waiting.id}-break-${confirmedAt}`,
          symbol,
          provider,
          direction: waiting.direction,
          entry: bar.close,
          openedAt: confirmedAt,
          confidence: waiting.confidence,
          five: bars5,
          fifteen: bars15,
          hourly: barsH1,
        });

        return candidate ? activate(previous, candidate) : previous;
      }

      if (
        !["BUY", "SELL"].includes(setup.status) ||
        !setup.signalId ||
        !setup.time ||
        setup.entry === null ||
        now - setup.time < 0 ||
        now - setup.time >= 300_000 ||
        seen(previous, symbol, setup.signalId)
      ) {
        return previous;
      }

      const direction = setup.status as "BUY" | "SELL";
      const barrier = nearbyBarrier(bars5, direction, setup.entry, setup.time);

      if (barrier !== null) {
        return setPending(previous, {
          id: setup.signalId,
          symbol,
          direction,
          level: barrier,
          createdAt: setup.time,
          confidence: setup.score,
        });
      }

      const candidate = plan({
        id: setup.signalId,
        symbol,
        provider,
        direction,
        entry: setup.entry,
        openedAt: setup.time,
        confidence: setup.score,
        five: bars5,
        fifteen: bars15,
        hourly: barsH1,
      });

      return candidate ? activate(previous, candidate) : previous;
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
    bars5,
    bars15,
    barsH1,
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
