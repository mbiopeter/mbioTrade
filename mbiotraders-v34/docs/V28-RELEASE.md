# mbioTraders v28 Release Notes

## Mobile responsiveness

The header remains useful at phone widths rather than hiding the market context. On narrow screens, branding and audio control sit together, the feed status has its own row, the current instrument/timeframe/momentum remain visible, and both selector rows scroll horizontally on touch devices. On larger widths the three-column market dashboard and full header remain intact.

## Long and short signal drawing

The chart retains the shaded green reward area, red risk area and compact value tags for the signal entry, TP and SL. Additional full-width entry/SL/TP price lines have been removed. The shaded position is recalculated from its actual price and candle time when the chart pans, zooms, or changes size. Support and resistance annotations continue to appear independently.

## TypeScript

A nullable provider captured in `useHistoricalCandles` previously flowed into the `URLSearchParams` constructor. The effect now narrows the provider into a non-null constant before the asynchronous backfill begins. The strict standalone strategy/data-library type check and a dependency-stubbed application type check pass. These checks do not replace a real Next.js build against installed dependencies.

## Comment-free source

The release removes authored comments from TypeScript, TSX, JavaScript, CSS, tests and configuration files. Next.js can regenerate `next-env.d.ts` during development or builds; generated files are managed by Next.js rather than the application.

## Upgrade

Replace v27 sources and install using `npm ci`. Do not change the site origin if you want to retain the existing localStorage signal history. You can then run `npm run doctor`, `npm test`, `npm run check`, `npm run build`, and `npm run dev`. Upgrading does not change the active signal ledger key.
