import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsPreferences } from "@/components/AnalyticsPreferences";

export const metadata: Metadata = {
  title: "Privacy and Analytics Preferences",
  description: "Understand mbioTraders analytics, local storage and notification permissions, and change tracking preferences.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return <main className="mbiotraders-info-page" data-analytics-section="privacy_page">
    <nav className="mbiotraders-info-nav"><Link href="/">← Back to mbioTraders</Link></nav>
    <header><p>PRIVACY & MEASUREMENT</p><h1>Analytics preferences</h1><p>mbioTraders uses Google Analytics 4, when configured, to understand website use and improve the experience.</p></header>
    <section className="mbiotraders-privacy-section"><h2>What is measured</h2><p>Page views, scroll depth, dashboard sections viewed, market and timeframe selections, feature clicks, PDF and CSV downloads, and app installation actions. Events report fixed category labels, not your trading prices or private account credentials.</p><p>Google Analytics may set cookies or process browsing data under Google's terms. You can opt out here; your choice applies to this browser on this website.</p><AnalyticsPreferences /></section>
    <section className="mbiotraders-privacy-section"><h2>Trading data and alerts</h2><p>Your signal history and display settings are stored locally in this browser. Browser notifications are requested only after you turn on alerts. The app does not send trade orders to a broker.</p></section>
    <footer><Link href="/how-signals-work">How signals work</Link> · <Link href="/">Dashboard</Link></footer>
  </main>;
}
