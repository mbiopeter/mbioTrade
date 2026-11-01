# v23.1 validation notes

- Node.js regression suite: **22 tests passed**, including the original 15 strategy/market-data tests, 6 higher-timeframe and live reading tests, and 1 bounded gauge responsiveness test.
- Source TypeScript/TSX files passed TypeScript transpilation syntax diagnostics without npm dependencies.
- CSS parsed without malformed top-level tokens.
- Structural layout fixture was rendered in Chromium at **1536, 1200, 1024, 768 and 390px**. All nine cards were present with **no horizontal document overflow**. At 1536px, major card bounding boxes matched the screenshot's staggered card geometry to within a few pixels.
- This structural layout fixture is **not** the running Next.js app and contains explicitly artificial demonstration values. It is excluded from the release ZIP.
- Actual `npm ci`, the full Next.js production build, full React hydration, and live upstream market feeds could **not** be verified here: npm packages were not available in this offline environment. These remain mandatory local/deployment checks, not reported as passing.

Commands to repeat on a machine with npm connectivity:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Test the dashboard at http://localhost:3000 and the market API at http://localhost:3000/api/market?symbol=XAUUSD. Verify current provider identity, timestamp, instrument, 3/5/7D selector and audible alert opt-in. A WAIT state during stale or absent market data is expected and intentional.
