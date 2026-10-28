/**
 * Optional browser integration regression. Run against `npm run dev` in another
 * terminal. Uses Playwright if installed locally or in the supplied runtime.
 * Every Deriv HTTP/WebSocket endpoint is mocked; no broker order is transmitted.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const playwright = runtimeModules
  ? await import(pathToFileURL(`${runtimeModules}/playwright/index.mjs`).href)
  : await import("playwright");
const { chromium } = playwright;
const baseUrl = process.env.MBIOTRADE_TEST_URL ?? "http://127.0.0.1:3000";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) {
  throw new Error("Browser smoke tests only run against a local test server.");
}
const credentials = {
  appId: "SmokeApp10",
  token: "MOCK_TOKEN_NOT_A_REAL_DERIV_SECRET",
  accountId: "VRTC1001",
  accountMode: "demo",
  rememberSession: true,
};
const browserErrors = [];
const connections = new Set();
const contracts = new Map();
const proposals = new Map();
const activities = [];
const candleIntervals = [];
let nextContract = 9000;
let buys = 0;
let sells = 0;
const protectionUpdates = [];
let sequence = 0;
let historyUnavailable = false;
let quotePriceOverride = null;
let availableBalance = 10000;
const currentEpoch = () => Math.floor(Date.now() / 1000);
const marketPrice = 1.1259;
const accountKey = (mode, accountId) => `${mode}:${accountId}`;
const currentContracts = (key) =>
  [...contracts.values()].filter((contract) => contract.accountKey === key);
function send(connection, type, data = {}, request, subscription) {
  try {
    connection.ws.send(
      JSON.stringify({
        msg_type: type,
        ...data,
        ...(request ? { req_id: request.req_id, echo_req: request } : {}),
        ...(subscription ? { subscription: { id: subscription } } : {}),
      }),
    );
  } catch {
    /* A route can close between an account event and delivery. */
  }
}
function broadcast(contract, action) {
  const transaction = {
    transaction_id: `tx-${++sequence}`,
    action,
    contract_id: contract.contract_id,
    symbol: contract.underlying_symbol,
    amount: action === "buy" ? -contract.buy_price : contract.sell_price,
    transaction_time: currentEpoch(),
    accountKey: contract.accountKey,
  };
  if (action) activities.push(transaction);
  for (const connection of connections) {
    if (connection.key !== contract.accountKey) continue;
    for (const subscription of connection.subscriptions) {
      if (subscription.type === "proposal_open_contract") {
        send(
          connection,
          "proposal_open_contract",
          { proposal_open_contract: contract },
          undefined,
          subscription.id,
        );
      }
      if (action && subscription.type === "transaction") {
        send(connection, "transaction", { transaction }, undefined, subscription.id);
      }
    }
  }
}
function openContract(key, overrides = {}) {
  const contract = {
    contract_id: ++nextContract,
    accountKey: key,
    contract_type: "MULTUP",
    underlying_symbol: "frxEURUSD",
    buy_price: 20,
    bid_price: 23.25,
    profit: 3.25,
    profit_percentage: 16.25,
    entry_spot: marketPrice,
    current_spot: marketPrice,
    multiplier: 100,
    commission: "0.10",
    currency: "USD",
    purchase_time: currentEpoch(),
    date_start: currentEpoch(),
    status: "open",
    is_sold: 0,
    is_valid_to_sell: 1,
    shortcode: "MULTUP_frxEURUSD_USD_20_100_0",
    limit_order: { stop_loss: { order_amount: 10 }, take_profit: { order_amount: 15 } },
    ...overrides,
  };
  contracts.set(contract.contract_id, contract);
  broadcast(contract, "buy");
  return contract;
}
function closeContract(id, soldFor = 25) {
  const contract = contracts.get(id);
  assert.ok(contract, "mock broker contract exists");
  Object.assign(contract, {
    is_sold: 1,
    is_valid_to_sell: 0,
    status: "sold",
    sell_price: soldFor,
    profit: soldFor - contract.buy_price,
    sell_time: currentEpoch(),
  });
  broadcast(contract, "sell");
}
async function installMocks(context, { otpFailures = 0, marketFailures = 0 } = {}) {
  const diagnostics = { otpAttempts: 0, marketConnections: 0 };
  await context.route("**/api/deriv/accounts", (route) =>
    route.fulfill({
      json: {
        accounts: [
          { accountId: "VRTC1001", currency: "USD", isDemo: true },
          { accountId: "CR1001", currency: "USD", isDemo: false },
        ],
      },
    }),
  );
  await context.route("**/api/deriv/otp", async (route) => {
    diagnostics.otpAttempts += 1;
    if (otpFailures > 0) {
      otpFailures -= 1;
      await route.fulfill({
        status: 503,
        json: { error: "Mock temporary connection failure" },
      });
      return;
    }
    const body = route.request().postDataJSON();
    await route.fulfill({
      json: {
        url: `wss://api.derivws.com/trading/v1/options/ws/${body.mode}?mockAccount=${body.accountId}`,
      },
    });
  });
  await context.route("**/api/news-calendar", (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  // Public and authenticated channels are fully mocked. No connectToServer is used.
  await context.routeWebSocket(/wss:\/\/api\.derivws\.com\//, (ws) => {
    const url = new URL(ws.url());
    const mode = url.pathname.split("/").at(-1);
    if (mode === "public") {
      diagnostics.marketConnections += 1;
      if (marketFailures > 0) {
        marketFailures -= 1;
        ws.close({ code: 1011, reason: "Mock temporary market connection failure" });
        return;
      }
    }
    const connection = {
      ws,
      context,
      key: accountKey(mode, url.searchParams.get("mockAccount")),
      subscriptions: [],
    };
    connections.add(connection);
    const tickTimer = setInterval(() => {
      for (const subscription of connection.subscriptions) {
        if (subscription.type === "tick") {
          send(
            connection,
            "tick",
            {
              tick: { symbol: "frxEURUSD", epoch: currentEpoch(), quote: marketPrice },
            },
            undefined,
            subscription.id,
          );
        }
      }
    }, 250);
    tickTimer.unref();
    ws.onClose(() => {
      clearInterval(tickTimer);
      connections.delete(connection);
    });
    ws.onMessage((raw) => {
      const request = JSON.parse(String(raw));
      const type = request.active_symbols
        ? "active_symbols"
        : request.ticks_history
          ? "candles"
          : request.ticks
            ? "tick"
            : request.contract_update
              ? "contract_update"
              : request.proposal_open_contract
                ? "proposal_open_contract"
                : request.profit_table
                  ? "profit_table"
                  : request.statement
                    ? "statement"
                    : request.transaction
                      ? "transaction"
                      : request.portfolio
                        ? "portfolio"
                        : request.balance
                          ? "balance"
                          : request.proposal
                            ? "proposal"
                            : request.buy
                              ? "buy"
                              : request.sell
                                ? "sell"
                                : request.forget
                                  ? "forget"
                                  : "ping";
      if (
        historyUnavailable &&
        type === "statement" &&
        request.action_type === "sell"
      ) {
        send(
          connection,
          "statement",
          {
            error: {
              code: "ServiceUnavailable",
              message: "Mock history temporarily unavailable",
            },
          },
          request,
        );
        return;
      }
      const subscription = request.subscribe ? `sub-${++sequence}` : undefined;
      if (subscription) connection.subscriptions.push({ type, id: subscription });
      let data = {};
      if (type === "active_symbols")
        data = {
          active_symbols: [
            {
              symbol: "frxEURUSD",
              display_name: "EUR/USD",
              market: "forex",
              exchange_is_open: 1,
            },
          ],
        };
      if (type === "candles") {
        const interval = request.granularity ?? 900;
        candleIntervals.push(interval);
        const lastTime = Math.floor(currentEpoch() / interval) * interval;
        data = {
          candles:
            typeof request.end === "number"
              ? []
              : Array.from({ length: 260 }, (_, index) => ({
                  epoch: lastTime - (259 - index) * interval,
                  open: 1.1 + index * 0.0001 - 0.00004,
                  close: 1.1 + index * 0.0001,
                  high: 1.1 + index * 0.0001 + 0.00008,
                  low: 1.1 + index * 0.0001 - 0.00008,
                })),
        };
      }
      if (type === "tick")
        data = {
          tick: { symbol: "frxEURUSD", epoch: currentEpoch(), quote: marketPrice },
        };
      if (type === "balance")
        data = { balance: { balance: availableBalance, currency: "USD" } };
      if (type === "portfolio")
        data = {
          portfolio: {
            contracts: currentContracts(connection.key).filter(
              (contract) => !contract.is_sold,
            ),
          },
        };
      if (type === "proposal_open_contract") {
        const contract = request.contract_id
          ? contracts.get(Number(request.contract_id))
          : currentContracts(connection.key).find((item) => !item.is_sold);
        data = contract ? { proposal_open_contract: contract } : {};
      }
      if (type === "profit_table")
        data = {
          profit_table: {
            transactions: currentContracts(connection.key)
              .filter(
                (contract) =>
                  contract.is_sold &&
                  (request.date_from === undefined ||
                    contract.sell_time >= Number(request.date_from)),
              )
              .slice(request.offset ?? 0, (request.offset ?? 0) + request.limit),
          },
        };
      if (type === "statement")
        data = {
          statement: {
            transactions: activities
              .filter(
                (item) =>
                  item.accountKey === connection.key &&
                  (!request.action_type || item.action === request.action_type) &&
                  (request.date_from === undefined ||
                    item.transaction_time >= Number(request.date_from)) &&
                  (request.date_to === undefined ||
                    item.transaction_time <= Number(request.date_to)),
              )
              .slice()
              .reverse()
              .slice(
                request.offset ?? 0,
                (request.offset ?? 0) + (request.limit ?? 100),
              ),
          },
        };
      if (type === "proposal") {
        const id = `proposal-${++sequence}`;
        proposals.set(id, request);
        data = {
          proposal: {
            id,
            ask_price: quotePriceOverride ?? request.amount,
            spot: marketPrice,
          },
        };
      }
      if (type === "buy") {
        const proposal = proposals.get(request.buy);
        assert.ok(proposal, "buy requires a valid mock proposal");
        const direction = proposal.contract_type === "MULTUP" ? 1 : -1;
        const exposure = proposal.amount * proposal.multiplier;
        const commission = 0.01;
        const contract = openContract(connection.key, {
          contract_type: proposal.contract_type,
          buy_price: proposal.amount,
          commission: String(commission),
          multiplier: proposal.multiplier,
          underlying_symbol: proposal.underlying_symbol,
          limit_order: {
            stop_loss: {
              order_amount: proposal.limit_order.stop_loss,
              value: String(
                marketPrice *
                  (1 +
                    (direction * (commission - proposal.limit_order.stop_loss)) /
                      exposure),
              ),
            },
            take_profit: {
              order_amount: proposal.limit_order.take_profit,
              value: String(
                marketPrice *
                  (1 +
                    (direction * (commission + proposal.limit_order.take_profit)) /
                      exposure),
              ),
            },
          },
        });
        buys += 1;
        data = {
          buy: {
            contract_id: contract.contract_id,
            start_time: contract.purchase_time,
            start_spot: marketPrice,
            buy_price: contract.buy_price,
          },
        };
      }
      if (type === "contract_update") {
        const contract = contracts.get(Number(request.contract_id));
        if (!contract || contract.accountKey !== connection.key || contract.is_sold) {
          send(
            connection,
            type,
            {
              error: {
                code: "InvalidContract",
                message: "Contract is not open on this account.",
              },
            },
            request,
          );
          return;
        }
        protectionUpdates.push({
          contractId: contract.contract_id,
          ...request.limit_order,
        });
        const direction = contract.contract_type === "MULTUP" ? 1 : -1;
        const exposure = contract.buy_price * contract.multiplier;
        const commission = Number(contract.commission ?? 0);
        for (const [key, amount] of Object.entries(request.limit_order)) {
          const netProfit = key === "stop_loss" ? -Number(amount) : Number(amount);
          contract.limit_order[key] = {
            order_amount: key === "stop_loss" ? -Number(amount) : Number(amount),
            value: String(
              contract.entry_spot *
                (1 + (direction * (netProfit + commission)) / exposure),
            ),
          };
        }
        data = {
          contract_update: {
            contract_id: contract.contract_id,
            ...contract.limit_order,
          },
        };
        broadcast(contract);
      }
      if (type === "sell") {
        closeContract(Number(request.sell), 24);
        sells += 1;
        data = { sell: { sold_for: 24 } };
      }
      if (type === "forget")
        connection.subscriptions = connection.subscriptions.filter(
          (item) => item.id !== request.forget,
        );
      send(connection, type, data, request, subscription);
    });
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => browserErrors.push(error.message)),
  );
  return diagnostics;
}
async function waitUntil(test, message, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await test()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${message}`);
}
async function connectWithSettings(page) {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => localStorage.getItem("mbiotrade.v10.preferences") !== null,
  );
  await page.getByPlaceholder("34N5mW67NQ9BRFoBF2UdF").fill(credentials.appId);
  await page.getByPlaceholder("Paste API key").fill(credentials.token);
  await waitUntil(async () => {
    const enabled = await page
      .getByRole("button", { name: "Discover accounts", exact: true })
      .isEnabled();
    if (!enabled) {
      await page.getByPlaceholder("34N5mW67NQ9BRFoBF2UdF").fill(credentials.appId);
      await page.getByPlaceholder("Paste API key").fill(credentials.token);
    }
    return enabled;
  }, "settings hydrated and ready to discover accounts");
  await page.getByRole("button", { name: "Discover accounts", exact: true }).click();
  await page.locator(".selected-account").filter({ hasText: "VRTC1001" }).waitFor();
  await page
    .getByRole("button", { name: "Connect selected account", exact: true })
    .click();
  try {
    await page
      .getByText("Deriv connected. Account positions are synchronized.", {
        exact: true,
      })
      .waitFor({ timeout: 15000 });
  } catch (error) {
    console.error(
      "Connection diagnostics:",
      await page.locator(".deriv-settings").innerText(),
    );
    console.error("Browser exceptions:", browserErrors);
    throw error;
  }
}

async function assertChartPosition(
  page,
  { direction = "LONG", entryPrice = marketPrice, estimated = false } = {},
) {
  const overlay = page.locator(".tv-position");
  await overlay.waitFor({ state: "visible" });
  await waitUntil(
    async () =>
      (await overlay.locator(".tv-entry").innerText()).includes(
        `${direction} · Entry ${entryPrice.toFixed(5)}`,
      ) && (await overlay.locator(".tv-live-pnl").innerText()).includes("+3.25 USD"),
    `${direction} chart entry and broker P/L are restored`,
  );
  assert.equal(await overlay.count(), 1, "the current open position is drawn once");
  assert.equal(await overlay.locator(".tv-label.tp").count(), 1);
  assert.equal(await overlay.locator(".tv-label.sl").count(), 1);
  assert.equal(
    await overlay.locator(".tv-zone").count(),
    2,
    "the restored position includes both target and risk rectangles",
  );
  if (estimated) assert.match(await overlay.locator(".tv-label.tp").innerText(), /≈/);
  const entry = await overlay.locator(".tv-entry").boundingBox();
  const chart = await page.locator(".market-chart-wrap").boundingBox();
  assert.ok(entry && chart, "the chart and position entry have renderable geometry");
  assert.ok(
    entry.y >= chart.y && entry.y <= chart.y + chart.height,
    "entry line is drawn inside the chart price area",
  );
  const annotationBoxes = [];
  for (const selector of [
    ".tv-entry span",
    ".tv-label.tp",
    ".tv-label.sl",
    ".tv-live-pnl",
  ]) {
    const box = await overlay.locator(selector).boundingBox();
    assert.ok(box, `${selector} has a visible annotation`);
    assert.ok(
      box.y >= chart.y && box.y + box.height <= chart.y + chart.height,
      `${selector} is within the chart`,
    );
    for (const previous of annotationBoxes) {
      const overlaps =
        Math.min(box.x + box.width, previous.box.x + previous.box.width) >
          Math.max(box.x, previous.box.x) + 1 &&
        Math.min(box.y + box.height, previous.box.y + previous.box.height) >
          Math.max(box.y, previous.box.y) + 1;
      assert.equal(overlaps, false, `${selector} does not cover ${previous.selector}`);
    }
    annotationBoxes.push({ selector, box });
  }
  const overlayBox = await overlay.boundingBox();
  assert.ok(overlayBox.width >= 145, "the position box has room for readable labels");
  for (const selector of [".tv-zone.target", ".tv-zone.risk"]) {
    const zone = await overlay.locator(selector).boundingBox();
    assert.ok(zone && zone.height > 1, `${selector} is drawn with nonzero height`);
    assert.ok(
      zone.y >= chart.y - 1 && zone.y + zone.height <= chart.y + chart.height + 1,
      `${selector} remains inside the chart price area`,
    );
  }
}

async function assertEntryTracksPriceScale(page) {
  // The mock entry equals the current price. Read the underlying canvas price
  // line rather than text badges, which deliberately move to avoid collisions.
  await waitUntil(async () => {
    const renderedPriceY = await page.locator(".market-chart").evaluate((container) => {
      let strongest = null;
      for (const canvas of container.querySelectorAll("canvas")) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 150) continue;
        const context = canvas.getContext("2d");
        if (!context) continue;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let y = 10; y < canvas.height - 10; y++) {
          let matches = 0;
          for (let x = 2; x < canvas.width * 0.8; x += 2) {
            const i = (y * canvas.width + x) * 4;
            if (
              pixels[i + 3] > 100 &&
              pixels[i + 1] > 160 &&
              pixels[i + 1] > pixels[i] * 1.8 &&
              pixels[i + 1] > pixels[i + 2] * 1.15
            ) {
              matches++;
            }
          }
          if (matches > 40 && (!strongest || matches > strongest.matches)) {
            strongest = {
              matches,
              y: rect.y + ((y + 0.5) * rect.height) / canvas.height,
            };
          }
        }
      }
      return strongest?.y ?? null;
    });
    const line = await page.locator(".tv-entry").boundingBox();
    return line && renderedPriceY !== null && Math.abs(line.y - renderedPriceY) <= 2;
  }, "position entry aligns with the rendered price scale after layout changes");
}

const browser = await chromium.launch({
  executablePath: process.env.MBIOTRADE_TEST_BROWSER || undefined,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context1 = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const firstConnection = await installMocks(context1, {
    otpFailures: 1,
    marketFailures: 1,
  });
  const page1 = await context1.newPage();
  await connectWithSettings(page1);
  assert.ok(
    firstConnection.otpAttempts >= 2,
    "failed initial authentication retries without another click",
  );
  console.log("PASS: initial connection failure automatically retries and connects.");
  await page1
    .getByRole("group", { name: "Execution mode", exact: true })
    .getByRole("button", { name: "Manual", exact: true })
    .click();
  await page1.goto(`${baseUrl}/terminal`);
  const multiplierButtons = page1.locator(".multiplier-grid button");
  assert.equal(
    await multiplierButtons.count(),
    5,
    "five multiplier choices are rendered",
  );
  await page1
    .locator(".multiplier-grid")
    .getByRole("button", { name: "100×", exact: true })
    .click();
  const execute = page1.locator(".execute-btn");
  await waitUntil(
    () => execute.isEnabled(),
    "manual order enabled after broker and market sync",
  );
  assert.ok(
    firstConnection.marketConnections >= 2,
    "failed market connection also retries",
  );
  await page1
    .getByRole("group", { name: "Direction", exact: true })
    .getByRole("button", { name: "Sell / Short", exact: true })
    .click();
  assert.equal(
    await execute.isEnabled(),
    false,
    "countertrend manual entry is blocked",
  );
  await page1.getByText(/Confirmed uptrend: select Buy \/ Long/).waitFor();
  await page1
    .getByRole("group", { name: "Direction", exact: true })
    .getByRole("button", { name: "Buy / Long", exact: true })
    .click();
  await waitUntil(() => execute.isEnabled(), "trend-aligned manual entry is restored");
  quotePriceOverride = 25;
  await execute.click();
  await page1
    .locator(".toast.error")
    .filter({ hasText: /require 25\.00 USD/ })
    .waitFor();
  assert.equal(buys, 0, "an order above the selected amount never reaches buy");
  assert.match(await page1.locator(".toast.error").last().innerText(), /20\.00 USD/);
  assert.match(
    await page1.locator(".toast.error").last().innerText(),
    /5\.00 USD short/,
  );
  quotePriceOverride = null;
  availableBalance = 12;
  await waitUntil(() => execute.isEnabled(), "ticket ready after amount rejection");
  await execute.click();
  await page1
    .locator(".toast.error")
    .filter({ hasText: /available: 12\.00 USD/ })
    .waitFor();
  assert.equal(buys, 0, "insufficient account balance never reaches buy");
  assert.match(
    await page1.locator(".toast.error").last().innerText(),
    /shortfall: 8\.00 USD/,
  );
  availableBalance = 10000;
  console.log(
    "PASS: insufficient selected amount and account balance reject with required amount and shortfall; zero buys",
  );
  await waitUntil(() => execute.isEnabled(), "ticket ready after balance rejection");
  await execute.click();
  await waitUntil(() => buys === 1, "manual order reached mock broker");
  await page1.getByText("Trade opened successfully", { exact: true }).waitFor();
  const firstId = nextContract;
  console.log("Manual buy confirmed:", firstId);
  assert.equal(
    contracts.get(firstId).multiplier,
    100,
    "minimum supported ticket multiplier reaches the broker proposal unchanged",
  );
  assert.ok(contracts.get(firstId)?.limit_order.stop_loss.order_amount > 0);
  assert.ok(contracts.get(firstId)?.limit_order.take_profit.order_amount > 0);
  await assertChartPosition(page1);
  console.log(
    "PASS: the originating browser retains the entry, TP/SL and live P/L overlay",
  );

  const context2 = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const secondConnection = await installMocks(context2);
  const page2 = await context2.newPage();
  await page2.goto(`${baseUrl}/settings`);
  assert.equal(
    await page2.evaluate(() => localStorage.getItem("mbiotrade.v10.credentials")),
    null,
    "second device has no credential or trade cache",
  );
  await connectWithSettings(page2);
  await page2.goto(`${baseUrl}/portfolio`);
  await page2.getByText(String(firstId), { exact: true }).waitFor();
  await page2.getByText("Live P/L +3.25 USD", { exact: true }).waitFor();
  assert.equal(await page2.locator(".demo-row").count(), 1);
  assert.match(await page2.locator(".demo-row").innerText(), /Deriv \/ another device/);
  console.log(
    "PASS: trade opened on device 1 restored with live broker P/L on device 2",
  );

  await page2.goto(`${baseUrl}/terminal`);
  await assertChartPosition(page2);
  assert.equal(
    await page2.locator(".tv-label.tp").innerText(),
    await page1.locator(".tv-label.tp").innerText(),
  );
  assert.equal(
    await page2.locator(".tv-label.sl").innerText(),
    await page1.locator(".tv-label.sl").innerText(),
  );
  await page2.getByRole("button", { name: "Open trades (1)", exact: true }).click();
  const editor2 = page2.locator(
    `.position-protection-editor[data-contract-id="${firstId}"]`,
  );
  await editor2.getByRole("button", { name: "Edit SL / TP", exact: true }).click();
  const originalStop = contracts.get(firstId).limit_order.stop_loss.order_amount;
  await editor2
    .getByRole("spinbutton", { name: "Take profit (USD)", exact: true })
    .fill("0.80");
  await assertEntryTracksPriceScale(page2);
  await page2.screenshot({
    path: join(tmpdir(), "mbiotrade-v13-protection-editor-smoke.png"),
    fullPage: true,
  });
  await editor2.getByRole("button", { name: "Save changes", exact: true }).click();
  await waitUntil(
    () => protectionUpdates.length === 1,
    "restored device updates broker TP",
  );
  await editor2.getByText("SL / TP updated on Deriv.", { exact: true }).waitFor();
  await assertEntryTracksPriceScale(page2);
  assert.equal(protectionUpdates[0].take_profit, 0.8);
  assert.equal(
    protectionUpdates[0].stop_loss,
    undefined,
    "changing TP leaves SL out of the update",
  );
  assert.equal(contracts.get(firstId).limit_order.stop_loss.order_amount, originalStop);
  await waitUntil(
    async () =>
      (await page1.locator(".tv-label.tp").innerText()).includes(
        Number(contracts.get(firstId).limit_order.take_profit.value).toFixed(5),
      ),
    "updated TP reaches originating chart",
  );
  await page1.getByRole("button", { name: "Open trades (1)", exact: true }).click();
  const editor1 = page1.locator(
    `.position-protection-editor[data-contract-id="${firstId}"]`,
  );
  await editor1.getByRole("button", { name: "Edit SL / TP", exact: true }).click();
  await editor1
    .getByRole("spinbutton", { name: "Stop loss (USD)", exact: true })
    .fill("0.40");
  await editor1.getByRole("button", { name: "Save changes", exact: true }).click();
  await waitUntil(
    () => protectionUpdates.length === 2,
    "original device updates broker SL",
  );
  await editor1.getByText("SL / TP updated on Deriv.", { exact: true }).waitFor();
  assert.equal(protectionUpdates[1].stop_loss, 0.4);
  assert.equal(
    protectionUpdates[1].take_profit,
    undefined,
    "changing SL does not overwrite updated TP",
  );
  await waitUntil(
    async () =>
      (await page2.locator(".tv-label.sl").innerText()).includes(
        Number(contracts.get(firstId).limit_order.stop_loss.value).toFixed(5),
      ),
    "updated SL reaches restored chart",
  );
  await assertEntryTracksPriceScale(page1);
  await assertEntryTracksPriceScale(page2);
  await assertChartPosition(page1);
  await assertChartPosition(page2);
  assert.equal(
    await page1.locator(".tv-label.tp").innerText(),
    await page2.locator(".tv-label.tp").innerText(),
  );
  assert.equal(
    await page1.locator(".tv-label.sl").innerText(),
    await page2.locator(".tv-label.sl").innerText(),
  );
  assert.equal(buys, 1, "protection edits never open another position");
  assert.equal(sells, 0, "protection edits do not close the position");
  console.log(
    "PASS: 100x multiplier and broker SL/TP editing on both devices, partial updates and full chart reconciliation",
  );
  const priorOtpAttempts = secondConnection.otpAttempts;
  for (const connection of [...connections]) {
    if (connection.context === context2 && connection.key === "demo:VRTC1001") {
      connection.ws.close({ code: 1011, reason: "Mock account connection lost" });
    }
  }
  await waitUntil(
    () => secondConnection.otpAttempts > priorOtpAttempts,
    "interrupted session requests a fresh OTP",
  );
  await assertChartPosition(page2);
  assert.equal(buys, 1, "reconnection does not replay the previous purchase");
  await page2.reload();
  await assertChartPosition(page2);
  const priorFiveMinuteRequests = candleIntervals.filter(
    (interval) => interval === 300,
  ).length;
  await page2
    .locator('[aria-label="Chart timeframe"]')
    .getByRole("button", {
      name: "5m",
      exact: true,
    })
    .click();
  await waitUntil(
    () =>
      candleIntervals.filter((interval) => interval === 300).length >
      priorFiveMinuteRequests,
    "second browser requests fresh five-minute chart data",
  );
  await assertChartPosition(page2);
  await page2.screenshot({
    path: join(tmpdir(), "mbiotrade-v13-restored-position-smoke.png"),
    fullPage: true,
  });
  console.log(
    "PASS: full long position box matches both browsers and survives reconnect, reload and timeframe change",
  );

  closeContract(firstId, 25);
  await waitUntil(
    async () =>
      (await page1.locator(".tv-position").count()) === 0 &&
      (await page2.locator(".tv-position").count()) === 0,
    "external closure removes the chart position from both browsers",
  );
  await page2.goto(`${baseUrl}/portfolio`);
  await page2.getByText("Realized P/L +5.00 USD", { exact: true }).waitFor();
  await waitUntil(
    () =>
      page2
        .getByRole("button", { name: "Close position", exact: true })
        .count()
        .then((n) => n === 0),
    "external sell removes close button on device 2",
  );
  await page1.getByRole("button", { name: "Open trades (0)", exact: true }).waitFor();
  console.log("PASS: external Deriv sale closes on both devices");

  historyUnavailable = true;
  const olderEntryPrice = marketPrice * 1.02;
  const external = openContract("demo:VRTC1001", {
    contract_type: "MULTDOWN",
    shortcode: "MULTDOWN_frxEURUSD_USD_20_100_0",
    purchase_time: currentEpoch() - 3 * 86400,
    date_start: currentEpoch() - 3 * 86400,
    entry_spot: olderEntryPrice,
  });
  await assertChartPosition(page1, {
    direction: "SHORT",
    entryPrice: olderEntryPrice,
    estimated: true,
  });
  console.log(
    "PASS: older external short restores the full risk/target drawing with labelled cash-derived estimates",
  );
  await page2.getByText(String(external.contract_id), { exact: true }).waitFor();
  await page2
    .locator(".inline-alert.warn")
    .filter({ hasText: "Mock history temporarily unavailable" })
    .waitFor();
  const externalRow = page2.locator(".demo-row").filter({ hasText: "Live P/L" });
  assert.equal(
    await externalRow
      .getByRole("button", { name: "Close position", exact: true })
      .isEnabled(),
    true,
    "history outage must not block closing a verified position",
  );
  const portfolioEditor = externalRow.locator(".position-protection-editor");
  await portfolioEditor
    .getByRole("button", { name: "Edit SL / TP", exact: true })
    .click();
  await portfolioEditor
    .getByRole("spinbutton", { name: "Stop loss (USD)", exact: true })
    .fill("8.00");
  await portfolioEditor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await waitUntil(
    () => protectionUpdates.length === 3,
    "portfolio allows a protective edit during a history outage",
  );
  await portfolioEditor
    .getByText("SL / TP updated on Deriv.", { exact: true })
    .waitFor();
  assert.equal(protectionUpdates[2].contractId, external.contract_id);
  assert.equal(protectionUpdates[2].stop_loss, 8);
  await waitUntil(
    async () =>
      (await page1.locator(".tv-label.sl").innerText()).includes(
        Number(contracts.get(external.contract_id).limit_order.stop_loss.value).toFixed(
          5,
        ),
      ),
    "short SL edit reaches other browser chart",
  );
  console.log(
    "PASS: Portfolio adjusts an external short during history outage, without requiring a new-entry sync",
  );
  await externalRow
    .getByRole("button", { name: "Close position", exact: true })
    .click();
  await waitUntil(
    () => sells === 1 && contracts.get(external.contract_id).is_sold === 1,
    "app close sells actual broker contract",
  );
  historyUnavailable = false;
  await page2.getByText("Realized P/L +4.00 USD", { exact: true }).waitFor();
  await page1.getByRole("button", { name: "Open trades (0)", exact: true }).waitFor();
  assert.equal(await page1.locator(".tv-position").count(), 0);
  console.log(
    "PASS: app sale during history outage changes broker contract and synchronizes all devices",
  );

  await page2.goto(`${baseUrl}/settings`);
  await page2.reload();
  await page2
    .getByText("Deriv connected. Account positions are synchronized.", { exact: true })
    .waitFor();
  assert.equal(
    await page2.getByPlaceholder("Paste API key").inputValue(),
    credentials.token,
  );
  await page2.getByRole("button", { name: "Disconnect", exact: true }).click();
  assert.ok(
    await page2.evaluate(() => localStorage.getItem("mbiotrade.v10.credentials")),
    "disconnect retains saved key",
  );
  await page2.getByRole("button", { name: "Forget saved key", exact: true }).click();
  assert.equal(await page2.getByPlaceholder("Paste API key").inputValue(), "");
  assert.equal(
    await page2.evaluate(() => localStorage.getItem("mbiotrade.v10.credentials")),
    null,
  );
  console.log(
    "PASS: API key survives reload/disconnect and explicit Forget removes it",
  );

  const cancelledContext = await browser.newContext();
  const cancelledConnection = await installMocks(cancelledContext, {
    otpFailures: 100,
  });
  await cancelledContext.addInitScript((saved) => {
    if (location.protocol === "http:" || location.protocol === "https:") {
      localStorage.setItem("mbiotrade.v10.credentials", JSON.stringify(saved));
    }
  }, credentials);
  const cancelledPage = await cancelledContext.newPage();
  await cancelledPage.goto(`${baseUrl}/settings`);
  await waitUntil(
    () => cancelledConnection.otpAttempts >= 1,
    "saved account starts a failed connection attempt",
  );
  await cancelledPage.getByRole("button", { name: "Disconnect", exact: true }).click();
  const attemptsAfterDisconnect = cancelledConnection.otpAttempts;
  await new Promise((resolve) => setTimeout(resolve, 1800));
  assert.equal(
    cancelledConnection.otpAttempts,
    attemptsAfterDisconnect,
    "explicit Disconnect cancels scheduled failed-connection retries",
  );
  await cancelledContext.close();
  console.log(
    "PASS: Disconnect cancels retry attempts without forgetting the saved key",
  );

  // Automatic execution is tested on both account modes from a non-terminal
  // page. No order button or per-trade confirmation is clicked.
  for (const accountMode of ["demo", "real"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await installMocks(context);
    await context.addInitScript(
      ({ saved, mode }) => {
        if (location.protocol !== "http:" && location.protocol !== "https:") return;
        localStorage.setItem(
          "mbiotrade.v10.credentials",
          JSON.stringify({
            ...saved,
            accountMode: mode,
            accountId: mode === "demo" ? "VRTC1001" : "CR1001",
          }),
        );
        localStorage.setItem(
          "mbiotrade.v10.preferences",
          JSON.stringify({
            executionMode: "automatic",
            automationExecutor: "browser",
            symbol: "frxEURUSD",
            timeframe: 900,
            risk: {
              stake: 20,
              multiplier: 100,
              maxOpenDemoTrades: 1,
              cooldownMinutes: 0,
              marginBudget: 75,
              maxDailyDemoLoss: 25,
            },
          }),
        );
        localStorage.setItem(
          "mbiotrade.v10.strategy-combos",
          JSON.stringify([
            {
              id: "smoke-trend",
              name: "Smoke trend",
              minConfidence: 50,
              minAgreement: 1,
              strategies: [{ id: "ema-trend", enabled: true, weight: 1 }],
              createdAt: 0,
            },
          ]),
        );
        localStorage.setItem(
          "mbiotrade.v10.active-combo-id",
          JSON.stringify("smoke-trend"),
        );
      },
      { saved: credentials, mode: accountMode },
    );
    const page = await context.newPage();
    const priorBuys = buys;
    await page.goto(`${baseUrl}/portfolio`);
    await waitUntil(
      () => buys === priorBuys + 1,
      `${accountMode} automatic execution without a manual action`,
      30000,
    );
    await page.getByText("Live P/L +3.25 USD", { exact: true }).waitFor();
    await page.goto(`${baseUrl}/settings`);
    await page
      .getByText("Deriv connected. Account positions are synchronized.", {
        exact: true,
      })
      .waitFor();
    assert.equal(buys, priorBuys + 1, "navigation does not submit a duplicate order");
    console.log(
      `PASS: ${accountMode} automatically executes from portfolio and survives navigation without duplicate orders`,
    );
    await context.close();
  }
  await page1.goto(`${baseUrl}/terminal`);
  await page1.locator("canvas").first().waitFor();
  await page1.screenshot({
    path:
      process.env.MBIOTRADE_TEST_SCREENSHOT ??
      join(tmpdir(), "mbiotrade-v14-terminal-smoke.png"),
    fullPage: true,
  });
  assert.deepEqual(browserErrors, [], "no uncaught browser exceptions");
  console.log(
    `Browser regression passed: ${buys} mock buys, ${sells} mock sell, ${protectionUpdates.length} protection updates; no real broker requests.`,
  );
} finally {
  await browser.close();
}
