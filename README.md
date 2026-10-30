# mbioTraders v29

A responsive, signal-only Gold and forex analysis dashboard built with Next.js.

## What changed in v29

- Recent Signals shows only **Time, Direction, Pair and Result**.
- Exactly three completed signal records appear on each page, with Previous/Next navigation.
- **Export CSV** downloads all stored results, not just the visible page. The CSV contains those four columns only.
- The most recent **100 completed signals across all six pairs** remain saved in the existing browser localStorage ledger.
- Existing v26–v28 saved signals and active positions are retained when upgrading on the same origin.
- Market Statistics uses the same 100 most recent completed signal outcomes.
- Retains the responsive mobile header, time- and price-anchored chart position drawings and TypeScript fixes from v28.

## Existing features retained

- XAUUSD, EURUSD, GBPUSD, USDJPY, AUDUSD and USDCAD
- Selectable 5m, 15m, 30m, 1H, 4H and daily timeframes
- Multi-timeframe trend alignment with 7-day momentum as the default
- Real market feeds with retries and a bottom-right connection toast
- Technical analysis, animated market-strength gauge and sound alerts
- One persistent active signal per pair with wider stops and opposing-level confirmation
- Stored outcomes and statistics (the latest 100 completed signals across all pairs), four-decimal price labels and 90-day historical backfill where supported
- Professional dark theme, responsive cards and skeleton loading states

## Installation

Use Node.js 22.16.0 or newer:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Then open http://localhost:3000.

## Data configuration

Copy `.env.example` into `.env.local` to configure `TWELVE_DATA_API_KEY` if you have a Twelve Data subscription. Without it the application uses the unauthenticated public Deriv market feed where supported. Configure `NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke` for your production website.

## Signal lifecycle

The dashboard does not execute trades. Once a paper signal is activated, it persists in the current browser until verified history confirms that the stop or target was reached. Missing history does not create a synthetic outcome. The 100 latest completed outcomes and any active signals use the original `mbiotraders-signals-v26` localStorage key, so normal upgrades preserve existing records on the same website address. Local storage is device-specific and is not a cross-device database.

The Recent Signals table shows three outcomes per page. Time means the original signal-entry time, displayed in East Africa Time (EAT). Exported timestamps use unambiguous ISO 8601 UTC, and the CSV exports all stored rows, regardless of the page currently displayed. Once more than 100 outcomes are completed, the oldest ones are removed from local storage.

## Verification

The automated tests check historical data, trend logic, the signal lifecycle, the mobile header and the price-line removal. A complete production build must be checked on a machine with the project dependencies installed.

See `docs/V29-RELEASE.md` for the updated Recent Signals behavior and `docs/V28-RELEASE.md` for the preceding responsive-design changes.
