import type { MarketSymbol } from "./v22/market.ts";

export const NEWS_BLOCK_BEFORE_MS = 3 * 60 * 60 * 1000;
export const NEWS_BLOCK_AFTER_MS = 2 * 60 * 60 * 1000;
export const NEWS_MAX_AGE_MS = 4 * 60 * 1000;
export const NEWS_SOURCE_URL = "https://www.financecalendar.com";
export const NEWS_API_URL = `${NEWS_SOURCE_URL}/wp-json/fc/v1/calendar`;
export const NEWS_COUNTRIES = ["US", "EU", "DE", "GB", "JP", "CA", "AU"] as const;

export type NewsEvent = {
  id: string;
  title: string;
  country: string;
  time: number | null;
  windowStart: number;
  windowEnd: number;
  timeConfirmed: boolean;
};

export type NewsSnapshot = {
  events: NewsEvent[];
  fetchedAt: number;
  from: number;
  to: number;
  source: "Finance Calendar";
};

export type NewsDecision = {
  allowed: boolean;
  state: "CLEAR" | "BLOCKED" | "UNAVAILABLE";
  reason: string;
  event: NewsEvent | null;
  next: NewsEvent | null;
};

type RawEvent = {
  id?: unknown;
  name?: unknown;
  title?: unknown;
  country?: unknown;
  impact?: unknown;
  status?: unknown;
  date?: unknown;
  release_at_utc?: unknown;
  time_utc?: unknown;
  date_window_start?: unknown;
  date_window_end?: unknown;
};

const DAY_MS = 86_400_000;

const SYMBOL_COUNTRIES: Record<MarketSymbol, readonly string[]> = {
  XAUUSD: ["US"],
  EURUSD: ["EU", "DE", "US"],
  GBPUSD: ["GB", "US"],
  USDJPY: ["JP", "US"],
  AUDUSD: ["AU", "US"],
  USDCAD: ["CA", "US"],
};

function dayUtc(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const result = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(result) && new Date(result).toISOString().startsWith(value)
    ? result
    : null;
}

function exactUtc(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

export function parseNewsSnapshot(data: unknown, fetchedAt: number, from: number, to: number): NewsSnapshot {
  if (!data || typeof data !== "object") throw new Error("Economic calendar response is invalid");
  const response = data as { events?: unknown; total?: unknown };
  if (!Array.isArray(response.events)) throw new Error("Economic calendar events are missing");
  if (typeof response.total === "number" && response.total > response.events.length) {
    throw new Error("Economic calendar result was incomplete");
  }

  const events = new Map<string, NewsEvent>();
  for (const entry of response.events) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as RawEvent;
    if (String(raw.impact ?? "").toLowerCase() !== "high") continue;
    if (String(raw.status ?? "").toLowerCase() === "cancelled") continue;
    const country = String(raw.country ?? "").toUpperCase();
    if (!(NEWS_COUNTRIES as readonly string[]).includes(country)) continue;
    const confirmed = exactUtc(raw.release_at_utc ?? raw.time_utc);
    const baseDate = dayUtc(raw.date);
    const windowStart = dayUtc(raw.date_window_start) ?? baseDate;
    const windowEnd = dayUtc(raw.date_window_end) ?? baseDate;
    if (confirmed === null && (windowStart === null || windowEnd === null)) {
      throw new Error("High-impact news has no usable schedule");
    }
    if (confirmed === null && windowEnd! < windowStart!) {
      throw new Error("High-impact news schedule is invalid");
    }
    const start = confirmed === null ? windowStart! - NEWS_BLOCK_BEFORE_MS : confirmed - NEWS_BLOCK_BEFORE_MS;
    const end = confirmed === null ? windowEnd! + DAY_MS + NEWS_BLOCK_AFTER_MS : confirmed + NEWS_BLOCK_AFTER_MS;
    const title = String(raw.title ?? raw.name ?? "High-impact economic release").slice(0, 160);
    const id = String(raw.id ?? `${country}:${title}:${confirmed ?? windowStart}`).slice(0, 180);
    events.set(id, {
      id,
      title,
      country,
      time: confirmed,
      windowStart: start,
      windowEnd: end,
      timeConfirmed: confirmed !== null,
    });
  }

  return {
    events: [...events.values()].sort((left, right) => left.windowStart - right.windowStart),
    fetchedAt,
    from,
    to,
    source: "Finance Calendar",
  };
}

export async function fetchNewsSnapshot(
  now = Date.now(),
  fetcher: typeof fetch = fetch,
): Promise<NewsSnapshot> {
  const from = Math.floor((now - DAY_MS) / DAY_MS) * DAY_MS;
  const to = Math.floor((now + 14 * DAY_MS) / DAY_MS) * DAY_MS + DAY_MS;
  const url = new URL(NEWS_API_URL);
  url.searchParams.set("from", new Date(from).toISOString().slice(0, 10));
  url.searchParams.set("to", new Date(to - DAY_MS).toISOString().slice(0, 10));
  url.searchParams.set("country", NEWS_COUNTRIES.join(","));
  url.searchParams.set("impact", "high");
  url.searchParams.set("limit", "500");

  const response = await fetcher(url.toString(), {
    next: { revalidate: 90 },
    signal: AbortSignal.timeout(12_000),
  } as RequestInit);
  if (!response.ok) throw new Error("Economic calendar is temporarily unavailable");
  const data: unknown = await response.json();
  return parseNewsSnapshot(data, Date.now(), from, to);
}

export function evaluateNewsGuard(
  snapshot: NewsSnapshot | null,
  symbol: MarketSymbol,
  now: number,
): NewsDecision {
  if (
    !snapshot ||
    !Number.isFinite(now) ||
    now < snapshot.from ||
    now >= snapshot.to ||
    snapshot.fetchedAt > now + 60_000 ||
    now - snapshot.fetchedAt > NEWS_MAX_AGE_MS
  ) {
    return {
      allowed: false,
      state: "UNAVAILABLE",
      reason: "Checking high-impact news calendar. New signals are paused.",
      event: null,
      next: null,
    };
  }

  const relevantCountries = SYMBOL_COUNTRIES[symbol];
  const relevant = snapshot.events.filter((event) => relevantCountries.includes(event.country));
  const blocking = relevant.find((event) => now >= event.windowStart && now <= event.windowEnd) ?? null;
  const next = relevant.find((event) => event.windowStart > now) ?? null;
  if (blocking) {
    return {
      allowed: false,
      state: "BLOCKED",
      reason: blocking.timeConfirmed
        ? `High-impact ${blocking.country} news: ${blocking.title}. No new signals 3h before to 2h after release.`
        : `High-impact ${blocking.country} news has an unconfirmed release time. New signals are paused for the published date window.`,
      event: blocking,
      next,
    };
  }

  return {
    allowed: true,
    state: "CLEAR",
    reason: "High-impact news filter clear for this market.",
    event: null,
    next,
  };
}
