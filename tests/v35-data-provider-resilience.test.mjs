import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchMarketShared, MARKET_CACHE_MS, MARKET_FAILURE_RETRY_MS } from "../src/lib/server-market-cache.ts";
import { fetchDeriv, FRAMES } from "../src/lib/v22/market.ts";

const root = resolve(import.meta.dirname, "..");
const source = (name) => readFileSync(resolve(root, name), "utf8");
const candles = (frame) => Array.from({ length: 70 }, (_, i) => ({
  time: frame * (10000 + i), open: 100, high: 102, low: 99, close: 101,
}));
const verified = (symbol) => ({
  symbol, provider: "deriv", providerName: "Deriv", sourceNote: "verified",
  fetchedAt: 1700000000000, warnings: [], streamSymbol: symbol,
  frames: Object.fromEntries(FRAMES.map((frame) => [frame, candles(frame)])),
});

test("shared market requests reuse the same pending real fetch and short-lived verified data", async () => {
  let now = 100_000;
  let requests = 0;
  let done;
  const gate = new Promise((resolve) => { done = resolve; });
  const loader = async (symbol) => { requests++; await gate; return verified(symbol); };
  const first = fetchMarketShared("XAUUSD", loader, () => now);
  const second = fetchMarketShared("XAUUSD", loader, () => now);
  assert.equal(requests, 1);
  done();
  const [one, two] = await Promise.all([first, second]);
  assert.strictEqual(one, two);
  assert.strictEqual(await fetchMarketShared("XAUUSD", loader, () => now + MARKET_CACHE_MS - 1), one);
  assert.equal(requests, 1);
  now += MARKET_CACHE_MS;
  await fetchMarketShared("XAUUSD", loader, () => now);
  assert.equal(requests, 2);
  assert.equal(one.fetchedAt, 1700000000000);
});

test("failed or incomplete market responses are never treated as valid cached market data", async () => {
  let now = 200_000;
  let requests = 0;
  const missing = async (symbol) => {
    requests++;
    const result = verified(symbol);
    delete result.frames[86400];
    return result;
  };
  await assert.rejects(fetchMarketShared("GBPUSD", missing, () => now), /incomplete/);
  await assert.rejects(fetchMarketShared("GBPUSD", missing, () => now + 1000), /incomplete/);
  assert.equal(requests, 1);
  now += MARKET_FAILURE_RETRY_MS;
  const good = verified("GBPUSD");
  assert.strictEqual(await fetchMarketShared("GBPUSD", async () => { requests++; return good; }, () => now), good);
  assert.equal(requests, 2);
});

test("market cache does not cross-contaminate currency pairs", async () => {
  const a = await fetchMarketShared("USDJPY", async (symbol) => verified(symbol), () => 50000);
  const b = await fetchMarketShared("USDCAD", async (symbol) => verified(symbol), () => 50000);
  assert.equal(a.symbol, "USDJPY");
  assert.equal(b.symbol, "USDCAD");
  assert.notStrictEqual(a, b);
});

test("Deriv historical queries are paced and complete all six genuine timeframes", async () => {
  const times = [];
  class Socket {
    listeners = new Map();
    constructor() { queueMicrotask(() => this.listeners.get("open")?.({})); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    send(value) {
      const req = JSON.parse(value);
      times.push(Date.now());
      queueMicrotask(() => this.listeners.get("message")?.({
        data: JSON.stringify({ req_id: req.req_id, candles: candles(req.granularity).map((c) => ({ ...c, epoch: c.time })) }),
      }));
    }
    close() {}
  }
  const result = await fetchDeriv("AUDUSD", () => new Socket());
  assert.equal(result.provider, "deriv");
  assert.equal(Object.keys(result.frames).length, 6);
  assert.equal(times.length, 6);
  assert.ok(times.at(-1) - times[0] >= 450, "Queries must not be sent as one burst");
});

test("Deriv rejects uncorrelated provider errors instead of silently timing out", async () => {
  class Socket {
    listeners = new Map();
    constructor() { queueMicrotask(() => this.listeners.get("open")?.({})); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    send() { queueMicrotask(() => this.listeners.get("message")?.({
      data: JSON.stringify({ error: { message: "API rate limit reached", code: "RateLimit" } }),
    })); }
    close() {}
  }
  await assert.rejects(fetchDeriv("EURUSD", () => new Socket()), /Deriv: API rate limit reached/);
});

test("live refreshes use public feeds without a secret key", () => {
  const live = source("src/lib/v22/market.ts");
  const fn = live.slice(live.indexOf("export async function fetchMarket(symbol:"));
  assert.match(fn, /fetchKraken\(symbol\)/);
  assert.match(fn, /fetchDeriv\(symbol\)/);
  assert.doesNotMatch(fn, /TWELVE_DATA_API_KEY|fetchTwelveData\(|apikey|key\.trim/);
  assert.doesNotMatch(source(".env.example"), /TWELVE_DATA_API_KEY/);
});

test("live activation still requires fresh data and verified technical momentum", () => {
  const ledger = source("src/components/useSignalLedger.ts");
  assert.match(ledger, /setup.dataCurrent/);
  assert.match(ledger, /setup.momentum.complete/);
  assert.match(ledger, /setup.entry === null/);
});

test("market route keeps cache and safe 503 for missing actual candles", () => {
  const market = source("src/app/api/market/route.ts");
  assert.match(market,/fetchMarketShared\(symbol\.symbol\)/);
  assert.match(market,/Retry-After/);
  assert.match(market,/status:503/);
  assert.match(source("src/lib/server-market-cache.ts"),/Provider returned incomplete or mismatched market candles/);
});
