import {
  LEGACY_STORAGE_NAMESPACES,
  STORAGE_NAMESPACE,
  WORKSPACE_IMPORTED_EVENT,
} from "./app-config";
import type {
  AccountTradeEvent,
  DemoTrade,
  DerivCredentials,
  Preferences,
  Signal,
  StrategyCombo,
  WorkspaceSnapshot,
} from "./types";
import { isRecord, sanitizeWorkspace, validateCredentials } from "./validation";

export const storageKeys = {
  preferences: "preferences",
  combos: "strategy-combos",
  activeComboId: "active-combo-id",
  signals: "signals",
  demoTrades: "demo-trades",
  tradeEvents: "trade-events",
  credentials: "credentials",
} as const;

export function fullStorageKey(key: string): string {
  return `${STORAGE_NAMESPACE}${key}`;
}

function findLegacyRaw(key: string, store: Storage): string | null {
  for (const prefix of LEGACY_STORAGE_NAMESPACES) {
    const raw = store.getItem(`${prefix}${key}`);
    if (raw !== null) {
      return raw;
    }
  }

  return null;
}

function loadFromStorage<T>(store: Storage, key: string, fallback: T): T {
  const currentKey = fullStorageKey(key);

  try {
    const current = store.getItem(currentKey);
    const raw = current ?? findLegacyRaw(key, store);

    if (raw === null) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as T;

    // Copy valid JSON from older namespaces into the current namespace once.
    if (current === null) {
      store.setItem(currentKey, raw);
    }

    return parsed;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(store: Storage, key: string, value: T): boolean {
  try {
    store.setItem(fullStorageKey(key), JSON.stringify(value));
    return true;
  } catch {
    // Storage may be blocked or full. The in-memory state remains usable.
    return false;
  }
}

export function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return loadFromStorage(window.localStorage, key, fallback);
  } catch {
    return fallback;
  }
}

export function saveLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    saveToStorage(window.localStorage, key, value);
  } catch {
    // Browser policy can deny access to the Storage object itself.
  }
}

export function loadSession<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    return loadFromStorage(window.sessionStorage, key, fallback);
  } catch {
    return fallback;
  }
}

export function saveSession<T>(key: string, value: T | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (value === null) {
    try {
      sessionStorage.removeItem(fullStorageKey(key));
    } catch {
      // Ignore storage access errors during credential cleanup.
    }
    return;
  }

  try {
    saveToStorage(window.sessionStorage, key, value);
  } catch {
    // Browser policy can deny access to the Storage object itself.
  }
}

/** Remove old copies too, so migration cannot resurrect a forgotten API key. */
export function forgetSavedCredentials(): void {
  if (typeof window === "undefined") return;
  for (const kind of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = window[kind];
      for (const prefix of [STORAGE_NAMESPACE, ...LEGACY_STORAGE_NAMESPACES]) {
        store.removeItem(`${prefix}${storageKeys.credentials}`);
      }
    } catch {
      // A blocked store cannot be read either; the live connection is cleared separately.
    }
  }
}

/** Credentials are deliberately separate from exportable workspace preferences. */
export function saveSavedCredentials(credentials: DerivCredentials): boolean {
  if (!credentials.rememberSession) {
    forgetSavedCredentials();
    return true;
  }
  const validation = validateCredentials(credentials);
  if (!validation.ok || typeof window === "undefined") return false;
  try {
    const saved = saveToStorage(
      window.localStorage,
      storageKeys.credentials,
      validation.value,
    );
    if (saved) {
      for (const prefix of [STORAGE_NAMESPACE, ...LEGACY_STORAGE_NAMESPACES]) {
        window.sessionStorage.removeItem(`${prefix}${storageKeys.credentials}`);
        if (prefix !== STORAGE_NAMESPACE) {
          window.localStorage.removeItem(`${prefix}${storageKeys.credentials}`);
        }
      }
    }
    return saved;
  } catch {
    return false;
  }
}

export function loadSavedCredentials(): DerivCredentials | null {
  const stored: unknown =
    loadLocal(storageKeys.credentials, null) ??
    loadSession(storageKeys.credentials, null);
  if (!isRecord(stored)) return null;
  const validation = validateCredentials(stored);
  if (!validation.ok || !validation.value.rememberSession) {
    forgetSavedCredentials();
    return null;
  }
  // Migrate a remembered v9 tab session without ever adding it to a backup.
  saveSavedCredentials(validation.value);
  return validation.value;
}

export function workspaceFromStorage(
  fallbackPreferences: Preferences,
  fallbackCombos: StrategyCombo[],
): WorkspaceSnapshot {
  return sanitizeWorkspace(
    {
      version: 10,
      exportedAt: Date.now(),
      preferences: loadLocal(storageKeys.preferences, fallbackPreferences),
      combos: loadLocal(storageKeys.combos, fallbackCombos),
      activeComboId: loadLocal(storageKeys.activeComboId, fallbackCombos[0]?.id ?? ""),
      signals: loadLocal<Signal[]>(storageKeys.signals, []),
      demoTrades: loadLocal<DemoTrade[]>(storageKeys.demoTrades, []),
      tradeEvents: loadLocal<AccountTradeEvent[]>(storageKeys.tradeEvents, []),
    },
    fallbackPreferences,
    fallbackCombos,
  );
}

export function writeWorkspace(snapshot: WorkspaceSnapshot): void {
  saveLocal(storageKeys.preferences, snapshot.preferences);
  saveLocal(storageKeys.combos, snapshot.combos);
  saveLocal(storageKeys.activeComboId, snapshot.activeComboId);
  saveLocal(storageKeys.signals, snapshot.signals.slice(0, 500));
  saveLocal(storageKeys.demoTrades, snapshot.demoTrades.slice(0, 500));
  saveLocal(storageKeys.tradeEvents, snapshot.tradeEvents.slice(0, 1000));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_IMPORTED_EVENT));
  }
}

export function resetAllMbioTradeStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const store of [localStorage, sessionStorage]) {
    const keysToRemove: string[] = [];

    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key?.startsWith("mbiotrade.")) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      store.removeItem(key);
    }
  }
}
