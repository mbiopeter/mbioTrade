import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const styles = read("src/app/globals.css");
const dashboard = read("src/components/MarketDashboard.tsx");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));

test("v32 includes synchronized npm install lockfile", () => {
  assert.equal(pkg.name, "mbiotraders-v32");
  assert.equal(pkg.version, "32.0.0");
  assert.equal(pkg.name, lock.name);
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[""].version);
  assert.deepEqual(pkg.dependencies, lock.packages[""].dependencies);
});

test("desktop names all nine card areas in a compact three-column grid", () => {
  assert.match(styles, /@media \(min-width: 1200px\)/);
  assert.match(styles, /grid-template-columns: minmax\(0, 2\.35fr\) minmax\(0, 1\.24fr\) minmax\(0, 1\.08fr\)/);
  for (const area of ["chart", "gauge", "signal", "align", "setup", "levels", "tech", "recent", "stats"]) {
    assert.match(styles, new RegExp(`mbiotraders-${area}-card`));
  }
  assert.match(styles, /"chart gauge signal"\s*"chart setup signal"\s*"align setup levels"\s*"tech recent stats"/);
  assert.match(styles, /@media \(min-width: 1200px\) and \(min-height: 700px\)/);
  assert.match(styles, /height: 100dvh/);
  assert.match(styles, /\.mbiotraders-grid \{ flex: 1 1 auto; min-height: 0; \}/);
});

test("tablets use two columns and phones one column with natural content heights", () => {
  assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1199px\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0,1fr\)\)/);
  assert.match(styles, /"chart chart"\s*"gauge signal"\s*"align align"\s*"setup levels"\s*"tech tech"\s*"recent stats"/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /grid-template-areas: "chart" "gauge" "signal" "align" "setup" "levels" "tech" "recent" "stats"/);
  assert.match(styles, /\.mbiotraders-setup-card \.mbiotraders-check-copy small/);
});

test("guide download is present in the header and not an inert placeholder", () => {
  assert.match(dashboard, /href="\/mbiotraders-signal-guide\.pdf"/);
  assert.match(dashboard, /download="mbioTraders-Signal-Guide\.pdf"/);
  assert.match(dashboard, /aria-label="Download PDF: How Signals Work"/);
  assert.match(styles, /\.mbiotraders-guide-link \{/);
  const pdf = readFileSync(new URL("../public/mbiotraders-signal-guide.pdf", import.meta.url));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(statSync(new URL("../public/mbiotraders-signal-guide.pdf", import.meta.url)).size > 50000);
  assert.doesNotMatch(pdf.toString("latin1"), /mbioTraders v31|mbioTraders v32|FIELD GUIDE \/ V31/i);
});

test("notification success message does not occupy top bar while alerts are retained", () => {
  assert.doesNotMatch(dashboard, /className="mbiotraders-notification-status"/);
  assert.match(dashboard, /className="sr-only" role="status" aria-live="polite"/);
  assert.match(dashboard, /requestBrowserNotificationPermission\(\)/);
  assert.match(dashboard, /sendBrowserSignalNotification\(activeSignal\)/);
  assert.match(dashboard, /className="mbiotraders-alert-tools"/);
  assert.match(styles, /\.mbiotraders-alert-tools \{ grid-area: alerts/);
});

test("v31 strategy, economic news, ledger, CSV and real alert modules remain connected", () => {
  assert.match(dashboard, /inspectConfluence\(payload, now, safeMomentumDays\)/);
  assert.match(dashboard, /useSignalLedger\(/);
  assert.match(dashboard, /useNewsCalendar\(symbol, now\)/);
  assert.match(dashboard, /useHistoricalCandles\(/);
  assert.match(dashboard, /exportSignalsCsv\(/);
  assert.match(dashboard, /rememberBrowserAlert\(/);
  assert.match(dashboard, /\.map\(\(criterion\) => \(/);
  assert.match(read("src/lib/v22/analysis.ts"), /inspectFiveMinuteEntry/);
  assert.match(read("src/components/browserNotifications.ts"), /showNotification\(alert\.title/);
});
