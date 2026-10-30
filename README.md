# mbioTraders v30

A responsive, signal-only Gold and forex analysis dashboard built with Next.js.

## What's new in v30

- Recent Signals now shows **two completed results per page**, with Previous/Next navigation and extra bottom spacing.
- The last **100 completed results across all supported pairs** remain in localStorage, and Export CSV still downloads the complete stored history.
- A server-side economic-calendar endpoint checks published **high-impact events** affecting the selected pair.
- New signals are blocked **three hours before** until **two hours after** the reported release time, inclusive.
- Gold follows USD events; forex pairs follow events for either currency (including Eurozone and German events for EUR/USD).
- Releases with unconfirmed times are conservatively blocked over their published date or date window.
- If the calendar is unavailable, stale, or incomplete, **new entries stay paused** and the application automatically retries.
- Signals already active continue TP/SL verification, even during a high-impact news window.
- Pending breakout setups are cleared during a news blackout or unavailable calendar rather than activating later without current confirmation.
- Calendar data is provided by [Finance Calendar](https://www.financecalendar.com), with attribution shown directly in the signal card.

## Existing functionality preserved

- XAUUSD, EURUSD, GBPUSD, USDJPY, AUDUSD and USDCAD.
- Selectable 5m, 15m, 30m, 1H, 4H and daily timeframes.
- Multi-timeframe trend alignment with seven-day momentum as the default.
- Real market feeds with retries, connection toast, 90-day history requests and skeleton loading states.
- Technical analysis, live strength gauge, chart position zones and sound alerts.
- One persistent active signal per pair with wider stops and opposing-level confirmation.
- Browser localStorage persistence, 100 completed results globally, CSV export and market statistics.
- Four-decimal prices, mobile header and the existing dark-green dashboard layout.

## Install

Use Node.js 22.16.0 or newer:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Open http://localhost:3000. The calendar uses a keyless public API and needs no additional environment variable.

## Market feeds and hosting

Copy `.env.example` to `.env.local` to configure optional `TWELVE_DATA_API_KEY`. Without this key, the existing public Deriv market-feed fallback remains. For production set:

```env
NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke
```

The calendar is fetched by `/api/news-calendar` on the Next.js server, and rechecked automatically by the browser. Its availability and source are shown in the signal panel. This calendar is a curated public economic-release schedule, not a guarantee that every market-moving announcement is covered.

## Signal rules

New signal creation and pending-breakout activation require valid current market data **and** a fresh calendar showing that the selected market is outside any relevant restricted interval. The filter blocks an exactly timed announcement from three hours before its reported time through two hours after it. Unknown times block conservatively over the published date window.

The filter does not cancel previously activated signals and does not retroactively change old paper results. Existing active signals close only when real provider candles verify SL/TP. Signals and outcomes stay in the existing `mbiotraders-signals-v26` localStorage key.

See `docs/V30-ECONOMIC-NEWS.md` for data source details, failure behavior and validation.
