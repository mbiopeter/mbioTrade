import type {
  AccountTradeEvent,
  DemoTrade,
  Direction,
  Preferences,
  Signal,
  StrategyCombo,
  StrategyVote,
  Timeframe,
  WorkspaceSnapshot,
} from "../types";
import { isRemovedMultiplier, sanitizeMultiplier } from "../multipliers";
import {
  clampNumber,
  cleanText,
  DIRECTIONS,
  finiteNumber,
  isRecord,
  safeId,
  SIGNAL_REGIMES,
  TIMEFRAMES,
  TRADE_DIRECTIONS,
  TRADE_SOURCES,
  TRADE_STATUSES,
} from "./common";
import { sanitizeCombo, sanitizePreferences } from "./preferences";

function sanitizeVote(raw: unknown): StrategyVote | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = cleanText(raw.id, 80);
  if (!id) {
    return null;
  }

  const direction = DIRECTIONS.has(raw.direction as Direction)
    ? (raw.direction as Direction)
    : "WAIT";

  return {
    id,
    name: cleanText(raw.name, 80) || id,
    direction,
    score: clampNumber(raw.score, 0, 100, 0),
    reason: cleanText(raw.reason, 300),
  };
}

function sanitizeSignal(raw: unknown): Signal | null {
  if (!isRecord(raw)) {
    return null;
  }

  const direction = DIRECTIONS.has(raw.direction as Direction)
    ? (raw.direction as Direction)
    : null;
  const timeframe = TIMEFRAMES.includes(Number(raw.timeframe) as Timeframe)
    ? (Number(raw.timeframe) as Timeframe)
    : null;
  const symbol = cleanText(raw.symbol, 30);
  const entry = Number(raw.entry);
  const stopLoss = Number(raw.stopLoss);
  const takeProfit = Number(raw.takeProfit);

  const hasValidPrices = [entry, stopLoss, takeProfit].every(Number.isFinite);
  const hasValidSymbol = /^[A-Za-z0-9_]{2,30}$/.test(symbol);

  if (!direction || !timeframe || !hasValidSymbol || !hasValidPrices) {
    return null;
  }

  const votes = Array.isArray(raw.votes)
    ? raw.votes.map(sanitizeVote).filter((vote): vote is StrategyVote => Boolean(vote))
    : [];

  return {
    id: safeId(raw.id, "signal"),
    symbol,
    timeframe,
    direction,
    entry,
    stopLoss,
    takeProfit,
    confidence: clampNumber(raw.confidence, 0, 99, 0),
    riskReward: clampNumber(raw.riskReward, 0.1, 20, 1),
    createdAt: finiteNumber(raw.createdAt, Date.now()),
    votes,
    regime: SIGNAL_REGIMES.has(String(raw.regime))
      ? (raw.regime as Signal["regime"])
      : "mixed",
    newsBlocked: Boolean(raw.newsBlocked),
    comboId: cleanText(raw.comboId, 160) || undefined,
    comboName: cleanText(raw.comboName, 80) || undefined,
  };
}

export function sanitizeSignals(raw: unknown): Signal[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(sanitizeSignal)
    .filter((signal): signal is Signal => Boolean(signal))
    .slice(0, 500);
}

function sanitizeDemoTrade(raw: unknown): DemoTrade | null {
  if (!isRecord(raw)) {
    return null;
  }

  const direction = TRADE_DIRECTIONS.has(raw.direction as Direction)
    ? (raw.direction as DemoTrade["direction"])
    : null;
  const symbol = cleanText(raw.symbol, 30);
  const entry = Number(raw.entry);
  const stopLoss = Number(raw.stopLoss);
  const takeProfit = Number(raw.takeProfit);
  const stake = Number(raw.stake);

  const hasValidValues = [entry, stopLoss, takeProfit, stake].every(Number.isFinite);

  if (
    !direction ||
    !/^[A-Za-z0-9_]{2,30}$/.test(symbol) ||
    !hasValidValues ||
    stake <= 0
  ) {
    return null;
  }

  const contractId = Number(raw.contractId);
  const optionalNumber = (value: unknown): number | undefined =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
  const accountId = cleanText(raw.accountId, 64);
  const accountMode =
    raw.accountMode === "demo" || raw.accountMode === "real"
      ? raw.accountMode
      : undefined;
  const brokerMultiplier = optionalNumber(raw.multiplier);
  const accountScoped = Boolean(accountMode && /^[A-Za-z0-9_-]{2,64}$/.test(accountId));

  return {
    id: safeId(raw.id, "trade"),
    contractId: Number.isFinite(contractId) && contractId > 0 ? contractId : undefined,
    symbol,
    direction,
    entry,
    stopLoss,
    takeProfit,
    stake: clampNumber(stake, 0.01, 1_000_000, 1),
    multiplier:
      // Ticket migrations must not resize saved v13 positions or their P/L.
      (accountScoped && brokerMultiplier !== undefined && brokerMultiplier >= 0) ||
      isRemovedMultiplier(raw.multiplier)
        ? Number(raw.multiplier)
        : sanitizeMultiplier(raw.multiplier),
    openedAt: finiteNumber(raw.openedAt, Date.now()),
    entryTime: Number.isFinite(Number(raw.entryTime))
      ? Math.floor(Number(raw.entryTime))
      : Math.floor(finiteNumber(raw.openedAt, Date.now()) / 1000),
    closedAt: optionalNumber(raw.closedAt),
    soldFor: optionalNumber(raw.soldFor),
    status: TRADE_STATUSES.has(String(raw.status))
      ? (raw.status as DemoTrade["status"])
      : "error",
    source:
      raw.source === "external"
        ? "external"
        : TRADE_SOURCES.has(String(raw.source))
          ? (raw.source as DemoTrade["source"])
          : "manual",
    error: cleanText(raw.error, 300) || undefined,
    comboId: cleanText(raw.comboId, 160) || undefined,
    comboName: cleanText(raw.comboName, 80) || undefined,
    confidence: Number.isFinite(Number(raw.confidence))
      ? clampNumber(raw.confidence, 0, 99, 0)
      : undefined,
    accountId: accountScoped ? accountId : undefined,
    accountMode,
    localStops:
      raw.localStops === true ||
      (raw.localStops === undefined &&
        !accountScoped &&
        raw.source !== "external" &&
        stopLoss > 0 &&
        takeProfit > 0),
    brokerProfit: optionalNumber(raw.brokerProfit),
    brokerTakeProfit: optionalNumber(raw.brokerTakeProfit),
    brokerStopLoss: optionalNumber(raw.brokerStopLoss),
    brokerTakeProfitPrice: optionalNumber(raw.brokerTakeProfitPrice),
    brokerStopLossPrice: optionalNumber(raw.brokerStopLossPrice),
    brokerLimitsKnown: raw.brokerLimitsKnown === true,
    brokerCommission: optionalNumber(raw.brokerCommission),
    currency: cleanText(raw.currency, 12) || undefined,
    contractType: cleanText(raw.contractType, 40) || undefined,
    signalId: cleanText(raw.signalId, 160) || undefined,
  };
}

export function sanitizeDemoTrades(raw: unknown): DemoTrade[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(sanitizeDemoTrade)
    .filter((trade): trade is DemoTrade => Boolean(trade))
    .slice(0, 500);
}

export function sanitizeTradeEvents(raw: unknown): AccountTradeEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isRecord)
    .filter(
      (event) =>
        typeof event.id === "string" &&
        ["buy", "sell", "activity"].includes(String(event.action)) &&
        typeof event.symbol === "string" &&
        (event.accountMode === "demo" || event.accountMode === "real"),
    )
    .map((event) => ({
      id: safeId(event.id, "event"),
      action: event.action as AccountTradeEvent["action"],
      symbol: cleanText(event.symbol, 60),
      amount: Number.isFinite(Number(event.amount)) ? Number(event.amount) : undefined,
      contractId: cleanText(event.contractId, 100) || undefined,
      time: finiteNumber(event.time, Date.now()),
      accountMode: event.accountMode as AccountTradeEvent["accountMode"],
      accountId: /^[A-Za-z0-9_-]{2,64}$/.test(String(event.accountId ?? ""))
        ? String(event.accountId)
        : undefined,
    }))
    .slice(0, 1000);
}

export function sanitizeWorkspace(
  raw: unknown,
  fallback: Preferences,
  defaultCombos: StrategyCombo[],
): WorkspaceSnapshot {
  const source = isRecord(raw) ? raw : {};

  const importedCombos = Array.isArray(source.combos)
    ? source.combos
        .map(sanitizeCombo)
        .filter((combo): combo is StrategyCombo => Boolean(combo))
    : [];
  const combos = importedCombos.length ? importedCombos : defaultCombos;

  const activeComboId = combos.some((combo) => combo.id === source.activeComboId)
    ? String(source.activeComboId)
    : (combos[0]?.id ?? "");

  return {
    version: 10,
    exportedAt: Date.now(),
    preferences: sanitizePreferences(source.preferences, fallback),
    combos,
    activeComboId,
    signals: sanitizeSignals(source.signals),
    demoTrades: sanitizeDemoTrades(source.demoTrades),
    tradeEvents: sanitizeTradeEvents(source.tradeEvents),
  };
}
