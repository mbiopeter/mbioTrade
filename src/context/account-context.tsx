"use client";

import { assertOrderBalance } from "@/lib/order-funding";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BrokerAccountSync,
  emptyAccountState,
  type AccountSyncState,
} from "@/lib/account-sync";
import { DerivAccountSocket } from "@/lib/deriv-auth";
import { REQUEST_TIMEOUT_MS } from "@/lib/app-config";
import { accountStorageSuffix, belongsToAccount } from "@/lib/deriv-reconciliation";
import { canAutoTrade, collectAccountOpenTrades } from "@/lib/risk";
import { localExitReached } from "@/lib/execution";
import {
  assertEditableProtection,
  updateTradeProtection,
  type ProtectionBaseline,
  type ProtectionUpdate,
} from "@/lib/trade-protection";
import {
  automaticSettingsKey,
  automaticSettingsStillMatch,
} from "@/lib/execution-guard";
import type { WebSocketConnectionState } from "@/lib/deriv/websocket-client";
import {
  forgetSavedCredentials,
  loadLocal,
  loadSavedCredentials,
  saveLocal,
  saveSavedCredentials,
  storageKeys,
} from "@/lib/storage";
import { isRecord, sanitizeDemoTrades, validateCredentials } from "@/lib/validation";
import type {
  AcceptedMultiplier,
  AccountTradeEvent,
  DemoTrade,
  DerivAccountSummary,
  DerivCredentials,
  DerivPortfolioContract,
  LivePositionSnapshot,
  Signal,
} from "@/lib/types";
import { useToast } from "./toast-context";
import { useApp } from "./app-context";

export type AccountConnectionStatus = WebSocketConnectionState | "disconnected";
export type AccountContextValue = {
  credentials: DerivCredentials | null;
  accounts: DerivAccountSummary[];
  connected: boolean;
  connectionStatus: AccountConnectionStatus;
  connectionError: string | null;
  synced: boolean;
  accountSynced: boolean;
  syncError: string | null;
  lastSyncedAt: number | null;
  historyComplete: boolean;
  dailyRealizedPnl: number | null;
  lastTradeAt: number | null;
  balance: number | null;
  currency: string;
  portfolio: DerivPortfolioContract[];
  /** Historical name retained for workspace/component compatibility; includes both account modes. */
  demoTrades: DemoTrade[];
  livePositions: Record<string, LivePositionSnapshot>;
  tradeEvents: AccountTradeEvent[];
  loadAccounts: (token: string, appId: string) => Promise<DerivAccountSummary[]>;
  connect: (credentials: DerivCredentials) => Promise<void>;
  disconnect: () => void;
  forgetCredentials: () => void;
  executeDemo: (
    signal: Signal,
    stake: number,
    multiplier: AcceptedMultiplier,
    source?: "manual" | "auto",
    beforeBuy?: () => void,
  ) => Promise<DemoTrade>;
  sellDemo: (id: string, localExit?: { symbol: string; price: number }) => Promise<void>;
  updateProtection: (tradeId: string, updates: ProtectionUpdate, expected?: ProtectionBaseline) => Promise<void>;
  refresh: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

async function requestOtpUrl(
  credentials: DerivCredentials,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/deriv/otp", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      token: credentials.token,
      appId: credentials.appId,
      accountId: credentials.accountId,
      mode: credentials.accountMode,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || typeof payload.url !== "string") {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Could not connect account.",
    );
  }
  return payload.url;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { preferences, activeCombo } = useApp();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const comboRef = useRef(activeCombo);
  comboRef.current = activeCombo;
  const socketRef = useRef<DerivAccountSocket | null>(null);
  const syncRef = useRef<BrokerAccountSync | null>(null);
  const credentialsRef = useRef<DerivCredentials | null>(null);
  const connectionUnsubscribeRef = useRef<(() => void) | null>(null);
  const connectionErrorUnsubscribeRef = useRef<(() => void) | null>(null);
  const otpAbortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const buyPendingRef = useRef(false);
  const sellPendingRef = useRef(new Set<number>());
  const protectionPendingRef = useRef(new Set<number>());
  const automaticAttemptsRef = useRef(new Set<string>());
  const statusRef = useRef<AccountConnectionStatus>("disconnected");

  const [credentials, setCredentials] = useState<DerivCredentials | null>(null);
  const [accounts, setAccounts] = useState<DerivAccountSummary[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<AccountConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [accountState, setAccountState] = useState<AccountSyncState>(emptyAccountState);

  const notify = useCallback(
    (title: string, message: string) => {
      toast({ title, message, tone: "info" });
      if (typeof Notification !== "undefined" && Notification.permission === "granted")
        new Notification(title, { body: message });
    },
    [toast],
  );

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    otpAbortRef.current?.abort();
    otpAbortRef.current = null;
    connectionErrorUnsubscribeRef.current?.();
    connectionErrorUnsubscribeRef.current = null;
    syncRef.current?.dispose();
    syncRef.current = null;
    connectionUnsubscribeRef.current?.();
    connectionUnsubscribeRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    credentialsRef.current = null;
    statusRef.current = "disconnected";
    buyPendingRef.current = false;
    sellPendingRef.current.clear();
    protectionPendingRef.current.clear();
    automaticAttemptsRef.current.clear();
    setConnected(false);
    setConnectionStatus("disconnected");
    setConnectionError(null);
    setCredentials(null);
    setAccountState(emptyAccountState());
    // Disconnect ends this connection. Only the explicit Forget key action
    // removes the remembered credential from the user's device.
  }, []);

  const forgetCredentials = useCallback(() => {
    forgetSavedCredentials();
    disconnect();
  }, [disconnect]);

  const loadAccounts = useCallback(
    async (token: string, appId: string): Promise<DerivAccountSummary[]> => {
      const response = await fetch("/api/deriv/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, appId }),
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not load accounts.",
        );
      const list =
        isRecord(payload) && Array.isArray(payload.accounts)
          ? (payload.accounts as DerivAccountSummary[])
          : [];
      setAccounts(list);
      return list;
    },
    [],
  );

  const connect = useCallback(
    async (rawCredentials: DerivCredentials) => {
      const validation = validateCredentials(rawCredentials);
      if (!validation.ok) throw new Error(validation.error);
      const next = validation.value;
      disconnect();
      const generation = generationRef.current;
      const current = () => generationRef.current === generation;
      const socket = new DerivAccountSocket(next.accountMode);
      socketRef.current = socket;
      credentialsRef.current = next;
      const suffix = accountStorageSuffix(next);
      const scoped = sanitizeDemoTrades(
        loadLocal(`${storageKeys.demoTrades}.${suffix}`, []),
      );
      const legacy = sanitizeDemoTrades(loadLocal(storageKeys.demoTrades, []));
      const metadata = [
        ...legacy.filter(
          (trade) =>
            (!trade.accountId && next.accountMode === "demo") ||
            belongsToAccount(trade, next),
        ),
        ...scoped,
      ];
      let lastJournalSave = 0;
      let lastJournalSignature = "";
      const sync = new BrokerAccountSync(
        socket,
        next,
        metadata,
        (state) => {
          if (!current()) return;
          setAccountState(state);
          if (state.lastSyncedAt === null) return;
          const tradeSignature = state.trades
            .map(
              (trade) => [
                trade.contractId, trade.status, trade.soldFor ?? "",
                trade.localStops, trade.brokerStopLoss ?? "", trade.brokerTakeProfit ?? "",
                trade.brokerStopLossPrice ?? "", trade.brokerTakeProfitPrice ?? "",
                trade.brokerLimitsKnown,
              ].join(":"),
            )
            .join("|");
          const signature = `${tradeSignature};${state.events[0]?.id ?? ""}:${state.events.length}`;
          if (
            signature === lastJournalSignature &&
            Date.now() - lastJournalSave < 10_000
          )
            return;
          lastJournalSignature = signature;
          lastJournalSave = Date.now();
          saveLocal(`${storageKeys.demoTrades}.${suffix}`, state.trades);
          saveLocal(`${storageKeys.tradeEvents}.${suffix}`, state.events);
          // Compatibility snapshot for existing export/Google sync. All records
          // carry account identity; they cannot become positions on another account.
          saveLocal(storageKeys.demoTrades, state.trades);
          saveLocal(storageKeys.tradeEvents, state.events);
        },
        (trade) => {
          if (!current()) return;
          const pnl = trade.brokerProfit;
          notify(
            "Trade closed",
            `${trade.symbol} · ${pnl === undefined ? "confirmed by Deriv" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ${trade.currency ?? sync.state.currency}`}`,
          );
        },
      );
      syncRef.current = sync;
      let initialized = false;
      let initialization: Promise<void> | null = null;
      let previouslyConnected = false;
      setCredentials(next);
      if (!saveSavedCredentials(next)) {
        toast({
          title: "API key could not be remembered",
          message:
            "This browser blocked local storage. Allow site storage to keep the key after closing the browser.",
          tone: "info",
        });
      }
      const initialize = () => {
        if (initialization) return initialization;
        initialization = sync
          .start()
          .catch((error: unknown) => {
            if (current())
              toast({
                title: "Account synchronization will retry",
                message:
                  error instanceof Error
                    ? error.message
                    : "Could not synchronize account.",
                tone: "info",
              });
          })
          .then(() => {
            if (!current()) return;
            initialized = true;
            if (statusRef.current !== "connected") return;
            toast({
              title: `${next.accountMode === "demo" ? "Demo" : "Real"} account connected`,
              message: sync.state.synced
                ? "Positions and trade history are synchronized with Deriv. Your selected execution mode applies to this account."
                : "Monitoring is connected. New entries wait for a complete Deriv account sync.",
              tone: sync.state.synced ? "success" : "info",
            });
          });
        return initialization;
      };
      connectionErrorUnsubscribeRef.current = socket.onConnectionError((message) => {
        if (current()) setConnectionError(message);
      });
      connectionUnsubscribeRef.current = socket.onConnectionState((state) => {
        if (!current()) return;
        statusRef.current = state;
        setConnectionStatus(state);
        setConnected(state === "connected");
        if (state !== "connected") {
          sync.markOffline();
          return;
        }
        // First-attempt failures do not dispose the session: a later successful
        // retry must install the same subscriptions and initialize broker state.
        if (!initialized) void initialize();
        else void sync.refresh(true).catch(() => undefined);
        if (previouslyConnected)
          notify(
            "Deriv connection restored",
            "Refreshing account positions and trade history from Deriv.",
          );
        previouslyConnected = true;
      });
      try {
        await socket.connect(async () => {
          otpAbortRef.current?.abort();
          const controller = new AbortController();
          otpAbortRef.current = controller;
          const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          try {
            return await requestOtpUrl(next, controller.signal);
          } catch (error) {
            if (controller.signal.aborted && current())
              throw new Error(
                "Deriv authentication request timed out. Retrying automatically.",
              );
            throw error;
          } finally {
            clearTimeout(timeout);
            if (otpAbortRef.current === controller) otpAbortRef.current = null;
          }
        });
        if (!current()) {
          socket.close();
          return;
        }
        await initialize();
      } catch (error) {
        if (!current()) return;
        const message =
          error instanceof Error ? error.message : "Deriv connection failed.";
        setConnectionError(message);
        // The transport owns an indefinitely retrying, capped-backoff loop.
        // Disconnect/Forget/account changes explicitly cancel that loop.
        toast({
          title: "Deriv connection will retry automatically",
          message,
          tone: "info",
        });
      }
    },
    [disconnect, notify, toast],
  );

  useEffect(() => {
    let active = true;
    const saved = loadSavedCredentials();
    if (saved)
      void connect(saved).catch((error: unknown) => {
        if (active)
          toast({
            title: "Saved Deriv account could not reconnect",
            message: error instanceof Error ? error.message : "Unknown error",
            tone: "error",
          });
      });
    return () => {
      active = false;
      disconnect();
    };
  }, [connect, disconnect, toast]);

  const refresh = useCallback(async () => {
    const sync = syncRef.current;
    if (!sync || statusRef.current !== "connected") return;
    await sync.refresh(true);
  }, []);

  useEffect(() => {
    const refreshQuietly = () => {
      if (statusRef.current === "connected")
        void syncRef.current?.refresh().catch(() => undefined);
    };
    const interval = window.setInterval(refreshQuietly, 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshQuietly();
    };
    window.addEventListener("focus", refreshQuietly);
    window.addEventListener("online", refreshQuietly);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshQuietly);
      window.removeEventListener("online", refreshQuietly);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const executeDemo = useCallback(
    async (
      signal: Signal,
      stake: number,
      multiplier: AcceptedMultiplier,
      source: "manual" | "auto" = "manual",
      beforeBuy?: () => void,
    ): Promise<DemoTrade> => {
      const socket = socketRef.current;
      const sync = syncRef.current;
      const account = credentialsRef.current;
      const generation = generationRef.current;
      const settingsKey = automaticSettingsKey(
        preferencesRef.current,
        comboRef.current,
      );
      if (!socket || !sync || !account || statusRef.current !== "connected")
        throw new Error(
          "Connect a Deriv account and wait for its live connection before trading.",
        );
      if (!sync.state.synced)
        throw new Error(
          "Wait for Deriv positions and trade history to finish synchronizing.",
        );
      if (buyPendingRef.current)
        throw new Error(
          "An order is already being submitted. Wait for Deriv to confirm it.",
        );
      const attempt = `${accountStorageSuffix(account)}:${signal.id}`;
      if (
        source === "auto" &&
        (automaticAttemptsRef.current.has(attempt) ||
          sync.state.trades.some((trade) => trade.signalId === signal.id))
      )
        throw new Error("This automatic signal has already been submitted.");
      buyPendingRef.current = true;
      const assertCurrentOrder = () => {
        if (
          generation !== generationRef.current ||
          statusRef.current !== "connected" ||
          !sync.state.synced
        )
          throw new Error(
            "Account connection changed. Wait for the current account to synchronize.",
          );
        const currentPreferences = preferencesRef.current;
        if (
          source === "auto" &&
          !automaticSettingsStillMatch(
            currentPreferences,
            comboRef.current,
            settingsKey,
            signal,
            stake,
            multiplier,
          )
        ) {
          throw new Error(
            "Automatic trading settings changed before this order was submitted.",
          );
        }
        const risk = currentPreferences.risk;
        const gate = canAutoTrade(
          signal,
          collectAccountOpenTrades(sync.state.trades, sync.state.portfolio),
          sync.state.trades,
          risk.maxOpenDemoTrades,
          risk.marginBudget,
          stake,
          risk.maxDailyDemoLoss,
          risk.cooldownMinutes,
          {
            realizedPnl: sync.state.dailyRealizedPnl,
            latestTradeAt: sync.state.lastTradeAt,
          },
        );
        if (!gate.ok)
          throw new Error(
            gate.reason ?? "This order exceeds the configured risk limits.",
          );
        assertOrderBalance(stake, sync.state.balance, sync.state.currency);
        beforeBuy?.();
      };
      try {
        await sync.refresh(true);
        assertCurrentOrder();
        if (source === "auto") automaticAttemptsRef.current.add(attempt);
        const trade = await socket.executeDemo(
          signal,
          stake,
          multiplier,
          sync.state.currency,
          source,
          assertCurrentOrder,
        );
        const enriched: DemoTrade = {
          ...trade,
          accountId: account.accountId,
          accountMode: account.accountMode,
          comboId: signal.comboId,
          comboName: signal.comboName,
          confidence: signal.confidence,
        };
        if (generation === generationRef.current) {
          sync.recordPurchase(enriched);
          notify(
            "Trade opened",
            `${trade.direction} ${trade.symbol} · amount ${trade.stake.toFixed(2)} ${sync.state.currency} · ×${trade.multiplier}`,
          );
        }
        return enriched;
      } catch (error) {
        if (generation === generationRef.current) sync.scheduleRefresh();
        throw error;
      } finally {
        if (generation === generationRef.current) buyPendingRef.current = false;
      }
    },
    [notify],
  );

  const updateProtection = useCallback(async (id: string, updates: ProtectionUpdate, expected?: ProtectionBaseline) => {
    const socket = socketRef.current;
    const sync = syncRef.current;
    const account = credentialsRef.current;
    const generation = generationRef.current;
    if (!socket || !sync || !account || statusRef.current !== "connected")
      throw new Error("Wait for the Deriv connection before changing protection.");
    const getTrade = () => sync.state.trades.find((trade) => trade.id === id);
    const trade = getTrade();
    assertEditableProtection(trade, account);
    const contractId = trade.contractId;
    if (sellPendingRef.current.has(contractId))
      throw new Error("This contract is already being closed. Wait for Deriv to confirm its status.");
    if (protectionPendingRef.current.has(contractId))
      throw new Error("A protection update for this contract is already being verified. Please wait.");
    protectionPendingRef.current.add(contractId);
    const assertCurrent = () => {
      if (
        generation !== generationRef.current ||
        socketRef.current !== socket ||
        syncRef.current !== sync
      )
        throw new Error("The connected account changed. Reconnect the original account and check this contract's limits at Deriv.");
    };
    try {
      await updateTradeProtection({
        account,
        getTrade,
        assertCurrent,
        readContract: (contract) => socket.openContract(contract),
        sendUpdate: (contract, changes, stake, beforeSend) => socket.updateProtection(
          contract, changes, stake, () => {
            assertCurrent();
            if (statusRef.current !== "connected")
              throw new Error("The Deriv connection changed before the update was sent.");
            beforeSend();
          },
        ),
        applyContract: (contract) => sync.applyContract(contract),
        disableLocalStops: (contract) => sync.disableLocalStops(contract),
      }, updates, expected);
    } finally {
      if (generation === generationRef.current) {
        protectionPendingRef.current.delete(contractId);
        sync.scheduleRefresh();
      }
    }
  }, []);

  const sellDemo = useCallback(async (id: string, localExit?: { symbol: string; price: number }) => {
    const socket = socketRef.current;
    const sync = syncRef.current;
    const account = credentialsRef.current;
    const generation = generationRef.current;
    const trade = sync?.state.trades.find((item) => item.id === id);
    if (
      !socket ||
      !sync ||
      !account ||
      !trade?.contractId ||
      !belongsToAccount(trade, account)
    )
      throw new Error("This contract is unavailable on the connected account.");
    if (trade.status === "closed") return;
    if (statusRef.current !== "connected")
      throw new Error("Wait for the Deriv connection before closing this trade.");
    if (protectionPendingRef.current.has(trade.contractId))
      throw new Error("Wait for the protection update to finish before closing this trade.");
    if (sellPendingRef.current.has(trade.contractId)) return;
    sellPendingRef.current.add(trade.contractId);
    const assertCanClose = () => {
      if (generation !== generationRef.current || statusRef.current !== "connected")
        throw new Error("The connected account changed before the close request was sent.");
      const current = sync.state.trades.find((item) => item.id === id);
      if (!current || !belongsToAccount(current, account) || current.status !== "open")
        throw new Error("This contract is no longer open on the connected account.");
      if (localExit && !localExitReached(current, localExit.symbol, localExit.price))
        throw new Error("The saved price exit is no longer current. Deriv's current protection remains in control.");
    };
    try {
      if (localExit) {
        // A different device may have adjusted protection since the last tick.
        // Check this contract only; a history/balance outage must not block it.
        const contract = await socket.openContract(trade.contractId);
        if (generation !== generationRef.current)
          throw new Error("The connected account changed before the close request was sent.");
        sync.applyContract(contract);
        if (sync.state.trades.find((item) => item.id === id)?.status === "closed") return;
        if (!Object.prototype.hasOwnProperty.call(contract, "limit_order"))
          throw new Error("Deriv's current protection could not be verified before the local exit.");
      }
      assertCanClose();
      const soldFor = await socket.sellDemo(trade.contractId, assertCanClose);
      if (generation === generationRef.current) sync.recordSale(trade, soldFor);
    } catch (error) {
      // A second device may have sold the contract while this request was in
      // flight. Verify the broker outcome before reporting a failed closure.
      try {
        const contract = await socket.openContract(trade.contractId);
        if (generation === generationRef.current) {
          sync.applyContract(contract);
          if (
            sync.state.trades.find((item) => item.contractId === trade.contractId)
              ?.status === "closed"
          )
            return;
        }
      } catch {
        /* Preserve the original sell error if status is unavailable. */
      }
      throw error;
    } finally {
      if (generation === generationRef.current) {
        sellPendingRef.current.delete(trade.contractId);
        sync.scheduleRefresh();
      }
    }
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      credentials,
      accounts,
      connected,
      connectionStatus,
      connectionError,
      synced: accountState.synced,
      accountSynced: accountState.synced,
      syncError: accountState.syncError,
      lastSyncedAt: accountState.lastSyncedAt,
      historyComplete: accountState.historyComplete,
      dailyRealizedPnl: accountState.dailyRealizedPnl,
      lastTradeAt: accountState.lastTradeAt,
      balance: accountState.balance,
      currency: accountState.currency,
      portfolio: accountState.portfolio,
      demoTrades: accountState.trades,
      livePositions: accountState.livePositions,
      tradeEvents: accountState.events,
      loadAccounts,
      connect,
      disconnect,
      forgetCredentials,
      executeDemo,
      sellDemo,
      updateProtection,
      refresh,
    }),
    [
      credentials,
      accounts,
      connected,
      connectionStatus,
      connectionError,
      accountState,
      loadAccounts,
      connect,
      disconnect,
      forgetCredentials,
      executeDemo,
      sellDemo,
      updateProtection,
      refresh,
    ],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccount must be used inside AccountProvider.");
  return context;
}
