import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconnectionDelay, HTTP_REFRESH_MS, HTTP_TIMEOUT_MS, STREAM_FIRST_TICK_TIMEOUT_MS, STREAM_STALE_TIMEOUT_MS } from '../src/lib/reconnection.ts';

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');

// Regression: both transport paths must retry indefinitely, including an
// opening WebSocket that receives no actual market ticks.
test('reconnection backoff starts quickly, grows and has a safe cap', () => {
  assert.equal(reconnectionDelay(1, 0.5), 2_000);
  assert.equal(reconnectionDelay(2, 0.5), 4_000);
  assert.equal(reconnectionDelay(3, 0.5), 8_000);
  assert.equal(reconnectionDelay(8, 0.5), 30_000);
  assert.equal(reconnectionDelay(9999, 0.5), 30_000);
  assert.ok(reconnectionDelay(1, 0) >= 1_500);
  assert.ok(reconnectionDelay(10, 1) <= 35_000);
  assert.ok(reconnectionDelay(-3) > 0);
  assert.ok(reconnectionDelay(Number.NaN) > 0);
});

test('retry and timeout constants cover HTTP and public streaming', () => {
  assert.equal(HTTP_REFRESH_MS, 45_000);
  assert.equal(HTTP_TIMEOUT_MS, 23_000);
  assert.equal(STREAM_FIRST_TICK_TIMEOUT_MS, 25_000);
  assert.equal(STREAM_STALE_TIMEOUT_MS, 150_000);
});

test('failed HTTP requests retry automatically and do not discard verified earlier bars', () => {
  const dashboard = read('src/components/MarketDashboard.tsx');
  assert.match(dashboard, /timer\.current = setTimeout\(\(\) => void reload\(\), reconnectionDelay\(attempts\)\)/);
  assert.match(dashboard, /timer\.current = setTimeout\(\(\) => void reload\(\), HTTP_REFRESH_MS\)/);
  assert.match(dashboard, /window\.addEventListener\("online", restore\)/);
  assert.match(dashboard, /document\.addEventListener\("visibilitychange", onVisible\)/);
  assert.match(dashboard, /abort\.current\?\.abort\(\)/);
  assert.match(dashboard, /!feed\.error && Boolean\(feed\.payload\)/);
  assert.match(dashboard, /const displayedSignal = isLive \? setup\.status : "WAIT"/);
});

test('public streaming feed retries failed subscription and stalls', () => {
  const dashboard = read('src/components/MarketDashboard.tsx');
  assert.match(dashboard, /firstTickTimeout = setTimeout/);
  assert.match(dashboard, /STREAM_FIRST_TICK_TIMEOUT_MS/);
  assert.match(dashboard, /STREAM_STALE_TIMEOUT_MS/);
  assert.match(dashboard, /candidate\.onerror = \(\) => \{ if \(candidate === socket\) retryConnection\(\); \}/);
  assert.match(dashboard, /candidate\.onclose = \(\) => \{ if \(candidate === socket\) retryConnection\(\); \}/);
  assert.match(dashboard, /retry = setTimeout\(\(\) => \{ retry = null; connect\(\); \}, reconnectionDelay\(\+\+attempts\)\)/);
});

test('title links to portfolio in loaded and skeleton pages; no visible version', () => {
  for (const file of ['src/components/MarketDashboard.tsx', 'src/app/loading.tsx']) {
    const source = read(file);
    assert.match(source, /href="https:\/\/mbiopeter\.co\.ke"/);
    assert.match(source, /mbio<span>Traders<\/span>/);
    assert.doesNotMatch(source, /<h1>.*v2[0-9]/);
  }
});

test('alert has stronger level and audio peak limiting', () => {
  const dashboard = read('src/components/MarketDashboard.tsx');
  assert.match(dashboard, /createDynamicsCompressor/);
  assert.match(dashboard, /exponentialRampToValueAtTime\(0\.42,/);
  assert.match(dashboard, /if \(audible\)/);
});

test('all visual CSS classes use mbioTraders branding, not release numbers', () => {
  const css = read('src/app/globals.css');
  assert.doesNotMatch(css, /\.v23-|\.v24-|\.v231-|@keyframes v24-/);
  assert.match(css, /\.mbiotraders-header \{ height: 50px/);
  assert.match(css, /\.mbiotraders-toolbar \{ height: 49px/);
  for(const file of ['src/components/MarketDashboard.tsx','src/components/StrengthGauge.tsx','src/components/LiveChart.tsx','src/components/DashboardSkeleton.tsx','src/app/loading.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /(?:className=|className=\{`)[^\n]*(?:v23-|v24-|v231-)/);
  }
});
