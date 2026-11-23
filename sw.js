// Service worker: permite abrir la app sin internet.
// Estrategia "red primero": con conexión siempre se baja la versión publicada (sin usar la caché HTTP),
// y la copia guardada solo se usa si no hay internet. Así las actualizaciones se ven al instante.
// Al publicar, subí el número de CACHE (y APP_VERSION en js/app.js).

const CACHE = 'prestamos-v6';
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
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
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

  const key = request.mode === 'navigate' ? './index.html' : request;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) cache.put(key, response.clone());
        return response;
      } catch {
        const cached = await cache.match(key, { ignoreSearch: true });
        if (cached) return cached;
        throw new Error('Sin conexión y sin copia guardada');
      }
    })(),
  );
});
