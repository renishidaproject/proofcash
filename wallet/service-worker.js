// ProofCash Passkey Wallet Service Worker v1.1
// Offline-first PWA caching & transaction queueing

const CACHE_NAME = 'proofcash-wallet-v1.8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './qrcode.min.js',
  './jsqr.min.js',
  './bip39-words.js',
  './passkey-crypto.js',
  './wallet-engine.js',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching static shell assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Let JSON-RPC / API requests pass through to the network
  const url = new URL(event.request.url);
  if (url.port === '8332' || url.pathname.startsWith('/rpc')) {
    return;
  }

  // Network-First strategy with Cache Fallback for instant live updates
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      // Fallback if offline
      return caches.match(event.request);
    })
  );
});
