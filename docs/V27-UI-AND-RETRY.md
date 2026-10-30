# v27: UI, retry handling, and readable source

## Connection and loading behavior

1. On an initial load or instrument switch, the nine-card skeleton fills the
   same layout until a valid market response is available.
2. If the HTTP fetch fails, times out, or receives an incomplete timeframe,
   automatic retries continue using the existing capped backoff. The raw
   upstream error is retained internally and **never shown as an inline
   warning**.
3. On the first real connection failure for the selected symbol, a
   bottom-right **Retrying connection…** toast appears and hides after exactly
   five seconds. It does not repeat on every failed poll in the same outage.
4. The free public streaming connection also retries if it closes, errors,
   fails to subscribe, or stops delivering fresh ticks. A stream outage can
   trigger the same transient notification.
5. When verified data returns, the retry state clears. A later independent
   outage may display a new five-second toast.
6. A normal loading state by itself is not treated as an error. Stale or
   incomplete data still blocks new confirmed alerts and signal activation.

The connection toast has a polite live-region announcement, a progress line,
and reduced-motion support. It uses only `mbiotraders-` styling names.

## Top bar

- Clickable mbioTraders brand links to https://mbiopeter.co.ke.
- Active symbol and chart timeframe are visible without scrolling down.
- The header also displays the selected 3/5/7-day momentum window, the
  actual market-data provider when connected, a live/waiting indicator,
  Nairobi time, and the sound-alert control.
- Markets and timeframes remain directly selectable without a sidebar.
- Controls scroll horizontally on small phones instead of widening the page.

## Background history

The 90-day chart-history status strip was removed, **not** the underlying
history request. `useHistoricalCandles` continues requesting additional real
candles, where the chosen provider supports them. No candles are invented.
Older data and the recovered ledger are cached in memory or localStorage as
before. The history source, API route, and signal ledger have been reformatted
for readability.

## Saved signals and release compatibility

The v26 localStorage key and record format are unchanged. The original
support/resistance breakout gate, wide ATR stops, no-cancel signal lifecycle,
4-decimal display, 7-day default, max 50 saved outcomes per pair, and
price/time-attached chart position zones remain in the application.

Changing the site domain changes browser localStorage scope. To preserve
existing saved data, upgrade on the **same site origin**. Local storage is not
a server database and does not synchronize two unrelated browsers.

## Verification

Run `npm run doctor`, `npm test`, `npm run check`, and `npm run build` after
installing dependencies. The tests cover v26 signal invariants and v27
warning suppression, toast timing/placement, history loading, topbar controls,
source readability, and canonical SEO configuration.

Unit and source checks are not a substitute for a full production build and
live-provider test. The application remains research-only, not an order
execution service.
