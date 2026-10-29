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
    featureList: ["Market-data chart", "Technical strength gauge", "Multi-timeframe momentum", "Signal alerts"],
  };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <MarketDashboard />
  </>;
}
