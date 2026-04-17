/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

// Standard PWA fetch/install handlers are handled by vite-plugin-pwa
// This placeholder is required for injectManifest strategy
// self.__WB_MANIFEST

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Cyber Rider Alert';
  const options = {
    body: data.body || 'New notification',
    icon: 'https://api.dicebear.com/7.x/bottts/svg?seed=commander-1',
    badge: 'https://api.dicebear.com/7.x/bottts/svg?seed=commander-1',
    vibrate: [200, 100, 200],
    data: {
      url: self.location.origin
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
