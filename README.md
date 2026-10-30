# mbioTraders v28

A responsive, signal-only Gold and forex analysis dashboard built with Next.js.

## What changed

- Mobile header reorganized into brand/alert, connection status, market context and swipeable market/timeframe controls.
- Live chart retains the time- and price-anchored long/short position boxes, without separate entry, stop-loss or take-profit lines.
- Historical backfill now uses a TypeScript-narrowed, non-null provider identifier in asynchronous requests.
- Application source, configuration, CSS and tests contain no authored code comments.

## Existing features retained

- XAUUSD, EURUSD, GBPUSD, USDJPY, AUDUSD and USDCAD
- Selectable 5m, 15m, 30m, 1H, 4H and daily timeframes
- Multi-timeframe trend alignment with 7-day momentum as the default
- Real market feeds with retries and a bottom-right connection toast
- Technical analysis, animated market-strength gauge and sound alerts
- One persistent active signal per pair with wider stops and opposing-level confirmation
- Stored outcomes and statistics (up to 50 per pair), four-decimal price labels and 90-day historical backfill where supported
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

The dashboard does not execute trades. Once a paper signal is activated, it persists in the current browser until verified history confirms that the stop or target was reached. Missing history does not create a synthetic outcome. Local storage is device-specific and is not a cross-device database.

## Verification

The automated tests check historical data, trend logic, the signal lifecycle, the mobile header and the price-line removal. A complete production build must be checked on a machine with the project dependencies installed.

See `docs/V28-RELEASE.md` for detailed changes.
