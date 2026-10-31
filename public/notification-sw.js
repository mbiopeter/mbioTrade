self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = pages.find((page) => new URL(page.url).origin === self.location.origin);
    if (existing) return existing.focus();
    return self.clients.openWindow("/");
  })());
});
