"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  evaluateNewsGuard,
  type NewsSnapshot,
} from "@/lib/news-calendar";
import type { MarketSymbol } from "@/lib/v22/market";

const POLL_MS = 90_000;
const TIMEOUT_MS = 15_000;

export function useNewsCalendar(symbol: MarketSymbol, now: number) {
  const [snapshot, setSnapshot] = useState<NewsSnapshot | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const attempts = useRef(0);
  const mounted = useRef(false);

  const reload = useCallback(async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch("/api/news-calendar", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Calendar request failed");
      const data = await response.json() as NewsSnapshot;
      if (
        data.source !== "Finance Calendar" ||
        !Array.isArray(data.events) ||
        !Number.isFinite(data.fetchedAt) ||
        !Number.isFinite(data.from) ||
        !Number.isFinite(data.to)
      ) {
        throw new Error("Calendar response is invalid");
      }
      if (!mounted.current || abort.current !== controller) return;
      setSnapshot(data);
      setError(false);
      attempts.current = 0;
      timer.current = setTimeout(() => void reload(), POLL_MS);
    } catch {
      if (!mounted.current || abort.current !== controller) return;
      setSnapshot(null);
      setError(true);
      attempts.current += 1;
      const delay = Math.min(120_000, 15_000 * 2 ** Math.min(3, attempts.current - 1));
      timer.current = setTimeout(() => void reload(), delay);
    } finally {
      clearTimeout(timeout);
      if (abort.current === controller) abort.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const reconnect = () => void reload();
    const visible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", visible);
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      abort.current?.abort();
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reload]);

  const guard = useMemo(
    () => evaluateNewsGuard(snapshot, symbol, now),
    [snapshot, symbol, Math.floor(now / 10_000)],
  );

  return { guard, error, reload };
}
