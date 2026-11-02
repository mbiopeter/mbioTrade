# mbioTraders v37

## Design and signal status

The Signal Setup Details checklist uses lighter, smaller labels and status tags. The square-edged information banner displays only the first unmet technical prerequisite, advancing through the checklist as the qualifications become true. When all conditions qualify, it shows BUY or SELL setup qualified; active entries show BUY or SELL active. No strategy predicates were modified.

The Current Signal panel always shows the latest technical confluence percentage from the current validated setup. For an existing active signal, the confidence percentage captured at activation is displayed separately and is not misrepresented as the current confluence.

The technical indicator heading and nine individual tiles use the U-with-underline icon.

## PDF guide

`public/mbiotraders-signal-guide.pdf` is a light-mode guide with illustrative BUY/SELL candlestick charts and the actual technical qualification rules. It has no version number.

## Preserved functionality

No changes were made to market feed, timeframe vote, entry calculation, signal ledger, notifications, PWA registration, GA4 reporting, or SEO routes. Signals are research tools, not trade executions.

## Validation

Run `npm ci`, `npm run doctor`, `npm test`, `npm run check`, `npm run build`. Node.js 24.x is configured in `package.json`.
