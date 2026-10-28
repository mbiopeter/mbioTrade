import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const failures = [];

if (pkg.name !== "mbiotrade") failures.push("Unexpected package name.");
if (pkg.version !== "16.0.0") failures.push("Expected package version 16.0.0.");
if (pkg.allowScripts?.["esbuild@0.28.2"] !== true) {
  failures.push("The pinned esbuild install-script approval is missing.");
}
if (!pkg.scripts?.predev || !pkg.scripts?.prebuild) {
  failures.push("Next.js preflight must run before dev and build.");
}
if (!pkg.dependencies?.["lightweight-charts"]) {
  failures.push("lightweight-charts dependency is missing.");
}
if (!pkg.devDependencies?.prettier) {
  failures.push("Prettier must be included for consistent formatting.");
}

const multipliers = read("src/lib/multipliers.ts");
if (!/100[\s,]+200[\s,]+300[\s,]+500[\s,]+800/.test(multipliers)) {
  failures.push("The accepted multiplier source is missing or changed.");
}

const execution = read("src/lib/deriv-auth.ts");
if (!execution.includes("assertAcceptedMultiplier(multiplier)")) {
  failures.push("The final execution multiplier guard is missing.");
}
if (!execution.includes("assertTradeAmount(stake)")) {
  failures.push("The final minimum trade-amount guard is missing.");
}

const tradeAmount = read("src/lib/trade-amount.ts");
if (
  !tradeAmount.includes("MIN_TRADE_AMOUNT = 1") ||
  !tradeAmount.includes("DEFAULT_TRADE_AMOUNT = 20") ||
  !tradeAmount.includes("assertTradeAmount")
) {
  failures.push("The centralized v9 trade-amount rules are missing.");
}

const appId = read("src/lib/deriv-app-id.ts");
if (
  !appId.includes("34N5mW67NQ9BRFoBF2UdF") ||
  !appId.includes("(?=.*[A-Za-z])") ||
  !appId.includes("(?=.*\\d)")
) {
  failures.push("Alphanumeric App ID validation is missing.");
}

const connectionSection = read("src/features/settings/DerivConnectionSection.tsx");
if (
  !connectionSection.includes("Deriv App ID") ||
  !connectionSection.includes("Deriv API key / token")
) {
  failures.push("Settings must expose both App ID and API key fields.");
}
if (
  !connectionSection.includes("DERIV_APP_ID_EXAMPLE") ||
  connectionSection.includes('inputMode="numeric"')
) {
  failures.push("The Settings App ID input is not alphanumeric.");
}
if (connectionSection.includes("<select")) {
  failures.push("A native select was found in the Deriv connection section.");
}

for (const route of [
  "src/app/api/deriv/accounts/route.ts",
  "src/app/api/deriv/otp/route.ts",
]) {
  const source = read(route);
  if (source.includes("process.env")) {
    failures.push(`Environment App ID fallback found in ${route}.`);
  }
}
if (existsSync(".env.example")) {
  failures.push(".env.example must not provision a Deriv App ID.");
}

const tradingBehavior = read("src/features/settings/TradingBehaviorSection.tsx");
const amountSetting = read("src/features/settings/TradeAmountSetting.tsx");
if (
  !tradingBehavior.includes("TradeAmountSetting") ||
  !amountSetting.includes('label="Trade amount"') ||
  !amountSetting.includes("MIN_TRADE_AMOUNT")
) {
  failures.push("Settings must expose a validated Trade amount input.");
}

const socketClient = read("src/lib/deriv/websocket-client.ts");
for (const requirement of [
  "KEEPALIVE_INTERVAL_MS",
  "scheduleReconnect",
  "restoreSubscriptions",
  "RECONNECT_MAX_DELAY_MS",
  'window.addEventListener("online"',
  'window.addEventListener("offline"',
]) {
  if (!socketClient.includes(requirement)) {
    failures.push(`Persistent WebSocket behavior is missing: ${requirement}`);
  }
}

const accountContext = read("src/context/account-context.tsx");
if (
  !accountContext.includes("requestOtpUrl") ||
  !accountContext.includes("await socket.connect(async () => {") ||
  !accountContext.includes("requestOtpUrl(next, controller.signal)")
) {
  failures.push("Authenticated reconnects must obtain a fresh OTP URL.");
}
if (!accountContext.includes("connectionStatus")) {
  failures.push("Account connection lifecycle status is missing.");
}

const terminal = read("src/app/terminal/page.tsx");
const manualTrade = read("src/lib/manual-trade.ts");
if (
  !terminal.includes("buildManualTradePlan") ||
  !terminal.includes('const planSource = qualifiedPlan ? "signal" : "manual"') ||
  !manualTrade.includes("getTrendState(confirmed)")
) {
  failures.push("Trend-aligned manual trade execution is missing.");
}

const shell = read("src/components/layout/app-shell.tsx");
const providers = read("src/app/providers.tsx");
const tsconfig = JSON.parse(read("tsconfig.json"));
if (!providers.includes('from "../components/layout/app-shell"')) {
  failures.push(
    "Providers must import the root app shell through the stable relative path.",
  );
}
if (
  tsconfig.compilerOptions?.baseUrl !== "." ||
  tsconfig.compilerOptions?.paths?.["@/*"]?.[0] !== "src/*"
) {
  failures.push(
    "TypeScript alias resolution must define baseUrl '.' and @/* -> src/*.",
  );
}
if (shell.includes("global-search") || shell.includes("Search tools, strategies")) {
  failures.push("The top search bar was not removed.");
}
if (shell.includes("Guest workspace") || shell.includes("no-login-chip")) {
  failures.push("The removed top-right guest label is still present.");
}

const css = read("src/app/globals.css");
for (const rule of [
  ".terminal-workspace>.terminal-center,.terminal-workspace>.trade-panel",
  ".terminal-bottom-grid>.bottom-terminal-card",
  ".settings-grid>.settings-section",
]) {
  if (!css.includes(rule)) {
    failures.push(`Equal-height card rule is missing: ${rule}`);
  }
}
if (css.includes(".no-login-chip")) {
  failures.push("Unused guest-chip CSS was not removed.");
}

const config = read("src/lib/app-config.ts");
if (
  !config.includes('STORAGE_NAMESPACE = "mbiotrade.v10."') ||
  !config.includes('"mbiotrade.v8."')
) {
  failures.push("v10 storage namespace or v8 migration support is missing.");
}

const marketChart = read("src/components/charts/MarketChart.tsx");
if (
  !marketChart.includes("resolveEntryCandleTime") ||
  !marketChart.includes("timeToCoordinate") ||
  !marketChart.includes("tv-entry-anchor") ||
  !marketChart.includes("POSITION_MIN_WIDTH_PX")
) {
  failures.push("The v9 entry-time anchored position overlay is missing.");
}

if (
  !execution.includes("subscribeOpenContract") ||
  !execution.includes("proposal_open_contract")
) {
  failures.push("Deriv open-contract P/L subscription support is missing.");
}

if (
  !accountContext.includes("livePositions") ||
  !accountContext.includes("BrokerAccountSync") ||
  !read("src/lib/account-sync.ts").includes("subscribeOpenContracts")
) {
  failures.push("Live position tracking is not wired into account state.");
}

const positionMetrics = read("src/lib/position-metrics.ts");
if (
  !positionMetrics.includes("estimatePositionPnl") ||
  !positionMetrics.includes('source: "broker"') ||
  !positionMetrics.includes('source: "chart"')
) {
  failures.push("Broker-first live P/L with chart fallback is missing.");
}

const root = read("src/app/page.tsx");
if (!root.includes('redirect("/terminal")')) {
  failures.push("The root route must open the terminal directly.");
}

if (failures.length) {
  console.error("Configuration check failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("MbioTrade v16 configuration looks valid.");
