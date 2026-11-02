import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { nextSetupBanner } from "../src/lib/setup-progress.ts";

const text = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const names = [
  "Fresh 5m candles",
  "7-day higher momentum",
  "Five higher frames aligned",
  "H1 trend strength",
  "5m countertrend pullback",
  "Two strong 5m candles (60%+)",
  "Third-candle open + swing SL + 2R",
];

test("setup information banner advances through one unmet qualification at a time", () => {
  const criteria = names.map((name) => ({ name, ok: false }));
  const messages = [];
  for (let i = 0; i < criteria.length; i++) {
    const next = nextSetupBanner(criteria, "WAIT");
    assert.equal(next.completed, i);
    assert.equal(next.total, criteria.length);
    assert.match(next.message, /^Waiting for /);
    messages.push(next.message);
    criteria[i].ok = true;
  }
  assert.equal(new Set(messages).size, criteria.length);
  assert.match(messages[0], /fresh, consecutive 5m candles/i);
  assert.match(messages[1], /7-day.*momentum/i);
  assert.match(messages[2], /15m, 30m, 1H, 4H and 1D/i);
  assert.match(messages[3], /ADX 16\+/i);
  assert.match(messages[4], /countertrend pullback/i);
  assert.match(messages[5], /60%\+ body/i);
  assert.match(messages[6], /earlier swing SL and 2R target/i);
  assert.deepEqual(nextSetupBanner(criteria, "BUY"), { message: "BUY setup qualified", tone: "up", completed: 7, total: 7 });
  assert.equal(nextSetupBanner(criteria, "SELL").message, "SELL setup qualified");
});

test("active signal status does not impersonate a new setup qualification", () => {
  const criteria = names.map((name) => ({ name, ok: false }));
  assert.deepEqual(nextSetupBanner(criteria, "WAIT", "BUY"), { message: "BUY active", tone: "up", completed: 0, total: 7 });
  assert.equal(nextSetupBanner(criteria, "WAIT", "SELL").message, "SELL active");
  assert.match(nextSetupBanner(criteria, "WAIT").message, /^Waiting for /);
  assert.equal(nextSetupBanner([], "WAIT").message, "Checking technical qualifications");
});

test("current confluence stays live even during an active signal", () => {
  const src = text("../src/components/MarketDashboard.tsx");
  assert.match(src, /<span>Current Confluence<\/span>/);
  assert.match(src, /<strong aria-label=\{`Current confluence \$\{setup\.score\} percent`\}>\{setup\.score\}%<\/strong>/);
  assert.match(src, /<ConfidenceBar score=\{setup\.score\} \/>/);
  assert.match(src, /At activation/);
  assert.match(src, /activeSignal\.confidence/);
  assert.doesNotMatch(src, /Waiting for setup/);
  assert.match(src, /nextSetupBanner\(setup\.criteria, setup\.status, activeSignal\?\.direction\)/);
});

test("indicator icon restores underlined U motif and setup banner is square", () => {
  const src = text("../src/components/MarketDashboard.tsx");
  const css = text("../src/app/globals.css");
  assert.match(src, /<Underline size=\{16\} strokeWidth=\{2\.1\} aria-hidden="true" \/> Technical Indicators/);
  assert.match(src, /mbiotraders-underline-icon/);
  assert.match(css, /\.mbiotraders-setup-card \.mbiotraders-conclusion \{\s*border-radius:\s*0;/);
  assert.match(css, /\.mbiotraders-setup-card \.mbiotraders-check-copy strong \{[^}]*font-weight:\s*480;/s);
});

test("v37 lockfile and light-mode guide remain bundled with unchanged technical-only markets", () => {
  const pkg = JSON.parse(text("../package.json"));
  const lock = JSON.parse(text("../package-lock.json"));
  assert.equal(pkg.name, "mbiotraders-v37");
  assert.equal(pkg.version, "37.0.0");
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(lock.packages[""].name, pkg.name);
  assert.ok(existsSync(new URL("../public/mbiotraders-signal-guide.pdf", import.meta.url)));
  assert.match(text("../public/notification-sw.js"), /mbiotraders-pwa-v37-light-static/);
  assert.deepEqual(readdirSync(new URL("../src/app/api/", import.meta.url)).sort(), ["market"]);
  assert.match(text("../src/lib/v22/market.ts"), /deriv|Deriv/);
  assert.match(text("../src/lib/v22/market.ts"), /BTCUSD/);
});
