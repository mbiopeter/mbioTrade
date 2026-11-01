import { MarketDashboard } from "@/components/MarketDashboard";
import { SITE_NAME, SITE_DESCRIPTION, siteOrigin } from "@/lib/seo";

export default function Home() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: siteOrigin(),
    description: SITE_DESCRIPTION,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any modern web browser",
    featureList: ["Gold, forex and Bitcoin charts", "Five-timeframe alignment", "Five-minute pullback and candle confirmations", "News-filtered research signals", "Installable progressive web app", "Browser notifications", "Signals history export"],
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <MarketDashboard />
  </>;
}
