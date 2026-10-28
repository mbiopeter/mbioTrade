export const APP_NAME = "MbioTrade";
export const APP_VERSION = "14.0.0";
export const APP_VERSION_LABEL = "v14";

export const DEFAULT_ACCENT = "#20e58b";
export const MARKET_HISTORY_DAYS = 92;
export const AUTO_SYNC_INTERVAL_MS = 120_000;
export const REQUEST_TIMEOUT_MS = 12_000;
export const PUBLIC_REQUEST_TIMEOUT_MS = 15_000;

// v14 keeps the v10 data schema and keys so saved credentials and settings survive.
export const STORAGE_NAMESPACE = "mbiotrade.v10.";
export const LEGACY_STORAGE_NAMESPACES = [
  "mbiotrade.v9.",
  "mbiotrade.v8.",
  "mbiotrade.v7.",
  "mbiotrade.v6.",
  "mbiotrade.v5.",
  "mbiotrade.v4.",
  "mbiotrade.v3.",
  "mbiotrade.v2.",
  "mbiotrade.v1.",
] as const;

export const BROADCAST_CHANNEL_NAME = "mbiotrade-v10";
export const WORKSPACE_IMPORTED_EVENT = "mbiotrade:workspace-imported";

export const DERIV_PUBLIC_WS_URL = "wss://api.derivws.com/trading/v1/options/ws/public";
export const DERIV_ACCOUNT_WS_PREFIX = "wss://api.derivws.com/trading/v1/options/ws/";
