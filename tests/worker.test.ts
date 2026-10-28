import assert from "node:assert/strict";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import { DERIV_APP_ID_EXAMPLE } from "../src/lib/deriv-app-id";
import { OrderFundingError } from "../src/lib/order-funding";
import type { AcceptedMultiplier, Candle, DemoTrade, Signal } from "../src/lib/types";
import {
  WorkerAccount,
  type BrokerSnapshot,
  type WorkerAccountPort,
} from "../worker/account";
import { parseWorkerConfig, type WorkerConfig } from "../worker/config";
import { WorkerEngine } from "../worker/engine";
import { appendTick, WorkerNews } from "../worker/market";

const origin = Date.UTC(2026, 9, 28, 12);
let now = origin;
const rawWorkspace = {
  preferences: {
    ...DEFAULT_PREFERENCES,
    symbol: "frxEURUSD",
    timeframe: 60,
    executionMode: "automatic",
    automationExecutor: "worker",
  },
  combos: DEFAULT_COMBOS.map((combo) => ({
    ...combo,
    strategies: combo.strategies.map((strategy) =>
      strategy.id === "news-guard" ? { ...strategy, enabled: false } : strategy,
    ),
  })),
  activeComboId: DEFAULT_COMBOS[0].id,
};
const env = {
  MBIOTRADE_WORKER_MODE: "automatic",
  DERIV_APP_ID: DERIV_APP_ID_EXAMPLE,
  DERIV_API_TOKEN: "offline_test_token_0123456789",
  DERIV_ACCOUNT_ID: "TEST123",
  DERIV_ACCOUNT_MODE: "demo",
};
const config = parseWorkerConfig(rawWorkspace, env);
assert.equal(parseWorkerConfig(rawWorkspace, {}).mode, "signals");
assert.equal(parseWorkerConfig(rawWorkspace, {}).credentials, null);
assert.throws(
  () => parseWorkerConfig(rawWorkspace, { ...env, DERIV_ACCOUNT_MODE: "" }),
  /valid Deriv account/,
);
assert.throws(
  () =>
    parseWorkerConfig(
      {
        ...rawWorkspace,
        preferences: { ...rawWorkspace.preferences, automationExecutor: "browser" },
      },
      env,
    ),
  /Background worker/,
);
assert.throws(
  () =>
    parseWorkerConfig(
      {
        ...rawWorkspace,
        preferences: {
          ...rawWorkspace.preferences,
          risk: { ...DEFAULT_PREFERENCES.risk, stake: -20 },
        },
      },
      env,
    ),
  /risk setting/,
);
assert.throws(
  () => parseWorkerConfig({ ...rawWorkspace, combos: DEFAULT_COMBOS }, env),
  /News Guard/,
);
assert.throws(
  () =>
    parseWorkerConfig(rawWorkspace, {
      ...env,
      MBIOTRADE_CALENDAR_URL: "http://example.com/calendar",
    }),
  /HTTPS/,
);

function candles(at = now): Candle[] {
  return Array.from({ length: 60 }, (_, index) => ({
    time: Math.floor(at / 1000 / 60) * 60 - (59 - index) * 60,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
  }));
}
function signal(
  rows: Candle[],
  symbol: string,
  timeframe: Signal["timeframe"],
): Signal {
  return {
    id: `${symbol}-${timeframe}-${rows.at(-1)!.time}-UP`,
    symbol,
    timeframe,
    direction: "UP",
    entry: 100,
    stopLoss: 99,
    takeProfit: 102,
    confidence: 90,
    riskReward: 2,
    createdAt: now,
    votes: [],
    regime: "trend",
  };
}
function openTrade(patch: Partial<DemoTrade> = {}): DemoTrade {
  return {
    id: "broker-1",
    contractId: 1,
    symbol: "frxEURUSD",
    direction: "UP",
    entry: 100,
    stopLoss: 99,
    takeProfit: 102,
    stake: 20,
    multiplier: 500,
    openedAt: now,
    status: "open",
    source: "auto",
    localStops: true,
    ...patch,
  };
}
function snapshot(patch: Partial<BrokerSnapshot> = {}): BrokerSnapshot {
  return {
    portfolio: [],
    trades: [],
    balance: 1000,
    currency: "USD",
    dailyRealizedPnl: 0,
    latestTradeAt: 0,
    complete: true,
    ...patch,
  };
}
class AccountDouble implements WorkerAccountPort {
  connected = true;
  buys = 0;
  sells = 0;
  refreshes = 0;
  failBuy = false;
  duringProposal?: () => void;
  data = snapshot();
  async refresh() {
    this.refreshes += 1;
    return this.data;
  }
  async buy(
    _signal: Signal,
    _stake: number,
    _multiplier: AcceptedMultiplier,
    _currency: string,
    beforeBuy?: () => void,
  ) {
    this.duringProposal?.();
    beforeBuy?.();
    this.buys += 1;
    if (this.failBuy) throw new Error("response lost");
    return openTrade();
  }
  async sell() {
    this.sells += 1;
  }
}
function engineFor(account: WorkerAccountPort | null, settings: WorkerConfig = config) {
  const engine = new WorkerEngine(
    settings,
    account,
    () => undefined,
    () => now,
    signal,
  );
  engine.setMarketConnected(true);
  engine.setHistory(candles());
  engine.tick(now / 1000, 100);
  return engine;
}
function nextCandle(engine: WorkerEngine) {
  now += 61_000;
  engine.tick(now / 1000, 100);
}
const news = { events: [], ready: true };

async function run(): Promise<void> {
  // Both modes execute through precisely the same worker gate and buy path.
  for (const accountMode of ["demo", "real"] as const) {
    now = origin;
    const account = new AccountDouble();
    const settings = parseWorkerConfig(rawWorkspace, {
      ...env,
      DERIV_ACCOUNT_MODE: accountMode,
    });
    const engine = engineFor(account, settings);
    await engine.step(news);
    assert.equal(account.buys, 0, "Restart must skip the already active candle.");
    nextCandle(engine);
    await Promise.all([engine.step(news), engine.step(news)]);
    await engine.step(news);
    assert.equal(
      account.buys,
      1,
      "Concurrent/repeated ticks must not duplicate a signal purchase.",
    );
  }

  now = origin;
  const signalsAccount = new AccountDouble();
  const signalsEngine = engineFor(signalsAccount, {
    ...config,
    mode: "signals",
    credentials: null,
  });
  nextCandle(signalsEngine);
  await signalsEngine.step(news);
  assert.equal(signalsAccount.buys, 0, "Signals mode must never send an order.");

  for (const state of [
    snapshot({ complete: false }),
    snapshot({ dailyRealizedPnl: null }),
    snapshot({ dailyRealizedPnl: -100 }),
    snapshot({ balance: 1 }),
    snapshot({ latestTradeAt: origin }),
    snapshot({ portfolio: [{ contract_id: 9, contract_type: "CALL", buy_price: 10 }] }),
    snapshot({ portfolio: [{ contract_id: 9, contract_type: "CALL" }] }),
  ]) {
    now = origin;
    const account = new AccountDouble();
    account.data = state;
    const engine = engineFor(account);
    nextCandle(engine);
    await engine.step(news);
    assert.equal(account.buys, 0, "Broker risk data must block an unsafe entry.");
  }

  now = origin;
  const rateLimited = new AccountDouble();
  rateLimited.data = snapshot({ dailyRealizedPnl: -100 });
  const limitedEngine = engineFor(rateLimited);
  nextCandle(limitedEngine);
  for (let index = 0; index < 10; index += 1) {
    await limitedEngine.step(news);
    now += 2000;
    limitedEngine.tick(now / 1000, 100);
  }
  assert.equal(rateLimited.buys, 0);
  assert.equal(
    rateLimited.refreshes,
    1,
    "A risk-blocked signal must not poll account history on every tick.",
  );

  now = origin;
  const disconnected = new AccountDouble();
  disconnected.connected = false;
  const reconnectEngine = engineFor(disconnected);
  nextCandle(reconnectEngine);
  await reconnectEngine.step(news);
  assert.equal(disconnected.buys, 0);
  disconnected.connected = true;
  await reconnectEngine.step(news);
  assert.equal(
    disconnected.buys,
    1,
    "Waiting for reconnect must not consume a qualified signal.",
  );

  now = origin;
  const newsAccount = new AccountDouble();
  const newsEngine = engineFor(newsAccount, { ...config, newsGuard: true });
  nextCandle(newsEngine);
  await newsEngine.step({ events: [], ready: false });
  assert.equal(newsAccount.buys, 0);
  await newsEngine.step({
    ready: true,
    events: [{ id: "news", title: "Test", currency: "USD", impact: "high", time: now }],
  });
  assert.equal(newsAccount.buys, 0);

  now = origin;
  const lostResponse = new AccountDouble();
  lostResponse.failBuy = true;
  const uncertainEngine = engineFor(lostResponse);
  nextCandle(uncertainEngine);
  await uncertainEngine.step(news);
  nextCandle(uncertainEngine);
  await uncertainEngine.step(news);
  assert.equal(
    lostResponse.buys,
    1,
    "An uncertain buy must never be retried automatically.",
  );
  assert.ok(uncertainEngine.automaticPaused);

  now = origin;
  const unfunded = new AccountDouble();
  const fundingReason =
    "Order not placed. These settings require 25.00 USD; selected 20.00 USD; 5.00 USD short.";
  unfunded.duringProposal = () => {
    throw new OrderFundingError(fundingReason);
  };
  const fundingLogs: string[] = [];
  const fundedEngine = new WorkerEngine(
    config,
    unfunded,
    (event, detail) => {
      if (event === "waiting") fundingLogs.push(String(detail.reason));
    },
    () => now,
    signal,
  );
  fundedEngine.setMarketConnected(true);
  fundedEngine.setHistory(candles());
  nextCandle(fundedEngine);
  await fundedEngine.step(news);
  await fundedEngine.step(news);
  assert.equal(unfunded.buys, 0, "Rejected preflight cannot submit a worker buy.");
  assert.equal(
    fundedEngine.automaticPaused,
    null,
    "Unsent funding rejection is not an uncertain order.",
  );
  assert.ok(
    fundingLogs.includes(fundingReason),
    "The worker preserves the required-amount notification.",
  );

  for (const change of ["stop", "stale", "disconnect", "new-signal"] as const) {
    now = origin;
    const account = new AccountDouble();
    const engine = engineFor(account);
    nextCandle(engine);
    account.duringProposal = () => {
      if (change === "stop") engine.stop();
      if (change === "stale") now += 121_000;
      if (change === "disconnect") engine.setMarketConnected(false);
      if (change === "new-signal") nextCandle(engine);
    };
    await engine.step(news);
    assert.equal(
      account.buys,
      0,
      `${change} during proposal must cancel an unsent order.`,
    );
    assert.equal(
      engine.automaticPaused,
      null,
      "A known pre-buy cancellation is not an uncertain purchase.",
    );
  }

  const broker = new WorkerAccount(config.credentials!);
  broker.connected = true;
  broker.socket.portfolio = async () => [];
  broker.socket.profitHistory = async () => ({ transactions: [], complete: true });
  broker.socket.balance = async () => ({ balance: 1000, currency: "USD" });
  broker.socket.recentTransactions = async () => [
    { action_type: "buy", transaction_time: origin / 1000 - 5 },
  ];
  assert.equal(
    (await broker.refresh()).latestTradeAt,
    origin - 5000,
    "A recent buy remains part of cooldown even after cancellation removes it from the portfolio.",
  );
  broker.close();

  now = origin;
  const oldTicks = new AccountDouble();
  const staleEngine = engineFor(oldTicks);
  now += 300_000;
  await staleEngine.step(news);
  assert.equal(oldTicks.buys, 0, "Historical prices cannot authorize a live buy.");

  now = origin;
  const shuttingDown = new AccountDouble();
  let finishRefresh: ((value: BrokerSnapshot) => void) | undefined;
  shuttingDown.refresh = () =>
    new Promise((resolve) => {
      finishRefresh = resolve;
    });
  const shutdownEngine = engineFor(shuttingDown);
  nextCandle(shutdownEngine);
  const pending = shutdownEngine.step(news);
  shutdownEngine.stop();
  finishRefresh!(snapshot());
  await pending;
  assert.equal(
    shuttingDown.buys,
    0,
    "SIGTERM during reconciliation must prevent a subsequent buy.",
  );

  for (const [trade, expected] of [
    [openTrade({ symbol: "frxGBPUSD" }), 0],
    [openTrade({ source: "external", localStops: false }), 0],
    [openTrade(), 1],
  ] as const) {
    now = origin;
    const account = new AccountDouble();
    account.data = snapshot({ trades: [trade] });
    const engine = engineFor(account);
    engine.tick(now / 1000, 103);
    await engine.step(news);
    assert.equal(
      account.sells,
      expected,
      "Local exits must respect symbol and trusted stop metadata.",
    );
  }

  const initial = candles();
  const merged = appendTick(initial, initial.at(-1)!.time + 1, 103, 60);
  assert.equal(merged.length, initial.length);
  assert.equal(merged.at(-1)!.high, 103);
  assert.equal(merged.at(-1)!.open, 100);
  assert.deepEqual(appendTick(merged, initial[0].time, 50, 60), merged);

  const originalFetch = globalThis.fetch;
  try {
    let available = true;
    globalThis.fetch = async () => {
      if (!available) throw new Error("offline");
      return new Response(JSON.stringify({ events: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    };
    const calendar = new WorkerNews("https://example.com/api/news-calendar", true);
    assert.equal((await calendar.snapshot(origin)).ready, true);
    available = false;
    assert.equal((await calendar.snapshot(origin + 300_001)).ready, true);
    assert.equal(
      (await calendar.snapshot(origin + 600_002)).ready,
      false,
      "Stale news must stop new entries.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("Background worker tests passed (offline; no Deriv orders).");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
