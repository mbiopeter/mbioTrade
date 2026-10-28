# MbioTrade v14 Strategy Guide

The six v14 configured strategies, exact entry rules, research sources and testing
boundaries are documented in [V14-STRATEGY-GUIDE.md](V14-STRATEGY-GUIDE.md).

Every generated signal must agree with the confirmed EMA50/EMA200 trend. A raw legacy
indicator vote is insufficient: the universal trend gate can reject it. The original
methods remain editable and saved combinations are retained. Range/reversal methods may
produce fewer entries because countertrend votes cannot authorize a trade.

## Current configured defaults

| Market | Setup | Chart | ATR stop | Target |
| --- | --- | --- | --- | --- |
| EURUSD | EMA20 pullback and first resumption | H1 | 1.5 | 2R |
| GBPUSD | 20-bar breakout and first retest | H1 | 1.8 | 2R |
| USDJPY | Price pullback and MACD restart | H1 | 1.5 | 2R |
| AUDUSD | 20-bar channel continuation | H4 | 2 | 2.5R |
| XAUUSD | EMA-area pullback and rejection wick | H1 | 2 | 2R |
| General | Trend, EMA-area pullback, resumption | H1 | 1.5 | 2R |

Each default has one complete configured entry method plus News Guard, with minimum
agreement 1. The five named market methods enforce their symbol. General keeps the selected
market. Chart periods and risk settings are explicit starting defaults, not optimized
performance claims. The actual chart stop distance also includes the existing minimum
price-distance floor described in the detailed guide.

## Legacy method catalogue

These descriptions explain indicator intentions; they are not verified claims that a
method is profitable on a particular market. Existing custom combinations still use
weighted directional voting after the universal trend gate.

## Smart Trend

Aligns EMA9, EMA20 and EMA50, checks slope and confirms momentum with RSI. It is
designed for established Forex, Gold and Crypto trends. It can enter late after an
extended move and can whipsaw in flat markets.

## Liquidity Sweep

Looks for a wick through a recent high/low followed by a close back inside the range. It
is useful around session opens and obvious swing levels. A sweep can become a genuine
breakout, so it should not be used alone.

## EMA Confluence

Requires EMA9/20/50 ordering, fast-average movement and price confirmation relative to
EMA20. It performs best in orderly continuation moves and poorly when the averages are
compressed.

## EMA Trend

Uses EMA20/50 relationship and EMA20 slope. It is a simpler trend filter for
pullback/continuation systems and is vulnerable to sideways-market flips.

## RSI Momentum

Uses RSI as directional momentum confirmation while avoiding the most stretched
readings. RSI can remain overbought or oversold for long periods in strong trends.

## MACD Flow

Combines MACD line/signal alignment, histogram follow-through and EMA20 price context.
It is useful for momentum confirmation but remains a lagging indicator.

## Volatility Breakout

Requires a close beyond the previous 20-bar Donchian range and meaningful range
expansion. It suits GBPUSD, XAUUSD and Crypto volatility expansions; false breakouts
remain a major risk.

## Structure Shift

Looks for a strong-body close through a recent swing boundary. It helps confirm
reversals and consolidation breaks, but a single close can fail without follow-through.

## Support / Resistance

Detects rejection wicks and closes away from recent range boundaries. Levels are treated
as areas rather than exact prices; strong trends can break them cleanly.

## Trend Pullback

Confirms an EMA trend, then waits for a retracement near EMA20 and a close back in the
trend direction. It is best in orderly markets and should be avoided when the EMA
structure is flat.

## Bollinger Reversion

Combines a close outside the Bollinger Band with RSI exhaustion. It targets range
reversion and can repeatedly fight a strong trend if regime filtering is ignored.

## Adaptive Regime

Measures EMA separation in ATR units and normalized volatility. It changes behavior
among trend, range and elevated-volatility conditions. Regime detection is
backward-looking and can change quickly.

## Stochastic Reversal

Looks for a stochastic extreme plus a reversal candle. It is intended for short-term
range exhaustion; extreme readings can persist during trends.

## ATR Supertrend

Uses ATR-derived dynamic trend support/resistance together with EMA structure. It suits
Gold and Crypto trends, but ATR expansion after shocks can delay entries and widen risk.

## Price Action

Looks for bullish/bearish engulfing structure near recent highs/lows. Candle patterns
have limited value without broader market context.

## High-impact News Guard

Matches high-impact calendar events to currencies related to the selected market and
blocks new signals near the event. XAU/Gold is treated as USD-sensitive. News Guard is a
risk veto, not a directional news predictor.

## Auto recommend

Auto recommend selects the matching saved v14 market preset or General Trend Pullback.
It does not optimize performance and does not alter the chart, spending or risk settings.
Use Apply preset to load the documented chart and ATR/reward configuration; Apply pauses
browser entries for review. If the matching preset is missing, selection falls back to
General or the first saved combination.
