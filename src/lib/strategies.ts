export { STRATEGY_CATALOG } from "./strategy-engine/catalog";
export type { StrategyMetadata } from "./strategy-engine/catalog";
export { evaluateStrategy } from "./strategy-engine/evaluate";
export type { StrategyEvaluationContext } from "./strategy-engine/configured";
export {
  STRATEGY_PROFILES,
  strategyProfile,
  profileForCombo,
} from "./strategy-engine/profiles";
export type { StrategyProfile } from "./strategy-engine/profiles";
export { getTrendState, TREND_MIN_CANDLES } from "./strategy-engine/trend";
export type { TrendState } from "./strategy-engine/trend";
export {
  detectRegime,
  generateSignal,
  hasNewsRisk,
  recommendComboId,
} from "./strategy-engine/signal";
