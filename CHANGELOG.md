# v16.0.0

- Maintenance release based directly on v14, with no changes to the trading engine,
  broker synchronization, market indicators, position chart drawing or background worker.
- Rebuilt the App Router `error.tsx` with an explicit first-line `"use client"` boundary
  and the typed error/reset contract required by Next.js.
- Added a zero-dependency preflight before `dev`, `dev:turbo` and `build`. It restores a
  missing or blank error boundary and moves a misplaced directive to the first statement;
  invalid non-empty source files fail fast with actionable guidance.
- Added an upgrade-aware `.next` cache stamp and `npm run dev:clean`, so stale v14 build
  output is discarded safely after an upgrade.
- Locked npm's install-script approval narrowly to the already pinned `esbuild@0.28.2`
  package; other dependency scripts are not automatically approved.
- Extended App Router static checks, added seven recovery tests, kept all 18 existing
  regression test files and the original six trend-aligned preset strategies.

# v14.0.0

- Added five configured pair/market setups for EURUSD, GBPUSD, USDJPY, AUDUSD and XAUUSD,
  plus General Trend Pullback, each with documented entry prerequisites and News Guard.
- Applied a shared confirmed-candle EMA50/EMA200 trend gate to every generated signal,
  including legacy/custom combinations, and to manual fallback entries with pre-buy rechecks.
- Added preset cards and atomic Apply/New/Duplicate actions. Apply preserves spending
  limits, pauses browser entry in Signals, and saves edited factory rules as a custom copy.
- Removed new-order multipliers below 100. Options are 100, 200, 300, 500, 800; default 100.
  Removed saved values migrate to 100 + Signals. Existing trade multipliers remain intact.
- Aligned live analysis windows at 600 completed bars and retained an extra worker forming
  bar. Worker attempt deduplication now follows the confirmed candle, with a broker-journal
  duplicate check at preflight.
- Corrected replay's settlement ordering and candle-close timestamps. Simulated future
  profits can no longer fund overlapping earlier entries.
- Retained broker synchronization, reconnects, saved credentials, funding rejection,
  cross-device position drawings and SL/TP editing, demo/real parity and optional worker.
- Added strategy, preset, migration, manual trend, replay-accounting, worker-boundary and
  browser regression coverage. No profitability claims or fabricated backtest results.

# v13.0.0

- Added five lower multiplier choices (5, 10, 20, 30 and 50), preserving all five
  existing choices, saved selections, the default and shared demo/real/worker guards.
- Added broker-confirmed SL/TP editing for open multiplier contracts from Terminal
  and Portfolio. Partial updates preserve untouched protection; charts and other
  devices reconcile the broker's current limits.
- Validate protection amounts and account/contract state; reconcile ambiguous
  outcomes without replaying a contract update. Retire stale local exit plans when
  broker protection changes, including changes made on another device.
- Keep chart price/position geometry aligned when the editor changes panel layout.
- Retained connection retries, funding rejection, full cross-device drawings,
  account synchronization, credentials, strategy engine and optional worker.

# v12.0.0

- Restore complete long/short target and risk drawings from Deriv's stored spot barriers
  across browsers/devices, with labelled monetary-limit estimates when necessary.
- Include target and stop prices in chart autoscaling and reserve readable drawing
  space; show risk/reward and handle changed or removed broker protection levels.
- Keep retrying initial and interrupted account/public-market connections, OTP and
  socket timeouts, and subscription failures with bounded delays and cancellation.
- Reject insufficient selected amounts or balances before buying; show required amount,
  selected amount, available balance and shortfall where known.
- Require a valid broker quote and fresh balance, preserve broker minimum requirements,
  and reject incompatible stop settings instead of silently capping them.
- Apply funding checks to the shared manual/automatic, demo/real and worker execution
  path while keeping uncertain purchase results non-replayable.
- Preserve the existing design, features, v10 storage keys and workspace schema.

# v11.0.0

- Draw broker-restored open multiplier positions on the selected market chart without
  requiring local stop-loss/take-profit price metadata.
- Display entry, long/short direction, entry time and live P/L across browsers/devices;
  preserve existing target/risk shading for known local chart levels.
- Keep broker monetary limits separate from optional chart-price levels.
- Retain all v10 execution, synchronization, persistence and background-worker behavior,
  including the v10 storage namespace and workspace schema for seamless upgrades.
- Add regression coverage for imported chart positions and two-browser restoration.

# v10.0.0

- Restore broker portfolio and live multiplier P/L across devices and reconnects.
- Reconcile external purchases, sales and settlements; execute actual Deriv sales from
  the app.
- Scope positions, journal metadata and activity by account ID and demo/real mode.
- Persist remembered API credentials across browser restarts; provide Forget saved key.
- Use matching manual/automatic execution, risk gates and broker monetary protection in
  demo and real.
- Keep browser automation mounted during app navigation; block stale market/account
  data.
- Add optional database-free Node worker, container packaging and Vercel Daemons
  example.
- Preserve original interface assets and tools; migrate prior preferences and workspace
  metadata.
- Add mocked regression tests for reconciliation, execution parity, storage, transport
  and worker.

# Changelog

## 9.1.0

- Fixed Next.js module resolution for the root `AppShell` import.
- Renamed the shell module to lowercase for case-sensitive filesystem portability.
- Added explicit TypeScript `baseUrl` and `@/*` alias configuration.
- Added release checks for provider imports and alias configuration.
- Preserved the v9 storage namespace for a non-destructive upgrade.

## 9.0.0

- Anchored TradingView-style position overlays to the exact entry candle and entry time.
- Extended open-position overlays dynamically as new candles arrive while clipping
  safely inside the chart.
- Added Deriv `proposal_open_contract` subscriptions for broker-provided live P/L and
  current spot updates.
- Added chart-price P/L estimates while the broker stream is reconnecting.
- Added live P/L to the trade ticket, terminal summary, chart overlay, and portfolio
  log.
- Preserved all v8 connection, strategy, backtesting, local sync, Google sync, and risk
  controls.

## 8.0.0

- Added a configurable Trade amount under Settings → Trading behavior.
- Changed the factory Deriv multiplier stake from `0.35` to `$20.00`.
- Enforced a minimum Trade amount of `$1.00` in Settings, the Terminal and the final
  Deriv proposal path.
- Added centralized amount validation in `src/lib/trade-amount.ts`.
- Migrated v1–v7 preferences below `$1.00` to the `$20.00` default.
- Updated terminal, notification, tutorial, documentation and analytics labels from Lot
  size to Trade amount.
- Preserved persistent WebSocket reconnection, subscription restoration, manual demo
  trades without signals and all v7 functionality.

## 7.0.0

- Added persistent public and authenticated Deriv WebSocket lifecycle management.
- Added 30-second keepalive pings and silent-disconnect recovery.
- Added capped exponential reconnect backoff with jitter and browser online/offline
  handling.
- Restored tick, balance and transaction subscriptions after reconnection.
- Requested a fresh authenticated OTP WebSocket URL on every account reconnect.
- Added session restoration when the user opted to remember credentials for the browser
  session.
- Added manual Buy/Long and Sell/Short demo execution without requiring a strategy
  signal.
- Added ATR-based Entry, TP and SL planning for manual orders without assigning fake
  confidence.
- Removed the top-right “No login required / Guest workspace” chip.
- Preserved the v6 terminal design, strategies, three-month history, backtesting,
  analysis, local storage, Google sync, multiplier validation and equal-height card
  layout.

## 6.0.0

- Reorganized the terminal into focused header, command, chart, ticket and summary
  modules.
- Reorganized Settings into connection, trading behavior, synchronization, appearance
  and reset sections.
- Split validation, strategy evaluation, Deriv transport and server adapters into
  smaller modules.
- Added formatting, configuration, App Router, maintainability and internal import
  checks.
- Preserved local workspace migration from MbioTrade v1 through v5.
- Preserved the alphanumeric Settings-based Deriv App ID and session-safe API key.
- Preserved multiplier validation for 100, 200, 300, 500 and 800.
- Added shared equal-height layout behavior for paired desktop cards.
- Removed top-bar search while retaining searchable market selection.
