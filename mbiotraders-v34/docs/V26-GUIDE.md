# mbioTraders v26 — Signal lifecycle and history

Signals are research-only, not actual positions. A detected signal is stored as
ACTIVE in the browser and retains its original entry, stop and target even if
higher- or lower-timeframe indicators subsequently disagree. The tracker
settles it only when a real completed 5-minute price candle touches TP or SL;
if both occur in one candle, SL wins conservatively. Missing market candles
leave the signal ACTIVE with a warning rather than inventing an outcome.

## Wider stops

The stop distance is the maximum of: recent 20-candle swing distance plus
0.35 ATR(5m); 2.6 ATR(5m); 1.4 ATR(15m); or 0.55 ATR(H1). If the stop exceeds
2 ATR(H1) the setup is rejected rather than narrowed. TP remains 2R. Wider
stops increase potential loss per unit of exposure, and are not guaranteed
to improve win rate.

## Resistance/support blocking

A BUY near earlier 5m resistance or a SELL near earlier 5m support is stored
as a PENDING candidate. Only two subsequent *completed* 5m closes beyond the
original barrier (with an ATR buffer) activate it. Pending candidates expire
in six hours. Pending signals do not count as active positions or outcomes.

## Persistence and historical price recovery

The localStorage key `mbiotraders-signals-v26` keeps one active position per
market and the last 50 settled signals per market; stats come only from these
actual tracked outcomes. This is **browser/device-local**, not a cloud backup.
Reopening the same domain/browser restores the active plan. History requests
then attempt to reconstruct price touches during the browser's absence. If
past candles are missing or the price provider has changed, reconciliation
pauses and the plan stays active. Audio alerts only work with an open tab.

The chart attempts to retrieve 90 calendar days of genuine selected-provider
OHLC in cursor-paged requests. The screen shows actual coverage and the
amount of downloaded data. Data access is **best effort**: free providers
may restrict long 5m history, subscription-level data, or request quotas;
no candles are filled in or fabricated. Prices display with four decimals,
but calculations retain provider precision. A chart box is attached to the
original time and price levels using the Lightweight Charts APIs, and is
recalculated on zoom, scroll, resize and timeframe changes.

## Limitations

Indicators are not probability-calibrated. The settlement model does not
include spreads, commissions, executable fills, intrabar order sequencing,
slippage or fees. If the stop and target are both touched within the same
candle, the stop is assumed first. Real market outcomes can differ.

## Checks

`npm ci`, `npm run doctor`, `npm test`, `npm run check`, `npm run build`.
This build was not verified against npm or live market data within this
execution environment. Validate those integrations on localhost and Vercel
before relying on the results.
