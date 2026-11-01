# mbioTraders v34 — Release Notes

## Changes from v33 runtime hotfix

1. Signal Setup Details removes the per-criterion descriptive sentences. The card retains the same eight analysis/news checks, visible outcomes and a concise Setup Status. Labels are larger without reworking the trading decision logic.
2. An Install App button is available on desktop, tablet and mobile. Supported Chromium browsers show their native installation dialog. iOS and other browsers receive platform-appropriate installation instructions.
3. New App Router PWA manifest with standalone display, start URL, theme, 192px and 512px PNG icons, a 512px maskable icon and iOS 180px touch icon.
4. Unified service worker extends the existing `/notification-sw.js`. It caches only explicitly safe static resources, uses an offline page on failed navigation and never intercepts `/api/` requests. Existing notification click handling remains.
5. Node.js 24.x, Next.js 16.4.3 and the synchronized npm lockfile are preserved. The original signal detection, broker feeds, BTCUSD Kraken integration, real alerts, trade history, economic calendar and downloadable guide are unchanged.

## Installation

Upload to your HTTPS hosting environment, deploy, open the dashboard, then click **Install App**. The browser's install icon or platform's Add to Home Screen menu can also be used. Installation keeps an app icon for later use but is not a server-side background agent.

## Offline safety

Offline navigation displays a clear offline screen. Signals, prices, news and trade outcomes are never served from the service-worker cache. Notifications are emitted for new signals detected while the app is running and properly permitted; no background push channel was added.

## Verification

- Existing tests plus v34 PWA/UI tests: 112 passing.
- Source transpilation and service-worker syntax checks: passed.
- Static Chromium layout fixture: verified on 1200x700, 1280x720, 1366x768, 1440x900, 820x1180, 390x844 and 360x780; no horizontal overflow or setup-card clipping. Desktop examples at 1200px and above had no page scrolling.
- Live market-feed availability and Next.js production build must be verified in the target installation environment. The build machine available for this release had Node.js 22, lacked the required npm package tarballs, and could not complete npm ci.
