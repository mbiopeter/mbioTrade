# mbioTraders v29 — Recent Signals

## Features

The dashboard retains the v28 appearance and signal logic, with one targeted change to the Recent Signals card.

- The table has exactly four columns: **Time, Direction, Pair, Result**.
- Each page displays at most three records. Previous and Next controls provide pagination.
- **Export CSV** downloads all available completed records, not just the displayed page.
- The 100 newest completed signals are retained **globally across all six markets**, not 100 per market.
- Time in the dashboard is the original entry timestamp in **East Africa Time**. Exported Time values use ISO 8601 UTC.
- The Result column identifies the verified TP or SL outcome and its paper result in R, such as `TP +2.00R` or `SL -1.00R`.

## Data persistence and upgrades

The storage key remains `mbiotraders-signals-v26`. Older v26, v27 and v28 stored results are read automatically. When more than 100 completed signals exist, the oldest completed records are trimmed, based on the signal-close timestamp. Pending and active signals remain untouched. When an active signal later settles, its outcome is saved and the 100-result limit is enforced again.

This history is stored in the current browser's localStorage and is not synchronized between devices. Clearing site data, changing the site origin or using private browsing may erase it. Export CSV regularly if you need an independent archive. The export is triggered in the browser without transmitting the records to a server.

## Safety and result interpretation

The dashboard tracks research signals only; it does not execute trades. Outcomes are based on available real market candles. A missing historical interval does not create an invented win or loss. The recorded R values describe modelled price movement, not actual brokerage P/L or a guaranteed profitable strategy.

## Installation

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Use Node.js 22.16.0 or newer. The application can be deployed to Vercel as a Next.js project, preserving the existing `NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke` configuration.

## Verification

The automated tests include global retention, old-ledger migration, pagination boundaries, CSV content and preservation of the four mobile columns. A full Next.js production build is still required on a machine with npm dependencies installed.
