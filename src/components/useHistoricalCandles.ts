"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Candle } from "@/lib/types";
import { coverage, merge } from "@/lib/v26-history";
import type {
  Frame,
  MarketPayload,
  MarketSymbol,
} from "@/lib/v22/market";

type CachedHistory = {
  older: Candle[];
  complete: boolean;
};

type HistoryState = CachedHistory & {
  key: string;
  loading: boolean;
  error: string | null;
};

type HistoryOptions = {
  symbol: MarketSymbol;
  frame: Frame;
  payload: MarketPayload | null;
  enabled?: boolean;
};

type HistoryResponse = {
  candles?: Candle[];
  provider?: string;
  symbol?: string;
  frame?: number;
  exhausted?: boolean;
  detail?: string;
};

const EMPTY_BARS: Candle[] = [];
const LOOKBACK_SECONDS = 90 * 86_400;
const PAGE_LIMIT = 16;





export function useHistoricalCandles({
  symbol,
  frame,
  payload,
  enabled = true,
}: HistoryOptions) {
  const base = payload?.frames[frame] ?? EMPTY_BARS;
  const provider = payload?.provider ?? null;
  const key = provider ? `${provider}:${symbol}:${frame}` : "";
  const ready = enabled && base.length > 0 && provider !== null;

  const [state, setState] = useState<HistoryState>({
    key: "",
    older: [],
    loading: false,
    complete: false,
    error: null,
  });
  const cache = useRef(new Map<string, CachedHistory>());

  useEffect(() => {
    if (!ready || !provider) return;
    const activeProvider: MarketPayload["provider"] = provider;

    let cancelled = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelSleep: (() => void) | null = null;

    let older = cache.current.get(key)?.older ?? [];
    let complete = cache.current.get(key)?.complete ?? false;

    const publish = (loading: boolean, error: string | null = null) => {
      if (cancelled) return;
      setState({ key, older, complete, loading, error });
    };

    publish(!complete);

    const delay = (milliseconds: number) =>
      new Promise<void>((resolve) => {
        cancelSleep = resolve;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          cancelSleep = null;
          resolve();
        }, milliseconds);
      });

    async function backfill() {
      let failures = 0;
      let page = 0;

      while (!cancelled && !complete && page < PAGE_LIMIT) {
        const available = merge(older, base);
        const oldest = available[0]?.time;

        if (!oldest || oldest <= Date.now() / 1000 - LOOKBACK_SECONDS) {
          complete = true;
          break;
        }

        const requestController = new AbortController();
        controller = requestController;

        try {
          const params = new URLSearchParams({
            symbol,
            frame: String(frame),
            provider: activeProvider,
            before: String(oldest),
          });
          const response = await fetch(`/api/market/history?${params}`, {
            signal: requestController.signal,
            cache: "no-store",
          });
          const data = (await response.json()) as HistoryResponse;

          if (!response.ok) {
            throw new Error(data.detail ?? `Historical HTTP ${response.status}`);
          }
          if (
            data.provider !== activeProvider ||
            data.symbol !== symbol ||
            data.frame !== frame ||
            !Array.isArray(data.candles)
          ) {
            throw new Error("Market history provider mismatch");
          }


          const part = data.candles.filter(
            (candle) =>
              Number.isSafeInteger(candle.time) && candle.time < oldest,
          );

          if (!part.length) {
            complete = true;
            break;
          }

          older = merge(older, part);
          if (older[0]?.time >= oldest || data.exhausted) {
            complete = true;
          }

          page += 1;
          failures = 0;
          cache.current.set(key, { older, complete });
          publish(!complete);
        } catch (error) {
          if (cancelled || requestController.signal.aborted) return;

          failures += 1;
          publish(
            true,
            error instanceof Error ? error.message : "History unavailable",
          );
          const wait = Math.min(120_000, 15_000 * 2 ** Math.min(failures - 1, 3));
          await delay(wait);
        } finally {
          if (controller === requestController) controller = null;
        }
      }

      if (cancelled) return;
      cache.current.set(key, { older, complete });
      publish(false);
    }

    void backfill();

    return () => {
      cancelled = true;
      controller?.abort();
      if (retryTimer !== null) clearTimeout(retryTimer);

      cancelSleep?.();
    };
  }, [key, ready, provider, symbol, frame]);

  const candles = useMemo(
    () => merge(state.key === key ? state.older : EMPTY_BARS, base),
    [state.older, state.key, key, base],
  );

  return {
    candles,
    days: coverage(candles),
    loading: state.key === key && state.loading,

    error: state.key === key ? state.error : null,
  };
}
