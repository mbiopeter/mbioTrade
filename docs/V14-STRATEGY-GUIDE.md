# MbioTrade v14: configured trend strategies

Release: 28 October 2026. This guide describes the implemented rules, their starting
settings, how to activate them, and what has and has not been validated.

## 1. What the six presets provide

| Preset | Market | Default chart | ATR stop factor | Target | Minimum score |
| --- | --- | --- | --- | --- | --- |
| EURUSD · EMA Pullback | EUR/USD | H1 | 1.5 | 2R | 78 |
| GBPUSD · Breakout Retest | GBP/USD | H1 | 1.8 | 2R | 80 |
| USDJPY · Momentum Restart | USD/JPY | H1 | 1.5 | 2R | 78 |
| AUDUSD · Channel Continuation | AUD/USD | H4 | 2 | 2.5R | 78 |
| XAUUSD · Pullback Rejection | Gold / USD | H1 | 2 | 2R | 80 |
| General · Trend Pullback | Current supported market | H1 | 1.5 | 2R | 76 |

The five named presets are scoped to their market. Gold is a metal quoted in USD.
These are five selected markets, not a claim that they are the five largest currency
pairs by turnover. Availability on the connected Deriv Options account is determined
by the broker. A public chart alone does not establish contract availability.

Each factory combination contains one complete entry method plus High-impact News
Guard. Minimum agreement is one because that method already combines trend, setup and
confirmation requirements. H1/H4 are editable starting defaults; the engine does not
hard-lock a preset to its suggested timeframe. Its symbol restriction remains active.

## 2. Research and profitability

Trend following has substantial published research. AQR's *A Century of Evidence on
Trend-Following Investing* studies historical time-series momentum across diversified
markets. CME's educational material describes retracement and continuation patterns.
These sources support the strategy families and concepts used here.

**The exact v14 pair rules and parameters have not been verified profitable on Deriv.**
No historical market backtest or live trading experiment was performed for this release.
The default periods, tolerances and targets are explicit engineering choices. They were
not optimized against a performance dataset, and no win rate, expected return or
professional endorsement is claimed. Deterministic tests verify code behavior rather
than investment results. Research on diversified, often slower strategies does not
establish the returns of an individual H1/H4 multiplier strategy after costs.

Primary sources, consulted 28 October 2026:

- [AQR: A Century of Evidence on Trend-Following Investing](https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing)
- [AQR: Which Trend Is Your Friend?](https://www.aqr.com/Insights/Research/Journal-Article/Which-Trend-Is-Your-Friend)
- [CME Group: Trend and Continuation Patterns](https://www.cmegroup.com/education/courses/technical-analysis/trend-and-continuation-patterns)

## 3. The shared trend requirement

Every generated entry, including a saved legacy/custom combination, must pass the
following gate on the selected chart timeframe. Manual fallback entries use the same
direction gate, although the user may enter without a completed strategy pattern.

At least **205 completed candles** are required. Candle data must be finite, positive,
valid OHLC data and in increasing timestamp order. The current unfinished candle is
excluded from analysis. Browser, scanner and worker use up to the last **600 completed
candles**; the worker retains an extra forming bar so it does not lose a history bar.

For a long entry:

1. The confirmed close is above EMA50, and EMA50 is above EMA200.
2. EMA50 minus EMA200 is at least 0.25 times current ATR14.
3. EMA50 is above its value three candles earlier.
4. EMA200 has risen by at least 0.02 times current ATR14 over five candles.

Short entries require the exact inverse relationships. If the averages are flat,
compressed, disagree with price, or lack enough history, the result is WAIT. Each new
configured pattern also requires EMA20 above EMA50 for longs, or below for shorts.
This is a trend measured on the selected timeframe; no additional higher-timeframe
confirmation is implied.

A fresh tick cannot revive a pattern from a market/history gap. For a live entry, the
latest confirmed candle must have ended no more than one timeframe ago. After an extended
gap the application waits for a recent completed candle. Historical replay evaluates each
completed historical window using its own position in the sequence.

Entries can wait for many bars. Waiting is expected when the setup is absent. An
uptrend alone does not satisfy a pullback strategy. An old range/reversal combination
can still produce raw votes, but it cannot authorize a countertrend order.

## 4. EURUSD: EMA pullback

Use the confirmed trend above. Within the previous five candles, price must have made
an adverse close: lower than the preceding close in an uptrend, or higher in a downtrend.
That candle's range must touch EMA20 with a tolerance of 0.20 preceding ATR14. Its close
must hold the EMA50 area, allowing up to 0.30 preceding ATR through EMA50.

For a long, the confirmation candle must have a bullish body and close above EMA20
and the previous candle's high. For a short it must have a bearish body and close below
EMA20 and the previous candle's low. Only the first such resumption after the detected
pullback qualifies; subsequent candles do not reuse an already resumed pullback.

The close must remain within 1.5 preceding ATR of EMA20 in the trade direction. The
confirmation candle's full high-low range must be no more than 2.5 preceding ATR.
The starting chart is H1, with a 1.5 ATR stop and 2R target, subject to the price-distance
floor described below. A success vote scores 82 before combination scoring.

## 5. GBPUSD: breakout followed by a retest

Within the previous five completed candles, locate a close beyond the preceding
20-bar Donchian boundary in the confirmed trend direction. The boundary is the highest
high for a long or lowest low for a short, calculated strictly before the breakout bar.
The breakout close must clear it by more than 0.05 preceding ATR14.

The latest candle must then produce the first valid retest. For a long, its low comes
within 0.25 ATR above the former resistance and may pierce at most 0.75 ATR below it.
Its close must be above the boundary, no more than 1.5 ATR beyond it, with a bullish body.
Shorts mirror these conditions around the former support. A previous qualifying retest
cannot be reused. An intervening close more than 0.5 ATR against the breakout invalidates
that candidate, using each intervening candle’s own preceding ATR. The final confirming candle must remain within the shared 2.5 preceding
ATR range limit.

A breakout candle alone is insufficient. The starting chart is H1, with a 1.8 ATR stop
and 2R target. A success vote scores 83 before combination scoring.

## 6. USDJPY: momentum restart after a pullback

Use MACD(12,26,9) together with the confirmed trend. Within the previous eight candles
there must be an adverse price close and a MACD histogram value against the trend.
For a long, the histogram must cross from nonpositive to positive on the latest completed
candle; the MACD line itself must remain positive. For a short, the histogram crosses
from nonnegative to negative and the MACD line remains negative.

The confirming close must be on the trend side of EMA20, advance beyond the previous
close in the trend direction, and have a directional candle body. The shared 2.5 preceding
ATR range limit applies. A histogram that has already been positive for several bars does
not create a new long restart. The starting chart is H1, with a 1.5 ATR stop and 2R target.
A success vote scores 82 before combination scoring.

## 7. AUDUSD: channel continuation

The latest completed candle must close beyond the preceding 20-bar Donchian high for
a long or low for a short. Its body must agree with the trend and its close must be on
the trend side of EMA20. A wick crossing the channel without a close beyond it does
not qualify.

The breakout candle's full range must be between 0.8 and 2.5 times preceding ATR14.
Its close must be no more than one preceding ATR beyond the broken boundary. This
preset is a trend continuation breakout; the separate General setup implements the
explicit wait-for-pullback sequence. The starting chart is H4, with a 2 ATR stop and
2.5R target. A success vote scores 82 before combination scoring.

## 8. XAUUSD: pullback and rejection wick

Within the previous six candles, require an adverse close whose range enters the
EMA20/EMA50 zone, allowing 0.25 preceding ATR around the zone. Its close must hold the
EMA50 area within 0.30 preceding ATR. Then wait for the first directional resumption
close beyond EMA20 and the previous candle's trend-side extreme.

The confirmation must also show a rejection wick at least 0.6 times its body: a lower
wick for longs or upper wick for shorts. Its range must touch the EMA20/50 area with
0.25 preceding ATR tolerance. Reject a close more than 1.5 ATR from EMA20 and a candle
larger than 2.5 preceding ATR. This supplies a concrete rejection rule rather than
entering merely because Gold is moving rapidly.

The starting chart is H1, with a 2 ATR stop and 2R target. High-impact USD events apply
to Gold's News Guard. A success vote scores 84 before combination scoring. These wider
starting distances can still be incompatible with a broker's stake/multiplier rules;
the existing funding/protection validator will explain the rejection.

## 9. General: trend → pullback → resumption

Apply this preset on the currently selected supported market. It keeps the market and
loads H1, a 1.5 ATR stop and 2R target. After establishing the confirmed trend, require
an adverse close into the EMA20/50 area within the previous six candles, with 0.25 ATR
zone tolerance and a close holding EMA50 within 0.30 ATR.

Then wait for the first completed directional candle closing beyond EMA20 and the
previous candle's high for a long or low for a short. Reject a confirmation farther
than 1.5 preceding ATR from EMA20, or larger than 2.5 preceding ATR in range. The Gold
rejection-wick condition is not imposed on General. A success vote scores 80 before
combination scoring.

## 10. ATR, chart levels, scores and News Guard

Pattern tolerances use the **preceding** ATR14 so the entry candle cannot inflate its
own allowed range. Automatic chart geometry uses the current completed ATR14:

`distance = max(ATR14 × ATR stop factor, abs(entry) × 0.0005)`

The plan's entry is the confirmation close. Long SL is entry minus distance and TP is
entry plus distance times reward/risk; short geometry is mirrored. Therefore a 2R target
is twice the planned price distance to the stop. Actual multiplier payouts, fees and
broker stops can differ from that chart relationship. Manual fallback uses the current
live price, confirmed ATR and its retained 0.0002 minimum price-distance ratio.

The existing order adapter translates plan distances into **cash** SL/TP for Deriv's
multiplier proposal. Cash limits are account-currency P/L amounts, not exact spot barriers
or CFD lot sizes. The broker must accept the settings. The application checks quote cost,
selected amount and fresh balance, and rejects incompatible protection without silently
increasing stake or shrinking a stop. If the proposal supplies a spot price already at or
beyond the planned SL/TP, purchase is rejected so an expired setup is not bought. This
check does not guarantee a particular fill price. Existing broker protection can still
be edited.

Rule scores are not probabilities. Combination confidence uses weighted directional
strength, a conflict deduction and three points per agreeing method, capped 99. A single
successful score 82 setup normally yields 85 before the minimum threshold check. Every
enabled configured method is a prerequisite: if it says WAIT, adding other bullish or
bearish votes cannot bypass its missing pattern. News Guard is a veto and does not count
toward directional agreement.

Factory presets block matching high-impact events within 30 minutes of the signal
decision time. Automatic browser and worker execution also check the current clock
immediately before purchase. If enabled calendar data is unavailable, automatic entries
wait. Manual entry remains user-directed and does not require calendar qualification.
The scanner uses an empty event list and is an informational technical scan; its displayed
signal is not confirmation that the live News Guard permits an automatic order.

## 11. Applying, editing and upgrading

Open Strategies, inspect a card's entry rules and click Apply. The action restores the
documented factory method and thresholds, selects its market/timeframe, and applies its
ATR and reward/risk settings. It stores Signals mode before publishing the changed
combination. An edited factory combination is preserved as a custom saved copy first.
Stake, multiplier, account limits, credentials, Google settings and executor selection
are preserved. Review the result, then choose Manual or Automatic in Settings.

General keeps the current symbol and market class. New combination starts with General's
complete pattern; Duplicate preserves the existing methods and pair scope. Both pause
browser execution while being edited. Auto recommend selects a matching saved profile
without applying its timeframe or risk defaults. Existing custom/legacy combinations
remain available, but the universal trend gate still governs their entries.

New-order multiplier choices are 100×, 200×, 300×, 500× and 800×. The new-workspace default is
100×. Removed saved 5×/10×/20×/30×/50× values become 100× with Signals mode and a notice.
Review the new sensitivity before enabling entry. Existing valid 100+ settings retain
their mode, and all existing positions retain their actual size. Automatic worker
startup rejects a removed raw configuration and requires a reviewed export. The existing
v10 storage keys/schema remain to preserve credentials and workspace data on the same
origin. A new device still connects to the same account to recover broker positions.

Applying a preset does not change an already running server worker. Export the reviewed
workspace, stop the previous worker and restart with that file. Factory presets enable
News Guard, so an automatic worker also needs its calendar URL. See
[BACKGROUND-WORKER.md](BACKGROUND-WORKER.md) for setup and [SETUP.md](SETUP.md) for Vercel.
Only one automatic owner should run per account; other devices can monitor and close.

## 12. Replay and validation

Replay uses the same trend and entry evaluator and up to 600 historical completed bars
per decision. It begins after 205 bars of warmup. Entry is timestamped at the signal
candle's close; future OHLC bars resolve the simulated exit. If both stop and target
occur in one bar, stop is assumed first. Exit settlement is conservatively timestamped
at that bar's close. Another simulated position can begin only once the preceding
position has settled, so future profits cannot finance an earlier overlapping entry.

Replay is a sequential model with an approximate multiplier P/L formula and configurable
commission. It does not reproduce actual Deriv proposals, fills, slippage, intrabar order
sequencing, historical News Guard data, every live risk limit, or a real concurrent
portfolio. Execution at an already observed close is an approximation. A three-month
sample can be too small to assess robustness; the D1 history window may not contain
enough candles for the 205-bar warmup. An empty result is possible and is not an error.

For practical evaluation, record the version, market, timeframe, exact rules, amount,
multiplier and costs; inspect multiple market regimes; reserve unseen data; then run
demo forward testing with the intended automatic execution owner. Track net P/L after
costs, drawdown, trade count and rejected/late orders, rather than relying only on win
rate. Demo/real share the application logic, while actual availability and execution
remain broker/account dependent.

The release's automated coverage includes mirrored long/short cases for all six setups,
missing-pattern rejection, countertrend rejection, flat/short/invalid history, pair scope,
bar-close news timing, preference migration, preset application, replay settlement order
and worker boundary deduplication. Existing mocked integration tests cover cross-device
charts, protection editing, funding failures and demo/real automatic parity. See
[VALIDATION.md](VALIDATION.md) for the completed release checks.

Implementation references: `strategy-engine/profiles.ts`, `trend.ts`, `configured.ts`,
`signal.ts`, `candles.ts`, `strategy-presets.ts`, `manual-trade.ts`, `backtest.ts` and
`worker/engine.ts`.
