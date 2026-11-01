# mbioTraders v35 — Verification report

## Source base

- Rebuilt from the supplied `mbiotraders-v34(1).zip`.
- Existing v34 signal calculations, indicator algorithms, market-data providers, economic-calendar safeguards, signal journal and notification delivery were preserved.
- Comparison against uploaded v34: all 13 existing trading library files (except the intentionally updated SEO helper) are byte-for-byte unchanged; existing PWA service worker, browser notifications module, signal-ledger hook and both market/news API routes are byte-for-byte unchanged.

## Checks

- `npm test`: **122 passed, 0 failed** (112 earlier tests plus 10 v35 regression tests).
- `node scripts/doctor.mjs`: **Passed**, 39 required files found and lockfile matches.
- TypeScript/TSX syntactic transpile: **40 source files passed, 0 syntax errors**.
- Responsive header fixture in Chromium: **320, 360, 390, 480, 768, 820 and 1200 px** had no document-level horizontal overflow; on mobile/tablet, action controls were on the same row and to the right of the brand title.
- GA4 tests: measurement-ID validation, safe event parameter filter, URL sanitization, scroll milestones, opt-out, manual pageviews, event coverage.
- PWA tests: hide when installed, real browser installation events, service worker remains unchanged.
- SEO tests: canonical metadata, verification setting, structured data, HTML methodology page, updated sitemap, robots, and privacy noindex.

## Environmental limitation

This execution environment provides Node.js 22.16.0 whereas the application requires Node.js 24.x. Its npm registry is unavailable or incomplete; `npm ci` could not complete, so a Next.js TypeScript semantic check and production build **could not be verified in this environment**. Do not report `npm run check` or `npm run build` as passed until run with Node 24 and installed dependencies.

On your machine or Vercel, use:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
```

If any command fails, capture the exact error output. Google Analytics reporting must be verified after deployment with a valid GA4 Measurement ID; no real measurement ID was provided or embedded here. Google Search indexing requires a Search Console-verified property and remains subject to Google crawling decisions.
