import {
  DERIV_APP_ID_ERROR,
  isValidDerivAppId,
  normalizeDerivAppId,
} from "../deriv-app-id";
import { normalizeExecutionMode } from "../execution";
import { isRemovedMultiplier, sanitizeMultiplier } from "../multipliers";
import { sanitizeTradeAmount } from "../trade-amount";
import type {
  DerivCredentials,
  MarketClass,
  Preferences,
  StrategyCombo,
  Timeframe,
} from "../types";
import {
  ALLOWED_STRATEGY_IDS,
  clampNumber,
  cleanText,
  isRecord,
  safeHex,
  safeId,
  TIMEFRAMES,
} from "./common";

const MARKET_CLASSES = new Set<MarketClass>(["forex", "cryptocurrency", "metals"]);

export function sanitizeAppId(value: unknown): string {
  const normalized = normalizeDerivAppId(value);
  return isValidDerivAppId(normalized) ? normalized : "";
}

export function sanitizePreferences(raw: unknown, fallback: Preferences): Preferences {
  const preferences = isRecord(raw) ? raw : {};
  const risk = isRecord(preferences.risk) ? preferences.risk : {};
  const googleSync = isRecord(preferences.googleSync) ? preferences.googleSync : {};

  const marketClass = MARKET_CLASSES.has(preferences.marketClass as MarketClass)
    ? (preferences.marketClass as MarketClass)
    : fallback.marketClass;

  const timeframe = TIMEFRAMES.includes(Number(preferences.timeframe) as Timeframe)
    ? (Number(preferences.timeframe) as Timeframe)
    : fallback.timeframe;

  // A removed factor becomes 100x. Pause entries so an upgrade or import cannot
  // automatically resume trading with a larger exposure than the user selected.
  const executionMode = isRemovedMultiplier(risk.multiplier)
    ? "signals"
    : normalizeExecutionMode(preferences.executionMode, fallback.executionMode);

  const symbol = cleanText(preferences.symbol, 30);
  const safeSymbol = /^[A-Za-z0-9_]{2,30}$/.test(symbol) ? symbol : fallback.symbol;

  const googleClientId = cleanText(googleSync.clientId, 200);

  return {
    symbol: safeSymbol,
    marketClass,
    timeframe,
    executionMode,
    automationExecutor:
      preferences.automationExecutor === "worker" ? "worker" : "browser",
    notifySignals:
      typeof preferences.notifySignals === "boolean"
        ? preferences.notifySignals
        : fallback.notifySignals,
    notifyMinConfidence: clampNumber(
      preferences.notifyMinConfidence,
      50,
      99,
      fallback.notifyMinConfidence,
    ),
    accent: safeHex(preferences.accent, fallback.accent),
    // The v8 sidebar uses fixed grouped navigation rather than icon collapse.
    compactSidebar: false,
    derivAppId: sanitizeAppId(preferences.derivAppId),
    risk: {
      stake: sanitizeTradeAmount(risk.stake, fallback.risk.stake),
      multiplier: sanitizeMultiplier(risk.multiplier, fallback.risk.multiplier),
      riskReward: clampNumber(risk.riskReward, 0.5, 10, fallback.risk.riskReward),
      atrStop: clampNumber(risk.atrStop, 0.3, 10, fallback.risk.atrStop),
      maxOpenDemoTrades: Math.round(
        clampNumber(risk.maxOpenDemoTrades, 1, 10, fallback.risk.maxOpenDemoTrades),
      ),
      marginBudget: clampNumber(
        risk.marginBudget,
        1,
        1_000_000,
        fallback.risk.marginBudget,
      ),
      maxDailyDemoLoss: clampNumber(
        risk.maxDailyDemoLoss,
        1,
        100_000,
        fallback.risk.maxDailyDemoLoss,
      ),
      cooldownMinutes: Math.round(
        clampNumber(risk.cooldownMinutes, 0, 1440, fallback.risk.cooldownMinutes),
      ),
    },
    googleSync: {
      enabled: Boolean(googleSync.enabled),
      clientId: /^[0-9A-Za-z._-]{8,200}$/.test(googleClientId) ? googleClientId : "",
      autoSync: Boolean(googleSync.autoSync),
      lastSyncAt: Number.isFinite(Number(googleSync.lastSyncAt))
        ? Number(googleSync.lastSyncAt)
        : undefined,
      lastFileId: cleanText(googleSync.lastFileId, 200) || undefined,
    },
  };
}

export function sanitizeCombo(raw: unknown): StrategyCombo | null {
  if (!isRecord(raw)) {
    return null;
  }

  const name = cleanText(raw.name, 60);
  if (name.length < 2) {
    return null;
  }

  const strategies = Array.isArray(raw.strategies)
    ? raw.strategies
        .filter(isRecord)
        .filter((strategy) => ALLOWED_STRATEGY_IDS.has(String(strategy.id)))
        .map((strategy) => ({
          id: String(strategy.id),
          enabled: Boolean(strategy.enabled),
          weight: clampNumber(strategy.weight, 0.1, 5, 1),
        }))
    : [];

  if (!strategies.some((strategy) => strategy.enabled)) {
    return null;
  }

  return {
    id: safeId(raw.id, "combo"),
    name,
    strategies,
    minConfidence: clampNumber(raw.minConfidence, 50, 99, 68),
    minAgreement: Math.round(clampNumber(raw.minAgreement, 1, 12, 2)),
    createdAt: Number.isFinite(Number(raw.createdAt))
      ? Number(raw.createdAt)
      : Date.now(),
  };
}

export type CredentialsValidationResult =
  { ok: true; value: DerivCredentials } | { ok: false; error: string };

export function validateCredentials(
  raw: Partial<DerivCredentials>,
): CredentialsValidationResult {
  const token = String(raw.token ?? "").trim();
  const accountId = String(raw.accountId ?? "").trim();
  const appId = normalizeDerivAppId(raw.appId);

  if (!isValidDerivAppId(appId)) {
    return { ok: false, error: DERIV_APP_ID_ERROR };
  }

  if (token.length < 12 || token.length > 4096 || /\s/.test(token)) {
    return { ok: false, error: "Enter a valid Deriv API key/token." };
  }

  if (!/^[A-Za-z0-9_-]{2,64}$/.test(accountId)) {
    return { ok: false, error: "Select a valid Deriv account." };
  }

  if (raw.accountMode !== "demo" && raw.accountMode !== "real") {
    return { ok: false, error: "Choose a valid Deriv account." };
  }

  return {
    ok: true,
    value: {
      appId,
      token,
      accountId,
      accountMode: raw.accountMode,
      rememberSession: raw.rememberSession !== false,
    },
  };
}
