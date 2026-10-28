import assert from "node:assert/strict";
import test from "node:test";
import { DerivAccountSocket } from "../src/lib/deriv-auth";
import {
  brokerLimitAmount,
  tradeFromContract,
  type AccountIdentity,
} from "../src/lib/deriv-reconciliation";
import { localExitReached } from "../src/lib/execution";
import {
  assertEditableProtection,
  protectionLimitOrder,
  protectionMatchesContract,
  updateTradeProtection,
  validateProtectionUpdate,
  type ProtectionSession,
  type ProtectionUpdate,
} from "../src/lib/trade-protection";
import type { DemoTrade, DerivOpenContract } from "../src/lib/types";
import { WorkerAccount } from "../worker/account";

const account: AccountIdentity = { accountId: "VRTC13001", accountMode: "demo" };

function contract(overrides: Partial<DerivOpenContract> = {}): DerivOpenContract {
  return {
    contract_id: 13001,
    contract_type: "MULTUP",
    underlying_symbol: "frxXAUUSD",
    currency: "USD",
    buy_price: 20,
    multiplier: 10,
    entry_spot: 2000,
    current_spot: 2002,
    date_start: 1_798_000_000,
    status: "open",
    is_sold: 0,
    limit_order: {
      stop_loss: { order_amount: -5, value: "1950" },
      take_profit: { order_amount: 10, value: "2100" },
    },
    ...overrides,
  };
}

function localTrade(identity = account, direction: "UP" | "DOWN" = "UP"): DemoTrade {
  const restored = tradeFromContract(contract({
    contract_type: direction === "UP" ? "MULTUP" : "MULTDOWN",
    limit_order: {
      stop_loss: { order_amount: -5, value: direction === "UP" ? "1950" : "2050" },
      take_profit: { order_amount: 10, value: direction === "UP" ? "2100" : "1900" },
    },
  }), identity);
  assert.ok(restored);
  return {
    ...restored,
    source: "manual",
    localStops: true,
    stopLoss: direction === "UP" ? 1950 : 2050,
    takeProfit: direction === "UP" ? 2100 : 1900,
  };
}

function harness(identity = account, direction: "UP" | "DOWN" = "UP") {
  const state = {
    trade: localTrade(identity, direction),
    broker: contract({
      contract_type: direction === "UP" ? "MULTUP" : "MULTDOWN",
      limit_order: {
        stop_loss: { order_amount: -5, value: direction === "UP" ? "1950" : "2050" },
        take_profit: { order_amount: 10, value: direction === "UP" ? "2100" : "1900" },
      },
    }),
    active: true,
    reads: 0,
    sends: [] as ProtectionUpdate[],
    attempts: 0,
    applications: 0,
    beforeSend: () => undefined as void,
    afterSend: () => undefined as void,
    readError: undefined as Error | undefined,
    updateError: undefined as Error | undefined,
    applyRequested: true,
  };
  const session: ProtectionSession = {
    account: identity,
    getTrade: () => state.trade,
    assertCurrent: () => {
      if (!state.active) throw new Error("Account changed.");
    },
    readContract: async () => {
      state.reads += 1;
      if (state.reads > 1 && state.readError) throw state.readError;
      return structuredClone(state.broker);
    },
    sendUpdate: async (_id, updates, _stake, beforeSend) => {
      state.attempts += 1;
      state.beforeSend();
      beforeSend();
      state.sends.push({ ...updates });
      if (state.applyRequested) {
        const oldLimits = state.broker.limit_order as Record<string, unknown>;
        state.broker = {
          ...state.broker,
          limit_order: {
            ...oldLimits,
            ...(updates.stopLoss === undefined ? {} : {
              stop_loss: { order_amount: -updates.stopLoss, value: direction === "UP" ? "1930" : "2070" },
            }),
            ...(updates.takeProfit === undefined ? {} : {
              take_profit: { order_amount: updates.takeProfit, value: direction === "UP" ? "2140" : "1860" },
            }),
          },
        };
      }
      state.afterSend();
      if (state.updateError) throw state.updateError;
    },
    applyContract: (payload) => {
      state.applications += 1;
      const next = tradeFromContract(payload, identity, state.trade);
      if (next && !(state.trade.status === "closed" && next.status === "open")) state.trade = next;
    },
    disableLocalStops: () => { state.trade = { ...state.trade, localStops: false }; },
  };
  return { state, session };
}

test("cash validation rejects invalid amounts and sends only explicitly changed sides", () => {
  assert.deepEqual(validateProtectionUpdate({ stopLoss: 7.25 }, 20), { stopLoss: 7.25 });
  assert.deepEqual(protectionLimitOrder({ takeProfit: 14 }, 20), { take_profit: 14 });
  assert.deepEqual(protectionLimitOrder({ stopLoss: 7, takeProfit: 14 }, 20), {
    stop_loss: 7, take_profit: 14,
  });
  for (const amount of [0, -1, NaN, Infinity, 0.001]) {
    assert.throws(() => validateProtectionUpdate({ stopLoss: amount }, 20));
    assert.throws(() => validateProtectionUpdate({ takeProfit: amount }, 20));
  }
  assert.throws(() => validateProtectionUpdate({}, 20), /at least one/);
  assert.throws(() => validateProtectionUpdate({ stopLoss: 20 }, 20), /less than/);
  assert.throws(() => validateProtectionUpdate({ stopLoss: 7 }, NaN), /confirm.*stake/);
  assert.doesNotThrow(() => validateProtectionUpdate({ takeProfit: 100 }, 20));
});

test("positive, negative, and display-only broker amounts normalize without confusing spot barriers", () => {
  assert.equal(brokerLimitAmount({ order_amount: -7 }, "stop_loss"), 7);
  assert.equal(brokerLimitAmount({ order_amount: 7 }, "stop_loss"), 7);
  assert.equal(brokerLimitAmount({ display_order_amount: "-7.00" }, "stop_loss"), 7);
  assert.equal(brokerLimitAmount({ display_order_amount: "14.00" }, "take_profit"), 14);
  assert.equal(brokerLimitAmount({ order_amount: -14 }, "take_profit"), undefined);
  assert.equal(brokerLimitAmount({ value: "1950" }, "stop_loss"), undefined);
  assert.equal(brokerLimitAmount({ order_amount: false }, "stop_loss"), undefined);
  assert.equal(brokerLimitAmount(null, "stop_loss"), undefined);
});

for (const direction of ["UP", "DOWN"] as const) {
  test(`${direction}: external protection changes or removal disable the original local price exit`, () => {
    const prior = localTrade(account, direction);
    const exitPrice = direction === "UP" ? 2110 : 1890;
    assert.equal(localExitReached(prior, prior.symbol, exitPrice), true);
    const same = tradeFromContract({
      contract_id: prior.contractId,
      limit_order: {
        stop_loss: { order_amount: -5, value: String(prior.brokerStopLossPrice) },
        take_profit: { order_amount: 10, value: String(prior.brokerTakeProfitPrice) },
      },
    }, account, prior)!;
    assert.equal(same.localStops, true, "SL sign changes do not invent a protection edit");
    const changed = tradeFromContract({
      contract_id: prior.contractId,
      limit_order: {
        stop_loss: { order_amount: -7, value: direction === "UP" ? "1930" : "2070" },
        take_profit: { order_amount: 14, value: direction === "UP" ? "2140" : "1860" },
      },
    }, account, same)!;
    assert.equal(changed.brokerStopLoss, 7);
    assert.equal(changed.brokerTakeProfit, 14);
    assert.equal(changed.localStops, false);
    assert.equal(localExitReached(changed, prior.symbol, exitPrice), false);
    for (const limit_order of [null, {}]) {
      const removed = tradeFromContract({ contract_id: prior.contractId, limit_order }, account, prior)!;
      assert.equal(removed.localStops, false);
      assert.equal(removed.brokerStopLoss, undefined);
      assert.equal(removed.brokerTakeProfit, undefined);
      assert.equal(removed.brokerStopLossPrice, undefined);
      assert.equal(removed.brokerTakeProfitPrice, undefined);
    }
    const partial = tradeFromContract({ contract_id: prior.contractId, profit: 1.5 }, account, prior)!;
    assert.equal(partial.brokerStopLoss, 5, "a tick without a limit snapshot does not remove protection");
    assert.equal(partial.localStops, true);
  });
}

for (const accountMode of ["demo", "real"] as const) {
  for (const direction of ["UP", "DOWN"] as const) {
    test(`${accountMode} ${direction}: update resolves only after broker read-back and replaces obsolete chart stops`, async () => {
      const { state, session } = harness({ accountId: `${accountMode}-13001`, accountMode }, direction);
      await updateTradeProtection(session, { stopLoss: 7, takeProfit: 14 });
      assert.equal(state.reads, 2);
      assert.deepEqual(state.sends, [{ stopLoss: 7, takeProfit: 14 }]);
      assert.equal(state.trade.brokerStopLoss, 7);
      assert.equal(state.trade.brokerTakeProfit, 14);
      assert.equal(state.trade.localStops, false);
      assert.equal(state.trade.brokerStopLossPrice, direction === "UP" ? 1930 : 2070);
      assert.equal(state.trade.brokerTakeProfitPrice, direction === "UP" ? 2140 : 1860);
    });
  }
}

test("partial edits preserve a take profit updated on another device", async () => {
  const { state, session } = harness();
  state.afterSend = () => {
    state.broker.limit_order = {
      ...(state.broker.limit_order as Record<string, unknown>),
      take_profit: { order_amount: 17, value: "2170" },
    };
  };
  await updateTradeProtection(session, { stopLoss: 7 });
  assert.deepEqual(state.sends, [{ stopLoss: 7 }]);
  assert.equal(state.trade.brokerTakeProfit, 17);
});

test("stale edited-field baselines are rejected after fresh broker preflight, while untouched changes are preserved", async () => {
  const conflict = harness();
  conflict.state.broker.limit_order = {
    stop_loss: { order_amount: -6, value: "1940" },
    take_profit: { order_amount: 10, value: "2100" },
  };
  await assert.rejects(
    updateTradeProtection(conflict.session, { stopLoss: 7 }, { stopLoss: 5 }),
    /Stop loss changed at Deriv.*Review the current/,
  );
  assert.equal(conflict.state.sends.length, 0);
  assert.equal(conflict.state.trade.brokerStopLoss, 6);
  const untouched = harness();
  untouched.state.broker.limit_order = {
    stop_loss: { order_amount: -5, value: "1950" },
    take_profit: { order_amount: 17, value: "2170" },
  };
  await updateTradeProtection(untouched.session, { stopLoss: 7 }, { stopLoss: 5, takeProfit: 10 });
  assert.equal(untouched.state.trade.brokerTakeProfit, 17);
  const formerlyAbsent = harness();
  await assert.rejects(
    updateTradeProtection(formerlyAbsent.session, { takeProfit: 14 }, { takeProfit: null }),
    /Take profit changed at Deriv/,
  );
  assert.equal(formerlyAbsent.state.sends.length, 0);
});

test("an edited field changed by the stream between preflight and send cancels the outgoing mutation", async () => {
  const { state, session } = harness();
  state.beforeSend = () => {
    state.trade = { ...state.trade, brokerStopLoss: 6, localStops: false };
    state.broker.limit_order = {
      stop_loss: { order_amount: -6, value: "1940" },
      take_profit: { order_amount: 10, value: "2100" },
    };
  };
  await assert.rejects(updateTradeProtection(session, { stopLoss: 7 }, { stopLoss: 5 }), /Stop loss changed at Deriv/);
  assert.equal(state.sends.length, 0);
  assert.equal(state.trade.brokerStopLoss, 6);
});

test("closed, foreign-account, unsupported, and invalid requests never reach the broker", async () => {
  for (const overrides of [
    { status: "closed" as const },
    { accountId: "another-account" },
    { accountMode: "real" as const },
    { contractType: "CALL" },
    { contractId: -1 },
  ]) {
    const { state, session } = harness();
    state.trade = { ...state.trade, ...overrides };
    await assert.rejects(updateTradeProtection(session, { stopLoss: 7 }));
    assert.equal(state.reads, 0);
    assert.equal(state.sends.length, 0);
  }
  assert.throws(() => assertEditableProtection(undefined, account), /unavailable/);
  const { state, session } = harness();
  await assert.rejects(updateTradeProtection(session, { stopLoss: 20 }), /less than/);
  assert.equal(state.reads, 0);
});

test("fresh contract status and stake are verified without fetching global balance/history", async () => {
  const closed = harness();
  closed.state.broker = contract({ is_sold: 1, status: "sold", sell_price: 21 });
  await assert.rejects(updateTradeProtection(closed.session, { stopLoss: 7 }), /closed/);
  assert.equal(closed.state.trade.status, "closed");
  assert.equal(closed.state.sends.length, 0);
  const cheaper = harness();
  cheaper.state.broker.buy_price = 6;
  await assert.rejects(updateTradeProtection(cheaper.session, { stopLoss: 7 }), /less than/);
  assert.equal(cheaper.state.sends.length, 0);
  const unknown = harness();
  delete unknown.state.broker.status;
  delete unknown.state.broker.is_sold;
  await assert.rejects(updateTradeProtection(unknown.session, { stopLoss: 7 }), /not confirmed/);
  assert.equal(unknown.state.sends.length, 0);
  const ineligible = harness();
  ineligible.state.broker.is_valid_to_update = { stop_loss: 0 };
  await assert.rejects(updateTradeProtection(ineligible.session, { stopLoss: 7 }), /does not currently allow/);
  assert.equal(ineligible.state.sends.length, 0);
});

test("a timed-out update that did apply is confirmed, without resending it", async () => {
  const { state, session } = harness();
  state.updateError = new Error("Deriv request timed out. Reconnecting automatically.");
  await updateTradeProtection(session, { stopLoss: 7 });
  assert.equal(state.attempts, 1);
  assert.equal(state.sends.length, 1);
  assert.equal(state.reads, 2);
  assert.equal(state.trade.brokerStopLoss, 7);
});

test("rejected or ambiguous updates leave displayed limits broker-backed and cannot revive the old local exit", async () => {
  for (const reason of ["InvalidStopLoss: amount not allowed.", "Deriv request timed out."]) {
    const { state, session } = harness();
    state.applyRequested = false;
    state.updateError = new Error(reason);
    await assert.rejects(updateTradeProtection(session, { stopLoss: 7 }), /does not confirm.*not resent/);
    assert.equal(state.attempts, 1);
    assert.equal(state.trade.brokerStopLoss, 5);
    assert.equal(state.trade.localStops, false);
  }
  const unavailable = harness();
  unavailable.state.readError = new Error("Connection interrupted.");
  await assert.rejects(updateTradeProtection(unavailable.session, { stopLoss: 7 }), /could not be verified.*not resent/);
  assert.equal(unavailable.state.attempts, 1);
  assert.equal(unavailable.state.trade.brokerStopLoss, 5, "an acknowledgement alone does not change the displayed limit");
  assert.equal(unavailable.state.trade.localStops, false);
});

test("a partial read-back cannot use cached limits to claim an update was confirmed", async () => {
  const { state, session } = harness();
  state.afterSend = () => { delete state.broker.limit_order; };
  await assert.rejects(updateTradeProtection(session, { stopLoss: 7 }), /does not confirm/);
  assert.equal(protectionMatchesContract({ contract_id: 13001 }, { stopLoss: 5 }), false);
  assert.equal(state.trade.brokerStopLoss, 5);
});

test("an account switch before send cancels the mutation; a switch after send cannot update the new account", async () => {
  const unsent = harness();
  unsent.state.beforeSend = () => { unsent.state.active = false; };
  await assert.rejects(updateTradeProtection(unsent.session, { stopLoss: 7 }), /Account changed/);
  assert.equal(unsent.state.sends.length, 0);
  assert.equal(unsent.state.reads, 1);
  const sent = harness();
  sent.state.afterSend = () => { sent.state.active = false; };
  await assert.rejects(updateTradeProtection(sent.session, { stopLoss: 7 }), /Account changed/);
  assert.equal(sent.state.sends.length, 1);
  assert.equal(sent.state.reads, 1);
  assert.equal(sent.state.applications, 1);
  assert.equal(sent.state.trade.brokerStopLoss, 5);
});

test("a concurrent close cancels an unsent update or reports a closed outcome", async () => {
  const before = harness();
  before.state.beforeSend = () => {
    before.state.trade = { ...before.state.trade, status: "closed" };
    before.state.broker = contract({ is_sold: 1, status: "sold", sell_price: 21 });
  };
  await assert.rejects(updateTradeProtection(before.session, { stopLoss: 7 }), /closed/);
  assert.equal(before.state.sends.length, 0);
  const after = harness();
  after.state.afterSend = () => {
    after.state.broker = contract({ is_sold: 1, status: "sold", sell_price: 21 });
  };
  await assert.rejects(updateTradeProtection(after.session, { stopLoss: 7 }), /closed/);
  assert.equal(after.state.trade.status, "closed");
  assert.equal(after.state.sends.length, 1);
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static latest: FakeWebSocket;
  static instances: FakeWebSocket[] = [];
  static broker = contract();
  static loseUpdateReply = false;
  readyState = 0;
  readonly sent: Array<Record<string, unknown>> = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.latest = this;
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
  }
  send(raw: string) {
    const request = JSON.parse(raw) as Record<string, unknown>;
    this.sent.push(request);
    const payload: Record<string, unknown> = {
      req_id: request.req_id,
      // The update acknowledgement intentionally contains only one side.
      contract_update: { stop_loss: { order_amount: -7 } },
      ...(request.ping ? { ping: "pong" } : {}),
    };
    if (request.proposal_open_contract) payload.proposal_open_contract = structuredClone(FakeWebSocket.broker);
    if (request.contract_update) {
      const limits = request.limit_order as Record<string, number>;
      FakeWebSocket.broker.limit_order = {
        ...(FakeWebSocket.broker.limit_order as Record<string, unknown>),
        ...(limits.stop_loss === undefined ? {} : { stop_loss: { order_amount: -limits.stop_loss, value: "1930" } }),
        ...(limits.take_profit === undefined ? {} : { take_profit: { order_amount: limits.take_profit, value: "2140" } }),
      };
      if (FakeWebSocket.loseUpdateReply) {
        FakeWebSocket.loseUpdateReply = false;
        queueMicrotask(() => this.close());
        return;
      }
    }
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(payload) }));
  }
  close() { this.readyState = 3; this.onclose?.(); }
}

test("demo and real adapters send identical valid partial contract_update payloads, and cancel stale sends", async () => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  try {
    for (const mode of ["demo", "real"] as const) {
      const socket = new DerivAccountSocket(mode);
      try {
        await socket.connect(`wss://api.derivws.com/trading/v1/options/ws/${mode}?otp=mock`);
        const wire = FakeWebSocket.latest;
        await socket.updateProtection(13001, { stopLoss: 7 }, 20);
        const update = wire.sent.find((item) => item.contract_update);
        assert.ok(update);
        assert.deepEqual({ ...update, req_id: undefined }, {
          contract_update: 1, contract_id: 13001, limit_order: { stop_loss: 7 }, req_id: undefined,
        });
        await assert.rejects(socket.updateProtection(13001, { stopLoss: 0 }, 20), /positive/);
        await assert.rejects(socket.updateProtection(13001, { takeProfit: 14 }, 20, () => {
          throw new Error("Account switched before send.");
        }), /Account switched/);
        assert.equal(wire.sent.filter((item) => item.contract_update).length, 1);
        assert.equal(wire.sent.some((item) => item.balance || item.portfolio || item.profit_table), false);
      } finally { socket.close(); }
    }
  } finally { globalThis.WebSocket = original; }
});

test("an interrupted real transport reconnects and verifies its one update without replaying it", async () => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.broker = contract();
  FakeWebSocket.instances = [];
  const socket = new DerivAccountSocket("demo");
  try {
    await socket.connect("wss://api.derivws.com/trading/v1/options/ws/demo?otp=mock");
    FakeWebSocket.loseUpdateReply = true;
    const { state, session } = harness();
    session.readContract = (id) => socket.openContract(id);
    session.sendUpdate = (id, changes, stake, beforeSend) => socket.updateProtection(id, changes, stake, beforeSend);
    await updateTradeProtection(session, { stopLoss: 7 }, { stopLoss: 5 });
    assert.equal(state.trade.brokerStopLoss, 7);
    assert.equal(state.trade.localStops, false);
    assert.ok(FakeWebSocket.instances.length >= 2);
    const requests = FakeWebSocket.instances.flatMap((wire) => wire.sent);
    assert.equal(requests.filter((item) => item.contract_update).length, 1);
    assert.equal(requests.filter((item) => item.proposal_open_contract).length, 2);
  } finally {
    socket.close();
    globalThis.WebSocket = original;
    FakeWebSocket.loseUpdateReply = false;
  }
});

test("an unsent guarded sell cannot cross a physical reconnect with an obsolete preflight", async () => {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  FakeWebSocket.instances = [];
  const socket = new DerivAccountSocket("demo");
  try {
    await socket.connect("wss://api.derivws.com/trading/v1/options/ws/demo?otp=mock");
    // Simulate a closed physical socket whose connection observer has not run yet.
    FakeWebSocket.latest.readyState = FakeWebSocket.CLOSED;
    await assert.rejects(socket.sellDemo(13001, () => undefined), /reconnected before this action was sent/);
    assert.ok(FakeWebSocket.instances.length >= 2);
    assert.equal(FakeWebSocket.instances.flatMap((wire) => wire.sent).some((item) => item.sell), false);
  } finally {
    socket.close();
    globalThis.WebSocket = original;
  }
});

test("worker rechecks external protection before an old local stop can sell", async () => {
  for (const direction of ["UP", "DOWN"] as const) {
    const trade = localTrade(account, direction);
    const worker = new WorkerAccount({ ...account, appId: "12345", token: "offline-test-token", rememberSession: false });
    worker.connected = true;
    let sells = 0;
    worker.socket.sellDemo = async (_id, beforeSend) => { beforeSend?.(); sells += 1; return 21; };
    worker.socket.openContract = async () => contract({
      contract_type: direction === "UP" ? "MULTUP" : "MULTDOWN",
      limit_order: {
        stop_loss: { order_amount: -7, value: direction === "UP" ? "1930" : "2070" },
        take_profit: { order_amount: 14, value: direction === "UP" ? "2140" : "1860" },
      },
    });
    try {
      await assert.rejects(worker.sell(trade, {
        symbol: trade.symbol, price: direction === "UP" ? 2110 : 1890,
      }), /old worker price exit was cancelled/);
      assert.equal(sells, 0);
    } finally { worker.close(); }
  }
});

test("unchanged broker protection preserves existing worker local exits in both directions", async () => {
  for (const direction of ["UP", "DOWN"] as const) {
    const trade = localTrade(account, direction);
    const worker = new WorkerAccount({ ...account, appId: "12345", token: "offline-test-token", rememberSession: false });
    worker.connected = true;
    let sells = 0;
    worker.socket.sellDemo = async (_id, beforeSend) => { beforeSend?.(); sells += 1; return 21; };
    worker.socket.openContract = async () => contract({
      contract_type: direction === "UP" ? "MULTUP" : "MULTDOWN",
      limit_order: {
        stop_loss: { order_amount: -5, value: String(trade.stopLoss) },
        take_profit: { order_amount: 10, value: String(trade.takeProfit) },
      },
    });
    try {
      await worker.sell(trade, { symbol: trade.symbol, price: direction === "UP" ? 2110 : 1890 });
      assert.equal(sells, 1);
    } finally { worker.close(); }
  }
});
