# v31 technical release notes — based on v30

## What changed

- `src/lib/v31/entry.ts` contains the self-contained 5m reversal detector, 60%-body check, previous confirmed swing search, third-candle opening price requirement and 2R calculation.
- `src/lib/v22/analysis.ts` now aligns 15m, 30m, 1H, 4H and 1D, using 3/5/7-day trend analysis for 1H/4H/D1; 5m voting is excluded. Signal status is WAIT until the new pattern and H1 ADX threshold complete. Historical replay also uses the actual next candle's open without consuming its future high, low or close during setup evaluation.
- `src/components/useSignalLedger.ts` keeps v30 ledger and news guard, skips old pending breakout entries and activates only the new signal's exact entry, swing stop and 2R target. Existing active positions reconcile before the news guard, and no new signal can activate inside a news blackout.
- `src/components/MarketDashboard.tsx` shows the 5m tile as **Entry only**, changes alignment to **n/5**, shows complete checklist details and requests browser notification permission when the user enables Alerts.
- `src/lib/v31/browser-alerts.ts` formats the exact four-decimal alert and deduplicates notified IDs across refreshes using `mbiotraders-browser-alerts-v31` in localStorage. This is separate from the existing v26 active signal ledger.
- `src/components/browserNotifications.ts` uses the Service Worker Notifications API (`showNotification`) where available, falling back to the standard Notification API. `public/notification-sw.js` focuses or reopens the dashboard when the user clicks a notification.
- `src/app/globals.css` removes setup-card fixed heights and truncation, expands text naturally, and keeps pagination styles and bottom margin from v30.
- The original v30 `package-lock.json` is retained with the root project version/name changed to `mbiotraders-v31@31.0.0`. Dependencies and pinned versions are unchanged; `npm ci` now has its required lockfile. The doctor command errors if the lockfile is missing.

## Guard order

1. Reconcile an already active signal from verified completed 5m candles; keep it if history is missing or the feed provider changes.
2. Check economic news: relevant high-impact releases block new entries from T−3h to T+2h inclusive; unavailable/uncertain data also blocks.
3. Check a live market feed, completed 5m candle freshness/continuity and complete multi-day momentum.
4. Require all five trend charts to agree, with H1 ADX at least 16.
5. Require the countertrend 5m pullback, two consecutive trend-direction candles with at least 60% body, and an actual third candle opening within the 90-second signal acceptance window.
6. Require an older confirmed 5m pivot strictly on the correct side of entry, calculate SL from that pivot's wick and TP at 2R.
7. Activate only if no currently active signal or previously seen signal ID exists for the same pair.

## Browser notification behavior

On **Alerts On**, request permission directly from a real click; never auto-prompt at page load. The request must run on a secure origin (HTTPS or localhost). When a new active signal is identified, format and deliver a system browser notification with its direction, pair, entry, SL, TP and risk/reward. Deduplicate by pair and signal ID. The page displays status for unsupported or denied permissions and does not silently claim browser notifications were delivered. Permission cannot be overridden by code.

No server-side Push API subscription, backend scheduler or permanently running data watcher is included, so background delivery after closing all tabs is **not supported**. The Service Worker supports showing notifications initiated by the running dashboard but does not independently analyze markets or receive remote pushes.

## Testing

- 86 passing automated regression tests, including old v30 economic-calendar and history tests plus new v31 positive BUY/SELL patterns, third-candle timing, 60% cutoff, previous confirmed structure stops, 2R target, 5m vote exclusion, 30m mismatch, stale/missing data, duplicate alerts and notification wiring.
- Node 22.16+ is required; project doctor verifies source files and matching package-lock.
- Automated tests can run with Node alone. npm dependency installation and Next.js production compilation could not be verified in the release environment due blocked external npm registry. Execute `npm ci`, `npm run check` and `npm run build` in a network-enabled environment before deployment.
