# v23.1 Momentum and Screenshot Design

## User interface geometry

The desktop reference has a 1536×1024 canvas. At that width, v23.1 sets 15px left/right padding and positions its major cards as follows (CSS pixels, measured with Chromium on a structural fixture):

| Component | x | y | Width | Height |
|---|---:|---:|---:|---:|
| Chart | 15 | 155 | 786 | 476 |
| Strength gauge | 811 | 155 | 392 | 380 |
| Current signal | 1213 | 155 | 308 | 380 |
| Timeframe alignment | 15 | 641 | 786 | 166 |
| Setup details | 811 | 545 | 427 | 262 |
| Key levels | 1248 | 545 | 273 | 262 |
| Technical indicators | 15 | 817 | 761 | 190 |
| Recent signals | 786 | 817 | 417 | 190 |
| Market statistics | 1213 | 817 | 308 | 190 |

The reference image's card arrangement is deliberately staggered. The real candlesticks, quote values, signals and statistics will naturally differ from the *illustrative* image. The dashboard never uses the screenshot itself as an input or reuses its fabricated signal examples.

The chart is interactive and is drawn with `lightweight-charts` 5.x. Both EMA values and zones use the current provider OHLC history. When a Deriv public tick stream is available, the forming chart bar and gauge follow fresh quotes; confirmed signals use only closed candles.

## Last three to seven completed trading days

Pick a lookback in the compact alignment selector: **3D**, **5D** (default), or **7D**.

1. Find the most recent `N` **fully closed D1 bars** from the currently selected market-data provider. Each represents a completed market session. No incomplete current D1 bar is counted.
2. For each of H1, H4 and D1, read only actual completed bars whose timestamps fall inside those exact daily sessions. Weekends between observed sessions remain gaps; no new candles are synthesized.
3. Require each selected session to have at least **16 genuine H1 bars**, **4 genuine H4 bars**, and **1 genuine D1 bar** (coverage guard). If the source cannot provide these, higher-timeframe momentum is NEUTRAL.
4. For each timeframe, compute the cumulative price difference between the first observed opening price and last observed closing price. A change must exceed **0.28× the average observed D1 high–low range** to count as a directional move. Independently fit a least-squares line to observed closing prices; its slope must have the same sign as the cumulative move.
5. The H1, H4 and D1 readings must all be BUY or all SELL to establish a higher-timeframe bias. Otherwise the result is NEUTRAL and new signals stay WAIT.
6. The 5m, 15m and 30m completed-bar indicator votes must also align before an entry plan is displayed; a recent 5m pullback and reversal close are required.

The window describes **trading sessions**, not 72/120/168 uninterrupted wall-clock hours. On markets with closed weekends, using the last N completed sessions avoids weekend-gap distortions. This does not establish predictive efficacy or a profitable trading edge.

The momentum function is pure, tested, and located at `src/lib/v231/momentum.ts`.

## Moving gauge vs. confirmed signals

The moving gauge is a strength *visualization*, not a win-rate prediction. On a fresh Deriv tick, the app calculates a provisional indicator vote using the observed developing bar. It then applies a bounded continuous adjustment of at most 12 score points from the live quote's deviation versus the latest completed close scaled by the observed recent bar range. CSS animates the needle toward the new reading. Without a streaming quote, the gauge updates from refreshed completed candles.

**An unfinished candle is never used to confirm BUY/SELL.** `inspectConfluence` uses only completed bars. Audio is unlocked by the user and plays only after a new signal ID appears on a later update; a signal already present on initial load does not cause a historical replay chime.

## Trading data and statistics

All prices come from the current provider. Support/resistance is based on the recent 36/72 received OHLC bars. Stats use **up to 50 resolved paper replay signals** in the available history; no fake results are rendered when none qualify. A 0-trade result shows a dash rather than an invented 0% historic win rate. The paper replay excludes spread, liquidity constraints and broker fees and should not be interpreted as verified live profitability.

## Data quality and hosting

Historical snapshots may be delayed/rate-limited by provider plan. The unauthenticated public Deriv streaming path is attempted only when its own valid candles are the active provider. Never mix providers within one set of indicators. Never replay saved illustrative candles as a live stream. No database, broker API key, order placement or execution worker is part of v23.1.
