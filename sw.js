// Service worker: guarda la app en caché para que abra sin internet.
// Estrategia "stale-while-revalidate": responde al instante con la caché y actualiza en segundo plano,
// así una versión nueva se ve la próxima vez que se abre la app.
// Al publicar cambios grandes, subí el número de CACHE para forzar la limpieza.

const CACHE = 'prestamos-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/calc.js',
  './js/format.js',
  './js/store.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = request.mode === 'navigate' ? './index.html' : request;
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(key, response.clone());
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      return network;
    }),
  );
});
