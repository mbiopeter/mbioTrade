import assert from "node:assert/strict";
import { DerivAccountSocket } from "../src/lib/deriv-auth";
import { multiplierLimitOrder } from "../src/lib/deriv-reconciliation";
import {
  assertOrderBalance,
  assertQuotedOrderCost,
  OrderFundingError,
  orderPreflightError,
} from "../src/lib/order-funding";
import type { Signal } from "../src/lib/types";

const signal: Signal = {
  id: "funding-regression",
  symbol: "frxEURUSD",
  timeframe: 900,
  direction: "UP",
  entry: 100,
  stopLoss: 99.8,
  takeProfit: 100.4,
  confidence: 80,
  riskReward: 2,
  createdAt: Date.now(),
  votes: [],
  regime: "trend",
};

assert.equal(assertQuotedOrderCost("20.00", 20, "USD"), 20);
assert.doesNotThrow(() => assertOrderBalance(20, "20.00", "USD"));
assert.throws(
  () => assertQuotedOrderCost(25, 20, "USD"),
  /require 25\.00 USD.*selected amount is 20\.00 USD.*5\.00 USD short/,
);
assert.throws(
  () => assertOrderBalance(20, 12.5, "USD"),
  /Required: 20\.00 USD.*available: 12\.50 USD.*shortfall: 7\.50 USD/,
);
for (const missing of [undefined, null, "", " ", NaN, Infinity, false, {}]) {
  assert.throws(() => assertQuotedOrderCost(missing, 20, "USD"), OrderFundingError);
  assert.throws(() => assertOrderBalance(20, missing, "USD"), OrderFundingError);
}
assert.throws(
  () => multiplierLimitOrder({ ...signal, stopLoss: 98.8 }, 20, 100, "USD"),
  /loss allowance of 24\.00 USD.*stake is 20\.00 USD.*increasing the stake alone/,
);
assert.throws(
  () => multiplierLimitOrder({ ...signal, stopLoss: 99 }, 20, 100, "USD"),
  /stop cannot be reached/,
);
assert.throws(
  () => multiplierLimitOrder({ ...signal, stopLoss: 99.0001 }, 20, 100, "USD"),
  /stop cannot be reached/,
  "rounding must not turn a near-total loss allowance into the whole stake",
);
assert.deepEqual(multiplierLimitOrder(signal, 20, 100, "USD"), {
  stop_loss: 4,
  take_profit: 8,
});
const minimumError = Object.assign(new Error("Stake is below the market minimum."), {
  code: "StakeTooSmall",
  details: { minimum_stake: "25", currency: "USD" },
});
assert.match(
  orderPreflightError(minimumError, 20, "USD").message,
  /minimum amount: 25\.00 USD.*Difference: 5\.00 USD/,
);
const stopMinimum = Object.assign(new Error("Stop loss amount is too small."), {
  code: "InvalidStopLoss",
  details: { minimum_amount: "1" },
});
assert.doesNotMatch(
  orderPreflightError(stopMinimum, 20, "USD").message,
  /Deriv minimum amount/,
);
const unknownMinimum = Object.assign(new Error("Stake below minimum."), {
  details: { min: 25 },
});
assert.doesNotMatch(orderPreflightError(unknownMinimum, 20, "USD").message, /25/);

type Scenario = {
  price?: unknown;
  spot?: number;
  balance?: unknown;
  currency?: string;
  proposalError?: Record<string, unknown>;
  balanceError?: Record<string, unknown>;
  buyError?: Record<string, unknown>;
};

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  static scenario: Scenario = {};
  readonly scenario: Scenario;
  readonly sent: Array<Record<string, unknown>> = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {
    this.scenario = FakeWebSocket.scenario;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(raw: string) {
    const request = JSON.parse(raw) as Record<string, unknown>;
    this.sent.push(request);
    const payload: Record<string, unknown> = { req_id: request.req_id };
    if (request.proposal) {
      payload.proposal = {
        id: "funding-proposal",
        ask_price: this.scenario.price,
        spot: this.scenario.spot ?? 100,
        commission: "0.25",
      };
      if (this.scenario.proposalError) payload.error = this.scenario.proposalError;
    }
    if (request.balance) {
      payload.balance = {
        balance: this.scenario.balance,
        currency: this.scenario.currency ?? "USD",
      };
      if (this.scenario.balanceError) payload.error = this.scenario.balanceError;
    }
    if (request.buy) {
      payload.buy = {
        contract_id: 12001,
        buy_price: this.scenario.price,
        start_spot: 100,
        start_time: Math.floor(Date.now() / 1000),
      };
      if (this.scenario.buyError) payload.error = this.scenario.buyError;
    }
    if (request.ping) payload.ping = "pong";
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(payload) }));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

async function withSocket(
  mode: "demo" | "real",
  scenario: Scenario,
  check: (socket: DerivAccountSocket, wire: FakeWebSocket) => Promise<void>,
) {
  FakeWebSocket.scenario = scenario;
  const socket = new DerivAccountSocket(mode);
  try {
    await socket.connect(
      `wss://api.derivws.com/trading/v1/options/ws/${mode}?otp=mock`,
    );
    await check(socket, FakeWebSocket.instances.at(-1)!);
  } finally {
    socket.close();
  }
}

async function main() {
  const originalWebSocket = globalThis.WebSocket;
  Object.assign(globalThis, { WebSocket: FakeWebSocket });
  try {
    for (const mode of ["demo", "real"] as const) {
      for (const source of ["manual", "auto"] as const) {
        for (const direction of ["UP", "DOWN"] as const) {
          const plan =
            direction === "UP"
              ? signal
              : { ...signal, direction, stopLoss: 100.2, takeProfit: 99.6 };
          for (const spot of [plan.stopLoss, plan.takeProfit]) {
            await withSocket(
              mode,
              { price: "20", balance: 1000, spot },
              async (socket, wire) => {
                await assert.rejects(
                  socket.executeDemo(plan, 20, 100, "USD", source),
                  /quoted market price has reached or passed/,
                );
                assert.equal(
                  wire.sent.filter((request) => request.buy).length,
                  0,
                  "an expired price plan never reaches buy",
                );
              },
            );
          }
        }
        await withSocket(mode, { price: "25", balance: 1000 }, async (socket, wire) => {
          await assert.rejects(
            socket.executeDemo(signal, 20, 100, "USD", source),
            /require 25\.00 USD.*selected amount is 20\.00 USD.*5\.00 USD short/,
          );
          assert.equal(wire.sent.filter((request) => request.buy).length, 0);
        });
        await withSocket(
          mode,
          { price: "20", balance: "12.5" },
          async (socket, wire) => {
            await assert.rejects(
              socket.executeDemo(signal, 20, 100, "USD", source),
              /Required: 20\.00 USD.*available: 12\.50 USD.*shortfall: 7\.50 USD/,
            );
            assert.equal(wire.sent.filter((request) => request.buy).length, 0);
            assert.equal(wire.sent.filter((request) => request.balance).length, 1);
          },
        );
        await withSocket(mode, { price: "20", balance: "20" }, async (socket, wire) => {
          let guarded = false;
          const trade = await socket.executeDemo(signal, 20, 100, "USD", source, () => {
            guarded = true;
            assert.equal(
              wire.sent.at(-1)?.balance,
              1,
              "fresh balance is checked after the quote",
            );
          });
          assert.equal(guarded, true);
          assert.equal(trade.contractId, 12001);
          assert.equal(trade.stake, 20);
          assert.equal(trade.accountMode, mode);
          assert.equal(wire.sent.filter((request) => request.buy).length, 1);
          assert.equal(wire.sent.find((request) => request.buy)?.price, 20);
          assert.equal(wire.sent.find((request) => request.proposal)?.amount, 20);
        });
      }
    }

    for (const price of [undefined, null, 0, -1, "invalid"]) {
      await withSocket("demo", { price, balance: 1000 }, async (socket, wire) => {
        await assert.rejects(
          socket.executeDemo(signal, 20, 100),
          /valid purchase price/,
        );
        assert.equal(wire.sent.filter((request) => request.buy).length, 0);
      });
    }
    await withSocket("demo", { price: 20 }, async (socket, wire) => {
      await assert.rejects(
        socket.executeDemo(signal, 20, 100),
        /balance could not be verified/,
      );
      assert.equal(wire.sent.filter((request) => request.buy).length, 0);
    });
    await withSocket(
      "real",
      { price: 20, balance: 100, currency: "EUR" },
      async (socket, wire) => {
        await assert.rejects(
          socket.executeDemo(signal, 20, 100),
          /quote uses USD.*account reports EUR/,
        );
        assert.equal(wire.sent.filter((request) => request.buy).length, 0);
      },
    );
    await withSocket(
      "demo",
      {
        price: 20,
        balance: 100,
        proposalError: {
          code: "StakeTooSmall",
          message: "Stake is below the market minimum.",
          details: { minimum_stake: "25", currency: "USD" },
        },
      },
      async (socket, wire) => {
        await assert.rejects(socket.executeDemo(signal, 20, 100), (error: unknown) => {
          assert.ok(error instanceof OrderFundingError);
          assert.equal(error.buySubmitted, false);
          assert.match(
            error.message,
            /minimum amount: 25\.00 USD.*Difference: 5\.00 USD/,
          );
          return true;
        });
        assert.equal(wire.sent.filter((request) => request.buy).length, 0);
      },
    );
    await withSocket("demo", { price: 20, balance: 100 }, async (socket, wire) => {
      await assert.rejects(
        socket.executeDemo({ ...signal, stopLoss: 98.8 }, 20, 100),
        (error: unknown) =>
          error instanceof OrderFundingError && /24\.00 USD/.test(error.message),
      );
      assert.equal(
        wire.sent.filter((request) => request.proposal || request.buy).length,
        0,
      );
    });
    await withSocket("demo", { price: 20, balance: 100 }, async (socket, wire) => {
      await assert.rejects(
        socket.executeDemo(signal, 20, 100, "USD", "auto", () => {
          throw new Error("Automatic settings changed.");
        }),
        (error: unknown) =>
          error instanceof OrderFundingError && /settings changed/.test(error.message),
      );
      assert.equal(wire.sent.filter((request) => request.buy).length, 0);
    });
    await withSocket(
      "demo",
      {
        price: 20,
        balance: 100,
        buyError: {
          code: "BuyRejected",
          message: "The purchase was rejected.",
        },
      },
      async (socket, wire) => {
        await assert.rejects(socket.executeDemo(signal, 20, 100), (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error instanceof OrderFundingError,
            false,
            "a sent buy is never marked as unsent",
          );
          return true;
        });
        assert.equal(
          wire.sent.filter((request) => request.buy).length,
          1,
          "no purchase retry",
        );
      },
    );
    console.log(
      "Funding preflight regression checks passed for manual/automatic demo/real orders.",
    );
  } finally {
    Object.assign(globalThis, { WebSocket: originalWebSocket });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
