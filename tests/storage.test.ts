import assert from "node:assert/strict";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "../src/lib/defaults";
import { DERIV_APP_ID_EXAMPLE } from "../src/lib/deriv-app-id";
import {
  normalizeDerivAccounts,
  isDerivAccountUrl,
} from "../src/lib/server/deriv-accounts";
import {
  forgetSavedCredentials,
  fullStorageKey,
  loadSavedCredentials,
  saveSavedCredentials,
  workspaceFromStorage,
  loadLocal,
  saveLocal,
} from "../src/lib/storage";
import { sanitizeDemoTrades } from "../src/lib/validation";
import type { DerivCredentials } from "../src/lib/types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: local, sessionStorage: session },
});
const credentials: DerivCredentials = {
  token: "test-token-not-a-real-secret",
  appId: DERIV_APP_ID_EXAMPLE,
  accountId: "VRTC123",
  accountMode: "demo",
  rememberSession: true,
};

assert.equal(saveSavedCredentials(credentials), true);
session.clear(); // Closing a tab must not delete the saved API key.
assert.deepEqual(loadSavedCredentials(), credentials);
assert.ok(local.getItem(fullStorageKey("credentials")));

forgetSavedCredentials();
session.setItem("mbiotrade.v9.credentials", JSON.stringify(credentials));
assert.deepEqual(loadSavedCredentials(), credentials);
assert.equal(session.getItem("mbiotrade.v9.credentials"), null);
assert.ok(local.getItem(fullStorageKey("credentials")));

local.setItem("mbiotrade.v8.credentials", JSON.stringify(credentials));
session.setItem("mbiotrade.v7.credentials", JSON.stringify(credentials));
forgetSavedCredentials();
assert.equal(loadSavedCredentials(), null);
assert.equal(local.getItem("mbiotrade.v8.credentials"), null);
assert.equal(session.getItem("mbiotrade.v7.credentials"), null);
saveSavedCredentials(credentials);
saveSavedCredentials({ ...credentials, rememberSession: false });
assert.equal(loadSavedCredentials(), null);

local.setItem(fullStorageKey("credentials"), JSON.stringify({ token: "bad" }));
assert.equal(loadSavedCredentials(), null);
saveSavedCredentials(credentials);
local.setItem(
  fullStorageKey("preferences"),
  JSON.stringify({
    ...DEFAULT_PREFERENCES,
    derivToken: credentials.token,
    token: credentials.token,
  }),
);
const exported = workspaceFromStorage(DEFAULT_PREFERENCES, DEFAULT_COMBOS);
assert.equal(exported.version, 10);
assert.equal(JSON.stringify(exported).includes(credentials.token), false);
assert.equal("derivToken" in exported.preferences, false);

const restored = sanitizeDemoTrades([
  {
    id: "broker-123",
    contractId: 123,
    accountId: "VRTC123",
    accountMode: "demo",
    symbol: "frxEURUSD",
    direction: "UP",
    entry: 1.1,
    stopLoss: 0,
    takeProfit: 0,
    stake: 20,
    multiplier: 10,
    openedAt: Date.now(),
    status: "open",
    source: "external",
    localStops: false,
    brokerProfit: 4.2,
    brokerTakeProfit: 8,
    brokerStopLoss: 4,
    currency: "USD",
    contractType: "MULTUP",
    signalId: "test-signal",
    soldFor: null,
    closedAt: null,
  },
]);
assert.equal(restored.length, 1);
assert.equal(restored[0].multiplier, 10);
assert.equal(restored[0].accountId, "VRTC123");
assert.equal(restored[0].source, "external");
assert.equal(restored[0].brokerProfit, 4.2);
assert.equal(restored[0].soldFor, undefined);
assert.equal(restored[0].closedAt, undefined);
assert.equal(restored[0].localStops, false);
assert.equal(sanitizeDemoTrades([{ ...restored[0], multiplier: 0 }])[0].multiplier, 0);

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    get localStorage() {
      throw new Error("Storage blocked");
    },
    get sessionStorage() {
      throw new Error("Storage blocked");
    },
  },
});
assert.equal(saveSavedCredentials(credentials), false);
assert.equal(loadSavedCredentials(), null);
assert.equal(loadLocal("preferences", "fallback"), "fallback");
assert.doesNotThrow(() => saveLocal("preferences", {}));
assert.doesNotThrow(() => forgetSavedCredentials());

if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
else Reflect.deleteProperty(globalThis, "window");

const accounts = normalizeDerivAccounts({
  data: [
    { account_id: "DEMO1", is_virtual: "1", currency: "USD" },
    { account_id: "REAL1", is_virtual: "0", currency: "USD" },
    { account_id: "DEMO2", account_type: "demo" },
    { account_id: "UNKNOWN" },
  ],
});
assert.deepEqual(
  accounts.map((row) => [row.accountId, row.isDemo]),
  [
    ["DEMO1", true],
    ["REAL1", false],
    ["DEMO2", true],
  ],
);
assert.equal(
  isDerivAccountUrl(
    "wss://api.derivws.com/trading/v1/options/ws/demo?otp=test",
    "demo",
  ),
  true,
);
assert.equal(
  isDerivAccountUrl(
    "wss://api.derivws.com/trading/v1/options/ws/real?otp=test",
    "demo",
  ),
  false,
);
assert.equal(
  isDerivAccountUrl("wss://api.derivws.com/trading/v1/options/ws/demoevil", "demo"),
  false,
);
assert.equal(
  isDerivAccountUrl(
    "wss://api.derivws.com.evil.test/trading/v1/options/ws/demo",
    "demo",
  ),
  false,
);
console.log(
  "MbioTrade v10 credential persistence, migration and account validation tests passed.",
);
