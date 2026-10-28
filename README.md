# MbioTrade v16

**v16 repairs the local Next.js development startup reported on v14.** It keeps the v14
trading implementation, charting, six trend-aligned presets, 100×–800× multiplier choices,
Deriv account sync, live SL/TP editing, saved credentials, automatic retries, demo/real
execution parity and optional background worker. No trading rules or broker execution
adapters were changed in this maintenance release.

## Start v16 locally

Use Node.js 22.9 or later. Extract the ZIP to a **new `mbiotrade-v16` folder** and run:

```bash
cd mbiotrade-v16
npm ci
npm run doctor
npm run dev
```

Visit `http://localhost:3000` or open `/terminal` directly. `npm run dev` now checks the
App Router before starting webpack. An empty/missing error-boundary file is restored,
a misplaced client directive is corrected, and the old `.next` cache is cleared on
first launch after an upgrade. A more severe source-file issue is reported before Next
can return a confusing HTTP 500. If a previous extraction left a stale build, run
`npm run dev:clean` for a fresh compilation. After `npm ci`,
you can also run `npm run smoke:dev` for an automated route check with a real local
Next.js webpack process. See
[the v16 startup/recovery guide](docs/V16-STARTUP-REPAIR.md).

The `npm warn install-scripts` notice about esbuild in newer npm releases is separate
from the HTTP 500. The reviewed `esbuild@0.28.2` install script is now approved by a
pinned `allowScripts` entry, without a blanket approval for other dependencies.

**Validation:** The supplied source and App Router guards passed, and all original
trading regression tests passed with the seven additional recovery tests. This
packaging environment has no access to the npm registry, so a real Next.js dev-server
startup or production build could not be repeated here. Follow the guide's local smoke
checks after installing dependencies. No live broker orders were placed.

## Preserved v14 strategy features

MbioTrade is a Next.js Deriv Options multiplier terminal. v14 keeps the existing dark
terminal design, broker position synchronization, full long/short drawings, remembered
keys, reconnects, funding checks, live SL/TP editing, scanner, replay and optional worker.

## What v14 changes

1. **Five configured market strategies:** EURUSD EMA Pullback, GBPUSD Breakout Retest,
   USDJPY Momentum Restart, AUDUSD Channel Continuation and XAUUSD Pullback Rejection.
   A sixth **General Trend Pullback** setup works on the currently selected supported
   market. See [the complete v14 strategy guide](docs/V14-STRATEGY-GUIDE.md) for every rule.
2. **Confirmed trend direction for every entry:** EMA50/EMA200 alignment, slopes and
   ATR separation must agree using at least 205 completed candles. Automatic strategies,
   legacy/custom combinations and manual fallback tickets cannot enter against that
   confirmed trend. Manual entry does not require a complete strategy pattern. A forming
   candle cannot confirm a strategy signal; existing positions can still be closed or edited.
3. **One-click configuration in Strategies:** Apply a preset to set its market,
   timeframe, method, ATR stop and reward/risk. General keeps the current market. Apply
   pauses browser entries in Signals so the new setup can be reviewed. Stake, multiplier,
   account limits and credentials remain unchanged. Edited factory presets are saved as
   custom copies before their documented rules are restored. A running worker needs a
   new export and restart to adopt these settings.
4. **Multipliers below 100 removed:** new orders offer `100`, `200`, `300`, `500`, `800`.
   New workspaces start at `100`. Saved removed choices migrate to `100` and **Signals**
   with a visible notice. Valid saved choices retain their execution mode. Existing
   positions retain their actual multiplier. Deriv's quote still decides availability
   and required amounts; the app never increases a $20 stake to make a trade pass.
5. **Consistent analysis and replay accounting:** browser, scanner and worker use up to
   600 completed bars. The worker retains an extra forming bar and deduplicates on the
   confirmed signal bar. Replay waits for the prior simulated trade to settle before
   funding another entry, and timestamps decisions at candle close.

These are explicit starting configurations of established trend/continuation methods.
Research documents historical trend-following results across diversified markets; it
has not verified the profitability of these exact intraday Deriv presets. Confidence
scores are rule-agreement scores, not win probabilities. See the guide's primary sources,
validation limits and demo forward-testing procedure.

### Use a preset

Open **Strategies**, expand a preset's entry rules, then choose **Apply [market] preset**.
Review the selected market/timeframe and funding settings. In **Settings**, choose Manual
or Automatic after review. Automatic still executes qualified signals without per-trade
confirmation on either demo or real accounts. Run only one automatic owner per account.

### Updating from v13

Extract v14 as a separate project and update the deployed project from its contents.
Close or reload older tabs and stop older workers so only v14 code manages execution.
Keep the same site origin to retain saved keys and local preferences. No workspace reset
is needed. Existing combinations remain available and the six new defaults are added.
Removed multiplier preferences pause entries; open contracts are not resized or closed.

### Open-trade SL/TP editing retained

Open **Terminal → Open trades** or **Portfolio**, choose **Edit SL / TP**, and enter the
positive loss/profit amounts in the account currency. Save sends an authenticated Deriv
contract update and reconciles the actual contract before reporting success. Unchanged
fields are not overwritten. Broker confirmation updates other connected devices and
chart zones; stale local exits cannot override edited protection. No close/reopen is used.

## Retained v12 improvements

1. **Full long/short position drawings across devices.** An open position restored
   from Deriv displays its green target area, red risk area, entry, TP/SL labels, live
   P/L and risk/reward on the selected market's chart. Actual broker spot barriers are
   preferred. If Deriv only returns monetary protection amounts, the chart derives and
   labels estimated price levels using the entry, stake, multiplier and known cash
   commission. These estimates affect the drawing only. A wider chart margin and
   automatic price range keep the full box readable. Connect the same account and
   choose the trade's market; no journal import is needed.
2. **Connection failures keep retrying.** Failed initial connections, authentication
   URL timeouts, interrupted sockets and stalled requests trigger automatic recovery
   with increasing, capped delays. The account, market data and subscriptions recover
   together. The interface displays the retry status and error. Disconnect, Forget,
   account changes and shutdown cancel the previous connection's retries. A rejected
   key still needs correction; retries cannot make invalid credentials valid.
3. **Insufficient amounts stop the order before purchase.** The shared manual/automatic
   demo/real execution path validates the actual Deriv quote against the selected
   amount, obtains a fresh balance, and rejects missing or unaffordable quotes. The
   notification identifies the required amount, selected amount, and balance shortfall
   where available. Broker-reported minimums and reasons are preserved. The app never
   increases the stake or silently shrinks an incompatible stop loss to make an order
   pass. If the chosen multiplier and stop distance cannot fit within the stake, it
   explains which settings need correction.

The full drawing uses current broker protection values, so changes or removals received
from Deriv update the chart. A trade without a TP or SL does not receive an invented
protection level. The chart identifies that unavailable level. Entry/target/risk
annotations are display-only for restored external trades; broker protection continues
as configured on the contract.

v14 retains the v10 storage keys and workspace schema. Existing saved keys, preferences
and compatible trade metadata remain available when updating the same site origin.
Connection recovery never automatically replays a purchase or sale whose result is
uncertain.

## Retained v10 improvements

1. **Deriv is the authority for positions.** Connect, reconnect, account events, focus
   and periodic refresh retrieve the broker portfolio and contract status. Opening or
   closing a supported position on Deriv or another device updates MbioTrade. Closing in
   MbioTrade sends an actual Deriv sell request.
2. **A fresh device restores open trades.** Connect to the same exact Deriv Options
   account to see open multiplier contracts and broker P/L without a local journal. Demo
   and real accounts are kept separate by account ID.
3. **Remembered API key.** The default connection setting saves the credential on this
   browser and origin, so reopening the site can reconnect automatically. Disconnect
   preserves it. **Forget saved key** deletes current and legacy copies. Credentials are
   never included in JSON/Google workspace backups.
4. **Matching demo and real behavior.** Signals, Manual and Automatic apply to either
   account type. Automatic does not require a manual confirmation for each real-account
   trade. Both use the same proposal, purchase, sell and risk checks. Existing Auto demo
   settings migrate to Automatic; old Manual demo and Real assisted settings migrate to
   Manual.
5. **Optional continuous server execution, without a database.** A Node worker shares
   the strategy engine and account logic. It can run as a Vercel Daemon where that beta
   is available, or on another always-on Node/container host. The normal Vercel Next.js
   deployment remains available without the worker.

## Run locally

Use Node.js 22.9 or later and npm:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The root redirects to `/terminal`. No environment file is
required for the browser application.

## Connect once on each device

1. Open **Settings → Deriv connection**.
2. Enter your App ID and API key/token.
3. Select **Discover accounts** and choose the required Demo or Real account.
4. Leave **Remember API key on this device** enabled on a trusted device.
5. Connect and wait for the account synchronization message.

The key is saved in localStorage, which is accessible to scripts running on the same
origin and anyone with access to that browser profile. It is not an encrypted password
vault. Clear it with **Forget saved key** on shared devices. Storage denial, private
browsing, clearing site data or a different site origin can prevent persistence. A
different device needs its own authorized connection; the API key is not copied between
devices through Deriv.

Trade position and P/L data come from Deriv. Preferences, strategy labels, analytical
trade plans and signal history are local workspace metadata. Broker spot barriers and
monetary protection amounts restore through Deriv for cross-device chart drawings. Use the existing
JSON/Google backup features to move those preferences and notes. External positions are
labeled as external; MbioTrade does not invent missing strategy confidence. Estimated
chart levels are identified separately from broker spot barriers.

## Trading modes

| Mode      | Demo account                            | Real account                                     |
| --------- | --------------------------------------- | ------------------------------------------------ |
| Signals   | Analysis and notifications              | Analysis and notifications                       |
| Manual    | Submit a chosen long/short position     | Submit a chosen long/short position              |
| Automatic | Execute qualified signals within limits | Execute qualified signals within the same limits |

Manual trading can build an ATR-based plan without a qualified pattern signal, provided
the selected direction agrees with the confirmed trend.
Automatic entries wait for a verified broker account snapshot, fresh market data, any
enabled News Guard, and your open-position, exposure, daily-loss and cooldown limits.
The broker's current account balance must cover the trade amount. The daily loss window
uses UTC consistently in the browser and worker.

The trade amount defaults to 20 account-currency units and has a minimum of 1.
Selectable multipliers are `100`, `200`, `300`, `500`, and `800`; Deriv can reject
combinations unavailable for the account or market. Broker-reported multipliers on
external positions are displayed as received.

New MbioTrade orders include Deriv monetary stop-loss/take-profit instructions. These
are account-currency P/L amounts derived from the chart plan, not exact underlying price
barriers. Deriv must accept them before a purchase is sent. Broker-supported stops can
continue operating after the browser closes.

The execution rules match between demo and real accounts; fills, available instruments,
prices and outcomes still depend on Deriv. MbioTrade never replays an uncertain buy
automatically after a timeout or disconnect.

## One automatic execution owner per account

Choose either the **Browser** or **Background worker** execution owner. Browser
automation stays mounted while navigating around the application. It needs a running
browser and live network. The Background worker selector pauses browser automation; it
does not itself start or stop a server process.

Run one automatic owner per account. Other devices may monitor or close trades.
Same-origin browser tabs use Web Locks and an account-specific attempt journal, but
separate devices/servers do not have a distributed lock without shared coordination.
Deriv remains the authority for positions; an open-position limit alone cannot guarantee
exactly-once simultaneous purchases from several devices.

## Vercel deployment

Import the extracted project into Vercel as a **Next.js** project:

- Root directory: the folder containing `package.json`.
- Install command: `npm ci`.
- Build command: `npm run build`.
- Node.js version: a current 22 LTS or later.
- Use the normal Next.js output; this is not a static-export project.

The account discovery, OTP and news endpoints are included. Do not put browser API keys
into `NEXT_PUBLIC_*` variables.

A regular Vercel Function has a finite lifetime, so deploying the website alone does not
keep browser analysis running after the browser closes. For continuous execution, follow
**[docs/BACKGROUND-WORKER.md](docs/BACKGROUND-WORKER.md)**. It includes the optional
Vercel Daemons configuration and a standalone Node/container alternative. No database is
required. Server credentials stay in server secret environment variables; worker
settings come from an exported workspace file.

## Verify and build

```bash
npm run quality
npm run build
npm run worker:check
npm run worker:build
```

`npm test` runs the original core and WebSocket tests plus reconciliation, execution,
credential-storage, market-readiness, worker, full chart-position, funding and reconnect
regressions with simulated broker data.
`worker:check` validates configuration without connecting or trading. The example worker
configuration defaults to analysis only.

See `docs/VALIDATION.md` for the validation performed for this release and the remaining
live-account checks. No user account credentials or real orders are included in
automated verification.

## Scope and existing features

This project uses the Deriv **Options** API and executes multiplier contracts. It does
not connect to a separate Deriv MT5/cTrader CFD account. Other Options contracts are
listed in the account portfolio and counted in exposure; the multiplier ticket and chart
model remain focused on supported multipliers.

The existing dark theme, fonts, navigation, market chart, anchored position overlay,
strategy catalogue/combinations, replay/backtesting, scanner, alerts, trade analysis,
profile, local export/import and Google Drive App Data backup remain in the project. The
retained v10 namespace migrates earlier valid preferences and metadata. Cached positions cannot
become active merely because they appeared in a JSON backup.

Additional documentation: `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`,
`docs/STRATEGIES.md`, `docs/MAINTAINABILITY.md`, and `CHANGELOG.md`.

## License

MIT
