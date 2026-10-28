# MbioTrade v16 validation

The v16 maintenance results, limitations and reproducible checks are in
[`V16-STARTUP-REPAIR.md`](V16-STARTUP-REPAIR.md). The v14 test record below is retained
as the baseline for the unchanged trading implementation.

---

# v14 release validation

Release date: 28 October 2026. Validation used Node.js 24.22.1 and the unchanged locked
Next.js 16.4.3 dependency graph. Node.js 22.9 or later remains the documented minimum.

## Completed results

- `npm run quality`: passed formatting, configuration/router/import invariants,
  TypeScript and all 18 test files.
- `npm run build`: passed the production compiler and TypeScript, generated the
  application pages and retained all three dynamic API endpoints.
- `npm run worker:build` followed by `node .worker-build/worker/run.js --check`: passed.
  The actual CommonJS output was executed; this caught and fixed an import-order issue
  that did not appear in the tsx runner.
- Main mocked browser regression: passed, with 3 mock buys, 1 mock sell, 3 protection
  updates and no uncaught browser errors.
- Preset/migration browser regression: passed 18 checkpoints, with zero account API calls,
  financial requests, external HTTP requests, unmocked external sockets or browser errors.
- Desktop 1440px and mobile 390px preset layouts were checked for overflow and visually
  inspected, including expanded Gold rules and the migration notice.
- All 136 v13 source files remain. Thirteen files are added, producing 149 source files
  in the release. The dependency lock differs only in the root release version.

No real Deriv account credentials, live orders, Vercel deployment or Docker image build
were used in this validation. The development test screens contain simulated data only.

## Scope of v14

The release adds five configured market patterns and General Trend Pullback. Every
entry uses the confirmed EMA50/EMA200 trend gate, including legacy combinations and
manual fallback tickets. The five market patterns enforce symbol scope. Applying a
preset preserves spending/account limits, pauses browser execution in Signals, and
keeps edited factory definitions as custom copies.

New-order multipliers are 100, 200, 300, 500, 800, default 100. Removed saved values become
100 + Signals; live and historical trade factors remain unchanged. Existing remembered
keys, broker synchronization, full chart drawings, reconnects, quote/balance checks,
SL/TP edits, demo/real behavior and the optional worker are retained.

## Automated test coverage

| Test file | Main coverage |
| --- | --- |
| `trend-strategies.test.ts` | 34 deterministic cases: all six patterns in both directions, genuine pullbacks, first resumption/retest, MACD reset, Gold wick/spike rules, pair scope, invalid/flat/short history, legacy countertrend rejection, required-pattern veto, recommendation and close-time News Guard |
| `presets.test.ts` | Six complete preset selections, General market retention, spending/credential/executor preservation, Signals pause, edited factory save-copy, repeat Apply and input immutability |
| `trend-integration.test.ts` | Completed-bar boundary, unfinished candle exclusion, stale-history gap rejection, manual warmup/direction and final settings rechecks |
| `worker-trend-boundary.test.ts` | 13 actual-generator cases: long/short × demo/real boundary deduplication, with/without recorded order metadata, 600-bar parity, quote-time News Guard crossing and stale pattern behind a fresh tick |
| `replay-accounting.test.ts` | 205-bar warmup, candle-close decision timestamps, chronological settlement, no overlapping earlier entry funded by future P/L |
| `multipliers.test.ts` | Five choices/default, hydration/import pause for removed factors, valid-setting preservation, raw worker rejection, broker/legacy factor preservation and no proposal/buy for unsupported new factors |
| `broker-levels.test.ts` | Broker spot barriers, cash commission, persistence, partial snapshots and removed protection |
| `chart-position.test.ts` | Long/short zones, exact broker barriers, labelled estimates, local fallback, invalid inputs and position anchoring |
| `funding.test.ts` | Quote cost, selected amount, fresh balance, shortfall/minimums, incompatible stops, no buy after rejection, expired quoted-price plan rejection, demo/real and manual/auto parity |
| `protection.test.ts` | 23 cases covering cash edits, baselines, partial updates, negative SL normalization, both directions/account types, ownership, switches, uncertainty, transport and stale local exits |
| `core.test.ts` | Indicators, legacy methods, manual plans, chart metrics, replay and validated workspace migration |
| `execution.test.ts` | Modes, risk limits, cooldown, account exposure and automatic signal ownership |
| `market-readiness.test.ts` | Fresh ticks, unavailable/expired prices, P/L and News Guard |
| `reconciliation.test.ts` | External closures, fresh-device restoration, account isolation, history and common execution adapter |
| `storage.test.ts` | Remembered credentials, migration, Forget, blocked storage and secret exclusion from backups |
| `websocket.test.ts` | Transport lifecycle, cancellation, restored subscriptions and one-shot requests |
| `reconnect.test.ts` | Initial OTP/handshake failures/timeouts, retry cancellation, stale messages, worker startup and no buy replay |
| `worker.test.ts` | Server execution, funding notifications, lifecycle/risk gates, concurrency, exits and uncertain purchases |

The GBP retest regression specifically proves that later volatility cannot revive a
breakout invalidated by an earlier close: each historical invalidation uses that bar's
own preceding ATR. Pattern tolerances likewise use preceding ATR so a large entry bar
cannot inflate its own permitted range.

## Main browser regression

`tests/browser-smoke.mjs` runs against a local Next.js server using Playwright and
Chrome Headless Shell. Every Deriv HTTP/WebSocket endpoint is mocked. It verifies:

1. Initial account and public connection failures retry without a second Connect action.
2. Five ticket multipliers are present, 100× reaches the proposal, and a manual short
   is disabled when the confirmed trend is up.
3. An excessive quote or insufficient balance reports the required amount/shortfall
   and produces zero buy requests.
4. One valid manual order displays entry, SL, TP, both colored zones and live P/L.
5. The same account on a clean second browser restores the full position from broker data.
6. Both devices can edit protection; changed fields are confirmed without overwriting
   untouched limits, and the charts reconcile after layout changes.
7. Drawing dimensions, labels and price alignment survive reload, reconnect and timeframe
   changes; the purchase is not replayed.
8. An external closure removes the trade from both browsers. An older external short
   restores full zones and labelled cash-derived levels.
9. Portfolio can edit or explicitly close a contract during a history outage.
10. Remembered keys survive reload/disconnect; Forget removes them and Disconnect cancels retries.
11. Demo and real Automatic modes trade from a non-terminal page without per-trade
    confirmation, then navigate without duplicate orders.

The observed successful run recorded 3 mock buys, 1 mock sell and 3 protection updates.

## Preset browser regression

`tests/preset-browser-smoke.mjs` verifies all six Apply actions, Signals-first storage
ordering, same-origin tab updates, factory configuration values, preserved custom
combinations, repeated Apply, saved copies of edited presets, General market retention,
and atomic New/Duplicate selection. It tests hydration of 20× Automatic and import of 50×
Automatic settings into 100× Signals, including the visible notice and persistence after
reload. Desktop and mobile card/rule layouts are measured and visually reviewed.

External HTTP is blocked, external sockets are mocked, and no credentials are supplied.
Only the local Next development socket is allowed to connect for hydration. Successful
results report 18 checkpoints, 9 mocked public sockets and zero financial/account calls.
Screenshots and local diagnostic outputs are not included in the release ZIP.

## Timing and financial boundaries

The worker retains 601 raw bars and analyzes 600 completed bars, matching browser and
replay windows. It deduplicates on the confirmed signal bar, checks recorded own signal
metadata where available, rechecks current News Guard at purchase, and refuses stale
closed patterns after a market/history gap. A connected live feed alone is insufficient.

The execution adapter rejects a supplied quote spot at or beyond planned SL/TP. It
still cannot guarantee a fill at the signal close. Known pre-buy failures remain unsent;
an uncertain purchase result is never automatically replayed. Independently running
owners on different devices still lack a distributed lock; use one automatic owner.

Replay now accounts for settlement chronologically and dates decisions at candle close.
It remains a simplified sequential OHLC simulation with approximate multiplier P/L,
configurable commission, stop-first ambiguous bars and no historical calendar or exact
broker fill model. The tests do not establish profitability, performance robustness or
professional-trader returns for the exact presets. No fabricated performance statistics
are supplied.

## Deployment and retained protection

The production build includes account discovery, OTP and calendar API routes. Normal
Next.js/Vercel deployment is documented in SETUP; uninterrupted execution needs the
separate worker described in BACKGROUND-WORKER. Merely deploying the website does not
keep browser JavaScript running after the browser closes.

Broker spot barriers and cash protection remain distinct. Estimated chart levels are
labelled and never create local automatic exits for imported external trades. Protection
updates send changed positive cash fields only, verify the broker read-back, retire stale
local price plans and cannot reuse preflight authorization across a socket reconnect.
A further independent broker edit cannot be atomically excluded by a client-side read.

## References

Strategy concepts and evidence limits are documented with primary sources in
[V14-STRATEGY-GUIDE.md](V14-STRATEGY-GUIDE.md). Existing broker semantics are documented in:

- [Deriv open-contract schema](https://github.com/deriv-com/deriv-api-schemas/blob/master/schemas/proposal_open_contract_response.schema.json)
- [Deriv contract-update API](https://developers.deriv.com/docs/trading/contract-update/)
- [Deriv proposal comparison](https://developers.deriv.com/comparison/proposal/)
- [Deriv buy API](https://developers.deriv.com/docs/trading/buy/)
- [Deriv multiplier relationship](https://deriv.com/options-types/multipliers)
