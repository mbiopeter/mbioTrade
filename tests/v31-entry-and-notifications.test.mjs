import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectConfluence, REQUIRED_ALIGNMENT_FRAMES } from "../src/lib/v22/analysis.ts";
import { FRAMES } from "../src/lib/v22/market.ts";
import { inspectFiveMinuteEntry, strongCandle, previousSwing, ENTRY_OPEN_GRACE_MS } from "../src/lib/v31/entry.ts";
import { browserAlertFor, eligibleForNewAlert, parseAlertHistory, rememberBrowserAlert } from "../src/lib/v31/browser-alerts.ts";

const anchor = Date.UTC(2026, 9, 29, 12) / 1000;

function fiveMinute(direction = "BUY", countertrendBase = false) {
  const sign = direction === "BUY" ? 1 : -1;
  const bars = [];
  const start = anchor - 260 * 300;
  for (let i = 0; i < 260; i += 1) {
    const base = 2000 + (countertrendBase ? -sign : sign) * 0.11 * i;
    let open = base - sign * 0.05;
    let close = base + sign * 0.05;
    let high = Math.max(open, close) + 0.15;
    let low = Math.min(open, close) - 0.15;
    if (i === 247) {
      if (direction === "BUY") low -= countertrendBase ? 90 : 4;
      else high += countertrendBase ? 90 : 4;
    }
    if (i === 256) {
      open = base + sign * 0.45;
      close = base - sign * 0.3;
      high = Math.max(open, close) + 0.07;
      low = Math.min(open, close) - 0.07;
    }
    if (i === 258 || i === 259) {
      open = base - sign * 0.7;
      close = base + sign * 0.5;
      high = Math.max(open, close) + 0.05;
      low = Math.min(open, close) - 0.05;
    }
    bars.push({ time: start + i * 300, open, high, low, close });
  }
  const opening = bars.at(-1).close + sign * 0.05;
  bars.push({ time: anchor, open: opening, high: opening, low: opening, close: opening });
  return bars;
}

function fullSnapshot(direction = "BUY", countertrendBase = false) {
  const sign = direction === "BUY" ? 1 : -1;
  const frames = { 300: fiveMinute(direction, countertrendBase) };
  for (const frame of FRAMES.filter((period) => period !== 300)) {
    const end = Math.floor(anchor / frame) * frame;
    frames[frame] = Array.from({ length: 260 }, (_, i) => {
      const close = 2000 + sign * 0.35 * i;
      const open = close - sign * 0.2;
      return { time: end - (260 - i) * frame, open, close,
        high: Math.max(open, close) + 0.35, low: Math.min(open, close) - 0.35 };
    });
  }
  return { symbol: "XAUUSD", frames };
}

test("v31 requires five aligned trend frames and excludes 5m from voting", () => {
  assert.deepEqual(REQUIRED_ALIGNMENT_FRAMES, [900, 1800, 3600, 14400, 86400]);
  const result = inspectConfluence(fullSnapshot("BUY", true), anchor * 1000 + 30_000, 7);
  assert.equal(result.frames[300].direction, "SELL");
  assert.equal(result.bias, "BUY");
  assert.equal(result.criteria.find((item) => item.name === "Five higher frames aligned").ok, true);
  assert.equal(result.status, "BUY");
});

test("BUY and SELL enter at actual third 5m candle open and use previous pivot with exactly 2R TP", () => {
  for (const direction of ["BUY", "SELL"]) {
    const source = fullSnapshot(direction);
    const at = anchor * 1000 + 30_000;
    const five = source.frames[300];
    const result = inspectConfluence(source, at, 7);
    const detected = inspectFiveMinuteEntry(five, direction, at);
    assert.equal(result.status, direction, result.reason);
    assert.equal(detected.twoStrong, true);
    assert.equal(detected.pullback, true);
    assert.equal(result.entry, five.at(-1).open);
    assert.equal(result.time, anchor * 1000);
    assert.equal(result.stop, direction === "BUY" ? detected.swing.low : detected.swing.high);
    assert.ok(detected.swing.time < five.at(-3).time);
    assert.equal(Math.abs(result.target - result.entry) / Math.abs(result.entry - result.stop), 2);
  }
});

test("two candles must each have body at least 60%, inclusive and directional", () => {
  const bar = { time: 300, open: 100, close: 106, low: 99, high: 109 };
  assert.equal(strongCandle(bar, "BUY"), true);
  assert.equal(strongCandle({ ...bar, close: 105.9 }, "BUY"), false);
  assert.equal(strongCandle({ ...bar, open: 106, close: 100 }, "SELL"), true);
  assert.equal(strongCandle({ ...bar, open: 105.9, close: 100 }, "SELL"), false);
});

test("third candle open cannot be inferred, be early or be late", () => {
  const series = fiveMinute();
  const before = inspectFiveMinuteEntry(series, "BUY", anchor * 1000 - 1000);
  const late = inspectFiveMinuteEntry(series, "BUY", anchor * 1000 + ENTRY_OPEN_GRACE_MS + 1);
  const absent = inspectFiveMinuteEntry(series.slice(0, -1), "BUY", anchor * 1000 + 1000);
  assert.equal(before.timely, false);
  assert.equal(late.timely, false);
  assert.equal(absent.entry, null);
  assert.equal(inspectConfluence(fullSnapshot(), anchor * 1000 + ENTRY_OPEN_GRACE_MS + 1, 7).status, "WAIT");
});

test("invalid swing and missing bars block entries rather than manufacturing prices", () => {
  const series = fiveMinute();
  assert.ok(previousSwing(series.slice(0, -1), "BUY"));
  const noSwing = series.map((bar, i) => ({ ...bar, low: 1000 + i * .1, high: 3000 + i * .1 }));
  assert.equal(previousSwing(noSwing.slice(0, -1), "BUY"), null);
  const missing = series.filter((bar, index) => index !== 254);
  assert.equal(inspectFiveMinuteEntry(missing, "BUY", anchor * 1000 + 1000).continuous, false);
});

test("one mismatching 30-minute trend blocks all new signals", () => {
  const snapshot = fullSnapshot("BUY");
  snapshot.frames[1800] = fullSnapshot("SELL").frames[1800];
  const result = inspectConfluence(snapshot, anchor * 1000 + 10_000, 7);
  assert.equal(result.status, "WAIT");
  assert.equal(result.criteria.find((item) => item.name === "Five higher frames aligned").ok, false);
});

test("desktop alert includes actual BUY or SELL entry, stop and target to 4 decimal places", () => {
  for (const direction of ["BUY", "SELL"]) {
    const signal = { id: `id-${direction}`, symbol: "XAUUSD", direction, entry: 2600,
      stop: direction === "BUY" ? 2590 : 2610,
      target: direction === "BUY" ? 2620 : 2580,
      openedAt: anchor * 1000, status: "ACTIVE" };
    const notification = browserAlertFor(signal);
    assert.match(notification.title, new RegExp(direction));
    assert.match(notification.body, /Entry 2600\.0000/);
    assert.match(notification.body, new RegExp(`SL ${signal.stop.toFixed(4)}`));
    assert.match(notification.body, new RegExp(`TP ${signal.target.toFixed(4)}`));
    assert.match(notification.body, /Risk\/Reward 1:2/);
    assert.equal(eligibleForNewAlert(signal, signal.openedAt + 60_000, true), true);
    assert.equal(eligibleForNewAlert(signal, signal.openedAt + 91_000, true), false);
    assert.equal(eligibleForNewAlert(signal, signal.openedAt + 60_000, false), false);
  }
});

test("browser alert IDs are retained only once across remounts and multiple tabs", () => {
  const first = rememberBrowserAlert([], "XAUUSD:one:open");
  assert.deepEqual(first, ["XAUUSD:one:open"]);
  assert.equal(rememberBrowserAlert(first, "XAUUSD:one:open"), null);
  assert.deepEqual(parseAlertHistory(JSON.stringify(first)), first);
  assert.deepEqual(parseAlertHistory("malformed"), []);
  assert.equal(rememberBrowserAlert(Array.from({ length: 200 }, (_, i) => String(i)), "next").length, 200);
});

test("real Notification permission is requested from an explicit alert click; worker delivers OS notifications", () => {
  const component = readFileSync(new URL("../src/components/MarketDashboard.tsx", import.meta.url), "utf8");
  const notifications = readFileSync(new URL("../src/components/browserNotifications.ts", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../public/notification-sw.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(component, /onClick=\{\(\) => void enableAlert\(\)\}/);
  assert.match(component, /const permissionRequest = requestBrowserNotificationPermission\(\)/);
  assert.match(component, /sendBrowserSignalNotification\(activeSignal\)/);
  assert.match(notifications, /Notification\.requestPermission\(\)/);
  assert.match(notifications, /registration\.showNotification\(alert\.title/);
  assert.match(notifications, /new Notification\(alert\.title/);
  assert.match(worker, /notificationclick/);
  assert.match(styles, /\.mbiotraders-setup-card \.mbiotraders-check-copy small/);
});
