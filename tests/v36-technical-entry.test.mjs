import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIGNALS_PER_PAGE, signalPage } from "../src/lib/signal-history.ts";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("new entries continue to require valid fresh candles and genuine timestamps", () => {
  const ledger = read("src/components/useSignalLedger.ts");
  const first = ledger.indexOf("const current = previous.active[symbol]");
  const next = ledger.indexOf("if (!isLive || !setup.dataCurrent || !setup.momentum.complete)");
  const pending = ledger.indexOf("const waiting = previous.pending[symbol]");
  const activate = ledger.indexOf("return activate(previous, candidate)");
  assert.ok(first >= 0 && first < next && next < pending && pending < activate);
  assert.match(ledger, /now - setup.time > 90_000/);
  assert.match(ledger, /setup.entry === null || setup.stop === null || setup.target === null/);
  assert.match(ledger, /seen\(previous, symbol, setup.signalId\)/);
});

test("dashboard maintains strict technical checks and readable wait state", () => {
  const dashboard = read("src/components/MarketDashboard.tsx");
  assert.match(dashboard, /nextSetupBanner\(setup\.criteria, setup\.status, activeSignal\?\.direction\)/);
  assert.match(dashboard, /WAITING for qualifying signal/);
  assert.match(dashboard, /setup.criteria.map/);
  assert.match(read("src/lib/v22/analysis.ts"), /inspectFiveMinuteEntry/);
});

test("recent signal history continues to paginate in groups of two", () => {
  const entries = Array.from({ length: 5 }, (_, id) => ({ id }));
  assert.equal(SIGNALS_PER_PAGE, 2);
  assert.deepEqual(signalPage(entries, 0).items.map(x => x.id), [0, 1]);
  assert.deepEqual(signalPage(entries, 1).items.map(x => x.id), [2, 3]);
  assert.equal(signalPage(entries, 99).pageCount, 3);
  assert.match(read("src/app/globals.css"), /\.mbiotraders-recent-pagination\s*\{[^}]*margin:\s*0 12px 18px/s);
});
