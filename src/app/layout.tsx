import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { analyticsMeasurementId, ANALYTICS_OPT_OUT_KEY } from "@/lib/analytics";
import type { ReactNode } from "react";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/seo";

const url = siteOrigin();
const measurementId = analyticsMeasurementId();
const searchVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const verifiedToken = searchVerification && /^[a-zA-Z0-9_-]{8,180}$/.test(searchVerification) ? searchVerification : undefined;
const bootstrap = measurementId ? `
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){window.dataLayer.push(arguments)};
  try { window['ga-disable-${measurementId}'] = window.localStorage.getItem('${ANALYTICS_OPT_OUT_KEY}') === 'true'; } catch (error) {}
  window.gtag('js', new Date());
  window.gtag('config', '${measurementId}', { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
` : null;

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: `${SITE_NAME} | Live Gold, Forex & Bitcoin Signals`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  verification: verifiedToken ? { google: verifiedToken } : undefined,
  category: "finance",
  keywords: [
    "mbioTraders", "live forex signals", "gold signals", "XAUUSD technical analysis", "BTCUSD crypto signals", "Bitcoin market strength",
    "market strength gauge", "multi timeframe analysis", "EURUSD", "GBPUSD",
    "technical indicators", "forex dashboard", "BTCUSD analysis", "Bitcoin signals", "five-minute entry confirmation", "public market data",
  ],
  alternates: { canonical: "/" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, title: "mbioTraders", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Live Market Signal Dashboard`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "mbioTraders live market signal dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Live Gold, Forex & Bitcoin Signals`,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export const viewport: Viewport = { themeColor: "#03111a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>
    {measurementId && bootstrap && <>
      <Script id="mbiotraders-ga-bootstrap" strategy="beforeInteractive">{bootstrap}</Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
    </>}
    <AnalyticsTracker />
    {children}
  </body></html>;
}
