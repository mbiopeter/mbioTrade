import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fetchMarket, FRAMES } from "../src/lib/v22/market.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public live market ignores leftover Twelve Data keys and retrieves six real Deriv frames", async () => {
  const previousWs = globalThis.WebSocket;
  const old = process.env.TWELVE_DATA_API_KEY;
  const requested = [];
  process.env.TWELVE_DATA_API_KEY = "previous-private-key-not-used";
  class FakeSocket {
    handlers = new Map();
    constructor(url) {
      assert.match(url, /^wss:\/\/api\.derivws\.com/);
      queueMicrotask(() => this.handlers.get("open")?.({}));
    }
    addEventListener(name, handler) { this.handlers.set(name, handler); }
    send(value) {
      const request = JSON.parse(value);
      requested.push(request);
      const rows = Array.from({ length: 70 }, (_, index) => ({
        epoch: request.granularity * (10_000 + index),
        open: 100, high: 102, low: 99, close: 101,
      }));
      queueMicrotask(() => this.handlers.get("message")?.({
        data: JSON.stringify({ req_id: request.req_id, candles: rows }),
      }));
    }
    close() {}
  }
  globalThis.WebSocket = FakeSocket;
  try {
    const result = await fetchMarket("EURUSD");
    assert.equal(result.provider, "deriv");
    assert.equal(result.streamSymbol, "frxEURUSD");
    assert.deepEqual(Object.keys(result.frames).map(Number).sort((a,b)=>a-b), [...FRAMES]);
    assert.equal(requested.length, FRAMES.length);
    assert.ok(requested.every(item => !Object.hasOwn(item, "api_key")));
  } finally {
    if (previousWs === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = previousWs;
    if (old === undefined) delete process.env.TWELVE_DATA_API_KEY;
    else process.env.TWELVE_DATA_API_KEY = old;
  }
});

test("signal activation is controlled by technical readiness", () => {
  const dashboard = read("src/components/MarketDashboard.tsx");
  const ledger = read("src/components/useSignalLedger.ts");
  assert.match(dashboard, /setup.criteria.map/);
  assert.match(ledger, /setup.dataCurrent/);
  assert.match(ledger, /setup.momentum.complete/);
});

test("public SEO article and downloadable guide describe the current technical strategy", () => {
  const article = read("src/app/how-signals-work/page.tsx");
  const guide = readFileSync(new URL("../public/mbiotraders-signal-guide.pdf", import.meta.url));
  assert.match(article, /Verify real candle data/);
  assert.match(article, /Confirm two strong closed candles/);
  assert.equal(guide.subarray(0, 5).toString(), "%PDF-");
  assert.ok(guide.byteLength > 50_000);
  assert.doesNotMatch(guide.toString("latin1"), /Signal Guide v36|FIELD GUIDE \/ V36/i);
});

test("mobile browser actions stay next to title using fixed compact icon controls", () => {
  const css=read("src/app/globals.css");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) max-content/);
  assert.match(css, /grid-template-areas: "brand alerts" "feed feed" "context context"/);
  assert.match(css, /flex-flow: row nowrap/);
  assert.match(css, /\.mbiotraders-alert-label \{ display: none/);
  const dashboard=read("src/components/MarketDashboard.tsx");
  for (const name of ["Download PDF: How Signals Work", "Turn off sound and browser notifications", "Enable sound and browser notifications"]) {
    assert.ok(dashboard.includes(name));
  }
  assert.match(read("src/components/PwaInstallButton.tsx"), /if \(isInstalled !== false\) return null/);
});
