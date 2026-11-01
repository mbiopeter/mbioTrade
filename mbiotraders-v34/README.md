# mbioTraders v33

A compact, responsive **Gold, forex and cryptocurrency** signal dashboard. Built directly from the user-supplied v32 ZIP, with the same established signal engine, news blackout, existing six instruments, candlestick chart, strength gauge, automatic retry, persisted positions, 100-entry history, CSV export, two-row pagination, real browser alerts, SEO and downloadable version-free illustrated guide.

**New in v33:** Enlarged the heading and supporting text inside **Multi-Timeframe Trend Alignment**, **Overall Market Strength**, **Signal Setup Details**, **Key Levels**, and **Market Statistics**, while retaining a single-screen three-column desktop layout and two-column tablet layout. Added **BTCUSD (Bitcoin/U.S. dollar)** as the seventh market, with actual 24/7 spot candlesticks from Kraken's public API and public live price updates through its ticker WebSocket. Existing Gold and five forex pairs retain their original data providers and strategy rules. BTCUSD participates in the same alignment, 5m entry, 2R exits, saved-signal journal, browser alerts and USD news blackout.

**BTCUSD market limitations:** Kraken's OHLC endpoint exposes up to **720 recent candles per interval**; older history cannot be backfilled from that endpoint. Six separate calls are paced to respect API rate limits, and Kraken or network outages stop new crypto signals rather than generating fabricated candles. Its newest OHLC bar is unfinished: the trading engine only uses closed candles for confirmations, except that it reads the actual opening of the third 5m bar for entry. When a server-side Twelve Data key is configured, Twelve Data can provide backup BTC/USD snapshots if Kraken fails, without pretending snapshot data is a live tick stream. Public Kraken data is not guaranteed to match other brokers or exchanges.

## Install and run

Use **Node.js 24.x**, pinned in `package.json` and `.nvmrc` for Vercel compatibility. This ZIP **includes `package-lock.json`**; do not delete it before running the following commands:

```bash
cd mbiotraders-v33
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Open `http://localhost:3000`. The project includes a valid, synchronized `package-lock.json` so **`npm ci` is supported**. If you rename the extracted project directory, adjust the `cd` command accordingly.

The **Signal Guide** link next to Alerts downloads `/mbiotraders-signal-guide.pdf`; the PDF is already bundled under `public/`, so it also works on Vercel with no extra server route.

## Signal strategy (unchanged from v32)

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

A server-side route at `/api/news-calendar` uses the Finance Calendar feed to pause **new signals** for the selected pair during the interval from **3 hours before through 2 hours after** relevant high-impact economic releases. Unconfirmed release times, missing, stale or unverifiable calendar coverage cause a conservative block. Gold and Bitcoin follow USD releases; forex pairs follow their currency countries. Active signals continue TP/SL verification during a blackout. The feed cannot guarantee that every possible market-moving announcement is listed.

## Optional market feed and production configuration

Copy `.env.example` to `.env.local` for `TWELVE_DATA_API_KEY` if desired. Without it, public Deriv market data is used for Gold and forex where supported, and public Kraken market data is used for BTCUSD without an API key. Add the following to production environment variables:

```env
NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke
```

The server-side key must **never** be exposed to the browser. Provider limitations, API rates, incomplete bar histories and network failures can delay or block entries; the app does not invent price candles.

## Validation

Run `npm test` for the full regression suite, including v32 layout and PDF checks and v33 BTCUSD provider, ledger, news and typography checks. `npm run doctor` confirms required files, the App Router error boundary and a matching lockfile. The production build was **not verifiable in the release environment** because its npm registry was unreachable; run `npm ci && npm run check && npm run build` on your computer before deploying.

See `docs/V33-RELEASE.md` for v33 changes, `docs/V32-RELEASE.md` for the retained layout, and `docs/V31-RELEASE.md` for original signal-logic details and limitations. This is a **signal-only tool**, not an order execution system, and does not guarantee profitable trades.


## Runtime data feed diagnostics

A successful `npm run build` confirms that the application compiles; a `503` on `/api/market` is a separate upstream market-data problem. Open `http://localhost:3000/api/market?symbol=XAUUSD` and inspect its JSON `detail` for the exact provider failure. Gold and forex use Twelve Data when `TWELVE_DATA_API_KEY` is set in `.env.local`; otherwise they fall back to public Deriv WebSockets. Closed markets may not have fresh live quotes; the historical fetch uses Deriv's documented `adjust_start_time: 1`, but signals will remain paused when data is stale or missing. BTCUSD uses Kraken separately and trades 24/7. The calendar route reuses a previously verified successful snapshot only for its existing four-minute freshness window. After that, it returns 503, and new signals are blocked rather than guessing news conditions.

## v34 — Clean Signal Setup and Installable App

mbioTraders now supports installation as a Progressive Web App (PWA). The dashboard keeps the v33 Gold, five forex pairs, BTCUSD, 5m two-candle entries, news safety gate, signal history, browser notifications, charts and mobile/tablet layouts. The Signal Setup Details card shows only conditions, their Yes/Wait/Clear outcomes and a short overall setup status; the underlying analysis criteria and news guard are unchanged.

### Install on desktop

Deploy the project to HTTPS (or use `http://localhost:3000` while developing). Open the dashboard in Chrome or Edge and select **Install App** in the header. When the browser offers a native install prompt, confirm. If the prompt is not available, use the browser's install icon in the address bar or its menu. Launch the installed app from the computer's app launcher.

### Install on Android

Open the HTTPS site in Chrome or Samsung Internet and select **Install App**. If the browser offers a native prompt, confirm. If not, open the browser's menu and choose **Install app** or **Add to Home screen**. The installed app appears in the phone's launcher.

### Install on iPhone or iPad

Open the HTTPS dashboard and select **Install App** to see the instructions. In the browser, tap **Share**, choose **Add to Home Screen**, then **Add**. Launch mbioTraders from its home screen icon. iOS does not support the website-triggered `beforeinstallprompt` install dialog.

### Important safety limits

- The app opens in its own standalone window without the usual browser tabs. It still requires internet access to verify live market data, check economic news and evaluate signals.
- Offline navigation displays an explicit **You are offline** page, not old or manufactured market quotes. The service worker never caches `/api/market`, `/api/market/history` or `/api/news-calendar` responses.
- The existing signal notification behavior is preserved. Alerts must be enabled, notifications must be permitted, and the app must be open for client-side signal detection. Installing the app does **not** add background signal scanning or server-side push after it is closed.
- Install buttons and browser install prompts depend on browser/platform support. Desktop Firefox does not currently support manifest-based installation.

### Start locally

Use Node.js 24.x:

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

The unified service worker remains at `/notification-sw.js` to preserve the existing notification registration path. The App Router automatically exposes `/manifest.webmanifest` from `src/app/manifest.ts`. Never deploy the app behind a path prefix without updating the manifest scope and worker registration together.
