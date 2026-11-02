# mbioTraders v36 — Technical strategy and compact mobile controls

## Source and scope

Based on the preceding public-feed release. Gold and forex Deriv market/history pacing, BTCUSD Kraken, verified caching, signal strategy, browser notifications, PWA, GA4, SEO, CSV and responsive grid are preserved.

## Live signal eligibility

The system validates actual OHLC candles across all six timeframes and uses five higher-timeframe votes. It waits for a 5m countertrend candle, two strong completed candles in the intended direction and the real third 5m opening. A prior confirmed pivot sets the stop, and the target is always 2R. A 90-second timing limit and freshness checks prevent late or guessed entries. A displayed signal is informational and does not execute an order.

## Public providers

Fresh live requests select public Deriv WebSockets for six non-crypto instruments and Kraken spot data for BTCUSD. The verified short-response cache and request pacing reduce unnecessary provider load. Live calls require genuine responses; a missing timeframe or unavailable provider returns a safe waiting state. Historical provider identifiers remain supported so previously saved signals do not lose provenance.

## Mobile design

At phone widths, Install, Guide and Alerts use compact accessible icon controls to the right of the brand title. The market selector and timeframe navigation remain below that first row. Installed PWA mode hides the Install control. The desktop compact grid and two-column tablet layout remain intact.

## Documentation

The public How Signals Work page and downloadable PDF describe the current technical strategy, entry checks and outcomes. They use illustrative prices, not claims of live executions.

## Validation

Run `npm ci`, `npm run doctor`, `npm test`, `npm run check`, and `npm run build` with Node.js 24.x. Provider availability is external and cannot be guaranteed by local unit tests. See the release validation report for check results.
