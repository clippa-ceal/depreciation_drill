const CACHE = 'shokyaku-drill-v48';
const ASSETS = [
  './',
  './index.html',
  './pension.html',
  './purchases.html',
  './lease.html',
  './trade.html',
  './wip.html',
  './hedge.html',
  './cash.html',
  './interest.html',
  './stockoption.html',
  './fxsec.html',
  './acqcost.html',
  './compress.html',
  './tokushu.html',
  './aro.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const isHtml = req.mode === 'navigate' ||
    (req.method === 'GET' && (req.destination === 'document' || (req.headers.get('accept') || '').includes('text/html')));
  if (isHtml) {
    // network-first for HTML so deploys reflect immediately
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
  } else {
    // cache-first for other assets
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
