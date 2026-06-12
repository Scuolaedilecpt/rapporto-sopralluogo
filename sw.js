// Service Worker — Rapporto di Sopralluogo CPT Formedil Padova
const CACHE_NAME = 'sopralluogo-cpt-v10';

const PRECACHE_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Install: pre-carica assets e skipWaiting immediato
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        PRECACHE_ASSETS.map(url => cache.add(url).catch(() => {}))
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate: rimuovi cache vecchie e prendi controllo
// NON fare client.navigate() qui — ci pensa il controllerchange nella pagina
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;

  // POST e altri metodi non-GET: NON intercettare mai.
  // Re-inoltrare un POST dal SW (respondWith(fetch(event.request)))
  // causa "NetworkError when attempting to fetch resource" su Firefox/Android.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Google Apps Script e Supabase: sempre network, mai cache
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('script.googleusercontent.com') ||
      url.hostname.includes('supabase.co')) {
    return; // lascia gestire al browser senza intercettare
  }

  // index.html: network-first, cache solo come fallback offline
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Font Google: stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const networkFetch = fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Tutto il resto: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Risponde al reset manuale dalla pagina
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
