import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validMeasurementId,
  reachedMilestones,
  safeEventLabel,
  safeEventParameters,
  classifyAnalyticsLink,
  trackEvent,
  ANALYTICS_OPT_OUT_KEY,
} from "../src/lib/analytics.ts";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("v35 release keeps synced npm ci lockfile and supported Node version", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.name, "mbiotraders-v35");
  assert.equal(pkg.version, "35.0.0");
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.equal(pkg.engines.node, "24.x");
});

test("Analytics Measurement IDs and event fields are validated", () => {
  assert.equal(validMeasurementId("G-ABC12345"), "G-ABC12345");
  assert.equal(validMeasurementId("G-ABC12345\"/><script>"), null);
  assert.equal(validMeasurementId("UA-123-1"), null);
  assert.equal(validMeasurementId(""), null);
  assert.equal(safeEventLabel("EURUSD"), "EURUSD");
  assert.equal(safeEventLabel("gold price=2642?token=secret"), undefined);
  assert.deepEqual(safeEventParameters({ market: "XAUUSD", direction: "BUY", fraction: 0.6, object: null, bad: "https://site.com/page?code=secret", "invalid-key": "no" }), { market: "XAUUSD", direction: "BUY", fraction: 0.6 });
});

test("one-time scroll milestones are finite and skip already sent thresholds", () => {
  assert.deepEqual(reachedMilestones(56, new Set()), [25,50]);
  assert.deepEqual(reachedMilestones(100, new Set([25,50,75])), [90,100]);
  assert.deepEqual(reachedMilestones(Number.NaN, new Set()), []);
});

test("tracked clicks never send sensitive link query strings or fragments", () => {
  assert.deepEqual(classifyAnalyticsLink("/how-signals-work?secret=123#token", "https://traders.mbiopeter.co.ke"), { kind: "internal", path: "/how-signals-work" });
  assert.deepEqual(classifyAnalyticsLink("/mbiotraders-signal-guide.pdf?secret=123", "https://traders.mbiopeter.co.ke"), { kind: "download", path: "/mbiotraders-signal-guide.pdf" });
  assert.deepEqual(classifyAnalyticsLink("https://mbiopeter.co.ke/contact?message=private", "https://traders.mbiopeter.co.ke"), { kind: "outbound", domain: "mbiopeter.co.ke" });
  assert.deepEqual(classifyAnalyticsLink("javascript:alert(1)", "https://traders.mbiopeter.co.ke"), { kind: "other" });
});

test("trackEvent queues events with a clean page URL and honors opt-out", () => {
  const id = process.env.NEXT_PUBLIC_GA_ID;
  const local = process.env.NEXT_PUBLIC_GA_TRACK_LOCAL;
  const mode = process.env.NODE_ENV;
  const previousWindow = globalThis.window;
  const seen = { disabled: false, events: [] };
  process.env.NEXT_PUBLIC_GA_ID = "G-ABCD123456";
  process.env.NEXT_PUBLIC_GA_TRACK_LOCAL = "true";
  process.env.NODE_ENV = "test";
  globalThis.window = {
    location: { origin: "https://traders.mbiopeter.co.ke" },
    localStorage: { getItem: (k) => k === ANALYTICS_OPT_OUT_KEY && seen.disabled ? "true" : "false" },
    gtag: (...args) => seen.events.push(args),
  };
  try {
    trackEvent("page_view", { page_path: "/privacy?secret=123#details", page_title: "mbiotraders" });
    assert.equal(seen.events.length, 1);
    assert.equal(seen.events[0][2].page_location, "https://traders.mbiopeter.co.ke/privacy");
    trackEvent("market_select", { market: "BTCUSD", token: "?secret=value" });
    assert.deepEqual(seen.events[1], ["event", "market_select", { market: "BTCUSD" }]);
    seen.disabled = true;
    trackEvent("ui_click", { section_name: "header" });
    assert.equal(seen.events.length, 2);
  } finally {
    if (id === undefined) delete process.env.NEXT_PUBLIC_GA_ID; else process.env.NEXT_PUBLIC_GA_ID = id;
    if (local === undefined) delete process.env.NEXT_PUBLIC_GA_TRACK_LOCAL; else process.env.NEXT_PUBLIC_GA_TRACK_LOCAL = local;
    if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test("GA4 initialized only for a valid ID and sends manual SPA pageviews", () => {
  const layout = read("src/app/layout.tsx");
  const tracker = read("src/components/AnalyticsTracker.tsx");
  assert.match(layout, /validMeasurementId|analyticsMeasurementId/);
  assert.match(layout, /googletagmanager\.com\/gtag\/js\?id=/);
  assert.match(layout, /send_page_view: false/);
  assert.match(layout, /ga-disable-/);
  assert.match(layout, /<AnalyticsTracker \/>/);
  assert.match(tracker, /trackEvent\("page_view"/);
  assert.match(tracker, /trackEvent\("ui_click"/);
  assert.match(tracker, /trackEvent\("scroll_depth"/);
  assert.match(tracker, /trackEvent\("toolbar_scroll"/);
  assert.match(tracker, /trackEvent\("section_view"/);
  assert.match(tracker, /trackEvent\("resource_download"/);
  assert.doesNotMatch(tracker, /\.textContent|\.innerText|\.value\b/);
});

test("dashboard analytics cover markets, frames, alerts, guide, export and signal state", () => {
  const dashboard = read("src/components/MarketDashboard.tsx");
  for (const event of ["market_select", "timeframe_select", "momentum_window_select", "alerts_toggle", "signal_guide_download", "history_export_csv", "signal_active_view", "market_feed_unavailable", "news_window_blocked", "signal_notification_sent"]) {
    assert.match(dashboard, new RegExp(event));
  }
  assert.match(dashboard, /data-analytics-section="signal_setup"/);
  assert.match(dashboard, /data-analytics-section="market_statistics"/);
});

test("installed PWA is entirely hidden and only shown when install is needed", () => {
  const pwa = read("src/components/PwaInstallButton.tsx");
  assert.match(pwa, /display-mode: standalone/);
  assert.match(pwa, /navigator as IosNavigator/);
  assert.match(pwa, /mbiotraders:pwa-installed/);
  assert.match(pwa, /setIsInstalled\(true\)/);
  assert.match(pwa, /if \(isInstalled !== false\) return null/);
  assert.match(pwa, /beforeinstallprompt/);
  assert.match(pwa, /appinstalled/);
  assert.match(pwa, /pwa_install_completed/);
  assert.match(pwa, /notification-sw\.js/);
});

test("mobile header keeps activity controls to the right of mbioTraders title", () => {
  const css = read("src/app/globals.css");
  const lastMedia = css.slice(css.lastIndexOf("@media (max-width: 780px)"));
  assert.match(lastMedia, /grid-template-areas:"brand alerts" "feed feed" "context context"/);
  assert.match(lastMedia, /\.mbiotraders-alert-tools \{ grid-area:alerts; justify-self:end; justify-content:flex-end; flex-wrap:nowrap/);
  assert.match(css, /\.mbiotraders-alert-label \{ display:none/);
  const source = read("src/components/MarketDashboard.tsx");
  assert.match(source, /className="mbiotraders-alert-tools"/);
  assert.match(source, /<PwaInstallButton \/>/);
  assert.match(source, /aria-label=\{audible \?/);
});

test("SEO exposes indexable methodology page, canonical sitemap and Search Console verification", () => {
  const sitemapSource = read("src/app/sitemap.ts");
  assert.match(sitemapSource, /\$\{siteOrigin\(\)\}\/how-signals-work/);
  assert.match(sitemapSource, /\$\{siteOrigin\(\)\}\//);
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /verification: verifiedToken/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /twitter/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  const article = read("src/app/how-signals-work/page.tsx");
  assert.match(article, /TechArticle/);
  assert.match(article, /60%/);
  assert.match(article, /canonical: "\/how-signals-work"/);
  assert.match(read("src/app/robots.ts"), /disallow: \["\/api\/"\]/);
  assert.match(read("src/app/privacy/page.tsx"), /index: false/);
  assert.match(read("src/components/MarketDashboard.tsx"), /href="\/how-signals-work"/);
});
