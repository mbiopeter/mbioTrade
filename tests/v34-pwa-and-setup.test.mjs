import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import vm from "node:vm";
import manifest from "../src/app/manifest.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("v34 package and lockfile match for clean installs", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.name, "mbiotraders-v34");
  assert.equal(pkg.version, "34.0.0");
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].name, pkg.name);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.deepEqual(lock.packages[""].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
  assert.equal(pkg.engines.node, "24.x");
});

test("setup displays only the larger headings and correct condition statuses", () => {
  const source = read("src/components/MarketDashboard.tsx");
  const section = source.slice(source.indexOf('<section className="mbiotraders-card mbiotraders-setup-card">'), source.indexOf('<section className="mbiotraders-card mbiotraders-levels-card">'));
  assert.ok(section.length > 700);
  assert.match(section, /setup\.criteria\.map/);
  assert.match(section, /\{criterion\.name\}/);
  assert.match(section, /\{criterion\.ok \?/);
  assert.match(section, /High-impact news window/);
  assert.match(section, /newsGuard\.allowed \? "Clear" : "Wait"/);
  assert.doesNotMatch(section, /criterion\.detail|newsGuard\.reason|<small>|activeReason/);
  assert.match(section, /Setup Status/);
  assert.match(section, /setupStatus/);
  const css = read("src/app/globals.css");
  assert.match(css, /\.mbiotraders-setup-card \.mbiotraders-check-copy strong \{[\s\S]*?font-size: 15px/);
  assert.match(css, /\.mbiotraders-setup-card \.mbiotraders-check-copy small \{ display: none; \}/);
  assert.match(css, /@media \(min-width: 1200px\) \{[\s\S]*?\.mbiotraders-setup-card \.mbiotraders-check-copy strong \{ font-size: 12\.6px/);
});

test("manifest is installable, standalone and has desktop, android and maskable icons", () => {
  const data = manifest();
  assert.equal(data.id, "/");
  assert.equal(data.start_url, "/");
  assert.equal(data.scope, "/");
  assert.equal(data.display, "standalone");
  assert.equal(data.theme_color, "#03111a");
  assert.ok(data.icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(data.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(data.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  for (const icon of [...data.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const file = new URL(`../public${icon.src}`, import.meta.url);
    const data = readFileSync(file);
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
    assert.ok(statSync(file).size > 10000);
  }
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /appleWebApp: \{ capable: true/);
  assert.match(layout, /themeColor: "#03111a"/);
});

test("desktop and mobile install button uses real user gesture or platform instructions", () => {
  const source = read("src/components/PwaInstallButton.tsx");
  const dashboard = read("src/components/MarketDashboard.tsx");
  assert.match(dashboard, /<PwaInstallButton \/>/);
  assert.match(source, /"beforeinstallprompt"/);
  assert.match(source, /await available\.prompt\(\)/);
  assert.match(source, /await available\.userChoice/);
  assert.match(source, /"appinstalled"/);
  assert.match(source, /display-mode: standalone/);
  assert.match(source, /navigator\.serviceWorker\.register\("\/notification-sw\.js"/);
  assert.match(source, /Add to Home Screen/);
  assert.match(source, /Install app/);
  assert.match(source, /Chrome or Microsoft Edge/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /window\.isSecureContext/);
  const css = read("src/app/globals.css");
  assert.match(css, /\.mbiotraders-install-button/);
  assert.match(css, /\.mbiotraders-install-dialog/);
  assert.match(css, /"brand brand" "alerts alerts" "feed feed" "context context"/);
});

test("single service worker preserves signal notifications and does not cache live APIs", async () => {
  const listeners = new Map();
  const seen = { fetches: [], cached: [], offline: false };
  const worker = read("public/notification-sw.js");
  const cache = {
    add: async (url) => seen.cached.push(url),
    put: async (url) => seen.cached.push(typeof url === "string" ? url : url.url),
  };
  const caches = {
    open: async () => cache,
    keys: async () => [],
    delete: async () => true,
    match: async (request) => {
      if (request === "/offline.html") {
        seen.offline = true;
        return new Response("offline", { status: 200 });
      }
      return null;
    },
  };
  const self = {
    location: { origin: "https://traders.mbiopeter.co.ke" },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
  };
  vm.runInNewContext(worker, { self, caches, Response, URL, fetch: async (request) => {
    const url = typeof request === "string" ? request : request.url;
    seen.fetches.push(url);
    return new Response("fresh", { status: 200 });
  } });
  for (const name of ["install", "activate", "fetch", "notificationclick"]) assert.ok(listeners.has(name), name);
  const installPromises = [];
  listeners.get("install")({ waitUntil: (p) => installPromises.push(p) });
  await Promise.all(installPromises);
  assert.ok(seen.cached.includes("/offline.html"));
  const before = seen.cached.length;
  const apiRequest = new Request("https://traders.mbiopeter.co.ke/api/market?symbol=XAUUSD");
  let intercepted = false;
  listeners.get("fetch")({ request: apiRequest, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
  assert.equal(seen.cached.length, before);
  const news = new Request("https://traders.mbiopeter.co.ke/api/news-calendar");
  listeners.get("fetch")({ request: news, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
  const navigation = { method: "GET", mode: "navigate", url: "https://traders.mbiopeter.co.ke/" };
  let result;
  listeners.get("fetch")({ request: navigation, respondWith: (p) => { result = p; } });
  assert.equal((await result).status, 200);
  assert.equal(seen.offline, false);
  assert.match(worker, /event\.notification\.close\(\)/);
  assert.match(read("src/components/browserNotifications.ts"), /showNotification\(alert\.title/);
  assert.match(read("src/components/browserNotifications.ts"), /"\/notification-sw\.js"/);
  assert.doesNotMatch(worker, /cache\.put\(.*api\/market/);
});

test("offline fallback explicitly blocks phantom live market information", () => {
  const offline = read("public/offline.html");
  assert.match(offline, /You are offline/);
  assert.match(offline, /No live signals are shown while disconnected/);
  assert.match(read("public/notification-sw.js"), /fetch\(request\)\.catch/);
  assert.match(read("public/notification-sw.js"), /url\.pathname\.startsWith\("\/api\/"\)/);
});
