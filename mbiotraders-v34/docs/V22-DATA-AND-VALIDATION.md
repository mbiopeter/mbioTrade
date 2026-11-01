# V22 — Data, rules and validation

## Screens

One dark green / navy professional dashboard. Market and timeframe selectors are inside the page, not a navigation bar. Main chart with EMA20/EMA50, semicircular strength gauge, current BUY/SELL/WAIT signal, 6-frame alignment panel, compact technical indicator vote grid, entry checklist, and recent historical paper outcomes. The visual gauge is an original implementation informed by the referenced Trader's Union/TradingView *style*, not copied source code, proprietary ratings or live TradingView analysis.

## External sources

1. Twelve Data, documented [time series](https://twelvedata.com/docs), optional environment key; plan restrictions and price delays can apply. Data requested separately for all six frames from the same provider. Never expose the key to the browser.
2. Deriv's official [unauthenticated public WebSocket market data](https://developers.deriv.com/docs/data/ticks-history/), used only when the preferred source is not configured or fails. No authenticated account, buy or sell.
3. TradingView [widget documentation](https://www.tradingview.com/widget-docs/getting-started/) explains that chart libraries require independent data. TradingView is **not** treated as a candle-data API and isn't scraped.

Source details and freshness status are visible. Provider OHLC rows must be timestamp-aligned, ordered, unique, positive and internally valid. No synthetic, resampled, extended or filled candles are inserted. The chart may show one **provisional observed live-tick** bar while the analytical engine uses completed native OHLC only.

## Ratings

Seven moving-average votes: price versus EMA9, EMA21, EMA50, EMA100, EMA200; EMA9 versus EMA21; EMA21 versus EMA50. Nine oscillator/momentum votes: RSI14, MACD, ADX/+DI/-DI, CCI20, Williams %R14, Stochastic RSI14, Awesome Oscillator5/34, Bull/Bear Power13, price momentum10. Each is +1/0/-1. A strength of +100 represents unanimous Buy votes; -100 unanimous Sell; near zero Neutral. **These scores are not forecasts or calibrated trade success rates.**

## Signal and alarm criteria

H1, H4 and daily direction first; then 5m/15m/30m must match, H1 ADX >=16, recent 5m retracement and last completed 5m reversal candle, 75/100 rule-confluence score, contiguous recent 5m data and freshness. Only then show a plan. Browser audio is enabled manually and sounds on a **new** confirmed and current setup, never on stale/historical data or a routine refresh.

## Replay

Historical outcome rows use next-bar open entry, 2R target, conservative stop priority, no overlap until the next candidate, and a 24-bar maximum hold. Paths containing missing time steps or an unsettled end are omitted. The output does **not** include execution costs, market impact or an independent historical profitability evaluation. No actual trading orders are sent.

## Validation in this environment

- Automated tests check symbol allowlisting, raw bar parsing, timestamp rejection, completed-bar only analysis, technical consensus, higher-frame disagreement, stale data, no invented replay, deterministic results, bullish and bearish confirmed setups, and one public WebSocket serving all six frame requests.
- Static source checks run on all `.ts` and `.tsx` files. CSS syntax checked separately.
- **Not executed here:** `npm ci`, `npm run build`, full browser integration, or remote live WebSocket/HTTP checks, due to unavailable registry/network access. Re-run after installation before deploying to production.

## Real-time caveats

True tick streaming is active only if the unauthenticated Deriv quote socket is connected and recent. Twelve Data snapshots are refreshed but may not be realtime on the free plan. When data gaps/staleness occur the app shows WAIT and disables alerts. Neither the system nor the data providers guarantee a profitable signal.
