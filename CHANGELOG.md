# Changelog

## v29.0.0

- Increased the stored completed-signal limit from 50 per pair to 100 across all supported pairs.
- Reduced Recent Signals to Time, Direction, Pair and Result columns.
- Added three-result pagination with Previous and Next controls.
- Added one-click CSV export of the entire stored history using ISO 8601 UTC timestamps.
- Preserved v26 localStorage keys, existing active signals and historical outcomes.
- Aligned Market Statistics with the same 100 most recent completed outcomes.
- Preserved every v28 chart, signal, market-feed, audio, SEO and responsive-header feature.


## v28.0.0

- Refined the header for compact mobile screens with visible live-feed status and touch-scrollable market/timeframe buttons.
- Removed the secondary entry, stop-loss and take-profit chart lines; retained shaded long/short risk/reward regions and their attached value labels.
- Fixed nullable provider typing within asynchronous market-history requests.
- Removed authored comments from project code, styles, tests and configuration files.
- Preserved persistent paper signals, 7-day momentum defaults, instrument selection, indicator gauge, backfill, alerts and SEO.

## v27.0.0

- Introduced retry toast and revised header.
- Retained historical data loading and persistent signal management.
