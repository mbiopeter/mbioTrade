# mbioTraders v32

A compact, responsive Gold and forex signal dashboard. **This v32 release is built directly on the rebuilt v31 codebase** (itself based on the uploaded v30 archive). It retains the market feeds, economic-calendar filter, six instruments, live chart, technical gauge, retry logic, five-timeframe signal strategy, persistent signals, 100-result history, CSV export, two-result pagination, alerts and SEO.

**What's new:** The dashboard uses a compact three-column layout on standard desktop screens (1200px and wider, with a viewport at least 700px high), a two-column layout on tablets (761–1199px), and a single column on phones. All nine dashboard sections remain present. The header now includes a **Signal Guide** PDF download, without a version number anywhere in the guide, and the notification success message no longer occupies header space.

## Install and run

Use **Node.js 22.16.0 or newer**. This ZIP **includes `package-lock.json`**; do not delete it before running the following commands:

```bash
cd mbiotraders-v32
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Open `http://localhost:3000`. The project includes a valid, synchronized `package-lock.json` so **`npm ci` is supported**. If you rename the extracted project directory, adjust the `cd` command accordingly.

The **Signal Guide** link next to Alerts downloads `/mbiotraders-signal-guide.pdf`; the PDF is already bundled under `public/`, so it also works on Vercel with no extra server route.

## Signal strategy (unchanged from v31)

The required trend-alignment charts are **15m, 30m, 1H, 4H and 1D**. All five must agree on BUY or SELL. The 5m chart is used only for timing and does not count against trend alignment. The existing multi-day momentum setting defaults to **7 trading days**; 3D and 5D remain available.

After higher-timeframe alignment, the 5m chart must show a countertrend candle within the lead-up to the entry (bearish pullback for BUY; bullish pullback for SELL). This must be followed by **two consecutive completed 5m candles in the trend direction**, each with `abs(close - open) / (high - low) >= 0.60`. The tool only signals at the **actual opening price of the third 5m candle**, when that candle is present in the provider feed and the first 90 seconds of its opening interval have not expired. It never invents a third-candle open from an earlier close.

The stop uses a **previous, confirmed 5m swing low (BUY) or swing high (SELL)**, not the latest wick or an ATR-based substitute. The swing is confirmed by at least two earlier and two later closed 5m candles and must occur before both confirmation candles. An invalid or missing swing blocks entry. TP is **exactly 2 times the entry-to-stop risk** in the direction of the trade. Signal values are displayed with four decimal places.

Previously activated signals remain stored across refreshes in the existing `mbiotraders-signals-v26` localStorage key. A signal cannot be cancelled by a later indicator flip: verified closed 5m candles are used to resolve TP or SL; if both levels are touched in the same candle, SL is applied conservatively. Legacy pending breakout entries from v30 are cleared rather than generating entries under the old strategy.

## Real browser notifications

1. Open the dashboard on `http://localhost:3000` or a secure **HTTPS** deployment.
2. Click **Alerts Off** so it becomes **Alerts On**. When your browser asks, select **Allow notifications**. The button also turns on sound alerts where the browser allows audio playback.
3. When a **new active signal** is detected for the selected pair with an up-to-date live feed, the page plays the alert sound and asks the operating system/browser to display a **real BUY or SELL notification**. The notification shows the pair, exact entry, SL, TP and 1:2 ratio.
4. Alerts are recorded so refreshing or switching between tabs doesn't resend the same signal. If notification permission is blocked, you can find an explanatory status in the Alerts button tooltip or change permission in browser site settings; no full-width success message is displayed in the header.

Browser notifications rely on the user's permission and a secure origin. They **work while the page is running**, including when its tab is not focused (subject to browser background throttling). **They are not remote push notifications**: closing the dashboard/browser stops live analysis and notifications. Browser-closed delivery would require a separate server-side monitoring and push-subscription system, which this release does not claim to provide. Some operating systems, browsers and mobile platforms also require additional notification settings.

## Signal Setup Details

The checklist now shows all seven strategy checks and the news-calendar status with the full explanatory text and the full conclusion. It uses content-driven height, text wrapping and **no internal scrollbar or ellipsis truncation**. On normal desktops, the cards are compacted to fit a single screen. Very short desktop viewports may still scroll rather than cut off explanatory text; tablets and phones scroll normally.

## News filter (preserved from v30)

A server-side route at `/api/news-calendar` uses the Finance Calendar feed to pause **new signals** for the selected pair during the interval from **3 hours before through 2 hours after** relevant high-impact economic releases. Unconfirmed release times, missing, stale or unverifiable calendar coverage cause a conservative block. Gold follows USD releases; forex pairs follow their currency countries. Active signals continue TP/SL verification during a blackout. The feed cannot guarantee that every possible market-moving announcement is listed.

## Optional market feed and production configuration

Copy `.env.example` to `.env.local` for `TWELVE_DATA_API_KEY` if desired. Without it, public Deriv market data is used where supported. Add the following to production environment variables:

```env
NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke
```

The server-side key must **never** be exposed to the browser. Provider limitations, API rates, incomplete bar histories and network failures can delay or block entries; the app does not invent price candles.

## Validation

Run `npm test` for the full regression suite, including v32 layout and PDF checks. `npm run doctor` confirms required files, the App Router error boundary and a matching lockfile. The production build was **not verifiable in the release environment** because its npm registry was unreachable; run `npm ci && npm run check && npm run build` on your computer before deploying.

See `docs/V32-RELEASE.md` for v32 design changes and `docs/V31-RELEASE.md` for the unchanged trading-logic details and limitations. This is a **signal-only tool**, not an order execution system, and does not guarantee profitable trades.
