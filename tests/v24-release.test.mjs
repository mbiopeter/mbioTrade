import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { siteOrigin, SITE_DESCRIPTION, SITE_NAME } from '../src/lib/seo.ts';

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');

test('runtime regression: evaluateLiveFrame is explicitly imported and exported', () => {
  const dashboard = read('src/components/MarketDashboard.tsx');
  const analysis = read('src/lib/v22/analysis.ts');
  assert.match(dashboard, /import\s*\{[\s\S]*?evaluateLiveFrame,[\s\S]*?\}\s*from\s*["']@\/lib\/v22\/analysis["']/);
  assert.match(analysis, /export function evaluateLiveFrame\s*\(/);
  assert.match(dashboard, /return evaluateLiveFrame\(chartCandles, frame, now, feed\.quote, feed\.quoteAt\)/);
});

test('gauge is an external maintained component with animated needle, not local SVG path implementation', () => {
  const gauge = read('src/components/StrengthGauge.tsx');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['react-gauge-component'], '2.0.29');
  assert.match(gauge, /dynamic\(\(\) => import\("react-gauge-component"\)/);
  assert.match(gauge, /ssr:\s*false/);
  assert.match(gauge, /type:\s*"needle"/);
  assert.match(gauge, /animationDuration:\s*450/);
  assert.match(gauge, /value=\{value\}/);
  assert.doesNotMatch(gauge, /<svg\b/);
});

test('brand renamed to mbioTraders in visible screen, title, errors and SEO', () => {
  assert.equal(SITE_NAME, 'mbioTraders');
  assert.match(read('src/components/MarketDashboard.tsx'), /mbio<span>Traders<\/span>/);
  assert.match(read('src/app/loading.tsx'), /mbio<span>Traders<\/span>/);
  assert.match(read('src/app/error.tsx'), /mbioTraders/);
  assert.match(read('src/app/layout.tsx'), /SITE_NAME/);
  assert.ok(SITE_DESCRIPTION.includes('market signals'));
});

test('nine skeleton cards preserve exact layout locations while loading', () => {
  const skel = read('src/components/DashboardSkeleton.tsx');
  const dashboard = read('src/components/MarketDashboard.tsx');
  for(const area of ['chart','gauge','signal','align','setup','levels','tech','recent','stats'])
    assert.match(skel, new RegExp(`<Card area="${area}"`));
  assert.match(dashboard, /<DashboardSkeletonCards \/>/);
  assert.match(read('src/app/loading.tsx'), /<DashboardSkeletonCards \/>/);
  assert.match(read('src/app/globals.css'), /mbiotraders-shimmer/);
});

test('SEO page and metadata routes exist, canonical configured safely', () => {
  for(const file of ['src/app/robots.ts','src/app/sitemap.ts','src/app/opengraph-image.tsx','src/app/layout.tsx','src/lib/seo.ts'])
    assert.ok(existsSync(resolve(root,file)),file);
  const layout = read('src/app/layout.tsx');
  for(const key of ['metadataBase','openGraph','twitter','robots','canonical','keywords']) assert.ok(layout.includes(key),key);
  assert.match(read('src/app/page.tsx'), /application\/ld\+json/);
  assert.match(read('src/app/robots.ts'), /sitemap\.xml/);
  assert.match(read('src/app/sitemap.ts'), /siteOrigin\(\)/);
});

test('invalid external canonical origins are ignored', () => {
  assert.equal(siteOrigin('https://example.com/campaign'), 'https://example.com');
  assert.equal(siteOrigin('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(siteOrigin('javascript:alert(1)'), 'https://mbiotrade.vercel.app');
  assert.equal(siteOrigin('http://external.example'), 'https://mbiotrade.vercel.app');
});

test('no order execution or authenticated broker tokens introduced in signal-only release', () => {
  const dashboard=read('src/components/MarketDashboard.tsx');
  assert.doesNotMatch(dashboard, /\b(buyContract|sellContract|DERIV_API_TOKEN|placeOrder|submitPurchase)\b/);
  assert.match(dashboard, /inspectConfluence/);
  assert.match(dashboard, /MOMENTUM_WINDOWS/);
  assert.match(dashboard, /replayRecent/);
});
