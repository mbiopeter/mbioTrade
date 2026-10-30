import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NEWS_BLOCK_AFTER_MS,
  NEWS_BLOCK_BEFORE_MS,
  NEWS_MAX_AGE_MS,
  NEWS_API_URL,
  evaluateNewsGuard,
  parseNewsSnapshot,
  fetchNewsSnapshot,
} from "../src/lib/news-calendar.ts";
import { SIGNALS_PER_PAGE, signalPage } from "../src/lib/signal-history.ts";

const utc = (date) => Date.parse(date);
const eventAt = "2026-10-30T12:30:00Z";
const at = utc(eventAt);
const from = utc("2026-10-29T00:00:00Z");
const to = utc("2026-11-14T00:00:00Z");

function payload(events) {
  return { total: events.length, events };
}

function entry(country, time = eventAt, options = {}) {
  return {
    id: `release-${country}-${options.id ?? "one"}`,
    title: `${country} interest rate decision`,
    country,
    impact: "high",
    status: "confirmed",
    release_at_utc: time,
    date: "2026-10-30",
    ...options,
  };
}

const snapshot = (entries, fetchedAt = at) => parseNewsSnapshot(payload(entries), fetchedAt, from, to);

test("high impact window starts exactly 3h before and ends exactly 2h after a release", () => {
  const check = (time) => evaluateNewsGuard(snapshot([entry("US")], time), "XAUUSD", time).state;
  assert.equal(NEWS_BLOCK_BEFORE_MS, 10_800_000);
  assert.equal(NEWS_BLOCK_AFTER_MS, 7_200_000);
  assert.equal(check(at - NEWS_BLOCK_BEFORE_MS), "BLOCKED");
  assert.equal(check(at + NEWS_BLOCK_AFTER_MS), "BLOCKED");
  assert.equal(check(at - NEWS_BLOCK_BEFORE_MS - 1), "CLEAR");
  assert.equal(check(at + NEWS_BLOCK_AFTER_MS + 1), "CLEAR");
});

test("gold is blocked by US releases; currencies are filtered to each pair's relevant legs", () => {
  const au = snapshot([entry("AU")]);
  assert.equal(evaluateNewsGuard(au, "AUDUSD", at).allowed, false);
  assert.equal(evaluateNewsGuard(au, "EURUSD", at).allowed, true);
  assert.equal(evaluateNewsGuard(au, "XAUUSD", at).allowed, true);
  const eu = snapshot([entry("DE"), entry("EU", eventAt, { id: "two" })]);
  assert.equal(evaluateNewsGuard(eu, "EURUSD", at).allowed, false);
  assert.equal(evaluateNewsGuard(eu, "GBPUSD", at).allowed, true);
  const gb = snapshot([entry("GB")]);
  assert.equal(evaluateNewsGuard(gb, "GBPUSD", at).allowed, false);
  assert.equal(evaluateNewsGuard(gb, "USDJPY", at).allowed, true);
  assert.equal(evaluateNewsGuard(snapshot([entry("JP")]), "USDJPY", at).allowed, false);
  assert.equal(evaluateNewsGuard(snapshot([entry("CA")]), "USDCAD", at).allowed, false);
  assert.equal(evaluateNewsGuard(snapshot([entry("US")]), "USDCAD", at).allowed, false);
});

test("other impacts and cancelled announcements never block; source input does not become executable code", () => {
  const data = snapshot([
    entry("US", eventAt, { impact: "medium" }),
    entry("GB", eventAt, { status: "cancelled" }),
    entry("JP", eventAt, { title: "<script>alert(1)</script>" }),
  ]);
  assert.equal(data.events.length, 1);
  assert.equal(evaluateNewsGuard(data, "EURUSD", at).state, "CLEAR");
  assert.equal(data.events[0].title, "<script>alert(1)</script>");
});

test("date-only high impact events block conservatively without assuming a release hour", () => {
  const check = (time) => evaluateNewsGuard(snapshot([entry("US", null)], time), "XAUUSD", time).state;
  const data = snapshot([entry("US", null)]);
  assert.equal(data.events[0].time, null);
  assert.equal(data.events[0].timeConfirmed, false);
  assert.equal(check(utc("2026-10-30T06:00:00Z")), "BLOCKED");
  assert.equal(check(utc("2026-10-29T18:00:00Z")), "CLEAR");
  assert.equal(check(utc("2026-10-31T03:00:00Z")), "CLEAR");
});

test("calendar failures, stale data and unverified coverage always prevent new entries", () => {
  const data = snapshot([], at);
  assert.equal(evaluateNewsGuard(null, "XAUUSD", at).state, "UNAVAILABLE");
  assert.equal(evaluateNewsGuard(data, "XAUUSD", at + NEWS_MAX_AGE_MS + 1).allowed, false);
  assert.equal(evaluateNewsGuard(data, "XAUUSD", to + 1).allowed, false);
  assert.equal(evaluateNewsGuard(data, "XAUUSD", from - 1).allowed, false);
  assert.equal(evaluateNewsGuard(data, "XAUUSD", at).state, "CLEAR");
  assert.throws(() => parseNewsSnapshot({}, at, from, to));
  assert.throws(() => parseNewsSnapshot({ total: 6, events: [] }, at, from, to));
  assert.throws(() => snapshot([entry("US", null, { date: null })]));
});

test("UTC timestamps with offsets are resolved to exact instants and never use local browser timezone", () => {
  const data = snapshot([entry("US", "2026-10-30T08:30:00-04:00")]);
  assert.equal(data.events[0].time, at);
  assert.equal(evaluateNewsGuard(data, "XAUUSD", at).state, "BLOCKED");
});

test("fetching the free high-impact calendar requests all relevant countries without a key", async () => {
  let requested = "";
  const fetcher = async (url) => {
    requested = url;
    return new Response(JSON.stringify(payload([entry("US")])), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const data = await fetchNewsSnapshot(at, fetcher);
  const url = new URL(requested);
  assert.equal(url.origin + url.pathname, NEWS_API_URL);
  assert.equal(url.searchParams.get("impact"), "high");
  assert.match(url.searchParams.get("country"), /US,EU,DE,GB,JP,CA,AU/);
  assert.equal(url.searchParams.has("api_key"), false);
  assert.equal(data.events[0].time, at);
  await assert.rejects(
    () => fetchNewsSnapshot(at, async () => new Response("Service Unavailable", { status: 503 })),
  );
});

test("two recent signals per page and navigation has bottom spacing", () => {
  const signals = Array.from({ length: 5 }, (_, id) => ({ id }));
  assert.equal(SIGNALS_PER_PAGE, 2);
  assert.deepEqual(signalPage(signals, 0).items.map((item) => item.id), [0, 1]);
  assert.deepEqual(signalPage(signals, 1).items.map((item) => item.id), [2, 3]);
  assert.deepEqual(signalPage(signals, 2).items.map((item) => item.id), [4]);
  assert.equal(signalPage(signals, 77).pageCount, 3);
  const stylesheet = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(stylesheet, /\.mbiotraders-recent-pagination\s*\{[^}]*margin:\s*0 12px 18px/s);
});

test("news gate is before both direct signal activation and pending breakout, but after live exit reconciliation", () => {
  const source = readFileSync(new URL("../src/components/useSignalLedger.ts", import.meta.url), "utf8");
  const current = source.indexOf("const current = previous.active[symbol]");
  const gate = source.indexOf("if (!allowNewSignals)");
  const pending = source.indexOf("const waiting = previous.pending[symbol]");
  const created = source.indexOf("return candidate ? activate(previous, candidate)");
  assert.ok(current >= 0 && current < gate && gate < pending && pending < created);
  assert.match(source, /allowNewSignals: boolean/);
  assert.match(source, /return closePending\(previous, symbol\)/);
});

test("live UI credits calendar provider and shows blocked status without exposing a misleading new signal", () => {
  const dashboard = readFileSync(new URL("../src/components/MarketDashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /allowNewSignals: newsGuard\.allowed/);
  assert.match(dashboard, /High-impact news filter/);
  assert.match(dashboard, /Calendar data: Finance Calendar/);
  assert.match(dashboard, /newsGuard\.reason/);
  assert.match(dashboard, /NEWS_SOURCE_URL/);
});
