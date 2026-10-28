import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES } from "../src/lib/defaults";
import {
  claimAutomaticSignal,
  localExitReached,
  normalizeExecutionMode,
  runAutomaticSignalOnce,
  signalAlreadyTraded,
} from "../src/lib/execution";
import { canAutoTrade, collectAccountOpenTrades, utcDayStart } from "../src/lib/risk";
import { sanitizePreferences } from "../src/lib/validation/preferences";
import type { DemoTrade, Signal } from "../src/lib/types";

const now = Date.UTC(2026, 9, 28, 12);
const signal: Signal = {
  id: "frxEURUSD-900-1793188800-UP",
  symbol: "frxEURUSD",
  timeframe: 900,
  direction: "UP",
  entry: 1.1,
  stopLoss: 1.09,
  takeProfit: 1.12,
  confidence: 80,
  riskReward: 2,
  createdAt: now,
  votes: [],
  regime: "trend",
};
const baseTrade: DemoTrade = {
  id: "trade-1",
  contractId: 1,
  symbol: "frxEURUSD",
  direction: "UP",
  entry: 1.1,
  stopLoss: 1.09,
  takeProfit: 1.12,
  stake: 20,
  multiplier: 100,
  openedAt: now - 60 * 60_000,
  status: "open",
  source: "auto",
  localStops: true,
  signalId: signal.id,
};

for (const [before, after] of [
  ["auto-demo", "automatic"],
  ["manual-demo", "manual"],
  ["real-assisted", "manual"],
  ["signals", "signals"],
  ["automatic", "automatic"],
  ["manual", "manual"],
  ["bad", "signals"],
]) {
  assert.equal(normalizeExecutionMode(before), after);
  assert.equal(
    sanitizePreferences({ executionMode: before }, DEFAULT_PREFERENCES).executionMode,
    after,
  );
}
assert.equal(
  sanitizePreferences({ automationExecutor: "worker" }, DEFAULT_PREFERENCES)
    .automationExecutor,
  "worker",
);
assert.equal(
  sanitizePreferences({}, DEFAULT_PREFERENCES).automationExecutor,
  "browser",
);

// Account type never changes a risk decision or requires a different mode.
for (const accountMode of ["demo", "real"] as const) {
  const trades = [{ ...baseTrade, accountMode, accountId: `account-${accountMode}` }];
  assert.equal(
    canAutoTrade(signal, trades, trades, 2, 75, 20, 25, 15, { now, realizedPnl: 0 }).ok,
    true,
  );
  assert.equal(
    canAutoTrade(signal, trades, trades, 1, 75, 20, 25, 15, { now, realizedPnl: 0 }).ok,
    false,
  );
  assert.match(
    canAutoTrade(signal, trades, trades, 2, 30, 20, 25, 15, { now, realizedPnl: 0 })
      .reason ?? "",
    /exposure/,
  );
}
const combined = collectAccountOpenTrades(
  [baseTrade],
  [
    { contract_id: 1, buy_price: 20, contract_type: "MULTUP" },
    { contract_id: 2, buy_price: 40, contract_type: "CALL", underlying: "frxEURUSD" },
  ],
);
assert.equal(
  combined.length,
  2,
  "broker positions are counted once, including non-multipliers",
);
assert.equal(
  canAutoTrade(signal, combined, [], 3, 75, 20, 25, 0, { now, realizedPnl: 0 }).ok,
  false,
);
const unknownExposure = collectAccountOpenTrades([], [{ contract_id: 3 }]);
assert.match(
  canAutoTrade(signal, unknownExposure, [], 3, 75, 20, 25, 0, { now, realizedPnl: 0 })
    .reason ?? "",
  /exposure/,
);
assert.match(
  canAutoTrade(signal, [], [], 2, 75, NaN, 25, 0, { now }).reason ?? "",
  /invalid/,
);
assert.match(
  canAutoTrade(signal, [], [], 2, 75, 20, 25, 0, { now, realizedPnl: null }).reason ??
    "",
  /Waiting/,
);
assert.match(
  canAutoTrade(signal, [], [], 2, 75, 20, 25, 0, { now, realizedPnl: -30 }).reason ??
    "",
  /Daily loss/,
);
assert.equal(utcDayStart(now), Date.UTC(2026, 9, 28));
assert.match(
  canAutoTrade(signal, [], [], 2, 75, 20, 25, 15, {
    now,
    realizedPnl: 0,
    latestTradeAt: now - 30_000,
  }).reason ?? "",
  /cooldown/,
  "non-multiplier broker buys also activate cooldown",
);
const overnightLoss = {
  ...baseTrade,
  status: "closed" as const,
  openedAt: now - 24 * 60 * 60_000,
  closedAt: now,
  brokerProfit: -30,
  soldFor: 20,
};
assert.equal(
  canAutoTrade(signal, [], [overnightLoss], 2, 75, 20, 25, 0, { now }).ok,
  false,
  "today's settlements include positions opened yesterday",
);
assert.equal(
  canAutoTrade(
    signal,
    [],
    [{ ...overnightLoss, closedAt: utcDayStart(now) - 1 }],
    2,
    75,
    20,
    25,
    0,
    { now },
  ).ok,
  true,
);
assert.equal(
  canAutoTrade(signal, [], [overnightLoss], 2, 75, 20, 25, 0, { now, realizedPnl: 0 })
    .ok,
  true,
  "broker's complete realized P/L overrides incomplete local history",
);
const midnight = utcDayStart(now) + 60_000;
assert.match(
  canAutoTrade(
    signal,
    [],
    [{ ...baseTrade, openedAt: midnight - 120_000 }],
    2,
    75,
    20,
    25,
    15,
    { now: midnight, realizedPnl: 0 },
  ).reason ?? "",
  /cooldown/,
);

assert.equal(localExitReached(baseTrade, "frxEURUSD", 1.13), true);
assert.equal(localExitReached(baseTrade, "frxEURUSD", 1.08), true);
assert.equal(localExitReached(baseTrade, "frxEURUSD", 1.1), false);
assert.equal(
  localExitReached(baseTrade, "frxXAUUSD", 2000),
  false,
  "never compare a position against a different instrument",
);
assert.equal(
  localExitReached(
    { ...baseTrade, source: "external", localStops: false, stopLoss: 0, takeProfit: 0 },
    "frxEURUSD",
    1.13,
  ),
  false,
);
assert.equal(
  localExitReached({ ...baseTrade, localStops: undefined }, "frxEURUSD", 1.13),
  false,
);
assert.equal(
  localExitReached({ ...baseTrade, stopLoss: 1.12 }, "frxEURUSD", 1.13),
  false,
);
const short = {
  ...baseTrade,
  direction: "DOWN" as const,
  stopLoss: 1.12,
  takeProfit: 1.09,
};
assert.equal(localExitReached(short, "frxEURUSD", 1.08), true);
assert.equal(localExitReached(short, "frxEURUSD", 1.13), true);
assert.equal(signalAlreadyTraded([baseTrade], signal), true);
assert.equal(signalAlreadyTraded([{ ...baseTrade, source: "manual" }], signal), false);

class MemoryStore {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

async function testAutomaticClaims() {
  const store = new MemoryStore();
  assert.equal(claimAutomaticSignal("demo:A", "s1", store), true);
  assert.equal(claimAutomaticSignal("demo:A", "s1", store), false);
  assert.equal(
    claimAutomaticSignal("real:A", "s1", store),
    true,
    "attempts are account scoped",
  );
  assert.throws(
    () =>
      claimAutomaticSignal("demo:blocked", "s1", {
        getItem: () => null,
        setItem: () => {
          throw new Error("storage blocked");
        },
      }),
    /storage blocked/,
  );

  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  let held = false;
  const locks = {
    async request(
      _key: string,
      _options: unknown,
      callback: (lock: object | null) => Promise<boolean>,
    ) {
      if (held) return callback(null);
      held = true;
      try {
        return await callback({});
      } finally {
        held = false;
      }
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: store },
  });
  try {
    let buys = 0;
    let finish: (() => void) | undefined;
    const first = runAutomaticSignalOnce(
      "demo:parallel",
      "same",
      () =>
        new Promise<void>((resolve) => {
          buys += 1;
          finish = resolve;
        }),
    );
    const duplicate = await runAutomaticSignalOnce(
      "demo:parallel",
      "same",
      async () => {
        buys += 1;
      },
    );
    assert.equal(duplicate, false);
    assert.equal(buys, 1);
    finish!();
    assert.equal(await first, true);
    assert.equal(
      await runAutomaticSignalOnce("demo:parallel", "same", async () => {
        buys += 1;
      }),
      false,
    );
    assert.equal(
      await runAutomaticSignalOnce(
        "demo:ready",
        "s",
        async () => {
          buys += 1;
        },
        () => false,
      ),
      false,
    );
    assert.equal(
      await runAutomaticSignalOnce("demo:ready", "s", async () => {
        buys += 1;
      }),
      true,
      "waiting for account readiness must not consume the signal",
    );
    await assert.rejects(
      runAutomaticSignalOnce("demo:uncertain", "s", async () => {
        throw new Error("response lost");
      }),
      /response lost/,
    );
    assert.equal(
      await runAutomaticSignalOnce("demo:uncertain", "s", async () => {
        buys += 1;
      }),
      false,
      "an uncertain buy is never retried automatically",
    );
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    await assert.rejects(
      runAutomaticSignalOnce("demo:no-lock", "s", async () => undefined),
      /Web Locks/,
    );
  } finally {
    if (navigatorDescriptor)
      Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

testAutomaticClaims().then(() =>
  console.log("Execution parity, broker risk, exit and duplicate-order tests passed."),
);
