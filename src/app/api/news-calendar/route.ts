import { NextResponse } from "next/server";
import { isRecord } from "@/lib/validation";
import type { NewsEvent } from "@/lib/types";

const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  EU: "EUR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  JP: "JPY",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  CH: "CHF",
  CN: "CNY",
};

const CALENDAR_URL =
  "https://www.financecalendar.com/wp-json/fc/v1/calendar?impact=high&limit=200";

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.events)) {
    return payload.events;
  }
  return [];
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
}

function normalizeEvent(row: unknown, index: number): NewsEvent | null {
  if (!isRecord(row)) {
    return null;
  }

  const country = String(
    row.country_code ?? row.country ?? row.iso2 ?? "",
  )
    .toUpperCase()
    .slice(0, 2);
  const dateText = String(
    row.time_utc ??
      row.datetime_utc ??
      row.scheduled_at ??
      row.date ??
      row.time ??
      "",
  );
  const time = Date.parse(dateText);
  if (!Number.isFinite(time)) {
    return null;
  }

  const rawImpact = String(row.impact ?? row.importance ?? "high").toLowerCase();
  const impact: NewsEvent["impact"] = rawImpact.includes("high")
    ? "high"
    : rawImpact.includes("med")
      ? "medium"
      : "low";
  const currency = String(row.currency ?? COUNTRY_CURRENCY[country] ?? "")
    .toUpperCase()
    .slice(0, 3);

  return {
    id: String(row.id ?? row.slug ?? `${time}-${index}`),
    title: String(
      row.title ?? row.event ?? row.event_name ?? row.series_name ?? "Economic event",
    ).slice(0, 180),
    currency: currency || undefined,
    country: country || undefined,
    impact,
    time,
    actual: optionalText(row.actual),
    forecast: optionalText(row.forecast),
    previous: optionalText(row.previous),
    sourceUrl:
      typeof row.source_url === "string" ? row.source_url : undefined,
  };
}

export async function GET() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(CALENDAR_URL, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`Calendar provider returned ${response.status}.`);
    }

    const payload: unknown = await response.json();
    const events = rowsFromPayload(payload)
      .map(normalizeEvent)
      .filter((event): event is NewsEvent => Boolean(event));

    return NextResponse.json(
      {
        events,
        provider: "Finance Calendar",
        attribution: "https://www.financecalendar.com",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Economic calendar unavailable.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeoutId);
  }
}
