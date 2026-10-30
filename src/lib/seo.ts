
const FALLBACK = "https://traders.mbiopeter.co.ke";
export const SITE_NAME = "mbioTraders";
export const SITE_DESCRIPTION = "Live Gold and major Forex market signals with an animated strength gauge, multi-timeframe trend alignment, technical indicators and research-only signal plans.";

export function siteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!value) return FALLBACK;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) return FALLBACK;
    return parsed.origin;
  } catch { return FALLBACK; }
}
