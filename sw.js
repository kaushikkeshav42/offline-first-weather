const STATIC_CACHE = "weather-static-v1";
const API_CACHE = "weather-api-v1";
const STATIC_ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./db.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Stale-While-Revalidate for Open-Meteo REST API requests
  if (url.origin.includes("open-meteo.com")) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          })
          .catch(() => cachedResponse);
        return cachedResponse || networkFetch;
      })
    );
    return;
  }

  // Cache-First for Static Shell Assets
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});