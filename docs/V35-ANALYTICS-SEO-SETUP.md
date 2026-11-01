# mbioTraders v35 — Google Analytics and SEO setup

This package keeps the v34 market-data, signal, news, ledger, PWA, notifications and responsive dashboard features. It adds GA4 event measurement, indexable explanatory content, and a compact mobile header.

## 1. Connect Google Analytics 4

Create or open a Google Analytics 4 web data stream for `https://traders.mbiopeter.co.ke`. Copy its Measurement ID (starts with `G-`). You may reuse the ID configured on `mbiopeter.co.ke` if you want both sites in the same property, or create a separate stream for clearer reporting.

Set the following in `.env.local` for development or in Vercel **Project → Settings → Environment Variables** for production:

```dotenv
NEXT_PUBLIC_GA_ID=G-YOURREALMEASUREMENTID
NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
```

Do not commit `.env.local`. `NEXT_PUBLIC_GA_ID` is a public property identifier, not a secret. The app refuses invalid ID formats and does not load the Google tag until a valid ID is supplied. Redeploy after changing Vercel variables. Local development analytics is off by default; set `NEXT_PUBLIC_GA_TRACK_LOCAL=true` only for intentional local debugging.

**Test:** Open the deployed site and navigate to Google Analytics → Reports → Realtime. Click BTCUSD, toggle Alerts, scroll on mobile, or download the signal guide. Look for `market_select`, `alerts_toggle`, `scroll_depth`, `signal_guide_download` and `ui_click`. Use Google Tag Assistant or GA4 DebugView for detailed verification. Reports outside Realtime can take time to populate.

**Prevent duplicate page views:** v35 sends one explicit `page_view` per application route and initializes gtag with `send_page_view:false`. In GA4 Web stream → Enhanced measurement settings, turn off **Page changes based on browser history events** if enabled; this separate GA setting can otherwise generate additional pageviews on client navigation.

## 2. Event catalog

| Event | Meaning | Useful parameters |
|---|---|---|
| `page_view` | Initial and SPA route visit | `page_path`, `page_location`, `page_title` |
| `ui_click` | Global click on link/button | `section_name`, `element_type`, `element_label`, `link_type` |
| `scroll_depth` | One-time 25, 50, 75, 90 or 100% vertical scroll depth | `percent_scrolled` |
| `toolbar_scroll` | Horizontal scroll in markets/timeframes on narrow screens | `toolbar` |
| `section_view` | A dashboard card or article section becomes visible | `section_name` |
| `page_engagement` | At least 5 seconds of foreground engagement when leaving | `engaged_seconds` |
| `market_select` | Pair selected | `item_name` |
| `timeframe_select` | Chart timeframe selected | `item_name` |
| `momentum_window_select` | 3/5/7-day momentum period selected | `item_name` |
| `alerts_toggle` | Alerts enabled or disabled | `item_name` |
| `signal_guide_download` | User clicks the illustrated PDF guide | `item_name` |
| `history_export_csv` | User exports a nonempty results journal | `item_name` |
| `outbound_link` | Navigation to a different site | `link_domain` |
| `resource_download` | Download link clicked | `file_path` |
| `pwa_install_intent` | Install App clicked | `item_name` |
| `pwa_install_accepted` | Browser install prompt accepted | `platform` |
| `pwa_install_completed` | Browser confirms app installation | `platform` |
| `signal_active_view` | A confirmed active signal first becomes visible this session | `market`, `direction` |
| `signal_notification_sent` | OS/browser notification request succeeds | `market`, `direction` |
| `market_feed_unavailable` | Market data fails in selected pair | `market` |
| `news_window_blocked` | High-impact news blocks a new entry | `market` |

Analytics is a **site usage** tool. Some events may be blocked by browser privacy settings, network failures or the visitor's tracking opt-out. `signal_active_view` measures a displayed active signal, not a unique trade opening globally. Analytics does not transmit signal price levels, saved trading results, authorization tokens, private URLs, or raw typed content.

To segment events in GA4 Explorations, create event-scoped custom dimensions for useful event parameters such as `market`, `direction`, `section_name`, `item_name`, `percent_scrolled`, `element_type`, and `platform`. The custom event names themselves appear in Events reports without custom definitions. Consider marking `signal_guide_download`, `alerts_toggle` or other valuable customer actions as key events based on your business goals.

Privacy setting: `/privacy` includes an analytics opt-out control stored in this browser. When disabled, v35 suppresses future GA4 event calls and sets GA's disable flag. Analytics may already have loaded before the visitor opts out; clearing earlier cookies depends on browser settings. Visitors can also use browser tracking protections.

## 3. Search engine indexing

Configure canonical domain and optional Google Search Console site-verification token:

```dotenv
NEXT_PUBLIC_SITE_URL=https://traders.mbiopeter.co.ke
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=YOUR-META-VERIFICATION-CONTENT
```

For a Search Console HTML meta tag, copy only the **content** value, not the entire `<meta>` tag. You can alternatively verify using DNS, without setting this variable.

The app provides:

- Server-rendered metadata, canonical URLs, Open Graph previews and Twitter cards
- `/robots.txt` with `/api/` disallowed
- `/sitemap.xml` listing `/` and `/how-signals-work`
- `/how-signals-work` with substantive indexable guidance and `TechArticle` structured data
- `WebApplication` structured data on the home page
- `/privacy` for data handling and opt-out; this page is deliberately marked `noindex`
- Crawlable internal links from the dashboard to the methodology page

After deployment, verify the sitemap in a browser and submit `https://traders.mbiopeter.co.ke/sitemap.xml` in Google Search Console. Use the URL Inspection tool to request indexing. Indexing and rankings remain Google's decision, not a guarantee.

## 4. PWA installation and mobile header

Installation can only be detected reliably when the installed app runs in standalone display mode. The `appinstalled` event is also remembered for the current browser, hiding the button in a normal tab where the install just completed. When a compatible browser offers `beforeinstallprompt` again, that stale flag is cleared, so reinstallation is possible. Different browsers and iOS home-screen shortcuts may not share installation state.

At phone widths, Install, Signal Guide and Alerts are icon buttons aligned immediately to the **right** of the mbioTraders title, with accessible labels; the live feed and pair/timeframe tabs remain below the first row. Installing the PWA does not provide a background trading server—live data and notifications still require the application to be open.

## 5. Release verification

```bash
npm ci
npm run doctor
npm test
npm run check
npm run build
npm run dev
```

Requires Node.js 24.x. All seven instruments and safety checks remain unchanged from the uploaded v34 source. If you use Vercel, the app files must sit at the root directory configured for that project; do not nest `mbiotraders-v35` inside a prior version's source tree.
