import { fullStorageKey } from "./storage";
import type { DemoTrade, ExecutionMode, Signal } from "./types";

export function normalizeExecutionMode(
  value: unknown,
  fallback: ExecutionMode = "signals",
): ExecutionMode {
  if (value === "auto-demo") return "automatic";
  if (value === "manual-demo" || value === "real-assisted") return "manual";
  return value === "signals" || value === "manual" || value === "automatic"
    ? value
    : fallback;
}

/** Local price exits apply only to a recorded plan for this exact instrument. */
export function localExitReached(
  trade: DemoTrade,
  symbol: string,
  price: number,
): boolean {
  if (
    trade.status !== "open" ||
    !trade.contractId ||
    trade.localStops !== true ||
    trade.symbol !== symbol ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(trade.entry) ||
    trade.entry <= 0 ||
    !Number.isFinite(trade.stopLoss) ||
    trade.stopLoss <= 0 ||
    !Number.isFinite(trade.takeProfit) ||
    trade.takeProfit <= 0
  )
    return false;
  if (trade.direction === "UP") {
    return (
      trade.stopLoss < trade.entry &&
      trade.takeProfit > trade.entry &&
      (price >= trade.takeProfit || price <= trade.stopLoss)
    );
  }
  return (
    trade.stopLoss > trade.entry &&
    trade.takeProfit < trade.entry &&
    (price <= trade.takeProfit || price >= trade.stopLoss)
  );
}

export function signalAlreadyTraded(trades: DemoTrade[], signal: Signal): boolean {
  return trades.some(
    (trade) => trade.source === "auto" && trade.signalId === signal.id,
  );
}

const inFlight = new Set<string>();
const attempted = new Map<string, Set<string>>();
const MAX_REMEMBERED_ATTEMPTS = 500;

type AttemptStore = Pick<Storage, "getItem" | "setItem">;

/**
 * Record before sending a buy. An uncertain response must not create a retry
 * after navigation/reload. This is a browser deduplication journal, never the
 * source of position or balance data.
 */
export function claimAutomaticSignal(
  accountKey: string,
  signalId: string,
  store?: AttemptStore,
): boolean {
  const key = fullStorageKey(`auto-attempts:${accountKey}`);
  const memory = attempted.get(accountKey) ?? new Set<string>();
  let ids: string[] = [];
  if (store) {
    try {
      const parsed: unknown = JSON.parse(store.getItem(key) ?? "[]");
      if (Array.isArray(parsed))
        ids = parsed.filter((value): value is string => typeof value === "string");
    } catch {
      // The shared Web Lock still serializes tabs when storage is unavailable.
    }
  }
  if (memory.has(signalId) || ids.includes(signalId)) return false;
  memory.add(signalId);
  while (memory.size > MAX_REMEMBERED_ATTEMPTS)
    memory.delete(memory.values().next().value!);
  attempted.set(accountKey, memory);
  if (store) {
    // Do not send a buy if its attempt cannot survive a reload on this device.
    store.setItem(
      key,
      JSON.stringify([...ids, signalId].slice(-MAX_REMEMBERED_ATTEMPTS)),
    );
  }
  return true;
}

/**
 * Web Locks serialize automatic entries across tabs on the same origin. Broker
 * reconciliation handles positions across devices; run one automation owner
 * per account because Deriv does not provide a distributed signal lock.
 */
export async function runAutomaticSignalOnce(
  accountKey: string,
  signalId: string,
  action: () => Promise<unknown>,
  isReady: () => boolean = () => true,
): Promise<boolean> {
  if (inFlight.has(accountKey)) return false;
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error(
      "Automatic trading requires a browser with Web Locks over HTTPS. Manual trading remains available.",
    );
  }
  inFlight.add(accountKey);
  try {
    return await navigator.locks.request(
      `mbiotrade-auto:${accountKey}`,
      { mode: "exclusive", ifAvailable: true },
      async (lock) => {
        if (!lock || !isReady()) return false;
        if (!claimAutomaticSignal(accountKey, signalId, window.localStorage))
          return false;
        await action();
        return true;
      },
    );
  } finally {
    inFlight.delete(accountKey);
  }
}
