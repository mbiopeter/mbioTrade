"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import {
  localExitReached,
  runAutomaticSignalOnce,
  signalAlreadyTraded,
} from "./execution";
import { canAutoTrade, collectAccountOpenTrades } from "./risk";
import { newsAllowsAutomaticEntry } from "./news-guard";
import { generateSignal } from "./strategies";
import {
  confirmedMarketCandles,
  isConfirmedHistoryCurrent,
} from "./strategy-engine/candles";
import type { Candle, NewsEvent } from "./types";

export type AnalysisOptions = { runExecution?: boolean; publishSignals?: boolean };

export function useAnalysis(
  candles: Candle[],
  newsEvents: NewsEvent[],
  marketReady = true,
  newsReady = true,
  options: AnalysisOptions = {},
) {
  const { runExecution = true, publishSignals = true } = options;
  const { preferences, activeCombo, pushSignal } = useApp();
  const account = useAccount();
  const { toast } = useToast();
  const {
    connected,
    connectionStatus,
    credentials,
    accountSynced,
    dailyRealizedPnl,
    lastTradeAt,
    demoTrades,
    portfolio,
    executeDemo,
    sellDemo,
  } = account;

  const lastNotifiedSignalRef = useRef<string | null>(null);
  const lastFailureRef = useRef<string | null>(null);
  const pendingExitIdsRef = useRef(new Set<string>());
  const exitRetryAfterRef = useRef(new Map<string, number>());

  const analysisCandles = useMemo(
    () => confirmedMarketCandles(candles, preferences.timeframe),
    [candles, preferences.timeframe],
  );
  const signal = useMemo(
    () =>
      marketReady && isConfirmedHistoryCurrent(analysisCandles, preferences.timeframe)
        ? generateSignal(
            analysisCandles,
            preferences.symbol,
            preferences.timeframe,
            activeCombo,
            preferences.risk.atrStop,
            preferences.risk.riskReward,
            newsEvents,
          )
        : null,
    [
      activeCombo,
      analysisCandles,
      marketReady,
      newsEvents,
      preferences.risk.atrStop,
      preferences.risk.riskReward,
      preferences.symbol,
      preferences.timeframe,
    ],
  );
  const newsGuardEnabled = activeCombo.strategies.some(
    (strategy) => strategy.enabled && strategy.id === "news-guard",
  );
  const executionReadinessRef = useRef({
    marketReady,
    newsReady,
    newsEvents,
    newsGuardEnabled,
    signal,
  });
  executionReadinessRef.current = {
    marketReady,
    newsReady,
    newsEvents,
    newsGuardEnabled,
    signal,
  };

  // Publishing a signal and attempting an order are separate lifecycles. A
  // signal observed before account synchronization remains eligible afterwards.
  useEffect(() => {
    if (!publishSignals || !signal || lastNotifiedSignalRef.current === signal.id)
      return;
    lastNotifiedSignalRef.current = signal.id;
    pushSignal(signal);
    if (
      preferences.notifySignals &&
      signal.confidence >= preferences.notifyMinConfidence &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification(`MbioTrade ${signal.direction} · ${signal.symbol}`, {
        body: `Entry ${signal.entry.toFixed(5)} · TP ${signal.takeProfit.toFixed(5)} · SL ${signal.stopLoss.toFixed(5)} · ${signal.confidence}%`,
      });
    }
  }, [
    preferences.notifyMinConfidence,
    preferences.notifySignals,
    publishSignals,
    pushSignal,
    signal,
  ]);

  useEffect(() => {
    if (
      !runExecution ||
      !signal ||
      !marketReady ||
      preferences.executionMode !== "automatic" ||
      preferences.automationExecutor !== "browser" ||
      !connected ||
      connectionStatus !== "connected" ||
      !credentials ||
      !accountSynced ||
      signalAlreadyTraded(demoTrades, signal)
    )
      return;
    if (
      !newsAllowsAutomaticEntry(newsGuardEnabled, newsReady, signal.symbol, newsEvents)
    )
      return;

    const lastCandleTime = candles.at(-1)?.time ?? 0;
    if (
      Date.now() - lastCandleTime * 1000 >
      Math.max(preferences.timeframe * 1500, 90_000)
    )
      return;

    const gate = canAutoTrade(
      signal,
      collectAccountOpenTrades(demoTrades, portfolio),
      demoTrades,
      preferences.risk.maxOpenDemoTrades,
      preferences.risk.marginBudget,
      preferences.risk.stake,
      preferences.risk.maxDailyDemoLoss,
      preferences.risk.cooldownMinutes,
      { realizedPnl: dailyRealizedPnl, latestTradeAt: lastTradeAt },
    );
    if (!gate.ok) return;

    const accountKey = `${credentials.accountMode}:${credentials.accountId}`;
    const attemptKey = `${accountKey}:${signal.id}`;
    let cancelled = false;
    void runAutomaticSignalOnce(
      accountKey,
      signal.id,
      () =>
        executeDemo(
          signal,
          preferences.risk.stake,
          preferences.risk.multiplier,
          "auto",
          () => {
            const latest = executionReadinessRef.current;
            if (
              !latest.marketReady ||
              latest.signal?.id !== signal.id ||
              !newsAllowsAutomaticEntry(
                latest.newsGuardEnabled,
                latest.newsReady,
                signal.symbol,
                latest.newsEvents,
              )
            ) {
              throw new Error(
                "Live market, signal or news conditions changed before this order was submitted.",
              );
            }
          },
        ),
      () => !cancelled,
    ).catch((error: unknown) => {
      if (lastFailureRef.current === attemptKey) return;
      lastFailureRef.current = attemptKey;
      toast({
        title: "Automatic order not completed",
        message:
          error instanceof Error
            ? error.message
            : "Check the Deriv account before trying again.",
        tone: "error",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    accountSynced,
    activeCombo,
    candles,
    connected,
    connectionStatus,
    credentials,
    dailyRealizedPnl,
    lastTradeAt,
    demoTrades,
    executeDemo,
    marketReady,
    newsReady,
    newsGuardEnabled,
    newsEvents,
    portfolio,
    preferences,
    runExecution,
    signal,
    toast,
  ]);

  useEffect(() => {
    const price = candles.at(-1)?.close;
    if (
      !runExecution ||
      !marketReady ||
      !Number.isFinite(price) ||
      !connected ||
      connectionStatus !== "connected" ||
      !credentials ||
      preferences.automationExecutor !== "browser"
    )
      return;

    for (const trade of demoTrades) {
      if (
        !localExitReached(trade, preferences.symbol, Number(price)) ||
        pendingExitIdsRef.current.has(trade.id) ||
        (exitRetryAfterRef.current.get(trade.id) ?? 0) > Date.now()
      )
        continue;

      pendingExitIdsRef.current.add(trade.id);
      void sellDemo(trade.id, { symbol: preferences.symbol, price: Number(price) })
        .catch((error: unknown) => {
          exitRetryAfterRef.current.set(trade.id, Date.now() + 10_000);
          toast({
            title: "Position exit not completed",
            message: error instanceof Error ? error.message : "Unknown error",
            tone: "error",
          });
        })
        .finally(() => pendingExitIdsRef.current.delete(trade.id));
    }
  }, [
    accountSynced,
    candles,
    connected,
    connectionStatus,
    credentials,
    demoTrades,
    marketReady,
    preferences.automationExecutor,
    preferences.symbol,
    runExecution,
    sellDemo,
    toast,
  ]);

  return signal;
}
