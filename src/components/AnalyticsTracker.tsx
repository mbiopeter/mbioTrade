"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  classifyAnalyticsLink,
  pagePathname,
  reachedMilestones,
  safeEventLabel,
  trackEvent,
} from "@/lib/analytics";

function sectionOf(node: Element): string {
  const section = node.closest<HTMLElement>("[data-analytics-section], section[id], header, main");
  return safeEventLabel(section?.dataset.analyticsSection) || safeEventLabel(section?.id) ||
    (section?.tagName === "HEADER" ? "header" : "dashboard");
}

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const pagePath = pagePathname(pathname || "/");
    trackEvent("page_view", { page_path: pagePath, page_title: safeEventLabel(document.title) || "mbioTraders" });
    const basic = { page_path: pagePath };
    const seenScroll = new Set<number>();
    const seenSections = new Set<string>();
    const scrolledTabs = new Set<string>();
    let hadScroll = false;
    let scheduled = 0;
    let activeAt = performance.now();

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const el = event.target.closest<HTMLElement>("a,button,[role='button'],[role='tab']");
      if (!el || el.closest("[data-analytics-ignore]") || el.getAttribute("aria-disabled") === "true" || (el instanceof HTMLButtonElement && el.disabled)) return;
      const section = sectionOf(el);
      const label = safeEventLabel(el.dataset.analyticsLabel);
      const type = el.tagName.toLowerCase();
      const extras: Record<string, string> = {};
      if (label) extras.element_label = label;
      if (el instanceof HTMLAnchorElement) {
        const link = classifyAnalyticsLink(el.href, window.location.origin);
        extras.link_type = link.kind;
        if (link.path) extras.link_path = link.path;
        if (link.domain) extras.link_domain = link.domain;
        if (link.kind === "outbound") trackEvent("outbound_link", { ...basic, section_name: section, link_domain: link.domain });
        if (link.kind === "download" || el.hasAttribute("download")) trackEvent("resource_download", { ...basic, section_name: section, file_path: link.path || "download" });
      }
      trackEvent("ui_click", { ...basic, section_name: section, element_type: type, ...extras });
      if (el.dataset.analyticsEvent && /^[a-z][a-z0-9_]{0,39}$/.test(el.dataset.analyticsEvent)) {
        trackEvent(el.dataset.analyticsEvent, { ...basic, section_name: section, ...(label ? { item_name: label } : {}) });
      }
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.classList.contains("mbiotraders-symbol-tabs") || target.classList.contains("mbiotraders-timeframe-tabs"))) {
        const name = target.classList.contains("mbiotraders-symbol-tabs") ? "market_tabs" : "timeframe_tabs";
        if (!scrolledTabs.has(name) && target.scrollLeft > 4) {
          scrolledTabs.add(name);
          trackEvent("toolbar_scroll", { ...basic, toolbar: name });
        }
        return;
      }
      if (!hadScroll && window.scrollY <= 0) return;
      hadScroll = true;
      if (scheduled) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) return;
        const percent = Math.min(100, Math.max(0, Math.floor(100 * window.scrollY / maxScroll)));
        for (const depth of reachedMilestones(percent, seenScroll)) {
          seenScroll.add(depth);
          trackEvent("scroll_depth", { ...basic, percent_scrolled: depth });
        }
      });
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target as HTMLElement;
        const name = safeEventLabel(node.dataset.analyticsSection);
        if (!name || seenSections.has(name)) continue;
        seenSections.add(name);
        trackEvent("section_view", { ...basic, section_name: name });
        observer?.unobserve(node);
      }
    }, { threshold: 0.12 });
    document.querySelectorAll<HTMLElement>("[data-analytics-section]").forEach((node) => observer?.observe(node));

    const recordEngagement = () => {
      const duration = Math.floor((performance.now() - activeAt) / 1000);
      activeAt = performance.now();
      if (duration >= 5) trackEvent("page_engagement", { ...basic, engaged_seconds: Math.min(duration, 3600) });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") recordEngagement();
      else activeAt = performance.now();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      recordEngagement();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
    };
  }, [pathname]);
  return null;
}
