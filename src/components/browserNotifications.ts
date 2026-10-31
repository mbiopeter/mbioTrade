"use client";

import type { TrackedSignal } from "@/lib/v26-signals";
import { browserAlertFor } from "@/lib/v31/browser-alerts";

export function notificationSupported(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && "Notification" in window;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function sendBrowserSignalNotification(signal: TrackedSignal): Promise<boolean> {
  if (!notificationSupported() || Notification.permission !== "granted") return false;
  const alert = browserAlertFor(signal);
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
      await registration.showNotification(alert.title, {
        body: alert.body,
        tag: alert.tag,
        icon: "/icon.svg",
        data: { url: alert.url },
      });
      return true;
    } catch {
    }
  }
  try {
    const notice = new Notification(alert.title, {
      body: alert.body,
      tag: alert.tag,
      icon: "/icon.svg",
    });
    notice.onclick = () => { window.focus(); notice.close(); };
    return true;
  } catch {
    return false;
  }
}
