/**
 * Shared domain types for MbioTrade.
 *
 * Keep network payload types at the edges of the application and convert them
 * into these stable domain types before storing or rendering them.
 */

// Trading and market types
export type Direction = "UP" | "DOWN" | "WAIT";
export type TradeDirection = Exclude<Direction, "WAIT">;
export type AccountMode = "public" | "demo" | "real";
export type ConnectedAccountMode = Exclude<AccountMode, "public">;
export type ExecutionMode = "signals" | "manual" | "automatic";
export type MarketClass = "forex" | "cryptocurrency" | "metals";
export type Timeframe =
  60 | 120 | 180 | 300 | 600 | 900 | 1800 | 3600 | 7200 | 14400 | 28800 | 86400;
export type AcceptedMultiplier = 100 | 200 | 300 | 500 | 800;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketSymbol {
  symbol: string;
  name: string;
  market?: string;
  submarket?: string;
  type?: string;
  pipSize?: number;
  open?: boolean;
}

// Strategy and signal types
export interface StrategyVote {
  id: string;
  name: string;
  direction: Direction;
  score: number;
  reason: string;
}

export interface NewsEvent {
  id: string;
  title: string;
  currency?: string;
  country?: string;
  impact: "low" | "medium" | "high";
  time: number;
  actual?: string;
  forecast?: string;
  previous?: string;
  sourceUrl?: string;
}

export interface Signal {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  riskReward: number;
  createdAt: number;
  votes: StrategyVote[];
  regime: "trend" | "range" | "volatile" | "mixed";
  newsBlocked?: boolean;
  comboId?: string;
  comboName?: string;
}

export interface StrategyConfig {
  id: string;
  enabled: boolean;
  weight: number;
}

export interface StrategyCombo {
  id: string;
  name: string;
  strategies: StrategyConfig[];
  minConfidence: number;
  minAgreement: number;
  createdAt: number;
}

// Application settings
export interface RiskSettings {
  /** Monetary amount used as the Deriv multiplier stake. */
  stake: number;
  multiplier: AcceptedMultiplier;
  riskReward: number;
  atrStop: number;
  maxOpenDemoTrades: number;
  marginBudget: number;
  maxDailyDemoLoss: number;
  cooldownMinutes: number;
}

export interface GoogleSyncSettings {
  enabled: boolean;
  clientId: string;
  autoSync: boolean;
  lastSyncAt?: number;
  lastFileId?: string;
}

export interface Preferences {
  symbol: string;
  marketClass: MarketClass;
  timeframe: Timeframe;
  executionMode: ExecutionMode;
  automationExecutor: "browser" | "worker";
  notifySignals: boolean;
  notifyMinConfidence: number;
  accent: string;
  compactSidebar: boolean;
  derivAppId: string;
  risk: RiskSettings;
  googleSync: GoogleSyncSettings;
}

// Deriv account types
export interface DerivCredentials {
  appId: string;
  token: string;
  accountId: string;
  accountMode: ConnectedAccountMode;
  rememberSession: boolean;
}

export interface DerivAccountSummary {
  accountId: string;
  accountType?: string;
  currency?: string;
  balance?: number;
  isDemo?: boolean;
}

export interface DerivBalance {
  balance?: number;
  amount?: number;
  currency?: string;
}

export interface DerivPortfolioContract {
  contract_id?: number;
  symbol?: string;
  underlying_symbol?: string;
  underlying?: string;
  contract_type?: string;
  buy_price?: number | string;
  bid_price?: number | string;
  profit?: number | string;
  purchase_time?: number;
  expiry_time?: number;
  [key: string]: unknown;
}

export interface DerivOpenContract {
  contract_type?: string;
  underlying_symbol?: string;
  underlying?: string;
  symbol?: string;
  currency?: string;
  multiplier?: number | string;
  contract_id?: number;
  current_spot?: number | string;
  entry_spot?: number | string;
  buy_price?: number | string;
  bid_price?: number | string;
  sell_price?: number | string;
  profit?: number | string;
  profit_percentage?: number | string;
  status?: string;
  is_sold?: boolean | number;
  is_expired?: boolean | number;
  is_valid_to_sell?: boolean | number;
  date_start?: number;
  date_expiry?: number;
  [key: string]: unknown;
}

export interface DerivTransaction {
  transaction_id?: string | number;
  id?: string | number;
  action?: string;
  action_type?: string;
  symbol?: string;
  underlying_symbol?: string;
  amount?: number;
  contract_id?: string | number;
  contractId?: string | number;
  transaction_time?: number;
  [key: string]: unknown;
}

export interface DerivProfitTransaction {
  contract_id?: number;
  buy_price?: number | string;
  sell_price?: number | string;
  purchase_time?: number;
  sell_time?: number;
  contract_type?: string;
  underlying_symbol?: string;
  shortcode?: string;
  [key: string]: unknown;
}

// Trading journal types
export interface DemoTrade {
  id: string;
  contractId?: number;
  symbol: string;
  direction: TradeDirection;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  stake: number;
  multiplier: number;
  accountId?: string;
  accountMode?: ConnectedAccountMode;
  contractType?: string;
  currency?: string;
  /** Only locally created positions may use the saved chart-price exit levels. */
  localStops?: boolean;
  brokerProfit?: number;
  brokerTakeProfit?: number;
  brokerStopLoss?: number;
  /** Underlying spot barriers returned by Deriv's limit_order.*.value. */
  brokerTakeProfitPrice?: number;
  brokerStopLossPrice?: number;
  /** True after an explicit broker limit-order snapshot, including removed limits. */
  brokerLimitsKnown?: boolean;
  /** Cash commission from an open-contract snapshot, not proposal commission %. */
  brokerCommission?: number;
  signalId?: string;
  openedAt: number;
  /** Exact chart candle timestamp in seconds used to anchor the position overlay. */
  entryTime?: number;
  closedAt?: number;
  soldFor?: number;
  status: "pending" | "open" | "closed" | "error";
  source: "manual" | "auto" | "external";
  error?: string;
  comboId?: string;
  comboName?: string;
  confidence?: number;
}

export interface LivePositionSnapshot {
  tradeId: string;
  contractId: number;
  currentSpot?: number;
  profit?: number | string;
  profitPercentage?: number;
  bidPrice?: number;
  buyPrice?: number;
  status?: string;
  isSold: boolean;
  isValidToSell?: boolean;
  updatedAt: number;
}

export interface AccountTradeEvent {
  id: string;
  action: "buy" | "sell" | "activity";
  symbol: string;
  amount?: number;
  contractId?: string;
  time: number;
  accountMode: ConnectedAccountMode;
  accountId?: string;
}

// Backtesting types
export interface BacktestTrade {
  direction: TradeDirection;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stopLoss: number;
  takeProfit: number;
  r: number;
  pnl: number;
  balanceAfter: number;
  outcome: "win" | "loss" | "timeout";
}

export interface BacktestResult {
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netR: number;
  avgR: number;
  profitFactor: number;
  maxDrawdownR: number;
  expectancyR: number;
  startingBalance: number;
  endingBalance: number;
  netPnl: number;
  returnPct: number;
  maxDrawdownMoney: number;
}

// Export / import schema
export interface WorkspaceSnapshot {
  version: 10;
  exportedAt: number;
  preferences: Preferences;
  combos: StrategyCombo[];
  activeComboId: string;
  signals: Signal[];
  demoTrades: DemoTrade[];
  tradeEvents: AccountTradeEvent[];
}
