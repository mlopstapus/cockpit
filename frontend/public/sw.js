/* Claude Cockpit — Service Worker */

const CACHE_VERSION = "v1";
const ASSETS_CACHE = "cockpit-assets-" + CACHE_VERSION;
const API_CACHE = "cockpit-api-" + CACHE_VERSION;
const RUNTIME_CACHE = "cockpit-runtime-" + CACHE_VERSION;

const urlsToCache = ["/", "/index.html", "/manifest.json"];

// Install event — cache core assets
self.addEventListener("install", function (event) {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches.open(ASSETS_CACHE).then(function (cache) {
      console.log("[SW] Caching core assets");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate event — cleanup old caches
self.addEventListener("activate", function (event) {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (cacheName) {
            return (
              (cacheName.startsWith("cockpit-") &&
                !cacheName.includes(CACHE_VERSION)) ||
              cacheName === "cockpit-v0"
            );
          })
          .map(function (cacheName) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event — intelligent caching strategy
self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);

  // Don't cache WebSocket connections or non-HTTP requests
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // API endpoints — network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok && request.method === "GET") {
            var responseClone = response.clone();
            caches.open(API_CACHE).then(function (cache) {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (cached) {
            return (
              cached ||
              new Response("API unavailable offline", { status: 503 })
            );
          });
        })
    );
    return;
  }

  // Static assets — cache first, network fallback
  event.respondWith(
    caches.match(request).then(function (cached) {
      return (
        cached ||
        fetch(request)
          .then(function (response) {
            if (response.ok && request.method === "GET") {
              var responseClone = response.clone();
              caches.open(RUNTIME_CACHE).then(function (cache) {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(function () {
            if (request.mode === "navigate") {
              return caches.match("/index.html");
            }
            return new Response("Resource unavailable offline", {
              status: 503,
            });
          })
      );
    })
  );
});

// Handle messages from client
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    var options = event.data.options;
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
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === "/" && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })
  );
});

console.log("[SW] Service worker loaded");
