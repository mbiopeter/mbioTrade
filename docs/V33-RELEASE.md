# mbioTraders v33 — Release notes

## Source and compatibility

Built on the uploaded `mbiotraders-v32(1).zip`, not on a recreated older release. All six earlier instruments, five-aligned-timeframe/5m-entry strategy, settings, persistence, economic calendar, charts, sound and desktop notifications, CSV export, 100-signal journal, two-result pagination, lightweight chart and PDF download remain available. Entry confirmation is two completed strong candles with a 60%-or-larger real body after an opposite-direction 5m pullback, signal on the actual third candle opening, a previously confirmed swing stop and exact 2:1 reward/risk.

## Improved readability

Larger section headings and values in the five requested dashboard areas: Multi-Timeframe Trend Alignment, Overall Market Strength, Signal Setup Details, Key Levels, Market Statistics. Desktop retains three columns when width >=1200px, tablet two columns from 761px to 1199px, and phone one column. A few compact-height-specific font and padding adjustments retain the previous desktop viewport-fit behavior; text is not hidden by internal scrollbars.

## BTCUSD market implementation

`BTCUSD` is available alongside Gold and the five forex instruments. The dashboard renders a Bitcoin symbol and maintains separate records per instrument. Kraken's public `/0/public/OHLC?pair=XBTUSD` endpoint supplies **all six timeframe histories** (5, 15, 30, 60, 240 and 1440-minute intervals), which are validated and never synthesized. WebSocket v2 `ticker` for `BTC/USD` supplies the most recent real spot price, with stream retry and freshness checks. API requests are serialized and spaced by 1.1 seconds to respect public throttling. Kraken returns at most 720 recent OHLC candles per timeframe, with the final candle still open. The entry engine requires completed candles for analysis and uses the actual third 5-minute candle's opening price. No backfilled history is claimed when the provider cannot supply it; the market pauses rather than inventing bars. Public feeds can have outages, delays and exchange-specific prices.

The existing server-side `TWELVE_DATA_API_KEY` can provide backup `BTC/USD` time-series snapshots when Kraken is down, but those snapshots are not treated as live ticks. BTCUSD uses the original USD high-impact news blackout of 3 hours before to 2 hours after verified events; missing news data blocks new signals conservatively. Signals are informational, with no broker orders.

## Deployment and verification

Use Node 24.x and run:

```
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

The ZIP contains a matching lockfile and `.nvmrc`. See the accompanying validation report for which checks were run in the packaging environment and which require local npm access. The version-free Signal Guide remains in `public/mbiotraders-signal-guide.pdf` and continues to be downloadable from the app.
