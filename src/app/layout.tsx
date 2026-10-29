import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_DESCRIPTION, SITE_NAME, siteOrigin } from "@/lib/seo";

const url = siteOrigin();

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: { default: `${SITE_NAME} | Live Gold & Forex Signals`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "finance",
  keywords: [
    "mbioTraders", "live forex signals", "gold signals", "XAUUSD technical analysis",
    "market strength gauge", "multi timeframe analysis", "EURUSD", "GBPUSD",
    "technical indicators", "forex dashboard",
  ],
  alternates: { canonical: "/" },
  icons: { icon: "/icon.svg" },
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
    title: `${SITE_NAME} — Live Gold & Forex Signals`,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
