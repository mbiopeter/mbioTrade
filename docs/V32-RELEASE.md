# mbioTraders v32 release notes

## Purpose

v32 is a presentation-only update on the rebuilt v31 source. The trading engine, candle detector, guard order, real market feeds, history/CSV workflow, signal ledger and browser notification delivery have not been changed.

## Layout and responsive breakpoints

- **Desktop, width >= 1200px:** compact three-column, four-row dashboard. The chart and current signal span two rows; Setup Details spans the two central rows. Alignment, indicators, recent signals, news status, levels and statistics remain visible. The old position hacks that caused horizontal overlaps were reset.
- **Desktop, width >= 1200px and viewport height >= 700px:** the grid takes the remaining height after the header using 100dvh, so normal desktop screens do not require vertical page scrolling. It was visually checked at 1200 x 700, 1280 x 720, 1366 x 768, 1440 x 900, and 1920 x 1080 using representative content. Screens shorter than 700px use natural document height to avoid hiding information.
- **Tablets, width 761-1199px:** exactly two equal columns with the chart and trend-alignment cards spanning both; content height remains natural. At 768px, 834px and 1024px widths, there are no clipped cards in the representative-content viewport checks.
- **Phones, width <= 760px:** one column with controls and cards kept in reading order.
- The Signal Setup checklist still shows each criterion's name, full explanation, status and conclusion; no inner scroll panel or ellipsis is introduced.

## Signal Guide PDF

Use **Signal Guide** beside **Alerts** in the header. The browser downloads the bundled file from `public/mbiotraders-signal-guide.pdf`. It is a 10-page illustrated strategy guide with BUY/SELL candle charts and no version number in its title, page headers, prose or PDF metadata. A separate backend route is not required. The file is about 110KB.

## Notification status

Successful browser-notification permission does not display a long message in the header. User activation, browser permission requests, alert sound, service-worker notification, normal Notification fallback and duplicate suppression are unchanged. Screen-reader status updates and the Alerts button's explanatory tooltip remain available.

## Tests and deployment

Use Node.js 22.16 or newer:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Test and inspection notes are supplied in the separate release validation file. This environment could run the Node test suite and browser-based layout mockup checks but could not complete a Next.js production build because the npm registry dependencies were unavailable. Run `npm ci`, `npm run check` and `npm run build` on a network-enabled machine before deployment.

No user-facing design changes modify orders, place broker trades, or guarantee profitable signals.
