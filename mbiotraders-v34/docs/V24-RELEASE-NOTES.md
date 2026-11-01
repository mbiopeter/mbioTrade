# mbioTraders v24 — Implementation and verification

## Crash fix

The v23.1 Dashboard referenced `evaluateLiveFrame` without importing it. The function already existed in `src/lib/v22/analysis.ts`; v24 imports it and uses its provisional frame only for the on-screen indicator and gauge. A dedicated regression test checks both the import and export. The confirmed signal engine still ignores unfinished candles.

## Gauge

An external maintained React component, `react-gauge-component@2.0.29`, draws the five-band semicircular strength gauge and animates a built-in needle; the application does not calculate SVG paths. The wrapper handles colors, count labels, accessible meter text and responsive styling. `next/dynamic` disables SSR for the gauge renderer. While live Deriv tick data is fresh, the UI can move provisionally; the final alert still requires a completed five-minute candle and all six timeframe rules.

## Skeletons

`DashboardSkeletonCards` uses the same nine grid class names as the live dashboard. It is displayed while a newly selected instrument's initial historical dataset loads. `src/app/loading.tsx` uses the same card skeletons. Failed data requests display an error/retry state rather than permanent shimmer.

## SEO

- `src/app/layout.tsx`: metadata, canonical, title, description, keywords, social cards.
- `src/app/page.tsx`: JSON-LD WebApplication structured data.
- `src/app/robots.ts` and `src/app/sitemap.ts`: publicly crawlable root; API excluded from indexing.
- `src/app/opengraph-image.tsx`: generated PNG social image.
- `src/lib/seo.ts`: canonical URL with HTTPS validation.

Set `NEXT_PUBLIC_SITE_URL` to the production origin; otherwise the canonical defaults to `https://mbiotrade.vercel.app`.

## Dependencies and build limitation

This coding environment did not have npm network access, so it could not install the new gauge package or run an actual Next.js build. To avoid shipping a **known-invalid lockfile**, v24 intentionally omits `package-lock.json`. On first install use `npm install` (not `npm ci`), run `npm test`, `npm run check`, and `npm run build`; commit the new lockfile before deploying. The installed dependency pin is `react-gauge-component@2.0.29`.

This release's scripted tests verify the signal engine, 3/5/7-day momentum, missing import regression, skeleton coverage and SEO source wiring. The actual live-provider and cross-browser visual results must be checked on deployment.
