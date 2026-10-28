import assert from "node:assert/strict";
import {
  BrokerAccountSync,
  type AccountSyncSocket,
  type AccountSyncState,
} from "../src/lib/account-sync";
import {
  finiteBrokerNumber,
  multiplierLimitOrder,
  realizedProfit,
  tradeFromContract,
  utcDayStart,
} from "../src/lib/deriv-reconciliation";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import {
  automaticSettingsKey,
  automaticSettingsStillMatch,
} from "../src/lib/execution-guard";
import { DerivAccountSocket } from "../src/lib/deriv-auth";
import type {
  DemoTrade,
  DerivOpenContract,
  DerivPortfolioContract,
  DerivProfitTransaction,
  DerivTransaction,
  Signal,
} from "../src/lib/types";

const account = { accountId: "VRTC123456", accountMode: "demo" as const };
const contract: DerivOpenContract = {
  contract_id: 101,
  contract_type: "MULTUP",
  underlying_symbol: "frxEURUSD",
  currency: "USD",
  buy_price: "10",
  multiplier: 200,
  entry_spot: "1.1",
  current_spot: "1.101",
  profit: "1.52",
  bid_price: "11.52",
  is_sold: 0,
  is_valid_to_sell: 1,
  date_start: Math.floor(Date.now() / 1000) - 120,
  limit_order: { stop_loss: { order_amount: 5 }, take_profit: { order_amount: 15 } },
};

class FakeBroker implements AccountSyncSocket {
  contracts: DerivPortfolioContract[] = [contract];
  details = new Map<number, DerivOpenContract>([[101, contract]]);
  history: DerivProfitTransaction[] = [];
  historyComplete = true;
  journal: DerivProfitTransaction[] = [];
  portfolioCalls = 0;
  openUpdate: ((contract: DerivOpenContract) => void) | null = null;
  transactionUpdate: ((event: DerivTransaction) => void) | null = null;
  portfolioDelay: Promise<void> | null = null;
  async balance() {
    return { balance: 1000, currency: "USD" };
  }
  async portfolio() {
    this.portfolioCalls += 1;
    const result = [...this.contracts];
    await this.portfolioDelay;
    return result;
  }
  async profitHistory() {
    return { transactions: [...this.history], complete: this.historyComplete };
  }
  async recentClosedHistory() {
    return this.journal;
  }
  async recentTransactions() {
    return [];
  }
  async openContract(id: number) {
    const found = this.details.get(id);
    if (!found) throw new Error("Contract unavailable");
    return found;
  }
  async subscribeBalance() {
    return () => undefined;
  }
  async subscribeTransactions(callback: (event: DerivTransaction) => void) {
    this.transactionUpdate = callback;
    return () => {
      this.transactionUpdate = null;
    };
  }
  async subscribeOpenContracts(callback: (contract: DerivOpenContract) => void) {
    this.openUpdate = callback;
    return () => {
      this.openUpdate = null;
    };
  }
}

const signal: Signal = {
  id: "signal-1",
  symbol: "frxEURUSD",
  timeframe: 900,
  direction: "UP",
  entry: 1.1,
  stopLoss: 1.099,
  takeProfit: 1.102,
  confidence: 80,
  riskReward: 2,
  createdAt: Date.now(),
  votes: [],
  regime: "trend",
};

async function syncTests() {
  const preferences = {
    ...DEFAULT_PREFERENCES,
    executionMode: "automatic" as const,
    risk: { ...DEFAULT_PREFERENCES.risk, stake: 10, multiplier: 200 as const },
  };
  const combo = DEFAULT_COMBOS[0];
  const planned = {
    ...signal,
    symbol: preferences.symbol,
    timeframe: preferences.timeframe,
    comboId: combo.id,
    createdAt: Date.now(),
  };
  const settings = automaticSettingsKey(preferences, combo);
  assert.equal(
    automaticSettingsStillMatch(preferences, combo, settings, planned, 10, 200),
    true,
  );
  assert.equal(
    automaticSettingsStillMatch(
      { ...preferences, executionMode: "manual" },
      combo,
      settings,
      planned,
      10,
      200,
    ),
    false,
  );
  assert.equal(
    automaticSettingsStillMatch(
      { ...preferences, automationExecutor: "worker" },
      combo,
      settings,
      planned,
      10,
      200,
    ),
    false,
  );
  assert.equal(
    automaticSettingsStillMatch(
      { ...preferences, symbol: "frxGBPUSD" },
      combo,
      settings,
      planned,
      10,
      200,
    ),
    false,
  );
  assert.equal(
    automaticSettingsStillMatch(
      preferences,
      { ...combo, minConfidence: combo.minConfidence + 1 },
      settings,
      planned,
      10,
      200,
    ),
    false,
  );
  assert.equal(
    automaticSettingsStillMatch(
      { ...preferences, risk: { ...preferences.risk, maxDailyDemoLoss: 50 } },
      combo,
      settings,
      planned,
      10,
      200,
    ),
    false,
  );
  assert.equal(
    automaticSettingsStillMatch(
      preferences,
      combo,
      settings,
      { ...planned, createdAt: Date.now() - 120001 },
      10,
      200,
    ),
    false,
  );
  assert.equal(finiteBrokerNumber(null), undefined);
  assert.equal(finiteBrokerNumber(""), undefined);
  assert.equal(finiteBrokerNumber("0"), 0);
  const limits = multiplierLimitOrder(signal, 10, 200);
  assert.ok(limits.stop_loss > 0 && limits.stop_loss <= 10);
  assert.ok(limits.take_profit > limits.stop_loss);
  assert.notEqual(
    limits.stop_loss,
    signal.stopLoss,
    "Broker stop amounts must not be chart prices.",
  );
  assert.throws(
    () => multiplierLimitOrder({ ...signal, stopLoss: 1.2 }, 10, 200),
    /surround/,
  );
  const imported = tradeFromContract(contract, account)!;
  assert.equal(imported.source, "external");
  assert.equal(imported.localStops, false);
  assert.equal(imported.stopLoss, 0);
  assert.equal(imported.brokerStopLoss, 5);
  assert.equal(imported.brokerTakeProfit, 15);
  assert.equal(imported.multiplier, 200);
  assert.equal(
    tradeFromContract({ ...contract, contract_type: "CALL" }, account),
    null,
  );
  const foreign: DemoTrade = {
    ...imported,
    accountId: "OTHER",
    source: "auto",
    signalId: "should-not-leak",
    stopLoss: 0.9,
    localStops: true,
  };
  assert.equal(tradeFromContract(contract, account, foreign)?.source, "external");
  assert.equal(tradeFromContract(contract, account, foreign)?.signalId, undefined);

  const broker = new FakeBroker();
  const settled: DemoTrade[] = [];
  const states: AccountSyncState[] = [];
  const sync = new BrokerAccountSync(
    broker,
    account,
    [],
    (state) => states.push(state),
    (trade) => settled.push(trade),
  );
  await sync.start();
  assert.equal(sync.state.synced, true);
  assert.equal(
    sync.state.trades.length,
    1,
    "A fresh device must discover existing Deriv positions without a local journal.",
  );
  assert.equal(sync.state.livePositions[imported.id].profit, 1.52);
  assert.equal(sync.state.trades[0].accountId, account.accountId);
  assert.equal(sync.state.dailyRealizedPnl, 0);
  broker.transactionUpdate?.({
    transaction_id: 1,
    action: "buy",
    contract_id: 101,
    amount: -10,
  });
  broker.transactionUpdate?.({
    transaction_id: 1,
    action: "buy",
    contract_id: 101,
    amount: -10,
  });
  assert.equal(sync.state.events.filter((event) => event.id === "1").length, 1);

  broker.openUpdate?.({ ...contract, profit: "4.25", current_spot: "1.103" });
  assert.equal(
    Number(sync.state.portfolio[0].profit),
    4.25,
    "Profile portfolio P/L must track the same broker stream as position cards.",
  );
  sync.markOffline();
  assert.equal(
    Object.keys(sync.state.livePositions).length,
    0,
    "A disconnected broker snapshot must not be labeled live.",
  );
  assert.equal(sync.state.portfolio[0].profit, undefined);
  await sync.refresh(true);
  const callsBeforeFocus = broker.portfolioCalls;
  await Promise.all([sync.refresh(), sync.refresh()]);
  assert.equal(
    broker.portfolioCalls,
    callsBeforeFocus,
    "Rapid focus refreshes can reuse a just-confirmed snapshot.",
  );
  await sync.refresh(true);
  assert.equal(
    broker.portfolioCalls,
    callsBeforeFocus + 1,
    "Entry checks must bypass the display-refresh TTL.",
  );

  broker.contracts = [];
  await sync.refresh(true);
  assert.equal(
    sync.state.trades[0].status,
    "open",
    "Portfolio omission cannot falsely close a still-open broker contract.",
  );
  broker.details.delete(101);
  await assert.rejects(sync.refresh(true), /could not be verified/);
  assert.equal(sync.state.synced, false);
  assert.equal(
    sync.state.trades[0].status,
    "open",
    "An unavailable status must retain uncertainty, not invent a closure.",
  );
  broker.details.set(101, contract);
  broker.contracts = [contract];
  await sync.refresh(true);
  assert.equal(sync.state.synced, true);

  const sold: DerivOpenContract = {
    ...contract,
    is_sold: 1,
    status: "sold",
    sell_price: "12.5",
    profit: "2.5",
    sell_time: Math.floor(Date.now() / 1000),
  };
  broker.openUpdate?.(sold);
  assert.equal(
    sync.state.trades[0].status,
    "closed",
    "Selling on Deriv must immediately close the platform position.",
  );
  assert.equal(sync.state.trades[0].soldFor, 12.5);
  assert.equal(sync.state.livePositions[imported.id], undefined);
  assert.equal(sync.state.portfolio.length, 0);
  assert.equal(sync.state.dailyRealizedPnl, 2.5);
  broker.openUpdate?.(sold);
  broker.openUpdate?.(contract);
  await sync.refresh(true);
  assert.equal(
    sync.state.trades[0].status,
    "closed",
    "Late open updates and stale portfolio snapshots must not resurrect a sold contract.",
  );
  assert.equal(settled.length, 1, "Closure notifications must be deduplicated.");
  sync.dispose();

  const broker2 = new FakeBroker();
  const secondDevice = new BrokerAccountSync(broker2, account, [], () => undefined);
  await secondDevice.start();
  assert.equal(
    secondDevice.state.trades[0].id,
    imported.id,
    "Broker contract identities must match on different devices.",
  );
  secondDevice.recordSale(secondDevice.state.trades[0], 8);
  assert.equal(secondDevice.state.trades[0].brokerProfit, -2);
  secondDevice.dispose();

  const otherBroker = new FakeBroker();
  const otherContract: DerivOpenContract = {
    ...contract,
    contract_id: 888,
    contract_type: "CALL",
    buy_price: 20,
  };
  otherBroker.contracts.push(otherContract);
  otherBroker.details.set(888, otherContract);
  const otherSync = new BrokerAccountSync(otherBroker, account, [], () => undefined);
  await otherSync.start();
  otherBroker.openUpdate?.({ ...otherContract, profit: 3.25 });
  assert.equal(
    Number(otherSync.state.portfolio.find((row) => row.contract_id === 888)?.profit),
    3.25,
    "Other contract types must also refresh their raw portfolio P/L.",
  );
  otherBroker.transactionUpdate?.({
    transaction_id: 8888,
    action: "sell",
    contract_id: 888,
    amount: 5,
    transaction_time: Math.floor(Date.now() / 1000),
  });
  assert.equal(
    otherSync.state.dailyRealizedPnl,
    -15,
    "An externally closed non-multiplier trade must immediately update account loss exposure.",
  );
  assert.equal(
    otherSync.state.portfolio.some((row) => row.contract_id === 888),
    false,
  );
  otherSync.dispose();

  const oldBroker = new FakeBroker();
  oldBroker.journal = [
    {
      contract_id: 300,
      buy_price: 10,
      sell_price: 13,
      purchase_time: 1600000000,
      sell_time: 1600000100,
      shortcode: "MULTUP_frxEURUSD_10_200_1600000000_0",
    },
  ];
  const oldHistory = new BrokerAccountSync(oldBroker, account, [], () => undefined);
  await oldHistory.start();
  assert.equal(
    oldHistory.state.trades.find((trade) => trade.contractId === 300)?.status,
    "closed",
    "A fresh device must restore older broker journal records outside the daily risk window.",
  );
  assert.equal(
    oldHistory.state.trades.find((trade) => trade.contractId === 300)?.symbol,
    "frxEURUSD",
  );
  assert.equal(
    oldHistory.state.dailyRealizedPnl,
    0,
    "Older journal profits must not count toward today's loss limit.",
  );
  oldHistory.dispose();

  const broker3 = new FakeBroker();
  broker3.history = [
    {
      contract_id: 999,
      buy_price: "20",
      sell_price: "4",
      sell_time: Math.floor(Date.now() / 1000),
      purchase_time: Math.floor(Date.now() / 1000) - 400,
    },
  ];
  const historySync = new BrokerAccountSync(
    broker3,
    account,
    [foreign],
    () => undefined,
  );
  await historySync.start();
  assert.equal(
    historySync.state.dailyRealizedPnl,
    -16,
    "Daily loss risk includes broker history from other devices and contract types.",
  );
  assert.equal(
    historySync.state.trades[0].source,
    "external",
    "Other-account cached metadata must not leak.",
  );
  broker3.historyComplete = false;
  await assert.rejects(historySync.refresh(true), /history is incomplete/);
  assert.equal(historySync.state.synced, false);
  historySync.dispose();

  const broker4 = new FakeBroker();
  let resolvePortfolio: () => void = () => undefined;
  broker4.portfolioDelay = new Promise<void>((resolve) => {
    resolvePortfolio = resolve;
  });
  let publications = 0;
  const disposedSync = new BrokerAccountSync(broker4, account, [], () => {
    publications += 1;
  });
  const refresh1 = disposedSync.refresh();
  const refresh2 = disposedSync.refresh();
  assert.equal(
    refresh1,
    refresh2,
    "Concurrent refreshes must share one broker snapshot request.",
  );
  disposedSync.dispose();
  resolvePortfolio();
  await refresh1;
  assert.equal(
    publications,
    0,
    "Late responses from a disposed account may not mutate a new account's UI.",
  );
  assert.equal(broker4.portfolioCalls, 1);

  const yesterday = utcDayStart() / 1000 - 10;
  assert.equal(
    realizedProfit(
      [{ buy_price: 10, sell_price: 5, sell_time: yesterday }],
      utcDayStart(),
    ),
    0,
  );
  assert.ok(states.length > 0);
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  static proposalHook: (() => void) | null = null;
  readonly sent: Array<Record<string, unknown>> = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(raw: string) {
    const message = JSON.parse(raw) as Record<string, unknown>;
    this.sent.push(message);
    const payload: Record<string, unknown> = { req_id: message.req_id };
    if (message.balance) payload.balance = { balance: 1000, currency: "USD" };
    if (message.proposal) FakeWebSocket.proposalHook?.();
    if (message.proposal)
      payload.proposal = { id: "proposal-1", ask_price: 10, spot: 1.1 };
    if (message.buy)
      payload.buy = {
        contract_id: 777,
        buy_price: 10,
        start_spot: 1.1,
        start_time: Math.floor(Date.now() / 1000),
      };
    if (message.sell) payload.sell = { sold_for: 12.5 };
    if (message.statement)
      payload.statement = {
        transactions: [
          {
            contract_id: 777,
            action_type: "sell",
            amount: 12.5,
            transaction_time: Math.floor(Date.now() / 1000),
          },
        ],
      };
    if (message.profit_table)
      payload.profit_table = {
        transactions: [
          {
            contract_id: 777,
            buy_price: 10,
            sell_price: 12.5,
            sell_time: Math.floor(Date.now() / 1000),
            purchase_time: Math.floor(Date.now() / 1000) - 90000,
          },
        ],
      };
    if (message.portfolio) payload.portfolio = { contracts: [] };
    if (message.ping) payload.ping = "pong";
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(payload) }));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

async function executionParityTests() {
  const originalWebSocket = globalThis.WebSocket;
  Object.assign(globalThis, { WebSocket: FakeWebSocket });
  try {
    const requests: Array<Array<Record<string, unknown>>> = [];
    for (const mode of ["demo", "real"] as const) {
      const socket = new DerivAccountSocket(mode);
      await socket.connect(
        `wss://api.derivws.com/trading/v1/options/ws/${mode}?otp=mock`,
      );
      const trade = await socket.executeDemo(signal, 10, 200, "USD", "auto");
      assert.equal(trade.contractId, 777);
      assert.equal(trade.accountMode, mode);
      assert.equal(trade.localStops, true);
      assert.equal(trade.signalId, signal.id);
      assert.equal(await socket.sellDemo(777), 12.5);
      const history = await socket.profitHistory(utcDayStart() / 1000);
      assert.equal(history.complete, true);
      const client = FakeWebSocket.instances.at(-1)!;
      const historyRequest = client.sent.find((message) => message.profit_table);
      assert.equal(
        historyRequest?.date_from,
        undefined,
        "Profit-table purchase date filters must not exclude overnight positions.",
      );
      assert.equal(
        history.transactions.length,
        1,
        "Sales today must include contracts purchased before midnight.",
      );
      assert.equal(history.transactions[0].buy_price, 10);
      requests.push(
        client.sent.filter(
          (message) => message.proposal || message.buy || message.sell,
        ),
      );
      socket.close();
    }
    assert.deepEqual(
      requests[0],
      requests[1],
      "Demo and real must submit identical proposal, purchase and sale payloads.",
    );
    const proposal = requests[0][0];
    assert.ok(
      proposal.limit_order,
      "Orders must include broker-side limits that survive browser closure.",
    );
    assert.equal(proposal.underlying_symbol, "frxEURUSD");
    const paused = new DerivAccountSocket("real");
    await paused.connect("wss://api.derivws.com/trading/v1/options/ws/real?otp=mock");
    let automaticEnabled = true;
    FakeWebSocket.proposalHook = () => {
      automaticEnabled = false;
    };
    await assert.rejects(
      paused.executeDemo(signal, 10, 200, "USD", "auto", () => {
        if (!automaticEnabled)
          throw new Error("Automatic trading was disabled during the proposal.");
      }),
      /disabled during/,
    );
    assert.equal(
      FakeWebSocket.instances.at(-1)!.sent.filter((message) => message.buy).length,
      0,
      "Disabling automatic trading while the proposal is pending must prevent the buy request.",
    );
    paused.close();
    FakeWebSocket.proposalHook = null;
    const socket = new DerivAccountSocket("demo");
    try {
      await assert.rejects(
        socket.connect(
          "wss://api.derivws.com/trading/v1/options/ws/demo-evil?otp=mock",
        ),
        /Unexpected/,
      );
    } finally {
      socket.close();
    }
  } finally {
    Object.assign(globalThis, { WebSocket: originalWebSocket });
  }
}

async function main() {
  await syncTests();
  await executionParityTests();
  console.log("MbioTrade v10 broker reconciliation and execution parity tests passed.");
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
