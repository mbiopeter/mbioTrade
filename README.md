# mbioTraders v37

This release adds step-by-step setup progress, continuously visible current confluence, smaller setup typography, and a light-mode signal guide. All trading rules and data providers are unchanged from the technical-only v36 release.

# mbioTraders — v37

An installable, research-only Gold, forex and Bitcoin signal dashboard using public market data. The current product uses technical signal conditions based on genuine prices, without requiring paid provider credentials.

## Markets and technical strategy

Supported instruments: XAUUSD, BTCUSD, EURUSD, GBPUSD, USDJPY, AUDUSD and USDCAD.

1. Require verified and fresh 5m, 15m, 30m, 1H, 4H and 1D candles from public market feeds.
2. Require all five higher timeframes (15m, 30m, 1H, 4H, 1D) to agree on direction. The 5m chart is only for timing the entry.
3. Wait for a countertrend 5m candle in the six candles before the confirmation sequence.
4. Require two consecutive completed directional 5m candles, each with body size at least 60% of its full range.
5. Enter using a real third 5m candle opening received within 90 seconds; never invent or approximate an entry price.
6. Place stop loss at an earlier confirmed 5m pivot and take profit at twice the distance from entry to stop (1:2 risk/reward).
7. Display the signal while the verified strategy setup is valid. Keep a signal active in the local ledger until real price candles confirm TP or SL.

This project does **not** place brokerage orders. Technical signals are research, not a prediction of profits. Market gaps, volatility, fees, spread and slippage can cause losses.

## Features preserved

- Compact three-column desktop dashboard, two-column tablet layout and single-column mobile layout
- Mobile action icons beside the mbioTraders title, including Install, Guide and Alerts
- Genuine market candles, chart overlays, technical indicators, market-strength gauge, key levels and market statistics
- Gold and five forex pairs through Deriv public feeds; BTCUSD through Kraken public feeds
- Automatic reconnection, paced requests, short verified response caching and closed-market historical data handling
- Up to 100 settled signal records, two-row pagination, CSV export and one active signal per pair
- Sound alerts and actual browser notifications when enabled and the application is open
- Installable PWA with an offline safety screen and installation button hidden in installed mode
- Google Analytics 4 events and privacy controls, SEO metadata, robots.txt, sitemap and an indexable method page
- Downloadable illustrated Signal Detection Guide with BUY and SELL examples

## Installation

Requires Node.js **24.x**. Extract the project ZIP so that `package.json` is at the project root, then run:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Open `http://localhost:3000`. For Vercel, deploy the root of the project, not a nested folder beneath an older release.

## Environment configuration

No provider secret is required for the public live feeds. Optional public settings:

```dotenv
NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_GA_TRACK_LOCAL=false
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
```

The optional GA4 ID is a public measurement tag, not an account credential. Do not commit private credentials or put secrets into `NEXT_PUBLIC_` variables.

## Troubleshooting

- `/api/market?symbol=XAUUSD` returns HTTP 200 when all six actual timeframes are present. HTTP 503 means required real price data is missing: wait and retry without inventing candles.
- `/api/market?symbol=BTCUSD` uses Kraken, which limits recent OHLC history. Missing frames still prevent a new signal.
- Internet access and a running app are required for live prices and browser notifications.
- Trading performance is never guaranteed. Market prices and execution conditions can move rapidly.

See `docs/V36-RELEASE.md` and `docs/V35-ANALYTICS-SEO-SETUP.md` for further configuration guidance.
