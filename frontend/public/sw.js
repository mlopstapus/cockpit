/// <reference lib="webworker" />

const CACHE_VERSION = "v1";
const ASSETS_CACHE = `cockpit-assets-${CACHE_VERSION}`;
const API_CACHE = `cockpit-api-${CACHE_VERSION}`;
const RUNTIME_CACHE = `cockpit-runtime-${CACHE_VERSION}`;

const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
];

declare const self: ServiceWorkerGlobalScope;

// Install event - cache assets
self.addEventListener("install", (event: ExtendableEvent) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches.open(ASSETS_CACHE).then((cache) => {
      console.log("[SW] Caching core assets");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener("activate", (event: ExtendableEvent) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old versions of our caches
          if (
            (cacheName.startsWith("cockpit-") && !cacheName.includes(CACHE_VERSION)) ||
            cacheName === "cockpit-v0"
          ) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - intelligent caching strategy
self.addEventListener("fetch", (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't cache WebSocket connections or non-HTTP requests
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // API endpoints - network first, fallback to cache or offline page
  if (url.pathname.startsWith("/api/")) {
    return event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok && request.method === "GET") {
            const cache = caches.open(API_CACHE);
            cache.then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // Return cached response if available
          return caches.match(request).then((cached) => {
            return (
              cached ||
              new Response("API unavailable offline", { status: 503 })
            );
          });
        })
    );
  }

  // Static assets - cache first, network fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((response) => {
            // Cache successful responses for static assets
            if (response.ok && request.method === "GET") {
              const cache = caches.open(RUNTIME_CACHE);
              cache.then((c) => c.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback - return index.html for navigation requests
            if (request.mode === "navigate") {
              return caches.match("/index.html");
            }
            // For other requests, return a generic offline response
            return new Response("Resource unavailable offline", { status: 503 });
          })
      );
    })
  );
});

// Handle messages from client
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const options = event.data.options;
    self.registration.showNotification(options.title, {
      body: options.body,
      icon: options.icon || "/icon-192.png",
      badge: options.badge || "/icon-192.png",
      tag: options.tag,
      requireInteraction: options.requireInteraction,
      actions: options.actions,
    });
  }
});

// Handle notification clicks
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  // Focus or open client window
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Check if there's already a window/tab with the target URL open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ((client as any).url === "/" && "focus" in client) {
          return (client as any).focus();
        }
      }
      // If not, open a new window/tab with the target URL
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});

console.log("[SW] Service worker loaded");

