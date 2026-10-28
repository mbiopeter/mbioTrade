"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { useToast } from "@/context/toast-context";
import { browserAutomationEnabled } from "@/components/trading/AppAutomation";
import { ChartPanel } from "@/features/terminal/ChartPanel";
import { CommandBar } from "@/features/terminal/CommandBar";
import { MarketHeader } from "@/features/terminal/MarketHeader";
import { TerminalBottomGrid } from "@/features/terminal/TerminalBottomGrid";
import { TradePanel } from "@/features/terminal/TradePanel";
import type { TicketTab } from "@/features/terminal/config";
import { useAnalysis } from "@/lib/use-analysis";
import { useMarketFeed } from "@/lib/use-market";
import { buildManualTradePlan } from "@/lib/manual-trade";
import { positionMetrics } from "@/lib/position-metrics";
import { assertTradeAmount } from "@/lib/trade-amount";
import { useNewsCalendar } from "@/lib/use-news";
import { newsAllowsAutomaticEntry } from "@/lib/news-guard";
import { getTrendState, profileForCombo } from "@/lib/strategies";
import {
  confirmedMarketCandles,
  isConfirmedHistoryCurrent,
} from "@/lib/strategy-engine/candles";
import { automaticSettingsKey, manualSettingsStillMatch } from "@/lib/execution-guard";
import type { Direction, Signal } from "@/lib/types";

const EXECUTION_NOTICE_DURATION_MS = 7000;

function qualifiedPlanForDirection(
  signal: Signal | null,
  direction: Exclude<Direction, "WAIT">,
): Signal | null {
  return signal?.direction === direction ? signal : null;
}

export default function TerminalPage() {
  const { preferences, updatePreferences, activeCombo } = useApp();
  const account = useAccount();
  const { toast } = useToast();
  const news = useNewsCalendar();
  const { events } = news;

  const feed = useMarketFeed(
    preferences.symbol,
    preferences.timeframe,
    preferences.marketClass,
  );
  const marketReady =
    feed.live &&
    !feed.loading &&
    feed.dataKey === `${preferences.symbol}:${preferences.timeframe}`;
  const signal = useAnalysis(
    feed.candles,
    events,
    marketReady,
    !news.loading && !news.error,
    {
      runExecution: false,
      publishSignals: !browserAutomationEnabled(
        preferences,
        account.connected,
        account.demoTrades,
      ),
    },
  );
  const trend = useMemo(() => {
    const confirmed = confirmedMarketCandles(feed.candles, preferences.timeframe);
    const state = getTrendState(confirmed);
    return state.direction !== "WAIT" &&
      !isConfirmedHistoryCurrent(confirmed, preferences.timeframe)
      ? {
          ...state,
          direction: "WAIT" as const,
          reason:
            "Waiting for a recent completed candle after the market or history gap.",
        }
      : state;
  }, [feed.candles, preferences.timeframe]);
  const profile = profileForCombo(activeCombo);

  const chartRef = useRef<HTMLElement>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTab] = useState<TicketTab>("ticket");
  const [ticketDirection, setTicketDirection] =
    useState<Exclude<Direction, "WAIT">>("UP");
  const [directionTouched, setDirectionTouched] = useState(false);
  const [executionNotice, setExecutionNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (
      !feed.loading &&
      feed.resolvedSymbol &&
      feed.resolvedSymbol !== preferences.symbol
    ) {
      updatePreferences({ symbol: feed.resolvedSymbol });
    }
  }, [feed.loading, feed.resolvedSymbol, preferences.symbol, updatePreferences]);

  useEffect(() => {
    if (!directionTouched && (trend.direction === "UP" || trend.direction === "DOWN")) {
      setTicketDirection(trend.direction);
    }
  }, [directionTouched, trend.direction]);

  useEffect(() => {
    setDirectionTouched(false);
  }, [preferences.symbol, preferences.timeframe]);

  const selectTicketDirection = useCallback((direction: Exclude<Direction, "WAIT">) => {
    setTicketDirection(direction);
    setDirectionTouched(true);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    },
    [],
  );

  const latest = feed.candles.at(-1);
  const previous = feed.candles.at(-2);
  const currentTrade =
    account.demoTrades.find(
      (trade) => trade.status === "open" && trade.symbol === preferences.symbol,
    ) ?? null;
  const currentTradeMetrics = currentTrade
    ? positionMetrics(
        currentTrade,
        account.livePositions[currentTrade.id],
        marketReady ? latest?.close : undefined,
      )
    : null;
  const qualifiedPlan = useMemo(
    () => qualifiedPlanForDirection(signal, ticketDirection),
    [signal, ticketDirection],
  );
  const manualPlan = useMemo(
    () =>
      buildManualTradePlan(
        feed.candles,
        preferences.symbol,
        preferences.timeframe,
        ticketDirection,
        preferences.risk,
      ),
    [
      feed.candles,
      preferences.risk,
      preferences.symbol,
      preferences.timeframe,
      ticketDirection,
    ],
  );
  const plan = qualifiedPlan ?? manualPlan;
  const planSource = qualifiedPlan ? "signal" : "manual";
  const entryBlockReason =
    trend.direction === "WAIT"
      ? trend.reason
      : trend.direction !== ticketDirection
        ? `Confirmed ${trend.direction === "UP" ? "uptrend" : "downtrend"}: select ${trend.direction === "UP" ? "Buy / Long" : "Sell / Short"} to trade with the trend.`
        : undefined;
  const orderReadinessRef = useRef({
    marketReady,
    plan,
    preferences,
    activeCombo,
    candles: feed.candles,
  });
  orderReadinessRef.current = {
    marketReady,
    plan,
    preferences,
    activeCombo,
    candles: feed.candles,
  };

  const executeTrade = useCallback(async () => {
    if (submittingRef.current) return;
    if (!plan || !marketReady) {
      toast({
        title: "Entry is not ready",
        message: !marketReady
          ? "Wait for the live market price before placing a trade."
          : (entryBlockReason ?? "Wait for a confirmed trend before placing a trade."),
        tone: "info",
      });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const tradeAmount = assertTradeAmount(preferences.risk.stake);
      const settingsKey = automaticSettingsKey(preferences, activeCombo);
      const trade = await account.executeDemo(
        plan,
        tradeAmount,
        preferences.risk.multiplier,
        "manual",
        () => {
          const current = orderReadinessRef.current;
          const confirmed = confirmedMarketCandles(
            current.candles,
            current.preferences.timeframe,
          );
          const currentTrend = getTrendState(confirmed);
          if (
            !current.marketReady ||
            !isConfirmedHistoryCurrent(confirmed, current.preferences.timeframe) ||
            current.plan?.id !== plan.id ||
            currentTrend.direction !== plan.direction ||
            !manualSettingsStillMatch(
              current.preferences,
              current.activeCombo,
              settingsKey,
              plan,
              tradeAmount,
              preferences.risk.multiplier,
            )
          ) {
            throw new Error(
              "Trend, trade plan or settings changed before this order was submitted. Review the current ticket.",
            );
          }
        },
      );
      const direction = trade.direction === "UP" ? "Long" : "Short";
      setExecutionNotice(
        `${direction} ${account.currency} ${trade.stake.toFixed(2)} · ${trade.symbol} at ${trade.entry.toFixed(5)}`,
      );
      setTab("open");

      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
      noticeTimerRef.current = setTimeout(
        () => setExecutionNotice(null),
        EXECUTION_NOTICE_DURATION_MS,
      );
    } catch (error) {
      toast({
        title: "Trade not opened",
        message: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [account, activeCombo, entryBlockReason, marketReady, plan, preferences, toast]);

  const copyPlan = useCallback(async () => {
    if (!plan) {
      return;
    }

    const text = [
      `${plan.direction} ${plan.symbol}`,
      `Entry: ${plan.entry}`,
      `TP: ${plan.takeProfit}`,
      `SL: ${plan.stopLoss}`,
      `Trade amount: ${account.currency} ${preferences.risk.stake.toFixed(2)}`,
      `Multiplier: ${preferences.risk.multiplier}x`,
      planSource === "signal"
        ? `Confidence: ${plan.confidence}%`
        : "Basis: Manual entry aligned with the confirmed trend (no pattern signal)",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Trade plan copied", tone: "success" });
    } catch {
      toast({
        title: "Could not copy trade plan",
        message: "Clipboard access was blocked by the browser.",
        tone: "error",
      });
    }
  }, [
    account.currency,
    plan,
    planSource,
    preferences.risk.multiplier,
    preferences.risk.stake,
    toast,
  ]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await chartRef.current?.requestFullscreen();
      }
    } catch {
      toast({
        title: "Full screen unavailable",
        message: "Your browser blocked full-screen mode.",
        tone: "error",
      });
    }
  }, [toast]);

  const nearbyEvents = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.time > Date.now() - 30 * 60_000 &&
            event.time < Date.now() + 6 * 60 * 60_000,
        )
        .slice(0, 4),
    [events],
  );

  const symbolName =
    feed.symbols.find((item) => item.symbol === preferences.symbol)?.name ??
    preferences.symbol;

  return (
    <div className="v8-terminal-page">
      <section className="terminal-workspace">
        <section className="terminal-center">
          <MarketHeader
            preferences={preferences}
            symbols={feed.symbols}
            latest={latest}
            previous={previous}
            onSymbolChange={(symbol) => updatePreferences({ symbol })}
          />

          <CommandBar
            preferences={preferences}
            live={feed.live}
            onPreferencesChange={updatePreferences}
            onReload={() => void feed.reload()}
            onFullscreen={() => void toggleFullscreen()}
          />

          <ChartPanel
            chartRef={chartRef}
            symbol={preferences.symbol}
            symbolName={symbolName}
            timeframe={preferences.timeframe}
            candles={feed.candles}
            currentTrade={currentTrade}
            currentPrice={currentTradeMetrics?.currentPrice ?? null}
            livePnl={currentTradeMetrics?.pnl ?? null}
            currency={account.currency}
            historyLoading={feed.historyLoading}
            historyProgress={feed.historyProgress}
            error={feed.error}
            executionNotice={executionNotice}
            accent={preferences.accent}
            onDismissNotice={() => setExecutionNotice(null)}
          />
        </section>

        <TradePanel
          tab={tab}
          setTab={setTab}
          preferences={preferences}
          updatePreferences={updatePreferences}
          account={account}
          feed={feed}
          signal={signal}
          plan={plan}
          planSource={planSource}
          ticketDirection={ticketDirection}
          setTicketDirection={selectTicketDirection}
          activeComboName={activeCombo.name}
          nearbyEvents={nearbyEvents}
          submitting={submitting}
          trendDirection={trend.direction}
          trendReason={trend.reason}
          entryBlockReason={entryBlockReason}
          automaticBlockReason={
            trend.direction === "WAIT"
              ? trend.reason
              : profile?.symbol && profile.symbol !== preferences.symbol
                ? `This preset is configured for ${profile.symbol.replace(/^frx/, "")}. Apply its preset or select the general trend pullback strategy.`
                : !newsAllowsAutomaticEntry(
                      activeCombo.strategies.some(
                        (strategy) => strategy.enabled && strategy.id === "news-guard",
                      ),
                      !news.loading && !news.error,
                      preferences.symbol,
                      events,
                    )
                  ? news.loading || news.error
                    ? "Waiting for the economic calendar required by the selected strategy."
                    : "News Guard is pausing entries around a high-impact event."
                  : undefined
          }
          onExecute={() => void executeTrade()}
          onCopyPlan={() => void copyPlan()}
        />
      </section>

      <TerminalBottomGrid
        currentSymbol={preferences.symbol}
        currentPrice={marketReady ? (latest?.close ?? null) : null}
      />
    </div>
  );
}
