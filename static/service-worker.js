const cacheName = "stc-cache-v4";
const urlsToCache = [
  "/",
  "/index.html",
  "/main.js",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png"
];

self.addEventListener("install", event =>
  event.waitUntil(async () => {
    console.log("caching");
    const cache = await caches.open(cacheName);
    await cache.addAll(urlsToCache);
  })
);

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(c => c || fetch(event.request))
  );
});

self.addEventListener('activate', event =>
  event.waitUntil(async () => {
    console.log("cleaning up");
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name !== cacheName) await caches.delete(name);
    }
  })
);
