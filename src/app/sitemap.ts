import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${siteOrigin()}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteOrigin()}/how-signals-work`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
