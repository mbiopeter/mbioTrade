/**
 * Optional v14 preset/migration browser regression. Run with a local dev server.
 * Every API is mocked, every external HTTP request is blocked, and all external
 * sockets are intercepted. Only local Next development sockets may connect.
 * No account credentials or financial operations are used.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const playwright = runtimeModules
  ? await import(pathToFileURL(`${runtimeModules}/playwright/index.mjs`).href)
  : await import("playwright");
const { chromium } = playwright;
const baseUrl = process.env.MBIOTRADE_TEST_URL ?? "http://127.0.0.1:3000";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Preset browser tests only run against a local test server.");
}
const screenshots =
  process.env.MBIOTRADE_TEST_SCREENSHOTS ?? join(tmpdir(), "mbiotrade-v14-presets");
await mkdir(screenshots, { recursive: true });
const prefix = "mbiotrade.v10.";
const profiles = [
  {
    id: "v14-eurusd-pullback",
    pair: "EURUSD",
    market: "forex",
    timeframe: 3600,
    atr: 1.5,
    rr: 2,
    confidence: 78,
  },
  {
    id: "v14-gbpusd-retest",
    pair: "GBPUSD",
    market: "forex",
    timeframe: 3600,
    atr: 1.8,
    rr: 2,
    confidence: 80,
  },
  {
    id: "v14-usdjpy-momentum",
    pair: "USDJPY",
    market: "forex",
    timeframe: 3600,
    atr: 1.5,
    rr: 2,
    confidence: 78,
  },
  {
    id: "v14-audusd-channel",
    pair: "AUDUSD",
    market: "forex",
    timeframe: 14400,
    atr: 2,
    rr: 2.5,
    confidence: 78,
  },
  {
    id: "v14-xauusd-pullback",
    pair: "XAUUSD",
    market: "metals",
    timeframe: 3600,
    atr: 2,
    rr: 2,
    confidence: 80,
  },
  {
    id: "v14-general-pullback",
    pair: null,
    market: null,
    timeframe: 3600,
    atr: 1.5,
    rr: 2,
    confidence: 76,
  },
];
const preferences = {
  symbol: "cryBTCUSD",
  marketClass: "cryptocurrency",
  timeframe: 900,
  executionMode: "automatic",
  automationExecutor: "worker",
  notifySignals: false,
  notifyMinConfidence: 83,
  accent: "#20e58b",
  compactSidebar: false,
  derivAppId: "PresetSmokeApp14",
  risk: {
    stake: 20,
    multiplier: 200,
    atrStop: 2.7,
    riskReward: 3.1,
    maxOpenDemoTrades: 2,
    marginBudget: 55,
    maxDailyDemoLoss: 13,
    cooldownMinutes: 17,
  },
  googleSync: { enabled: false, clientId: "", autoSync: false },
};
const legacyCombo = {
  id: "saved-v13-custom",
  name: "Saved v13 custom combination",
  strategies: [{ id: "ema-trend", enabled: true, weight: 1.3 }],
  minConfidence: 72,
  minAgreement: 1,
  createdAt: 123456,
};
const diagnostics = {
  passed: [],
  browserErrors: [],
  consoleErrors: [],
  failedRequests: [],
  blockedExternalHttp: [],
  blockedExternalSockets: [],
  unexpectedApi: [],
  financialRequests: [],
  publicConnections: 0,
  screenshots: [],
};
const pass = (message) => {
  diagnostics.passed.push(message);
  console.log(`PASS: ${message}`);
};

async function waitUntil(test, message, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await test()) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${message}`);
}

async function installMocks(context) {
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== baseUrl) {
      diagnostics.blockedExternalHttp.push(url.href);
      await route.abort("blockedbyclient");
    } else if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/news-calendar") {
        await route.fulfill({ json: { events: [], updatedAt: Date.now() } });
      } else {
        diagnostics.unexpectedApi.push(url.pathname);
        await route.fulfill({
          status: 403,
          json: { error: "Account APIs are disabled in this UI-only test." },
        });
      }
    } else {
      await route.continue();
    }
  });
  await context.routeWebSocket(/.*/, (ws) => {
    const url = new URL(ws.url());
    if (url.host === new URL(baseUrl).host && url.pathname.startsWith("/_next/")) {
      ws.connectToServer();
      return;
    }
    if (url.hostname !== "api.derivws.com" || !url.pathname.endsWith("/public")) {
      if (!["127.0.0.1", "localhost"].includes(url.hostname))
        diagnostics.blockedExternalSockets.push(url.href);
      ws.close({ code: 1000, reason: "Socket disabled by UI regression test" });
      return;
    }
    diagnostics.publicConnections += 1;
    const subscriptions = new Map();
    const prices = {
      frxEURUSD: 1.1259,
      frxGBPUSD: 1.31,
      frxUSDJPY: 149,
      frxAUDUSD: 0.66,
      frxXAUUSD: 2500,
      cryBTCUSD: 65000,
    };
    let sequence = 0;
    const send = (type, data, request, subscription) => {
      try {
        ws.send(
          JSON.stringify({
            msg_type: type,
            ...data,
            ...(request ? { req_id: request.req_id, echo_req: request } : {}),
            ...(subscription ? { subscription: { id: subscription } } : {}),
          }),
        );
      } catch {
        /* Page navigation can close a route before the last mock tick. */
      }
    };
    const timer = setInterval(() => {
      for (const [id, symbol] of subscriptions) {
        send(
          "tick",
          {
            tick: {
              symbol,
              epoch: Math.floor(Date.now() / 1000),
              quote: prices[symbol] ?? 1,
            },
          },
          undefined,
          id,
        );
      }
    }, 300);
    timer.unref();
    ws.onClose(() => clearInterval(timer));
    ws.onMessage((raw) => {
      const request = JSON.parse(String(raw));
      if (
        ["buy", "sell", "proposal", "contract_update", "authorize"].some(
          (key) => key in request,
        )
      ) {
        diagnostics.financialRequests.push(request);
        send(
          "error",
          {
            error: {
              code: "Disabled",
              message: "Financial operations are disabled in this test.",
            },
          },
          request,
        );
      } else if (request.active_symbols) {
        send(
          "active_symbols",
          {
            active_symbols: Object.keys(prices).map((symbol) => ({
              symbol,
              display_name: symbol.replace(/^(frx|cry)/, ""),
              market:
                symbol === "frxXAUUSD"
                  ? "commodities"
                  : symbol === "cryBTCUSD"
                    ? "cryptocurrency"
                    : "forex",
              exchange_is_open: 1,
            })),
          },
          request,
        );
      } else if (request.ticks_history) {
        const interval = request.granularity ?? 900;
        const lastTime = Math.floor(Date.now() / 1000 / interval) * interval;
        const price = prices[request.ticks_history] ?? 1;
        send(
          "candles",
          {
            candles:
              typeof request.end === "number"
                ? []
                : Array.from({ length: 260 }, (_, index) => {
                    const close = price * (0.98 + (index * 0.02) / 259);
                    return {
                      epoch: lastTime - (259 - index) * interval,
                      open: close - price * 0.00004,
                      close,
                      high: close + price * 0.00008,
                      low: close - price * 0.00008,
                    };
                  }),
          },
          request,
        );
      } else if (request.ticks) {
        const id = `mock-tick-${++sequence}`;
        if (request.subscribe) subscriptions.set(id, request.ticks);
        send(
          "tick",
          {
            tick: {
              symbol: request.ticks,
              epoch: Math.floor(Date.now() / 1000),
              quote: prices[request.ticks] ?? 1,
            },
          },
          request,
          id,
        );
      } else if (request.forget) {
        subscriptions.delete(request.forget);
        send("forget", { forget: request.forget }, request);
      } else {
        send("ping", { ping: "pong" }, request);
      }
    });
  });
  await context.addInitScript(() => {
    window.__presetStorageWrites = [];
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === window.localStorage && key.startsWith("mbiotrade.v10.")) {
        const current =
          key === "mbiotrade.v10.preferences"
            ? JSON.parse(value)
            : JSON.parse(localStorage.getItem("mbiotrade.v10.preferences") ?? "null");
        window.__presetStorageWrites.push({
          key,
          executionMode: current?.executionMode,
        });
      }
      return write.call(this, key, value);
    };
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => diagnostics.browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED") {
        diagnostics.failedRequests.push({
          url: request.url(),
          failure: request.failure()?.errorText,
        });
      }
    });
  });
}

async function newContext(browser, seed = null) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    serviceWorkers: "block",
    ...(seed
      ? {
          storageState: {
            cookies: [],
            origins: [
              {
                origin: baseUrl,
                localStorage: Object.entries(seed).map(([key, value]) => ({
                  name: `${prefix}${key}`,
                  value: JSON.stringify(value),
                })),
              },
            ],
          },
        }
      : {}),
  });
  await installMocks(context);
  return context;
}

const executionButton = (page, mode) =>
  page
    .getByRole("group", { name: "Execution mode", exact: true })
    .getByRole("button", { name: mode, exact: true });
const fieldInput = (page, label) =>
  page
    .locator(".field")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("input");
const applyButton = (page, profile) =>
  page.getByRole("button", {
    name: `Apply ${profile.pair ?? "general"} preset`,
    exact: true,
  });
async function stored(page, key) {
  return page.evaluate(
    (storageKey) => JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    `${prefix}${key}`,
  );
}
async function strategiesReady(page) {
  await applyButton(page, profiles[0]).waitFor();
  await waitUntil(
    () => applyButton(page, profiles[0]).isEnabled(),
    "strategy UI hydration",
  );
}
async function automaticThenStrategies(page) {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await waitUntil(
    async () =>
      (await fieldInput(page, "Margin / exposure limit").inputValue()) === "55",
    "saved settings hydration",
  );
  await executionButton(page, "Automatic").click();
  await waitUntil(
    async () => (await stored(page, "preferences")).executionMode === "automatic",
    "automatic setting stored",
  );
  await page.goto(`${baseUrl}/strategies`, { waitUntil: "domcontentloaded" });
  await strategiesReady(page);
}
async function auditNextSelection(page, action) {
  await page.evaluate(() => {
    window.__presetStorageWrites = [];
  });
  await action();
  const writes = await page.evaluate(() => window.__presetStorageWrites);
  const selectionWrites = writes.filter((write) =>
    ["preferences", "strategy-combos", "active-combo-id"].some(
      (key) => write.key === `${prefix}${key}`,
    ),
  );
  assert.equal(
    selectionWrites[0]?.key,
    `${prefix}preferences`,
    "Signals is persisted before any changed combination.",
  );
  assert.ok(selectionWrites.some((write) => write.key === `${prefix}strategy-combos`));
  assert.ok(selectionWrites.some((write) => write.key === `${prefix}active-combo-id`));
  assert.ok(
    selectionWrites.every((write) => write.executionMode === "signals"),
    "No selection write exposes Automatic with the new combo.",
  );
}
async function checkLayout(page, width, height) {
  await page.setViewportSize({ width, height });
  await strategiesReady(page);
  // The existing app shell animates its sidebar offset on viewport changes.
  await waitUntil(
    () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          [...document.querySelectorAll(".strategy-preset-card")].every(
            (card) => card.getBoundingClientRect().width > 200,
          ),
      ),
    `responsive layout settles at ${width}px`,
    5000,
  );
  const geometry = await page.evaluate(() => {
    const section = document.querySelector(".strategy-presets").getBoundingClientRect();
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      cards: [...document.querySelectorAll(".strategy-preset-card")].map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          scrollWidth: card.scrollWidth,
          clientWidth: card.clientWidth,
        };
      }),
      section: { left: section.left, right: section.right },
    };
  });
  assert.equal(geometry.cards.length, 6);
  assert.ok(
    geometry.document <= geometry.viewport + 1,
    `No horizontal page overflow at ${width}px: ${JSON.stringify(geometry)}`,
  );
  for (const card of geometry.cards) {
    assert.ok(
      card.left >= geometry.section.left - 1 &&
        card.right <= geometry.section.right + 1,
      "Every card stays inside its section.",
    );
    assert.ok(
      card.scrollWidth <= card.clientWidth + 1,
      "Card content does not overflow horizontally.",
    );
    assert.ok(card.width > 200, "Cards retain readable width.");
  }
  for (const profile of profiles)
    assert.equal(await applyButton(page, profile).count(), 1);
  pass(`Six preset cards render without horizontal overflow at ${width}×${height}.`);
}
async function screenshot(page, name, locator = null) {
  const path = join(screenshots, name);
  if (locator) await locator.screenshot({ path, animations: "disabled" });
  else await page.screenshot({ path, animations: "disabled" });
  diagnostics.screenshots.push(path);
}

const browser = await chromium.launch({
  executablePath: process.env.MBIOTRADE_TEST_BROWSER || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const fresh = await newContext(browser);
  const freshPage = await fresh.newPage();
  freshPage.setDefaultTimeout(30000);
  await freshPage.goto(`${baseUrl}/strategies`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await strategiesReady(freshPage);
  assert.equal(
    await freshPage.locator(".combo-item").count(),
    6,
    "Fresh workspaces contain six factory combinations.",
  );
  assert.equal((await stored(freshPage, "preferences")).risk.multiplier, 100);
  assert.equal((await stored(freshPage, "preferences")).executionMode, "signals");
  await checkLayout(freshPage, 1440, 1080);
  await screenshot(freshPage, "presets-desktop.png");
  await screenshot(
    freshPage,
    "presets-cards-desktop.png",
    freshPage.locator(".strategy-presets"),
  );
  await checkLayout(freshPage, 390, 844);
  await freshPage.evaluate(() => scrollTo(0, 0));
  await screenshot(freshPage, "presets-mobile-viewport.png");
  await screenshot(
    freshPage,
    "presets-mobile.png",
    freshPage.locator(".strategy-presets"),
  );
  const goldCard = freshPage.locator('[data-preset-id="v14-xauusd-pullback"]');
  await goldCard.locator("summary").click();
  assert.ok((await goldCard.locator("details[open] li").count()) >= 5);
  await checkLayout(freshPage, 390, 844);
  await screenshot(freshPage, "presets-gold-entry-rules-mobile.png", goldCard);
  pass("Fresh workspace defaults and expandable Gold entry rules are rendered.");
  await fresh.close();

  const context = await newContext(browser, {
    preferences,
    "strategy-combos": [legacyCombo],
    "active-combo-id": legacyCombo.id,
  });
  const page = await context.newPage();
  const monitor = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${baseUrl}/strategies`, { waitUntil: "domcontentloaded" });
  await strategiesReady(page);
  assert.equal(
    await page.locator(".combo-item").count(),
    7,
    "Six presets are added without losing saved combinations.",
  );
  assert.equal(
    await page.locator(".combo-item.active strong").innerText(),
    legacyCombo.name,
  );
  await monitor.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await waitUntil(
    async () =>
      (await executionButton(monitor, "Automatic").getAttribute("aria-pressed")) ===
      "true",
    "monitor initial mode",
  );
  pass("Saved v13 custom combinations and their active selection survive hydration.");
  for (const [index, profile] of profiles.entries()) {
    if (index > 0) await automaticThenStrategies(page);
    const before = await stored(page, "preferences");
    await auditNextSelection(page, () => applyButton(page, profile).click());
    const after = await stored(page, "preferences");
    assert.deepEqual(
      after,
      {
        ...before,
        executionMode: "signals",
        symbol: profile.pair ? `frx${profile.pair}` : before.symbol,
        marketClass: profile.market ?? before.marketClass,
        timeframe: profile.timeframe,
        risk: { ...before.risk, atrStop: profile.atr, riskReward: profile.rr },
      },
      "Apply only changes the disclosed settings.",
    );
    assert.equal(after.risk.stake, 20);
    assert.equal(after.risk.multiplier, 200);
    assert.equal(after.risk.marginBudget, 55);
    assert.equal(after.risk.maxDailyDemoLoss, 13);
    assert.equal(after.risk.maxOpenDemoTrades, 2);
    assert.equal(after.risk.cooldownMinutes, 17);
    const activeId = await stored(page, "active-combo-id");
    const combos = await stored(page, "strategy-combos");
    const active = combos.find((combo) => combo.id === activeId);
    assert.equal(activeId, profile.id);
    assert.equal(active.minConfidence, profile.confidence);
    assert.equal(active.minAgreement, 1);
    assert.ok(
      active.strategies.some(
        (strategy) => strategy.id === profile.id && strategy.enabled,
      ),
    );
    assert.deepEqual(
      combos.find((combo) => combo.id === legacyCombo.id),
      legacyCombo,
    );
    await waitUntil(
      async () =>
        (await executionButton(monitor, "Signals").getAttribute("aria-pressed")) ===
        "true",
      "Signals propagates to second tab",
    );
    await waitUntil(
      async () =>
        Number(await fieldInput(monitor, "ATR stop distance").inputValue()) ===
        profile.atr,
      "ATR propagates to second tab",
    );
    assert.equal(
      Number(await fieldInput(monitor, "Risk / reward").inputValue()),
      profile.rr,
    );
    assert.match(
      await page.locator(".strategy-presets-notice").innerText(),
      /select Manual or Automatic/,
    );
    assert.match(
      await page.locator(".strategy-presets-notice").innerText(),
      /export.*restart/i,
    );
    pass(
      `${profile.pair ?? "General"} Apply stores its settings atomically, pauses Signals, preserves account limits, and syncs the second tab.`,
    );
  }
  assert.equal(
    (await stored(page, "preferences")).symbol,
    "frxXAUUSD",
    "General retains the previously selected Gold market.",
  );
  assert.equal((await stored(page, "preferences")).marketClass, "metals");
  pass("General keeps the current symbol and market class.");

  const goldProfile = profiles[4];
  await applyButton(page, goldProfile).click();
  await page.locator(".builder-head input").fill("Gold test revision");
  await page.locator(".threshold-row input").first().fill("87");
  await waitUntil(
    async () =>
      (await stored(page, "strategy-combos")).find(
        (combo) => combo.id === goldProfile.id,
      )?.minConfidence === 87,
    "edited preset stored",
  );
  const beforeRestore = await stored(page, "strategy-combos");
  const edited = beforeRestore.find((combo) => combo.id === goldProfile.id);
  await auditNextSelection(page, () => applyButton(page, goldProfile).click());
  const afterRestore = await stored(page, "strategy-combos");
  assert.equal(afterRestore.length, beforeRestore.length + 1);
  const savedCopy = afterRestore.find(
    (combo) => combo.name === "Gold test revision (saved copy)",
  );
  assert.ok(savedCopy);
  assert.notEqual(savedCopy.id, goldProfile.id);
  assert.equal(savedCopy.minConfidence, 87);
  assert.deepEqual(savedCopy.strategies, edited.strategies);
  assert.equal(
    afterRestore.find((combo) => combo.id === goldProfile.id).minConfidence,
    80,
  );
  assert.match(
    await page.locator(".strategy-presets-notice").innerText(),
    /preserved as a saved copy/,
  );
  await applyButton(page, goldProfile).click();
  assert.equal(
    (await stored(page, "strategy-combos")).length,
    afterRestore.length,
    "Repeated Apply must not duplicate a canonical preset.",
  );
  pass(
    "Applying an edited factory preset preserves a custom copy and restores canonical rules once.",
  );

  await automaticThenStrategies(page);
  const goldFactory = (await stored(page, "strategy-combos")).find(
    (combo) => combo.id === goldProfile.id,
  );
  await auditNextSelection(page, () =>
    page.getByRole("button", { name: "Duplicate", exact: true }).click(),
  );
  let activeId = await stored(page, "active-combo-id");
  let active = (await stored(page, "strategy-combos")).find(
    (combo) => combo.id === activeId,
  );
  assert.notEqual(activeId, goldFactory.id);
  assert.deepEqual(active.strategies, goldFactory.strategies);
  assert.equal(active.minConfidence, goldFactory.minConfidence);
  assert.equal(
    await page.locator(".combo-item.active strong").innerText(),
    active.name,
  );
  assert.equal(
    await page.locator('[data-preset-id="v14-xauusd-pullback"].selected').count(),
    1,
  );
  assert.equal((await stored(page, "preferences")).executionMode, "signals");
  pass(
    "Duplicate atomically selects the new combination and preserves the Gold entry method and pair scope.",
  );

  await automaticThenStrategies(page);
  const beforeNew = await stored(page, "preferences");
  await auditNextSelection(page, () =>
    page.getByRole("button", { name: "New combo", exact: true }).click(),
  );
  activeId = await stored(page, "active-combo-id");
  active = (await stored(page, "strategy-combos")).find(
    (combo) => combo.id === activeId,
  );
  assert.equal(active.name, "New combination");
  assert.ok(!profiles.some((profile) => profile.id === activeId));
  assert.deepEqual(
    active.strategies
      .filter((strategy) => strategy.enabled)
      .map((strategy) => strategy.id)
      .sort(),
    ["news-guard", "v14-general-pullback"],
  );
  assert.equal(active.minConfidence, 76);
  assert.equal(active.minAgreement, 1);
  assert.equal(
    await page.locator(".combo-item.active strong").innerText(),
    active.name,
  );
  assert.deepEqual(await stored(page, "preferences"), {
    ...beforeNew,
    executionMode: "signals",
  });
  pass(
    "New combo atomically selects General trend pullback with its proper threshold and pauses Signals.",
  );
  await context.close();

  const oldPreferences = {
    ...preferences,
    automationExecutor: "browser",
    risk: { ...preferences.risk, multiplier: 20 },
  };
  const migration = await newContext(browser, { preferences: oldPreferences });
  const migrationPage = await migration.newPage();
  await migrationPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  const migrationToast = migrationPage.getByRole("button", {
    name: "Dismiss: Multiplier settings need review",
    exact: true,
  });
  await migrationToast.waitFor();
  assert.equal(await migrationToast.count(), 1);
  assert.match(await migrationToast.innerText(), /100×.*paused in Signals/);
  await waitUntil(
    async () => (await stored(migrationPage, "preferences")).risk.multiplier === 100,
    "saved multiplier migration",
  );
  assert.deepEqual(await stored(migrationPage, "preferences"), {
    ...oldPreferences,
    executionMode: "signals",
    risk: { ...oldPreferences.risk, multiplier: 100 },
  });
  assert.equal(
    await executionButton(migrationPage, "Signals").getAttribute("aria-pressed"),
    "true",
  );
  assert.deepEqual(
    await migrationPage.locator(".settings-multipliers button").allTextContents(),
    ["100×", "200×", "300×", "500×", "800×"],
  );
  await screenshot(migrationPage, "presets-multiplier-migration.png");
  await migrationPage.reload({ waitUntil: "domcontentloaded" });
  await waitUntil(
    async () =>
      (await fieldInput(migrationPage, "Margin / exposure limit").inputValue()) ===
      "55",
    "reloaded migrated settings",
  );
  assert.equal(
    await migrationToast.count(),
    0,
    "Migration notice is not repeated after persisted migration.",
  );
  assert.equal((await stored(migrationPage, "preferences")).executionMode, "signals");
  assert.equal((await stored(migrationPage, "preferences")).risk.multiplier, 100);
  pass(
    "Saved 20× Automatic settings migrate to 100× Signals with one review notice and persist safely across reload.",
  );
  await migration.close();

  const importing = await newContext(browser, { preferences });
  const importPage = await importing.newPage();
  await importPage.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await waitUntil(
    async () =>
      (await executionButton(importPage, "Automatic").getAttribute("aria-pressed")) ===
      "true",
    "import settings hydration",
  );
  const importedPreferences = {
    ...preferences,
    risk: { ...preferences.risk, multiplier: 50 },
  };
  await importPage.locator('input[type="file"]').setInputFiles({
    name: "v13-preset-test-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        version: 10,
        preferences: importedPreferences,
        combos: [legacyCombo],
        activeComboId: legacyCombo.id,
        signals: [],
        demoTrades: [],
        tradeEvents: [],
        exportedAt: Date.now(),
      }),
    ),
  });
  await importPage
    .getByRole("button", {
      name: "Dismiss: Multiplier settings need review",
      exact: true,
    })
    .waitFor();
  await importPage
    .getByRole("button", { name: "Dismiss: Local backup imported", exact: true })
    .waitFor();
  assert.deepEqual(await stored(importPage, "preferences"), {
    ...importedPreferences,
    executionMode: "signals",
    risk: { ...importedPreferences.risk, multiplier: 100 },
  });
  pass(
    "Importing a 50× Automatic workspace also pauses to 100× Signals and shows the migration notice.",
  );
  await importing.close();

  assert.deepEqual(diagnostics.browserErrors, [], "No uncaught browser exceptions.");
  assert.deepEqual(diagnostics.unexpectedApi, [], "No account API was called.");
  assert.deepEqual(
    diagnostics.financialRequests,
    [],
    "No financial request was attempted.",
  );
  assert.deepEqual(
    diagnostics.blockedExternalHttp,
    [],
    "No external HTTP access was attempted.",
  );
  assert.deepEqual(
    diagnostics.blockedExternalSockets,
    [],
    "Only fully mocked public market sockets were used.",
  );
  assert.ok(
    diagnostics.publicConnections > 0,
    "Public market feeds were exercised through mocks.",
  );
  pass(
    "Network isolation held: no account APIs, financial requests, external HTTP, or unmocked external sockets.",
  );
  console.log(`Screenshots: ${screenshots}`);
} catch (error) {
  diagnostics.failure = error instanceof Error ? error.message : String(error);
  for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page) {
      await screenshot(page, `failure-context-${index}.png`).catch(() => undefined);
    }
  }
  throw error;
} finally {
  await writeFile(
    join(screenshots, "preset-browser-results.json"),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
  );
  await browser.close();
}
