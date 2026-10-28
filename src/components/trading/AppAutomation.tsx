"use client";

import { useAccount } from "@/context/account-context";
import { useApp } from "@/context/app-context";
import { useAnalysis } from "@/lib/use-analysis";
import { useMarketFeed } from "@/lib/use-market";
import { useNewsCalendar } from "@/lib/use-news";
import type { DemoTrade, Preferences } from "@/lib/types";

export function browserAutomationEnabled(
  preferences: Preferences,
  connected: boolean,
  trades: DemoTrade[],
): boolean {
  return (
    connected &&
    preferences.automationExecutor === "browser" &&
    (preferences.executionMode === "automatic" ||
      trades.some((trade) => trade.status === "open" && trade.localStops === true))
  );
}

function BrowserAutomationEngine() {
  const { preferences } = useApp();
  const feed = useMarketFeed(
    preferences.symbol,
    preferences.timeframe,
    preferences.marketClass,
    false,
  );
  const news = useNewsCalendar();
  const marketReady =
    feed.live &&
    !feed.loading &&
    feed.dataKey === `${preferences.symbol}:${preferences.timeframe}`;
  useAnalysis(feed.candles, news.events, marketReady, !news.loading && !news.error);
  return null;
}

/** One browser execution owner persists while navigating between app pages. */
export function AppAutomation() {
  const { preferences, hydrated } = useApp();
  const { connected, demoTrades } = useAccount();
  return hydrated && browserAutomationEnabled(preferences, connected, demoTrades) ? (
    <BrowserAutomationEngine />
  ) : null;
}
