import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const file = (name) => readFileSync(join(root, name), "utf8");
const dashboard = file("src/components/MarketDashboard.tsx");
const toast = file("src/components/ConnectionRetryToast.tsx");
const styles = file("src/app/globals.css");



test("market-data provider errors are not rendered as raw inline warnings", () => {
  assert.doesNotMatch(dashboard, /<div className="mbiotraders-warning"/);
  assert.doesNotMatch(dashboard, /\{feed\.error\}[^\n]*Retrying/);
  assert.doesNotMatch(dashboard, /Missing 4H timeframe/);
  assert.match(dashboard, /<ConnectionRetryToast contextKey=\{symbol\} retrying=\{retrying\}/);
  assert.match(dashboard, /feed\.requestSymbol === symbol/);
});

test("five-second retry notice appears in the bottom-right corner", () => {
  assert.match(toast, /CONNECTION_TOAST_DURATION_MS = 5_000/);
  assert.match(toast, /Retrying connection…/);
  assert.match(toast, /setTimeout\(/);
  assert.match(toast, /setVisible\(false\)/);
  assert.match(styles, /\.mbiotraders-connection-toast \{[\s\S]*?position: fixed/);
  assert.match(styles, /right: 20px;\s*bottom: 20px;/);
  assert.match(styles, /animation: mbiotraders-toast-progress 5s linear forwards/);
});

test("retries stay automatic and the stream can report retry state", () => {
  assert.match(dashboard, /reconnectionDelay\(attempts\)/);
  assert.match(dashboard, /streamRetrying: true/);
  assert.match(dashboard, /streamRetrying: false/);
  assert.match(dashboard, /feed\.error !== null \|\| feed\.streamRetrying/);
});

test("technical history bar is removed without removing history fetching", () => {
  assert.doesNotMatch(dashboard, /Chart history:/);
  assert.doesNotMatch(dashboard, /mbiotraders-history-note/);
  assert.doesNotMatch(styles, /\.mbiotraders-history-note/);
  assert.match(dashboard, /useHistoricalCandles/);
  assert.match(file("src/components/useHistoricalCandles.ts"), /api\/market\/history/);
});

test("new professional header retains pair and timeframe functionality", () => {
  assert.match(dashboard, /mbiotraders-topbar-primary/);
  assert.match(dashboard, /mbiotraders-topbar-secondary/);
  assert.match(dashboard, /MARKET INTELLIGENCE/);
  assert.match(dashboard, /aria-label="Instrument selection"/);
  assert.match(dashboard, /aria-label="Timeframe selection"/);
  assert.match(dashboard, /https:\/\/mbiopeter\.co\.ke/);
  assert.match(dashboard, /Alerts \{audible \? "On" : "Off"\}/);
});

test("signal tracking, 7D momentum, price precision and storage remain compatible", () => {
  assert.match(dashboard, /"mbio-mbiotraders-momentum-days-v26"/);
  assert.match(dashboard, /const tracker = useSignalLedger/);
  assert.match(dashboard, /const old5 = useHistoricalCandles/);
  assert.match(file("src/lib/v26-signals.ts"), /mbiotraders-signals-v26/);
  assert.match(file("src/lib/v26-signals.ts"), /slice\(-50\)/);
  assert.match(dashboard, /value\.toFixed\(4\)/);
});

test("rewritten historical-data and signal hooks use readable source lines", () => {
  for (const name of [
    "src/components/useHistoricalCandles.ts",
    "src/components/useSignalLedger.ts",
    "src/lib/v26-history.ts",
    "src/lib/v26-signals.ts",
    "src/app/api/market/history/route.ts",
  ]) {
    const source = file(name);
    const longest = Math.max(...source.split("\n").map((line) => line.length));
    assert.ok(longest <= 120, `${name} has a ${longest}-character line`);
  }
});

test("production SEO now defaults to the provided mbioTraders domain", () => {
  assert.match(file("src/lib/seo.ts"), /https:\/\/traders\.mbiopeter\.co\.ke/);
  assert.match(file(".env.example"), /https:\/\/traders\.mbiopeter\.co\.ke/);
});
