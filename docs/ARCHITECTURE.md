# MbioTrade v14 architecture

## UI and composition

The existing Next.js App Router layout and global CSS are retained. Browser providers
are composed in `src/app/providers.tsx`: workspace state, broker account state, toasts
and the application shell. `AppAutomation` keeps a single browser analysis/execution
owner mounted across navigation. Terminal display analysis is separate from order side
effects.

## Broker account state

`src/lib/deriv-auth.ts` wraps the authenticated Deriv Options WebSocket. It exposes
balance, portfolio, open-contract, statement/history, buy, sell and protection-update operations. Manual
and automatic Demo/Real requests share this adapter.

`src/lib/deriv-reconciliation.ts` normalizes broker records, identifies account scopes,
builds live P/L snapshots and translates chart plan distances into broker monetary stop
amounts. Unknown external strategy labels/levels remain unknown.

`src/lib/account-sync.ts` owns a broker-backed account session. It:

- starts balance, transaction and all-open-contract subscriptions;
- restores portfolio positions without needing local journals;
- fetches contract snapshots and verifies disappeared positions;
- reconciles external sale events and rejects stale reopening snapshots;
- deduplicates account events and derives realized account P/L from broker history;
- treats cached journals as metadata candidates matched by contract ID;
- invalidates synchronization during reconnect and incomplete history;
- disposes callbacks when the selected account changes.

`src/context/account-context.tsx` exposes this state to React, refreshes on
reconnection/focus/every 15 seconds, persists metadata, and checks readiness and risk
immediately before purchases. `demoTrades`, `executeDemo` and `sellDemo` remain
compatibility names internally; they serve the selected account in both modes. App sells
send actual Deriv requests and reconcile ambiguous outcomes.

## Open-position protection editing

`trade-protection.ts` validates positive cash limits, account/contract ownership and
edited-field baselines. It reads the individual contract, sends one `contract_update`
and reads the contract again before confirming success. Unchanged fields are omitted;
partial acknowledgements are not applied as full protection snapshots. Updates remain
available without complete history/balance readiness, subject to their own checks.

A broker-side change/removal and a potentially sent edit retire the previous local
price plan. Browser/worker local exits verify fresh contract state before selling.
Financial requests with a before-send guard are pinned to the physical socket used
for preflight; an intervening reconnect rejects the unsent request. Read-only recovery
can reconnect and verify the result without replaying the mutation.

## Restored chart positions

Broker reconciliation preserves `limit_order.*.value` as underlying spot barriers,
`order_amount` as monetary protection, and open-contract `commission` as a cash amount.
Proposal commission is a percentage and must not be stored as a cash commission.
Explicit broker limit snapshots distinguish removed limits from partial portfolio
updates. The workspace validator preserves these optional fields without a schema
migration.

`chart-position.ts` chooses broker spot barriers first. While broker protection is
unknown it may use a known local plan. With only cash limits it derives labelled,
display-only price estimates from the multiplier P/L relationship. Imported positions
never gain local automatic exits merely because the chart can now draw their zones.
`MarketChart` includes all known levels in automatic scaling and leaves enough horizontal
space for the full target/risk box and labels.

## Storage

v14 retains the v10 workspace schema and keys. `mbiotrade.v10.*` stores preferences, strategy combinations, signal history,
account-scoped journal metadata and browser submission attempts. Earlier namespaces are
migrated after validation. The saved credential is separate from exportable workspace
data. Same-origin preferences still synchronize through BroadcastChannel and storage
events. The broker supplies positions on a fresh device; credentials and local strategy
notes are not transmitted between devices through Deriv.

## Transport and market readiness

The persistent WebSocket layer correlates request IDs, pings, reconnects with backoff,
restores subscriptions and obtains a fresh OTP URL for authenticated reconnects. It
rejects in-flight one-shot requests rather than replaying them. Closing or replacing a
connection invalidates its pending URL/open callbacks.

Market feed snapshots are keyed by symbol and timeframe. A new selection cannot trade
using candles from the previous selection. Backfill preserves newer live candles,
asynchronous subscriptions clean up on cancellation, and reconnects refresh missed
history. The news calendar is periodically refreshed; enabled News Guard does not
silently proceed on an unavailable calendar in automatic mode.

## Order funding

`order-funding.ts` validates a positive broker purchase quote, the selected spending
amount and a freshly read account balance. It formats required/selected/available
amounts consistently and preserves explicit broker minimum requirements. Known pre-buy
failures use `OrderFundingError` so the worker can report a rejected unsent order
without describing it as an ambiguous purchase. Errors after a buy is sent remain
uncertain and are never automatically replayed.

Multiplier protection validation rejects a stop distance that consumes or exceeds the
whole stake. Raising the stake cannot fix a percentage distance that already consumes
100% at the chosen multiplier; the error asks for a closer stop or lower multiplier.

## Execution and risk

`src/lib/use-analysis.ts` separates signal publication from execution, so a signal seen
before account synchronization remains eligible afterwards. `execution.ts` contains
execution-mode migration, validated local price exits and browser attempt claims.
`risk.ts` shares open-position, account exposure, UTC daily-loss and cooldown gates.
Unsupported Options contract types still count in exposure.

Imported positions without known chart levels never receive fabricated local exits. New
multiplier orders include Deriv monetary stop-loss/take-profit amounts. Browser chart
estimates remain clearly distinguished from broker P/L.

## Optional worker

`worker/` shares the strategy engine, broker adapter and risk logic in a standalone Node
process. Configuration comes from an exported workspace plus server environment
variables; no database is introduced. The server owns continuous analysis independently
of a browser. `Dockerfile.worker` and the optional Vercel Daemons example package it.
The normal Next.js deployment does not depend on this optional runtime.

One automatic owner per account is required across devices and server rollouts. There is
no distributed exactly-once order lock without a shared coordination mechanism. The
browser owner selector and deployment instructions make this explicit.

## Existing features

The module boundaries for terminal/settings/UI, strategy catalogue, indicators, scanner,
backtesting, profile, analytics, chart overlay, and Google backup are retained.
Workspace schema version is 10; the prior Drive backup filename remains stable for
migration. Tokens are excluded from all workspace snapshots.

## v14 strategy and timing layer

`strategy-engine/profiles.ts` declares six user-visible presets; `configured.ts` implements
their complete pattern prerequisites. `trend.ts` owns EMA50/200 alignment, slope and ATR
separation. `signal.ts` applies that gate to every combination, then prevents incomplete
configured patterns from being bypassed by other votes. Legacy methods remain available.

`candles.ts` filters unfinished bars and caps live analysis at 600 completed bars. Browser,
scanner and worker check confirmed-history freshness. Worker raw retention is 601 bars,
so a forming candle does not shorten the analyzed window. Attempt deduplication uses the
confirmed bar and broker-recorded own signals; the final quote callback rechecks live
News Guard timing. Existing-position exits run independently of a new-entry trend signal.

Manual tickets use confirmed trend direction and current live price. Their callback
rechecks the trend, live data, selected plan and settings after account/quote requests.
Exits and protection edits are not gated by new-entry trend readiness.

`strategy-presets.ts` builds a complete immutable preset selection. AppContext stores
Signals before the changed combo/market, preserves edited factory definitions as custom
copies, and updates same-origin tabs. Removed multiplier preferences migrate to 100 + Signals
with a notice, while existing position sizing remains authoritative. Storage keys/schema
and credential handling are unchanged.

Replay consumes historical prefixes through each completed decision candle. Settlement
is dated at exit-bar close, and the next decision cannot precede the last simulated exit.
It is a sequential approximation rather than a broker-fill or concurrent-portfolio model.
