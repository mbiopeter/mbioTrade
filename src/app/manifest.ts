import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "mbioTraders — Live Market Signals",
    short_name: "mbioTraders",
    description: "Gold, forex and Bitcoin market signals with verified multi-timeframe analysis.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#03111a",
    theme_color: "#03111a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
