export type AnalyticsValue = string | number | boolean;
export type AnalyticsParameters = Record<string, AnalyticsValue | null | undefined>;

export const ANALYTICS_OPT_OUT_KEY = "mbiotraders:analytics-disabled";
const MEASUREMENT_ID = /^G-[A-Z0-9]{6,30}$/i;
const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const PARAM_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const SAFE_VALUE = /^[a-zA-Z0-9 _./-]{1,80}$/;
export const SCROLL_MILESTONES = [25, 50, 75, 90, 100] as const;

export function validMeasurementId(value: string | undefined | null): string | null {
  const id = (value || "").trim();
  return MEASUREMENT_ID.test(id) ? id.toUpperCase() : null;
}

export function analyticsMeasurementId(): string | null {
  const id = validMeasurementId(process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_GA_TRACK_LOCAL !== "true") return null;
  return id;
}

export function isAnalyticsDisabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === "true"; }
  catch { return false; }
}

export function updateAnalyticsPreference(disabled: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, String(disabled));
    const id = analyticsMeasurementId();
    if (id) Reflect.set(window, `ga-disable-${id}`, disabled);
    return true;
  } catch { return false; }
}

export function safeEventLabel(value: string | undefined | null): string | undefined {
  const label = value?.trim() || "";
  return SAFE_VALUE.test(label) ? label : undefined;
}

export function safeEventParameters(params: AnalyticsParameters): Record<string, AnalyticsValue> {
  const clean: Record<string, AnalyticsValue> = {};
  for (const [name, value] of Object.entries(params)) {
    if (!PARAM_NAME.test(name) || value === undefined || value === null) continue;
    if (typeof value === "string") {
      if (SAFE_VALUE.test(value)) clean[name] = value;
    } else if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      clean[name] = value;
    }
  }
  return clean;
}

export function trackEvent(eventName: string, params: AnalyticsParameters = {}): void {
  if (typeof window === "undefined" || !analyticsMeasurementId() || isAnalyticsDisabled() || !EVENT_NAME.test(eventName)) return;
  const safe = safeEventParameters(params);
  if (eventName === "page_view" && typeof params.page_path === "string") {
    safe.page_location = window.location.origin + pagePathname(params.page_path);
  }
  const w = window as Window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };
  if (typeof w.gtag === "function") {
    w.gtag("event", eventName, safe);
  } else {
    w.dataLayer ??= [];
    const argumentsLike = (function (..._args: unknown[]) { return arguments; })("event", eventName, safe);
    w.dataLayer.push(argumentsLike);
  }
}

export function reachedMilestones(depth: number, seen: ReadonlySet<number>): number[] {
  return Number.isFinite(depth) ? SCROLL_MILESTONES.filter((v) => depth >= v && !seen.has(v)) : [];
}

export function classifyAnalyticsLink(rawHref: string, origin: string): {
  kind: "internal" | "outbound" | "download" | "other";
  path?: string;
  domain?: string;
} {
  if (!rawHref || /^(?:mailto:|tel:|javascript:|data:|blob:)/i.test(rawHref.trim())) return { kind: "other" };
  try {
    const url = new URL(rawHref, origin);
    if (!/^(https?:)$/.test(url.protocol)) return { kind: "other" };
    if (url.origin !== origin) return { kind: "outbound", domain: url.hostname.slice(0, 80) };
    const path = url.pathname.slice(0, 100);
    if (/\.(pdf|csv|zip|docx?|xlsx?|png|jpe?g|webp)$/i.test(path)) return { kind: "download", path };
    return { kind: "internal", path };
  } catch { return { kind: "other" }; }
}

export function pagePathname(rawPath: string): string {
  const path = rawPath.split(/[?#]/)[0] || "/";
  return path.startsWith("/") && path.length <= 120 && !/[<>"']/g.test(path) ? path : "/";
}
