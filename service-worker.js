const CACHE_NAME = 'kouji-kantan-pwa-v58';
const CORE = ['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kouji-kantan-pwa-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET') return;
 event.respondWith(caches.open(CACHE_NAME).then(async cache => {
  const cached = await cache.match(event.request);
  if (cached) return cached;
  try {
   const response = await fetch(event.request);
   if (response.ok) await cache.put(event.request, response.clone());
   return response;
  } catch (error) {
   return (await cache.match('./index.html')) || Response.error();
  }
 }));
});
