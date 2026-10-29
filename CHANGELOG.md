# Change log

## v26

- Persistent per-pair active signal until 5-minute OHLC confirms TP/SL; no cancellation on indicator disagreement.
- Per-pair last 50 settled signals and statistics in localStorage.
- Wider ATR/swing based stop plan, conservative stop-first paper outcomes.
- Opposite S/R gate with two completed 5-minute breakout candles.
- 4-decimal price display and 7-trading-day momentum default.
- Three-calendar-month history backfill by selected provider, where available.
- Chart-attached green/red risk/target overlay that tracks chart scroll and zoom.
- Fixed signal reconciliation to reject a different provider after source changes.

# Changelog

## v25.0.0 — mbioTraders

- Rebuilt HTTP and public WebSocket connection recovery with indefinite capped retries, backoff, timeouts, and reconnect on network restoration.
- Retained last valid candles as cached visuals while outages show WAIT and suppress new signal alerts.
- Reduced header and instrument toolbar height, and adjusted text sizes slightly.
- Increased audible signal tone level with a limiter.
- Made the visible title link to https://mbiopeter.co.ke.
- Renamed all visual CSS class and animation prefixes to `mbiotraders-` instead of release-number prefixes.
- Preserved the edited v24 design, skeletons, technical indicators, multi-day momentum, SEO and gauge integration.


## v24.0.0 — mbioTraders

- Fixed `evaluateLiveFrame` missing runtime import.
- Replaced local SVG market-strength gauge with the third-party `react-gauge-component` library and a responsive wrapper.
- Renamed visible interface to **mbioTraders**, preserving previous saved preferences and market selections.
- Added complete SEO configuration, robots/sitemap and social metadata images.
- Added matching 9-card skeleton loaders and improved loading route.
- Preserved 3/5/7-day momentum and signal-only behavior from v23.1.
- New external dependency requires `npm install` to generate a fresh npm lockfile on the first installation.

## v23.1

- Screenshot-focused dashboard and 3/5/7 completed-session momentum.
