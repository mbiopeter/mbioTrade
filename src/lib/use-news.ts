"use client";

import { useEffect, useState } from "react";
import { isRecord } from "./validation";
import type { NewsEvent } from "./types";

export type NewsCalendarState = {
  events: NewsEvent[];
  loading: boolean;
  error: string | null;
};

export function useNewsCalendar(): NewsCalendarState {
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;

    const load = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      const requestController = new AbortController();
      const cancelRequest = () => requestController.abort();
      controller.signal.addEventListener("abort", cancelRequest, { once: true });
      const timeout = window.setTimeout(cancelRequest, 15_000);
      try {
        const response = await fetch("/api/news-calendar", {
          signal: requestController.signal,
          cache: "no-store",
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          const message =
            isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : "Calendar unavailable.";
          throw new Error(message);
        }

        if (!isRecord(payload) || !Array.isArray(payload.events)) {
          throw new Error("Calendar data could not be verified.");
        }
        setEvents(payload.events as NewsEvent[]);
        setFetchedAt(Date.now());
        setError(null);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error ? loadError.message : "Calendar unavailable.",
          );
        }
      } finally {
        pending = false;
        window.clearTimeout(timeout);
        controller.signal.removeEventListener("abort", cancelRequest);
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 5 * 60_000);
    const refreshOnFocus = () => void load();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      controller.abort();
    };
  }, []);

  return {
    events,
    loading,
    error:
      error ??
      (fetchedAt > 0 && Date.now() - fetchedAt > 10 * 60_000
        ? "The economic calendar is stale. Waiting for a refresh."
        : null),
  };
}
