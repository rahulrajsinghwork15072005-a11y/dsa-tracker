/* DSA Tracker service worker — offline-first app shell + runtime caches */
const V = 'dsa-v5';
const SHELL = ['/', '/index.html', '/manifest.json', '/js/core.js', '/js/data.js', '/js/board.js', '/js/companies.js', '/js/track.js', '/js/srs.js', '/js/screens.js', '/js/search.js', '/js/sprint.js'];
const CDN_PRECACHE = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Patrick+Hand&display=swap'
];
const CDN_HOSTS = /cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(V)
      .then((c) => c.addAll(SHELL))
      .then(() => caches.open(V))
      // CDN served opaque (no-cors) — add() rejects those, so fetch+put instead
      .then((c) => Promise.allSettled(CDN_PRECACHE.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => c.put(u, r)))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin && !CDN_HOSTS.test(u.host)) return;
  if (u.pathname.startsWith('/api/')) return; // never cache API
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const c = r.clone();
          caches.open(V).then((cc) => cc.put('/index.html', c));
          return r;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // stale-while-revalidate for shell, data, pdfs, CDN
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((r) => {
          if (r && (r.ok || r.type === 'opaque')) {
            const c = r.clone();
            caches.open(V).then((cc) => cc.put(req, c));
          }
          return r;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
