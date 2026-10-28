import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import { generateSignal, hasNewsRisk } from "../src/lib/strategies";
import {
  confirmedMarketCandles,
  MAX_ANALYSIS_CANDLES,
} from "../src/lib/strategy-engine/candles";
import type {
  AcceptedMultiplier,
  Candle,
  ConnectedAccountMode,
  DemoTrade,
  Signal,
  StrategyCombo,
  TradeDirection,
} from "../src/lib/types";
import type { BrokerSnapshot, WorkerAccountPort } from "../worker/account";
import type { WorkerConfig } from "../worker/config";
import { WorkerEngine } from "../worker/engine";

const origin = Date.UTC(2026, 9, 28, 12);
const timeframe = 3600;
const barMs = timeframe * 1000;
const news = { events: [], ready: true };

function risingHistory(count: number, lastTime: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.04;
    return {
      time: lastTime - (count - 1 - index) * timeframe,
      open: close - 0.03,
      high: close + 0.12,
      low: close - 0.15,
      close,
    };
  });
}

function append(
  candles: Candle[],
  open: number,
  high: number,
  low: number,
  close: number,
): void {
  candles.push({ time: candles.at(-1)!.time + timeframe, open, high, low, close });
}

function mirror(candles: Candle[]): Candle[] {
  return candles.map((candle) => ({
    ...candle,
    open: 250 - candle.open,
    high: 250 - candle.low,
    low: 250 - candle.high,
    close: 250 - candle.close,
  }));
}

function completedPullback(lastTime: number): Candle[] {
  const candles = risingHistory(300, lastTime - 4 * timeframe);
  const top = candles.at(-1)!.close;
  append(candles, top, top + 0.04, top - 0.24, top - 0.16);
  append(candles, top - 0.16, top - 0.12, top - 0.4, top - 0.32);
  append(candles, top - 0.32, top - 0.28, top - 0.48, top - 0.42);
  append(candles, top - 0.4, top - 0.03, top - 0.65, top - 0.08);
  return candles;
}

function configuration(combo: StrategyCombo, mode: WorkerConfig["mode"]): WorkerConfig {
  return {
    mode,
    preferences: {
      ...DEFAULT_PREFERENCES,
      symbol: "frxEURUSD",
      timeframe,
      executionMode: "automatic",
      automationExecutor: "worker",
      risk: {
        ...DEFAULT_PREFERENCES.risk,
        maxOpenDemoTrades: 3,
        cooldownMinutes: 0,
        marginBudget: 100,
      },
    },
    combo,
    credentials: null,
    calendarUrl: null,
    newsGuard: true,
  };
}

class BoundaryAccount implements WorkerAccountPort {
  connected = true;
  purchases: DemoTrade[] = [];
  duringProposal?: () => void;
  constructor(
    private readonly accountMode: ConnectedAccountMode,
    private readonly keepJournal: boolean,
    private readonly now: () => number,
  ) {}
  async refresh(): Promise<BrokerSnapshot> {
    return {
      trades: this.keepJournal ? [...this.purchases] : [],
      portfolio: [],
      balance: 1000,
      currency: "USD",
      dailyRealizedPnl: 0,
      latestTradeAt: 0,
      complete: true,
    };
  }
  async buy(
    signal: Signal,
    stake: number,
    multiplier: AcceptedMultiplier,
    _currency: string,
    beforeBuy?: () => void,
  ): Promise<DemoTrade> {
    this.duringProposal?.();
    beforeBuy?.();
    const trade: DemoTrade = {
      id: `offline-${this.purchases.length + 1}`,
      contractId: this.purchases.length + 1,
      symbol: signal.symbol,
      direction: signal.direction as TradeDirection,
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      stake,
      multiplier,
      openedAt: this.now(),
      status: "open",
      source: "auto",
      localStops: false,
      signalId: signal.id,
      accountId: "OFFLINETEST123",
      accountMode: this.accountMode,
    };
    this.purchases.push(trade);
    return trade;
  }
  async sell(): Promise<void> {
    throw new Error("This offline entry regression must not request an exit.");
  }
}

for (const accountMode of ["demo", "real"] as const) {
  for (const direction of ["UP", "DOWN"] as const) {
    for (const keepJournal of [true, false]) {
      test(`worker deduplicates a confirmed ${direction} setup across the first new tick: ${accountMode}, journal ${keepJournal}`, async () => {
        let now = origin;
        const history = risingHistory(300, origin / 1000 - 3 * timeframe);
        const top = history.at(-1)!.close;
        append(history, top, top + 0.04, top - 0.24, top - 0.16);
        append(history, top - 0.16, top - 0.12, top - 0.4, top - 0.32);
        append(history, top - 0.32, top - 0.28, top - 0.48, top - 0.42);
        const initial = direction === "UP" ? history : mirror(history);
        const price = (value: number) => (direction === "UP" ? value : 250 - value);
        const combo = DEFAULT_COMBOS.find((item) => item.id === "v14-general-pullback");
        assert.ok(combo);
        const account = new BoundaryAccount(accountMode, keepJournal, () => now);
        // Use the actual shared generator and the full configured pullback pattern.
        const engine = new WorkerEngine(
          configuration(combo, "automatic"),
          account,
          () => undefined,
          () => now,
        );
        engine.setMarketConnected(true);
        engine.setHistory(initial);

        // Build a directional resumption OHLC from ticks during the next bar.
        for (const [offset, quote] of [
          [barMs + 10_000, top - 0.4],
          [barMs + 20_000, top - 0.65],
          [barMs + 30_000, top - 0.03],
          [2 * barMs - 1000, top - 0.08],
        ]) {
          now = origin + offset;
          engine.tick(now / 1000, price(quote));
        }

        // The clock can confirm the bar before its successor receives a tick.
        now = origin + 2 * barMs;
        await engine.step(news);
        assert.equal(
          account.purchases.length,
          1,
          "The completed pattern should execute once.",
        );
        assert.equal(account.purchases[0].direction, direction);

        // A first tick in the next bar must not erase this signal's attempt.
        now += 1000;
        engine.tick(now / 1000, price(top - 0.07));
        await engine.step(news);
        await engine.step(news);
        assert.equal(
          account.purchases.length,
          1,
          "The same confirmed bar must not buy twice when the raw current bar changes.",
        );
      });
    }
  }
}

test("worker, browser and replay retain the same 600 completed bars", async () => {
  let now = origin + 1000;
  const history = risingHistory(900, origin / 1000);
  const combo: StrategyCombo = {
    id: "offline-ema-parity",
    name: "Offline EMA parity",
    strategies: [{ id: "ema-trend", enabled: true, weight: 1 }],
    minAgreement: 1,
    minConfidence: 50,
    createdAt: 0,
  };
  const windows: Candle[][] = [];
  const captureSignal: typeof generateSignal = (...args) => {
    windows.push(args[0]);
    return generateSignal(...args);
  };
  const engine = new WorkerEngine(
    configuration(combo, "signals"),
    null,
    () => undefined,
    () => now,
    captureSignal,
  );
  engine.setMarketConnected(true);
  engine.setHistory(history);
  engine.tick(now / 1000, history.at(-1)!.close);
  await engine.step(news);

  const browserWindow = confirmedMarketCandles(history, timeframe, now);
  assert.equal(browserWindow.length, MAX_ANALYSIS_CANDLES);
  assert.deepEqual(windows.at(-1), browserWindow);

  now = origin + barMs + 1000;
  const close = history.at(-1)!.close + 0.04;
  const next: Candle = {
    time: origin / 1000 + timeframe,
    open: close,
    high: close,
    low: close,
    close,
  };
  engine.tick(now / 1000, next.close);
  await engine.step(news);

  const browserAfterTick = confirmedMarketCandles([...history, next], timeframe, now);
  const replayWindow = history.slice(-MAX_ANALYSIS_CANDLES);
  assert.deepEqual(windows.at(-1), browserAfterTick);
  assert.deepEqual(windows.at(-1), replayWindow);
  const workerSignal = generateSignal(windows.at(-1)!, "frxEURUSD", timeframe, combo);
  const browserSignal = generateSignal(browserAfterTick, "frxEURUSD", timeframe, combo);
  const replaySignal = generateSignal(replayWindow, "frxEURUSD", timeframe, combo);
  assert.ok(workerSignal && browserSignal && replaySignal);
  for (const expected of [browserSignal, replaySignal]) {
    assert.equal(workerSignal.id, expected.id);
    assert.equal(workerSignal.direction, expected.direction);
    assert.equal(workerSignal.entry, expected.entry);
    assert.equal(workerSignal.stopLoss, expected.stopLoss);
    assert.equal(workerSignal.takeProfit, expected.takeProfit);
    assert.equal(workerSignal.confidence, expected.confidence);
  }
});

for (const accountMode of ["demo", "real"] as const) {
  test(`worker rechecks News Guard when a quote crosses its time boundary: ${accountMode}`, async () => {
    let now = origin;
    const combo = DEFAULT_COMBOS.find((item) => item.id === "v14-general-pullback");
    assert.ok(combo);
    const account = new BoundaryAccount(accountMode, true, () => now);
    const engine = new WorkerEngine(
      configuration(combo, "automatic"),
      account,
      () => undefined,
      () => now,
    );
    const history = completedPullback(origin / 1000 + timeframe);
    now = origin + 2 * barMs;
    engine.setMarketConnected(true);
    engine.setHistory(history);
    engine.tick(now / 1000, history.at(-1)!.close + 0.01);
    const events = [
      {
        id: "offline-usd-event",
        title: "Offline USD event",
        currency: "USD",
        impact: "high" as const,
        time: now + 30 * 60_000 + 100,
      },
    ];
    assert.equal(hasNewsRisk("frxEURUSD", events, now), false);
    account.duringProposal = () => {
      now += 200;
    };
    await engine.step({ events, ready: true });
    assert.equal(hasNewsRisk("frxEURUSD", events, now), true);
    assert.equal(
      account.purchases.length,
      0,
      "An event entering the block window must cancel an unsent buy.",
    );
    assert.equal(
      engine.automaticPaused,
      null,
      "A known pre-buy cancellation is not an ambiguous purchase.",
    );
  });

  test(`worker rejects an old completed pattern despite a fresh current tick: ${accountMode}`, async () => {
    let now = origin;
    const combo = DEFAULT_COMBOS.find((item) => item.id === "v14-general-pullback");
    assert.ok(combo);
    const account = new BoundaryAccount(accountMode, true, () => now);
    const engine = new WorkerEngine(
      configuration(combo, "automatic"),
      account,
      () => undefined,
      () => now,
    );
    const oldHistory = completedPullback(origin / 1000 - 4 * timeframe);
    assert.ok(
      generateSignal(oldHistory, "frxEURUSD", timeframe, combo),
      "The old bars contain a real qualified pattern.",
    );
    now = origin + 2 * barMs;
    engine.setMarketConnected(true);
    engine.setHistory(oldHistory);
    engine.tick(now / 1000, oldHistory.at(-1)!.close + 0.01);
    await engine.step(news);
    assert.equal(
      account.purchases.length,
      0,
      "Fresh ticks cannot make an old signal's entry current.",
    );
  });
}
