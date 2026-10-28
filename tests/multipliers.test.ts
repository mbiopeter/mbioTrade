import assert from "node:assert/strict";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import { DERIV_APP_ID_EXAMPLE } from "../src/lib/deriv-app-id";
import { DerivAccountSocket } from "../src/lib/deriv-auth";
import {
  multiplierLimitOrder,
  tradeFromContract,
} from "../src/lib/deriv-reconciliation";
import {
  ACCEPTED_MULTIPLIERS,
  DEFAULT_MULTIPLIER,
  assertAcceptedMultiplier,
  isAcceptedMultiplier,
  isRemovedMultiplier,
  sanitizeMultiplier,
} from "../src/lib/multipliers";
import { OrderFundingError } from "../src/lib/order-funding";
import { estimatePositionPnl } from "../src/lib/position-metrics";
import type { AcceptedMultiplier, DemoTrade, Signal } from "../src/lib/types";
import {
  sanitizeDemoTrades,
  sanitizePreferences,
  sanitizeWorkspace,
} from "../src/lib/validation";
import { parseWorkerConfig } from "../worker/config";

const options = [100, 200, 300, 500, 800];
const removedOptions = [5, 10, 20, 30, 50];
assert.deepEqual(ACCEPTED_MULTIPLIERS, options);
assert.equal(DEFAULT_MULTIPLIER, 100, "New workspaces start at the lowest choice.");
assert.equal(DEFAULT_PREFERENCES.risk.multiplier, 100);

function workerEnvironment(accountMode: "demo" | "real") {
  return {
    MBIOTRADE_WORKER_MODE: "automatic",
    MBIOTRADE_CALENDAR_URL: "https://example.com/api/news-calendar",
    DERIV_APP_ID: DERIV_APP_ID_EXAMPLE,
    DERIV_API_TOKEN: "mock-token-for-config-only",
    DERIV_ACCOUNT_ID: "MOCKACCOUNT123",
    DERIV_ACCOUNT_MODE: accountMode,
  };
}

for (const multiplier of ACCEPTED_MULTIPLIERS) {
  assert.equal(isAcceptedMultiplier(multiplier), true);
  assert.equal(isRemovedMultiplier(multiplier), false);
  assert.equal(sanitizeMultiplier(String(multiplier)), multiplier);
  assert.doesNotThrow(() => assertAcceptedMultiplier(multiplier));
  const preferences = sanitizePreferences(
    {
      ...DEFAULT_PREFERENCES,
      executionMode: "automatic",
      automationExecutor: "worker",
      risk: { ...DEFAULT_PREFERENCES.risk, multiplier },
    },
    DEFAULT_PREFERENCES,
  );
  assert.equal(preferences.risk.multiplier, multiplier);
  assert.equal(preferences.executionMode, "automatic");
  const raw = {
    version: 10,
    preferences,
    combos: DEFAULT_COMBOS,
    activeComboId: DEFAULT_COMBOS[0].id,
  };
  const restored = sanitizeWorkspace(
    JSON.parse(JSON.stringify(raw)),
    DEFAULT_PREFERENCES,
    DEFAULT_COMBOS,
  );
  assert.equal(restored.preferences.risk.multiplier, multiplier);
  assert.equal(restored.preferences.executionMode, "automatic");

  // Configuration checks perform no network requests or financial operations.
  for (const accountMode of ["demo", "real"] as const) {
    const worker = parseWorkerConfig(raw, workerEnvironment(accountMode));
    assert.equal(worker.preferences.risk.multiplier, multiplier);
    assert.equal(worker.credentials?.accountMode, accountMode);
  }
}

for (const removed of removedOptions) {
  for (const multiplier of [removed, String(removed)]) {
    assert.equal(isAcceptedMultiplier(multiplier), false);
    assert.equal(isRemovedMultiplier(multiplier), true);
    assert.equal(sanitizeMultiplier(multiplier), 100);
    assert.equal(sanitizeMultiplier(multiplier, 500), 100);
    assert.throws(
      () => assertAcceptedMultiplier(multiplier),
      /Accepts 100,200,300,500,800/,
    );

    for (const executionMode of ["signals", "manual", "automatic"] as const) {
      for (const automationExecutor of ["browser", "worker"] as const) {
        const rawPreferences = {
          ...DEFAULT_PREFERENCES,
          executionMode,
          automationExecutor,
          notifySignals: false,
          risk: { ...DEFAULT_PREFERENCES.risk, stake: 20, multiplier },
        };
        const fallback = {
          ...DEFAULT_PREFERENCES,
          risk: { ...DEFAULT_PREFERENCES.risk, multiplier: 500 as const },
        };
        const migrated = sanitizePreferences(rawPreferences, fallback);
        assert.equal(migrated.risk.multiplier, 100);
        assert.equal(
          migrated.executionMode,
          "signals",
          "A changed factor cannot resume entries.",
        );
        assert.equal(migrated.automationExecutor, automationExecutor);
        assert.equal(migrated.notifySignals, false);
        assert.deepEqual(migrated.risk, { ...rawPreferences.risk, multiplier: 100 });

        const raw = {
          version: 10,
          preferences: rawPreferences,
          combos: DEFAULT_COMBOS,
          activeComboId: DEFAULT_COMBOS[0].id,
        };
        const imported = sanitizeWorkspace(
          JSON.parse(JSON.stringify(raw)),
          DEFAULT_PREFERENCES,
          DEFAULT_COMBOS,
        );
        assert.equal(imported.preferences.risk.multiplier, 100);
        assert.equal(imported.preferences.executionMode, "signals");
        const reloaded = sanitizeWorkspace(
          imported,
          DEFAULT_PREFERENCES,
          DEFAULT_COMBOS,
        );
        assert.equal(
          reloaded.preferences.executionMode,
          "signals",
          "The pause persists after reload.",
        );

        if (executionMode === "automatic" && automationExecutor === "worker") {
          for (const accountMode of ["demo", "real"] as const) {
            assert.throws(
              () => parseWorkerConfig(raw, workerEnvironment(accountMode)),
              /Automatic trading|invalid or missing risk setting/,
              "An automatic worker must reject removed raw settings instead of trading at 100x.",
            );
          }
        }
      }
    }
  }
}

for (const invalid of [
  1,
  2,
  7,
  15,
  0,
  -5,
  20.5,
  NaN,
  Infinity,
  "",
  "bad",
  true,
  null,
  {},
  [5],
]) {
  assert.equal(isAcceptedMultiplier(invalid), false);
  assert.equal(isRemovedMultiplier(invalid), false);
  assert.equal(sanitizeMultiplier(invalid), 100);
  assert.throws(() => assertAcceptedMultiplier(invalid), /Accepts/);
}
assert.equal(sanitizeMultiplier(undefined), 100);
assert.equal(sanitizeMultiplier("invalid", 5 as AcceptedMultiplier), 100);
for (const accountMode of ["demo", "real"] as const) {
  for (const multiplier of [7, 150, "100"]) {
    assert.throws(
      () =>
        parseWorkerConfig(
          {
            version: 10,
            preferences: {
              ...DEFAULT_PREFERENCES,
              executionMode: "automatic",
              automationExecutor: "worker",
              risk: { ...DEFAULT_PREFERENCES.risk, multiplier },
            },
            combos: DEFAULT_COMBOS,
            activeComboId: DEFAULT_COMBOS[0].id,
          },
          workerEnvironment(accountMode),
        ),
      /invalid or missing risk setting: multiplier/,
    );
  }
}

const plan: Signal = {
  id: "gold-multiplier-illustration",
  symbol: "frxXAUUSD",
  timeframe: 900,
  direction: "UP",
  entry: 2500,
  stopLoss: 2497.5,
  takeProfit: 2505,
  riskReward: 2,
  confidence: 0,
  votes: [],
  regime: "mixed",
  createdAt: Date.now(),
};

// Verify cash-distance conversion for the new ticket choices. A live broker
// proposal must still confirm market availability and its minimum amount.
for (const multiplier of ACCEPTED_MULTIPLIERS) {
  assert.deepEqual(multiplierLimitOrder(plan, 20, multiplier), {
    stop_loss: multiplier * 0.02,
    take_profit: multiplier * 0.04,
  });
}
assert.throws(
  () => multiplierLimitOrder({ ...plan, stopLoss: 2475 }, 20, 100),
  /closer stop or a lower multiplier/,
);

const trade: DemoTrade = {
  id: "existing-broker-multiplier",
  symbol: plan.symbol,
  direction: "UP",
  entry: plan.entry,
  stopLoss: plan.stopLoss,
  takeProfit: plan.takeProfit,
  stake: 20,
  multiplier: 5,
  openedAt: Date.now(),
  status: "open",
  source: "manual",
};
assert.ok(Math.abs(estimatePositionPnl(trade, 2502.5)! - 0.1) < 1e-9);
assert.ok(
  Math.abs(estimatePositionPnl({ ...trade, multiplier: 100 }, 2502.5)! - 2) < 1e-9,
);
assert.equal(estimatePositionPnl(trade, 1000), -20);
assert.equal(sanitizeDemoTrades([trade])[0].multiplier, 5);
for (const multiplier of removedOptions) {
  assert.equal(
    sanitizeDemoTrades([{ ...trade, multiplier }])[0].multiplier,
    multiplier,
  );
}
assert.deepEqual(
  multiplierLimitOrder(plan, trade.stake, trade.multiplier),
  {
    stop_loss: 0.1,
    take_profit: 0.2,
  },
  "Protection math for an existing position keeps its broker factor.",
);
assert.equal(
  sanitizeDemoTrades([
    {
      ...trade,
      contractId: 12345,
      multiplier: 15,
      source: "external",
      accountId: "MOCKACCOUNT123",
      accountMode: "demo",
    },
  ])[0].multiplier,
  15,
  "External broker multipliers remain faithfully displayed even outside ticket choices.",
);
for (const accountMode of ["demo", "real"] as const) {
  const brokerTrade = tradeFromContract(
    {
      contract_id: 12345,
      contract_type: "MULTUP",
      underlying: plan.symbol,
      buy_price: 20,
      entry_spot: 2500,
      multiplier: 15,
      purchase_time: 1_700_000_000,
    },
    { accountId: "MOCKACCOUNT123", accountMode },
  );
  assert.equal(brokerTrade?.multiplier, 15);
  assert.equal(sanitizeDemoTrades([brokerTrade])[0]?.multiplier, 15);
}

async function verifyRawOrderRejection() {
  for (const accountMode of ["demo", "real"] as const) {
    const socket = new DerivAccountSocket(accountMode);
    const requests: Array<Record<string, unknown>> = [];
    // Stub the request boundary: any proposal or buy would be captured without
    // contacting Deriv or creating a real position.
    const client = (
      socket as unknown as {
        client: { request: (body: Record<string, unknown>) => Promise<never> };
      }
    ).client;
    client.request = async (body) => {
      requests.push(body);
      throw new Error("Unexpected request for a rejected multiplier.");
    };
    for (const source of ["manual", "auto"] as const) {
      for (const multiplier of removedOptions) {
        await assert.rejects(
          socket.executeDemo(plan, 20, multiplier as AcceptedMultiplier, "USD", source),
          (error: unknown) => {
            assert.ok(error instanceof OrderFundingError);
            assert.equal(error.buySubmitted, false);
            assert.match(error.message, /Accepts 100,200,300,500,800/);
            return true;
          },
        );
      }
    }
    assert.deepEqual(
      requests,
      [],
      "Removed factors cannot reach proposal or buy on either account mode.",
    );
  }
  console.log(
    "v14 multiplier choices, safe migration, worker parity and order rejection tests passed.",
  );
}

void verifyRawOrderRejection().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
