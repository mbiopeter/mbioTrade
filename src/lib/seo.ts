
const FALLBACK = "https://traders.mbiopeter.co.ke";
export const SITE_NAME = "mbioTraders";
export const SITE_DESCRIPTION = "Research-only market signals for gold, five forex pairs and Bitcoin (BTCUSD). See real-data charts, five-timeframe trend checks, 5-minute entry confirmations, economic-news safeguards and downloadable signal analysis.";

export function siteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL): string {
  if (!value) return FALLBACK;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) return FALLBACK;
    return parsed.origin;
  } catch { return FALLBACK; }
}
