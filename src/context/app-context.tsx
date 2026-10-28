"use client";

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
  BROADCAST_CHANNEL_NAME,
  STORAGE_NAMESPACE,
  WORKSPACE_IMPORTED_EVENT,
} from "@/lib/app-config";
import { DEFAULT_COMBOS, DEFAULT_PREFERENCES } from "@/lib/defaults";
import { loadLocal, saveLocal, storageKeys, writeWorkspace } from "@/lib/storage";
import { buildPresetSelection } from "@/lib/strategy-presets";
import { isRemovedMultiplier } from "@/lib/multipliers";
import { useToast } from "./toast-context";
import {
  isRecord,
  sanitizeCombo,
  sanitizePreferences,
  sanitizeSignals,
  sanitizeWorkspace,
} from "@/lib/validation";
import type {
  Preferences,
  Signal,
  StrategyCombo,
  WorkspaceSnapshot,
} from "@/lib/types";

export type AppContextValue = {
  preferences: Preferences;
  updatePreferences: (patch: Partial<Preferences>) => void;
  combos: StrategyCombo[];
  setCombos: (combos: StrategyCombo[]) => void;
  activeComboId: string;
  setActiveComboId: (id: string) => void;
  activateCombo: (combo: StrategyCombo) => void;
  applyStrategyPreset: (id: string) => { preservedCustomCopy: boolean } | null;
  activeCombo: StrategyCombo;
  signals: Signal[];
  pushSignal: (signal: Signal) => void;
  clearSignals: () => void;
  exportWorkspace: () => WorkspaceSnapshot;
  importWorkspace: (raw: unknown) => void;
  hydrated: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

function mergeDefaultCombos(loaded: StrategyCombo[]): StrategyCombo[] {
  const loadedIds = new Set(loaded.map((combo) => combo.id));
  const missingDefaults = DEFAULT_COMBOS.filter((combo) => !loadedIds.has(combo.id));
  return [...loaded, ...missingDefaults];
}

function loadCombos(): StrategyCombo[] {
  const raw = loadLocal<unknown>(storageKeys.combos, []);
  const imported = (Array.isArray(raw) ? raw : [])
    .map(sanitizeCombo)
    .filter((combo): combo is StrategyCombo => Boolean(combo));

  return mergeDefaultCombos(imported.length ? imported : DEFAULT_COMBOS);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [combos, setComboState] = useState(DEFAULT_COMBOS);
  const [activeComboId, setActiveComboIdState] = useState(DEFAULT_COMBOS[0].id);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const suppressPreferenceBroadcastRef = useRef(false);
  const migrationNotifiedRef = useRef(false);

  const notifyMultiplierMigration = useCallback(
    (raw: unknown) => {
      if (
        !migrationNotifiedRef.current &&
        isRecord(raw) &&
        isRecord(raw.risk) &&
        isRemovedMultiplier(raw.risk.multiplier)
      ) {
        migrationNotifiedRef.current = true;
        toast({
          title: "Multiplier settings need review",
          message:
            "Your saved multiplier below 100 was removed. The ticket is now 100× and trading is paused in Signals. Existing positions retain their original size.",
          tone: "info",
        });
      }
    },
    [toast],
  );

  const broadcastSync = useCallback(() => {
    try {
      channelRef.current?.postMessage({ type: "sync", at: Date.now() });
    } catch {}
  }, []);

  const hydrateFromStorage = useCallback(() => {
    suppressPreferenceBroadcastRef.current = true;

    const rawPreferences = loadLocal(storageKeys.preferences, DEFAULT_PREFERENCES);
    const nextPreferences = sanitizePreferences(rawPreferences, DEFAULT_PREFERENCES);
    notifyMultiplierMigration(rawPreferences);
    const nextCombos = loadCombos();
    const storedActiveComboId = loadLocal(
      storageKeys.activeComboId,
      nextCombos[0]?.id ?? "",
    );
    const nextActiveComboId = nextCombos.some(
      (combo) => combo.id === storedActiveComboId,
    )
      ? storedActiveComboId
      : (nextCombos[0]?.id ?? "");
    const nextSignals = sanitizeSignals(loadLocal(storageKeys.signals, []));

    setPreferences(nextPreferences);
    setComboState(nextCombos);
    setActiveComboIdState(nextActiveComboId);
    setSignals(nextSignals);
    setHydrated(true);
  }, [notifyMultiplierMigration]);

  useEffect(() => {
    hydrateFromStorage();

    try {
      channelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channelRef.current.onmessage = (event) => {
        if (event.data?.type === "sync") {
          hydrateFromStorage();
        }
      };
    } catch {
      channelRef.current = null;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(STORAGE_NAMESPACE)) {
        hydrateFromStorage();
      }
    };
    const handleWorkspaceImport = () => hydrateFromStorage();

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      WORKSPACE_IMPORTED_EVENT,
      handleWorkspaceImport as EventListener,
    );

    return () => {
      channelRef.current?.close();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        WORKSPACE_IMPORTED_EVENT,
        handleWorkspaceImport as EventListener,
      );
    };
  }, [hydrateFromStorage]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", preferences.accent);

    if (!hydrated) {
      return;
    }

    saveLocal(storageKeys.preferences, preferences);

    if (suppressPreferenceBroadcastRef.current) {
      suppressPreferenceBroadcastRef.current = false;
      return;
    }

    broadcastSync();
  }, [broadcastSync, hydrated, preferences]);

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) =>
      sanitizePreferences(
        {
          ...current,
          ...patch,
          risk: patch.risk ? { ...current.risk, ...patch.risk } : current.risk,
          googleSync: patch.googleSync
            ? { ...current.googleSync, ...patch.googleSync }
            : current.googleSync,
        },
        DEFAULT_PREFERENCES,
      ),
    );
  }, []);

  const setCombos = useCallback(
    (nextCombos: StrategyCombo[]) => {
      const safeCombos = nextCombos
        .map(sanitizeCombo)
        .filter((combo): combo is StrategyCombo => Boolean(combo));

      if (safeCombos.length === 0) {
        return;
      }

      setComboState(safeCombos);
      saveLocal(storageKeys.combos, safeCombos);
      broadcastSync();
    },
    [broadcastSync],
  );

  const setActiveComboId = useCallback(
    (id: string) => {
      const safeId = combos.some((combo) => combo.id === id)
        ? id
        : (combos[0]?.id ?? DEFAULT_COMBOS[0].id);

      setActiveComboIdState(safeId);
      saveLocal(storageKeys.activeComboId, safeId);
      broadcastSync();
    },
    [broadcastSync, combos],
  );

  const commitSelection = useCallback(
    (
      nextCombos: StrategyCombo[],
      nextActiveId: string,
      nextPreferences: Preferences,
    ) => {
      // Persist Signals before publishing a changed combination. Other same-origin
      // tabs must not hydrate a new strategy together with the old Automatic mode.
      saveLocal(storageKeys.preferences, nextPreferences);
      saveLocal(storageKeys.combos, nextCombos);
      saveLocal(storageKeys.activeComboId, nextActiveId);
      suppressPreferenceBroadcastRef.current = true;
      setPreferences(nextPreferences);
      setComboState(nextCombos);
      setActiveComboIdState(nextActiveId);
      broadcastSync();
    },
    [broadcastSync],
  );

  const activateCombo = useCallback(
    (combo: StrategyCombo) => {
      const safeCombo = sanitizeCombo(combo);
      if (!safeCombo) return;
      const nextCombos = combos.some((item) => item.id === safeCombo.id)
        ? combos.map((item) => (item.id === safeCombo.id ? safeCombo : item))
        : [...combos, safeCombo];
      commitSelection(nextCombos, safeCombo.id, {
        ...preferences,
        executionMode: "signals",
      });
    },
    [combos, commitSelection, preferences],
  );

  const applyStrategyPreset = useCallback(
    (id: string) => {
      const next = buildPresetSelection(id, preferences, combos, crypto.randomUUID());
      if (!next) return null;
      commitSelection(next.combos, next.activeComboId, next.preferences);
      return { preservedCustomCopy: next.preservedCustomCopy };
    },
    [combos, commitSelection, preferences],
  );

  const pushSignal = useCallback(
    (signal: Signal) => {
      setSignals((current) => {
        if (current[0]?.id === signal.id) {
          return current;
        }

        const next = [signal, ...current].slice(0, 500);
        saveLocal(storageKeys.signals, next);
        broadcastSync();
        return next;
      });
    },
    [broadcastSync],
  );

  const clearSignals = useCallback(() => {
    setSignals([]);
    saveLocal(storageKeys.signals, []);
    broadcastSync();
  }, [broadcastSync]);

  const exportWorkspace = useCallback(
    (): WorkspaceSnapshot => ({
      version: 10,
      exportedAt: Date.now(),
      preferences,
      combos,
      activeComboId,
      signals,
      demoTrades: loadLocal(storageKeys.demoTrades, []),
      tradeEvents: loadLocal(storageKeys.tradeEvents, []),
    }),
    [activeComboId, combos, preferences, signals],
  );

  const importWorkspace = useCallback(
    (raw: unknown) => {
      if (isRecord(raw)) notifyMultiplierMigration(raw.preferences);
      const safeWorkspace = sanitizeWorkspace(raw, DEFAULT_PREFERENCES, DEFAULT_COMBOS);
      writeWorkspace(safeWorkspace);
      hydrateFromStorage();
      broadcastSync();
    },
    [broadcastSync, hydrateFromStorage, notifyMultiplierMigration],
  );

  const activeCombo =
    combos.find((combo) => combo.id === activeComboId) ??
    combos[0] ??
    DEFAULT_COMBOS[0];

  const value = useMemo<AppContextValue>(
    () => ({
      preferences,
      updatePreferences,
      combos,
      setCombos,
      activeComboId,
      setActiveComboId,
      activateCombo,
      applyStrategyPreset,
      activeCombo,
      signals,
      pushSignal,
      clearSignals,
      exportWorkspace,
      importWorkspace,
      hydrated,
    }),
    [
      preferences,
      updatePreferences,
      combos,
      setCombos,
      activeComboId,
      setActiveComboId,
      activateCombo,
      applyStrategyPreset,
      activeCombo,
      signals,
      pushSignal,
      clearSignals,
      exportWorkspace,
      importWorkspace,
      hydrated,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider.");
  }
  return context;
}
