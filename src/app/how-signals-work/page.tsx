import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, siteOrigin } from "@/lib/seo";

export const metadata: Metadata = {
  title: "How Forex, Gold and Bitcoin Signals Work",
  description: "Learn how mbioTraders checks aligned higher timeframes, waits for 5-minute candle confirmations, sets previous-swing stops and two-to-one profit targets before showing research signals.",
  alternates: { canonical: "/how-signals-work" },
  openGraph: { title: "How mbioTraders Signals Work", url: `${siteOrigin()}/how-signals-work`, type: "article" },
};

const steps = [
  ["Verify real candle data", "Read actual market candles across 5m, 15m, 30m, 1H, 4H and 1D. Missing, stale or incomplete frames prevent new signals."],
  ["Check the higher-timeframe direction", "All five higher timeframes (15m, 30m, 1H, 4H and 1D) must agree with the market trend. The 5m chart is for entries, not higher-timeframe voting."],
  ["Wait for a 5-minute pullback", "Following the agreed direction, require a countertrend move on the 5m chart before confirmation. A small opposite-direction candle in the lookback can qualify."],
  ["Confirm two strong closed candles", "Each confirmation candle must move in the higher-timeframe direction, with its real body making up at least 60% of its full high-to-low range."],
  ["Use the third candle opening", "If the actual opening price of the next 5m candle arrives in the permitted entry window, use it as the entry rather than guessing from a later quote."],
  ["Place the stop and two-risk target", "For BUY, anchor the stop to an earlier confirmed 5m swing low; for SELL, use an earlier confirmed 5m swing high. Set the target at twice the entry-to-stop distance."],
  ["Monitor results and notify", "Display an eligible signal, track its active outcome and show a browser notification when alerts have been enabled and permission granted. The app never executes broker orders."],
] as const;

export default function HowSignalsWork() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "How mbioTraders Research Signals Work",
    description: "An explanation of multi-timeframe analysis, the five-minute candle entry and two-to-one risk-to-reward targets.",
    url: `${siteOrigin()}/how-signals-work`,
    publisher: { "@type": "Organization", name: SITE_NAME },
    about: ["Forex technical analysis", "Bitcoin chart analysis", "Gold technical analysis"],
  };
  return <main className="mbiotraders-info-page" data-analytics-section="how_signals_work">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <nav className="mbiotraders-info-nav"><Link href="/">← Back to mbioTraders</Link><a href="/mbiotraders-signal-guide.pdf" download>Download illustrated PDF</a></nav>
    <header><p>TRADING SIGNAL METHODOLOGY</p><h1>How mbioTraders detects a market signal</h1><p>Gold (XAUUSD), five major forex pairs and Bitcoin (BTCUSD). Technical-analysis research only, not an automated broker or a guarantee of returns.</p></header>
    <div className="mbiotraders-info-steps">{steps.map(([title, description], i) => <section key={title} data-analytics-section={`method_step_${i + 1}`}><span>{String(i + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{description}</p></div></section>)}</div>
    <p className="mbiotraders-info-disclaimer">Market prices, spreads, delays and price gaps can affect outcomes. Historical performance or a simulated illustration does not predict future results.</p>
    <footer><Link href="/">Open live dashboard</Link> · <Link href="/privacy">Privacy & analytics</Link></footer>
  </main>;
}
