import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activate,
  emptyLedger,
  parseLedger,
  update,
} from "../src/lib/v26-signals.ts";
import {
  RECENT_SIGNAL_LIMIT,
  SIGNALS_PER_PAGE,
  recentSignals,
  signalPage,
  formatSignalResult,
  exportSignalsCsv,
} from "../src/lib/signal-history.ts";

const start = Date.UTC(2026, 9, 20, 9);
const markets = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD"];

function makeSignal(index, symbol = markets[index % markets.length]) {
  const openedAt = start + index * 300_000;
  return {
    id: `closed-${index}`,
    symbol,
    provider: "deriv",
    direction: index % 2 ? "SELL" : "BUY",
    entry: 1000,
    stop: index % 2 ? 1010 : 990,
    target: index % 2 ? 980 : 1020,
    openedAt,
    confidence: 90,
    status: "ACTIVE",
    lastCheckedAt: openedAt,
    closedAt: null,
    exitPrice: null,
    resultR: null,
  };
}

function settle(book, opened, result = opened.direction === "BUY" ? "TP" : "SL") {
  const active = activate(book, opened);
  const exitPrice = result === "TP" ? opened.target : opened.stop;
  const resultR = result === "TP" ? 2 : -1;
  return update(active, opened.symbol, {
    ...opened,
    status: result,
    lastCheckedAt: opened.openedAt + 300_000,
    closedAt: opened.openedAt + 300_000,
    exitPrice,
    resultR,
  });
}

test("retains the most recent 100 completed signals globally across markets", () => {
  let book = emptyLedger();
  for (let index = 0; index < 130; index += 1) {
    book = settle(book, makeSignal(index));
  }

  const signals = recentSignals(book.history);
  assert.equal(RECENT_SIGNAL_LIMIT, 100);
  assert.equal(signals.length, 100);
  assert.equal(signals[0].id, "closed-129");
  assert.equal(signals.at(-1).id, "closed-30");
  assert.equal(
    Object.values(book.history).reduce((total, records) => total + (records?.length ?? 0), 0),
    100,
  );
  assert.deepEqual([...new Set(signals.map((item) => item.symbol))].sort(), [...markets].sort());
  assert.equal(parseLedger(JSON.stringify(book)).active.XAUUSD, undefined);
  assert.equal(recentSignals(parseLedger(JSON.stringify(book)).history).length, 100);
});

test("single-market 101st close removes the oldest outcome but preserves active signals", () => {
  let book = emptyLedger();
  for (let index = 0; index < 101; index += 1) {
    book = settle(book, makeSignal(index, "XAUUSD"));
  }
  const active = makeSignal(200, "EURUSD");
  book = activate(book, active);

  const saved = parseLedger(JSON.stringify(book));
  assert.equal(saved.active.EURUSD?.id, active.id);
  assert.equal(saved.history.XAUUSD?.length, 100);
  assert.equal(recentSignals(saved.history).at(-1).id, "closed-1");
});

test("reading an older v26 localStorage ledger retains up to 100 across pairs", () => {
  const legacy = emptyLedger();
  legacy.history.XAUUSD = Array.from({ length: 50 }, (_, index) => {
    const entry = makeSignal(index, "XAUUSD");
    return {
      ...entry,
      status: "TP",
      closedAt: entry.openedAt + 300_000,
      resultR: 2,
      exitPrice: entry.target,
    };
  });
  legacy.history.EURUSD = Array.from({ length: 50 }, (_, index) => {
    const entry = makeSignal(index + 50, "EURUSD");
    return {
      ...entry,
      status: "SL",
      closedAt: entry.openedAt + 300_000,
      resultR: -1,
      exitPrice: entry.stop,
    };
  });
  legacy.history.USDJPY = Array.from({ length: 50 }, (_, index) => {
    const entry = makeSignal(index + 100, "USDJPY");
    return {
      ...entry,
      status: "TP",
      closedAt: entry.openedAt + 300_000,
      resultR: 2,
      exitPrice: entry.target,
    };
  });
  legacy.active.GBPUSD = makeSignal(500, "GBPUSD");

  const parsed = parseLedger(JSON.stringify(legacy));
  const kept = recentSignals(parsed.history);
  assert.equal(kept.length, 100);
  assert.equal(kept[0].id, "closed-149");
  assert.equal(kept.at(-1).id, "closed-50");
  assert.equal(parsed.active.GBPUSD?.id, "closed-500");
});

test("two signals per page, correct navigation, empty and out-of-range handling", () => {
  const signals = Array.from({ length: 10 }, (_, index) => makeSignal(index));
  assert.equal(SIGNALS_PER_PAGE, 2);
  assert.deepEqual(signalPage(signals, 0).items.map((value) => value.id), ["closed-0", "closed-1"]);
  assert.deepEqual(signalPage(signals, 1).items.map((value) => value.id), ["closed-2", "closed-3"]);
  assert.deepEqual(signalPage(signals, 2).items.map((value) => value.id), ["closed-4", "closed-5"]);
  assert.deepEqual(signalPage(signals, 4).items.map((value) => value.id), ["closed-8", "closed-9"]);
  assert.equal(signalPage(signals, 30).page, 4);
  assert.equal(signalPage(signals, -7).page, 0);
  assert.deepEqual(signalPage([], 3), { items: [], page: 0, pageCount: 1, total: 0, from: 0, to: 0 });
});

test("CSV includes all stored trades with only Time, Direction, Pair, Result columns", () => {
  let book = emptyLedger();
  for (let index = 0; index < 11; index += 1) book = settle(book, makeSignal(index));
  const records = recentSignals(book.history);
  const page = signalPage(records, 0);
  const csv = exportSignalsCsv(records);
  const rows = csv.trim().split("\r\n");
  assert.equal(rows[0], "Time,Direction,Pair,Result");
  assert.equal(rows.length, 12);
  assert.equal(page.items.length, 2);
  assert.match(rows[1], /^"2026-10-20T\d\d:\d\d:\d\d\.000Z","BUY","AUDUSD","TP \+2\.00R"$/);
  assert.ok(rows.some((row) => row.includes('"SL -1.00R"')));
  assert.doesNotMatch(rows[0], /Entry|Stop|Target|TP|SL/);
  assert.equal(formatSignalResult(records[1]).includes("R"), true);
});

test("UI renders four columns and a CSV button, and keeps all four columns on mobile", () => {
  const dashboard = readFileSync(new URL("../src/components/MarketDashboard.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../src/components/useSignalLedger.ts", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const recentSection = dashboard.split('<section className="mbiotraders-card mbiotraders-recent-card">')[1].split('<section className="mbiotraders-card mbiotraders-stats-card">')[0];

  assert.match(hook, /historyAll: recentSignals\(ledger\.history\)/);
  assert.match(recentSection, /<span>Time<\/span>[\s\S]*?<span>Direction<\/span>[\s\S]*?<span>Pair<\/span>[\s\S]*?<span>Result<\/span>/);
  assert.doesNotMatch(recentSection, /<span>Entry<\/span>|<span>TP<\/span>|<span>SL<\/span>/);
  assert.match(recentSection, /displayedHistory\.items\.map/);
  assert.match(recentSection, /Export CSV/);
  assert.match(recentSection, /Previous signals page/);
  assert.match(recentSection, /Next signals page/);
  assert.match(recentSection, /signalDateTime\(item\.openedAt\)/);
  assert.match(styles, /mbiotraders-recent-card \.mbiotraders-table-row span:nth-child\(n\+4\)/);
});
