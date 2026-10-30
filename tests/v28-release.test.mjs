import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const dashboard = read("src/components/MarketDashboard.tsx");
const chart = read("src/components/LiveChart.tsx");
const styles = read("src/app/globals.css");
const historyHook = read("src/components/useHistoricalCandles.ts");

function sourceFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(entry.name) ? [relative] : [];
  });
}

test("mobile header groups branding, alerts, live status and market controls", () => {
  assert.match(styles, /@media \(max-width: 780px\)/);
  assert.match(styles, /grid-template-areas:\s*"brand alerts"\s*"feed feed"\s*"context context"/);
  assert.match(styles, /\.mbiotraders-topbar-feed\s*\{\s*grid-area: feed/);
  assert.match(styles, /\.mbiotraders-topbar-context\s*\{\s*grid-area: context/);
  assert.match(styles, /overscroll-behavior-x: contain/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(styles, /@media \(max-width: 360px\)/);
  assert.match(dashboard, /aria-label="Instrument selection"/);
  assert.match(dashboard, /aria-label="Timeframe selection"/);
});

test("long and short drawings use chart-attached shaded zones without extra price lines", () => {
  assert.match(chart, /timeToCoordinate/);
  assert.match(chart, /priceToCoordinate/);
  assert.match(chart, /subscribeVisibleLogicalRangeChange/);
  assert.match(chart, /mbiotraders-position-zone gain/);
  assert.match(chart, /mbiotraders-position-zone risk/);
  assert.doesNotMatch(chart, /createPriceLine|removePriceLine|IPriceLine/);
  assert.doesNotMatch(chart, /mbiotraders-position-level/);
  assert.doesNotMatch(styles, /\.mbiotraders-position-level/);
});

test("history requests use a non-null confirmed provider in their query parameters", () => {
  assert.match(historyHook, /const activeProvider: MarketPayload\["provider"\] = provider/);
  assert.match(historyHook, /provider: activeProvider/);
  assert.match(historyHook, /data\.provider !== activeProvider/);
});

test("existing signals, connection retry, market controls and seven-day default remain", () => {
  assert.match(dashboard, /useSignalLedger/);
  assert.match(dashboard, /useHistoricalCandles/);
  assert.match(dashboard, /<ConnectionRetryToast/);
  assert.match(dashboard, /https:\/\/mbiopeter\.co\.ke/);
  assert.match(dashboard, /"mbio-mbiotraders-momentum-days-v26"/);
  assert.match(read("src/lib/v26-signals.ts"), /mbiotraders-signals-v26/);
});

test("application source, scripts, styles, tests and generated types contain no authored comments", () => {
  const paths = [
    ...sourceFiles("src"),
    ...sourceFiles("scripts"),
    ...sourceFiles("tests"),
    "next.config.ts",
    "postcss.config.mjs",
    ".gitignore",
    ".prettierignore",
  ];
  const slash = String.fromCharCode(47);
  const lineComment = slash + slash;
  const blockComment = slash + "*";
  for (const path of paths) {
    const contents = read(path);
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trimStart();
      assert.equal(trimmed.startsWith(lineComment), false, `${path} has a line comment`);
      assert.equal(trimmed.startsWith(blockComment), false, `${path} has a block comment`);
      if (path.endsWith(".css")) {
        assert.equal(line.includes(blockComment), false, `${path} has a stylesheet comment`);
      }
      if (path === ".gitignore" || path === ".prettierignore") {
        assert.equal(trimmed.startsWith("#"), false, `${path} has a configuration comment`);
      }
    }
  }
});
