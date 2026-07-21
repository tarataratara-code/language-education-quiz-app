const CACHE_NAME = "language-education-quiz-app-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260721-2",
  "./app.js?v=20260721-2",
  "./firebase-config.js?v=20260721-2",
  "./cloud-sync.js?v=20260721-2",
  "./tcj-data.js?v=20260713-1",
  "./redbook-written-data.js?v=20260721-1",
  "./manifest.webmanifest?v=20260713-1",
  "./icons/icon.svg",
  "./icons/maskable-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
