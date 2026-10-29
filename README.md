# mbioTraders v25 — Live Market Signal Dashboard

A single-screen **Gold and Forex market signal research application**, based on the v23.1 dashboard layout. **No trade execution** or broker authentication. Market data is supplied by Twelve Data (if you configure a server-side key) or the free public Deriv history and streaming API. Missing/stale data blocks signals; prices are not generated or interpolated.

## What's new in v25

- Persistent automatic retries for HTTP candle history, including timeouts and errors; capped exponential backoff.
- Self-healing public tick WebSocket: retries after errors, close, failed subscriptions, first-tick timeouts, and stalled data. Online/resume events force an immediate HTTP refresh.
- Keeps previously verified candles visible through transient outages, but displays WAIT and blocks new alerts until the data request recovers.
- A slightly shorter header and instrument/timeframe toolbar, with slightly smaller typography.
- A louder three-tone sound with audio peak limiting (click Alerts On to allow browser audio).
- Clicking the mbioTraders title opens https://mbiopeter.co.ke in a new tab.
- All visual CSS class prefixes are **`mbiotraders-`** without release numbers. Visible branding remains **mbioTraders** (no version badge).

## Features retained from v24

- Fixed the `evaluateLiveFrame is not defined` runtime crash by explicitly importing the engine export in the dashboard.
- Replaced the custom SVG gauge with the independently maintained **react-gauge-component** `2.0.29` (semicircle, colored bands, animated needle, keyboard-friendly status labels).
- Rebranded the application from MbioTrade to **mbioTraders**.
- Added SEO: page title and description, canonical URL, Open Graph/Twitter social preview, `robots.txt`, `sitemap.xml`, JSON-LD WebApplication metadata.
- Replaced first-load blank panels and the Next.js loading indicator with nine matching **skeleton cards**. The original desktop card positions and responsive structure remain intact.
- Preserved selectable Gold + five Forex pairs, 5m/15m/30m/1H/4H/1D chart views, 3/5/7 completed-trading-day higher-timeframe momentum, confirmed-candle signal logic, live chart ticks and audio alerts.

## Install locally (important)

**This complete v25 project includes a consistent package-lock.json.** Install with `npm ci` (a clean install):

```bash
cd mbiotraders-v25
node --version                  # Node 22.16+ recommended
npm ci                         # Installs the pinned dependencies
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Open http://localhost:3000. Commit **both** `package.json` and `package-lock.json` when deploying from Git, so Vercel uses the locked dependencies.

The UI uses `react-gauge-component`, with `d3` as its dependency. It is dynamically imported on the client to avoid server-side SVG measurement issues.

## Environment settings (optional)

Copy `.env.example` to `.env.local`:

```env
TWELVE_DATA_API_KEY=
NEXT_PUBLIC_SITE_URL=https://mbiotrade.vercel.app
```

The Twelve Data key is a **server-side** secret. Never prefix it with `NEXT_PUBLIC_` or commit `.env.local`. If your website changes domain, set `NEXT_PUBLIC_SITE_URL` to the new **HTTPS origin** for correct canonical links, social preview, sitemap and robots output. Default canonical domain is the previously supplied `mbiotrade.vercel.app`.

## Deploy to Vercel

1. Run `npm ci`, `npm run test`, `npm run check`, `npm run build` locally first.
2. Push the entire source **including `package-lock.json`** to GitHub.
3. Import it as a **Next.js** project at Vercel with root directory `./`.
4. In Vercel project environment settings, set `NEXT_PUBLIC_SITE_URL` to your production origin; optionally add `TWELVE_DATA_API_KEY` as a secret.
5. Deploy and open `/`, `/robots.txt`, `/sitemap.xml` and `/opengraph-image`. Check actual data freshness and test alerts after enabling audio with a click.

## Signal methodology

- The 1H, 4H and 1D readings use a selectable 3, 5 or 7 **completed trading sessions** and must align.
- A qualifying short-term signal requires a pullback, a **completed** five-minute reversal candle, all six directional ratings aligned, sufficient ADX and the minimum confluence threshold.
- The **strength gauge** is a visual directional indicator that can move provisionally on ticks; it is **not** a winning probability. Confirmed BUY/SELL signals never use incomplete candles.
- Recent outcomes are a short paper replay without spreads, slippage or fees and are not evidence of live profitability.

Refer to `docs/V25-UPGRADE.md`, `docs/V24-RELEASE-NOTES.md` and the previous methodology documents for further details.
