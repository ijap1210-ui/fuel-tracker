/* Keeps the app working without signal. Serves the saved copy first, then refreshes it in the background.
   Bump VERSION after changing any file so phones pick up the new copy on their next two opens. */
const VERSION = 'fuel-tracker-v2';
const FILES = [
  './', './index.html', './app.css', './calc.js', './store.js', './charts.js', './app.js', './forms.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const base = new URL(self.registration.scope).pathname;
  if (url.origin !== self.location.origin || !url.pathname.startsWith(base)) return;
  // Only the app's own files (and opening the app) go through the saved copy.
  const rel = './' + url.pathname.slice(base.length);
  if (req.mode !== 'navigate' && !FILES.includes(rel)) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    if (cached) { e.waitUntil(fresh); return cached; }
    return fresh;
  }));
});
