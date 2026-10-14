/* Tiny service worker: lets reminders show as proper notifications (also on phones) and focuses Aquestoria when clicked. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) =>
        list.length ? list[0].focus() : clients.openWindow("./"),
      ),
  );
});
