# v30 — Two-row signal history and economic-calendar protection

## Recent Signals

Recent Signals shows exactly two completed outcomes per page, with extra space below the navigation controls. The four columns remain Time, Direction, Pair and Result. Export CSV still exports all 100 most recent completed records, not just the visible page. This is browser-local state: another browser/device needs its own stored ledger.

## High-impact news feed

The Next.js API route `/api/news-calendar` obtains high-impact events for US, Eurozone, Germany, UK, Japan, Canada and Australia from [Finance Calendar](https://www.financecalendar.com/api/forex-calendar/). The provider publishes event titles, countries, high-impact classifications and UTC release timestamps. A public API key is not required, and a visible provider attribution link is part of the UI.

For XAUUSD, US events are relevant. EURUSD checks US, Eurozone and Germany. GBPUSD checks US and UK. USDJPY checks US and Japan. AUDUSD checks US and Australia. USDCAD checks US and Canada.

For each event with an exact reported time T:

- No new signal is allowed from **T − 3 hours** through **T + 2 hours** (including the endpoints).
- When multiple relevant events overlap, signals remain paused until every active restricted interval has ended.
- If the event has only a date or wider window and no confirmed hour, the affected day/window is blocked conservatively, including a three-hour leading buffer and two-hour trailing buffer.
- Cancelled events and events not classified as high impact do not block signals.

The server queries yesterday through the next two weeks. Its response is checked every 90 seconds while the tab is running. A client snapshot becomes too old after four minutes. Calendar request failures trigger automatic retries with exponential backoff. An unavailable or stale calendar blocks new signals rather than assuming there is no news.

## Active and pending signals

Existing active signals are handled before the news guard: they continue to be tracked and reconciled against genuine 5-minute OHLC candles until TP or SL is confirmed. News does not cancel their recorded entry, stop or target. A pending support/resistance breakout is discarded during a blackout or when the calendar cannot be verified. A new fully confirmed entry must form after restrictions clear.

The news filter blocks **new tracked signals** only. The technical gauge and individual indicator votes remain visible as market analysis, even during a blocked period. A blackout is shown in the Current Signal card and the Signal Setup Details checklist.

## Data limitations

No economic calendar covers every unplanned geopolitical or monetary event. Provider impact ratings and schedules can be revised; entry blocking relies on the information currently published. Date-only events are deliberately handled conservatively. This feature is a risk-control filter and does not guarantee profitable results.

Historical paper outcomes that were stored in older versions are retained unchanged; v30 does not invent a historical economic-calendar backtest or relabel older signals.

## Verification

Run `npm ci`, `npm test`, `npm run doctor`, `npm run check`, then `npm run build` before deploying. Tests cover boundary times, instrument currency mappings, unknown event times, failed calendars, previous active-signal tracking, pending-breakout gating, pagination and CSV preservation. Live provider access and a full Next.js production build must still be verified on a networked machine.
