import { DEFAULT_ACCENT } from "./app-config";
import { DEFAULT_MULTIPLIER } from "./multipliers";
import { DEFAULT_TRADE_AMOUNT } from "./trade-amount";
import { STRATEGY_PROFILES } from "./strategy-engine/profiles";
import type { Preferences, StrategyCombo } from "./types";

export { DEFAULT_ACCENT } from "./app-config";

export const DEFAULT_PREFERENCES: Preferences = {
  symbol: "frxEURUSD",
  marketClass: "forex",
  timeframe: 3600,
  executionMode: "signals",
  automationExecutor: "browser",
  notifySignals: true,
  notifyMinConfidence: 72,
  accent: DEFAULT_ACCENT,
  compactSidebar: false,
  derivAppId: "",
  risk: {
    stake: DEFAULT_TRADE_AMOUNT,
    multiplier: DEFAULT_MULTIPLIER,
    riskReward: 2,
    atrStop: 1.5,
    maxOpenDemoTrades: 1,
    marginBudget: 75,
    maxDailyDemoLoss: 25,
    cooldownMinutes: 15,
  },
  googleSync: {
    enabled: false,
    clientId: "",
    autoSync: false,
  },
};

export const DEFAULT_COMBOS: StrategyCombo[] = STRATEGY_PROFILES.map((profile) => ({
  id: profile.id,
  name: profile.name,
  minConfidence: profile.minConfidence,
  minAgreement: 1,
  strategies: [
    { id: profile.id, enabled: true, weight: 1 },
    { id: "news-guard", enabled: true, weight: 0.8 },
  ],
  createdAt: 0,
}));
