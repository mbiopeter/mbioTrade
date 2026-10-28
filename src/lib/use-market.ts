"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MARKET_HISTORY_DAYS } from "./app-config";
import { isFreshMarketTick, type MarketTick } from "./market-freshness";
import type { WebSocketConnectionState } from "./deriv/websocket-client";
import {
  backfillThreeMonths,
  DerivPublicClient,
  fetchCandlePage,
  fetchSymbols,
  subscribeTicks,
} from "./deriv-public";
import type { Candle, MarketClass, MarketSymbol, Timeframe } from "./types";

export type MarketFeedState = {
  symbols: MarketSymbol[];
  resolvedSymbol: string;
  resolvedTimeframe: Timeframe | null;
  dataKey: string;
  candles: Candle[];
  loading: boolean;
  historyLoading: boolean;
  historyProgress: number;
  error: string | null;
  live: boolean;
  connectionStatus: WebSocketConnectionState;
  reload: () => Promise<void>;
};

function applyTick(
  candles: Candle[],
  epoch: number,
  quote: number,
  timeframe: Timeframe,
): Candle[] {
  if (candles.length === 0) {
    return candles;
  }

  const bucket = Math.floor(epoch / timeframe) * timeframe;
  const last = candles[candles.length - 1];

  if (last.time === bucket) {
    const next = [...candles];
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, quote),
      low: Math.min(last.low, quote),
      close: quote,
    };
    return next;
  }

  if (bucket > last.time) {
    return [
      ...candles,
      {
        time: bucket,
        open: quote,
        high: quote,
        low: quote,
        close: quote,
      },
    ];
  }

  return candles;
}

function mergeLiveCandles(history: Candle[], live: Candle[]): Candle[] {
  const byTime = new Map(history.map((candle) => [candle.time, candle]));
  // Backfill requests can finish after a fresh tick. Preserve the current candle.
  for (const candle of live) byTime.set(candle.time, candle);
  return [...byTime.values()].sort((first, second) => first.time - second.time);
}

export function useMarketFeed(
  symbol: string,
  timeframe: Timeframe,
  marketClass: MarketClass = "forex",
  loadFullHistory = true,
): MarketFeedState {
  const clientRef = useRef<DerivPublicClient | null>(null);
  const generationRef = useRef(0);
  const requestKey = `${marketClass}:${symbol}:${timeframe}`;
  const requestKeyRef = useRef(requestKey);
  requestKeyRef.current = requestKey;
  const loadedFeedRef = useRef<{
    requestKey: string;
    symbol: string;
    timeframe: Timeframe;
  } | null>(null);
  const reloadRef = useRef<(() => Promise<void>) | null>(null);
  const latestTickRef = useRef<
    (MarketTick & { symbol: string; timeframe: Timeframe }) | null
  >(null);
  const connectionStateRef = useRef<WebSocketConnectionState>("idle");

  const [symbols, setSymbols] = useState<MarketSymbol[]>([]);
  const [resolvedSymbol, setResolvedSymbol] = useState(symbol);
  const [loadedRequestKey, setLoadedRequestKey] = useState("");
  const [resolvedTimeframe, setResolvedTimeframe] = useState<Timeframe | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProgress, setHistoryProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<WebSocketConnectionState>("idle");

  useEffect(() => {
    const client = new DerivPublicClient();
    clientRef.current = client;
    let hasConnected = false;
    const unsubscribeState = client.onConnectionState((state) => {
      const previousState = connectionStateRef.current;
      connectionStateRef.current = state;
      setConnectionStatus(state);
      if (state === "connected") {
        if (
          hasConnected ||
          previousState === "reconnecting" ||
          previousState === "offline"
        )
          void reloadRef.current?.();
        hasConnected = true;
      } else {
        latestTickRef.current = null;
        setLive(false);
      }
    });

    return () => {
      generationRef.current += 1;
      loadedFeedRef.current = null;
      latestTickRef.current = null;
      unsubscribeState();
      client.close();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const checkFreshness = () => {
      const loaded = loadedFeedRef.current;
      const tick = latestTickRef.current;
      setLive(
        Boolean(
          connectionStateRef.current === "connected" &&
          loaded &&
          loaded.requestKey === requestKeyRef.current &&
          tick?.symbol === loaded.symbol &&
          tick?.timeframe === loaded.timeframe &&
          isFreshMarketTick(tick),
        ),
      );
    };
    const interval = window.setInterval(checkFreshness, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const reload = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    setLoading(true);
    setHistoryLoading(false);
    setHistoryProgress(0);
    setError(null);
    loadedFeedRef.current = null;
    latestTickRef.current = null;
    setLive(false);

    try {
      const client = clientRef.current ?? new DerivPublicClient();
      clientRef.current = client;

      const availableSymbols = await fetchSymbols(client, marketClass);
      if (generation !== generationRef.current) {
        return;
      }

      setSymbols(availableSymbols);
      const effectiveSymbol = availableSymbols.some((item) => item.symbol === symbol)
        ? symbol
        : (availableSymbols[0]?.symbol ?? symbol);
      setResolvedSymbol(effectiveSymbol);

      const recent = await fetchCandlePage(client, effectiveSymbol, timeframe, {
        count: 1500,
        end: "latest",
      });
      if (generation !== generationRef.current) {
        return;
      }

      const tick = latestTickRef.current as
        (MarketTick & { symbol: string; timeframe: Timeframe }) | null;
      const freshTick =
        tick?.symbol === effectiveSymbol &&
        tick?.timeframe === timeframe &&
        isFreshMarketTick(tick)
          ? tick
          : null;
      setCandles(
        freshTick
          ? applyTick(recent, freshTick.epoch, freshTick.quote, timeframe)
          : recent,
      );
      loadedFeedRef.current = { requestKey, symbol: effectiveSymbol, timeframe };
      setLoadedRequestKey(requestKey);
      setResolvedTimeframe(timeframe);
      setLoading(false);
      setLive(Boolean(freshTick && connectionStateRef.current === "connected"));

      if (!loadFullHistory) {
        setHistoryProgress(1);
        return;
      }

      setHistoryLoading(true);
      void backfillThreeMonths(
        client,
        effectiveSymbol,
        timeframe,
        recent,
        (next, progress) => {
          if (generation === generationRef.current) {
            setCandles((current) => mergeLiveCandles(next, current));
            setHistoryProgress(progress);
          }
        },
        () => generation !== generationRef.current,
      )
        .then((finalCandles) => {
          if (generation === generationRef.current) {
            setCandles((current) => mergeLiveCandles(finalCandles, current));
            setHistoryProgress(1);
            setHistoryLoading(false);
          }
        })
        .catch((historyError: unknown) => {
          if (generation !== generationRef.current) {
            return;
          }

          setHistoryLoading(false);
          const message =
            historyError instanceof Error
              ? historyError.message
              : "History backfill stopped.";
          setError(
            `Recent data is live; ${MARKET_HISTORY_DAYS}-day backfill stopped: ${message}`,
          );
        });
    } catch (feedError) {
      if (generation !== generationRef.current) {
        return;
      }

      setError(feedError instanceof Error ? feedError.message : "Market data failed.");
      setLive(false);
      setLoading(false);
      setHistoryLoading(false);
    }
  }, [loadFullHistory, marketClass, requestKey, symbol, timeframe]);
  reloadRef.current = reload;

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const start = async () => {
      try {
        const client = clientRef.current ?? new DerivPublicClient();
        clientRef.current = client;

        unsubscribe = await subscribeTicks(
          client,
          resolvedSymbol,
          ({ epoch, quote }) => {
            if (cancelled) return;
            const tick = { epoch, quote, receivedAt: Date.now() };
            if (!isFreshMarketTick(tick)) return;
            latestTickRef.current = { ...tick, symbol: resolvedSymbol, timeframe };
            const loaded = loadedFeedRef.current;
            if (
              cancelled ||
              !loaded ||
              loaded.requestKey !== requestKeyRef.current ||
              loaded.symbol !== resolvedSymbol ||
              loaded.timeframe !== timeframe
            ) {
              return;
            }

            setCandles((current) => applyTick(current, epoch, quote, timeframe));
            setLive(connectionStateRef.current === "connected");
          },
        );
        if (cancelled) unsubscribe();
      } catch (tickError) {
        if (!cancelled) {
          setError(
            tickError instanceof Error ? tickError.message : "Live ticks failed.",
          );
          setLive(false);
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [requestKey, resolvedSymbol, timeframe]);

  return {
    symbols,
    resolvedSymbol,
    resolvedTimeframe,
    dataKey: `${resolvedSymbol}:${resolvedTimeframe ?? ""}`,
    candles: loadedRequestKey === requestKey ? candles : [],
    loading: loading || (!error && loadedRequestKey !== requestKey),
    historyLoading,
    historyProgress,
    error,
    live: live && loadedRequestKey === requestKey,
    connectionStatus,
    reload,
  };
}
