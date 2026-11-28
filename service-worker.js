const CACHE_NAME = 'kouji-kantan-pwa-v144';
const CORE = ['./','./index.html','./field-register.html','./invoice.html','./shared-setup.html','./set-password.html','./shared-auth.js','./shared-auth-v2.js','./shared-auth-v3.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('kouji-kantan-pwa-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 if (event.request.method !== 'GET') return;
 event.respondWith(caches.open(CACHE_NAME).then(async cache => {
  const isPage = event.request.mode === 'navigate' || new URL(event.request.url).pathname.endsWith('/index.html') || new URL(event.request.url).pathname.endsWith('/kouji-kantan-seikyu-test/');
  if (isPage) {
   try {
    const response = await fetch(event.request, {cache:'no-store'});
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
   } catch (error) {
    const pageUrl = new URL(event.request.url);
    const cachedPage = await cache.match(pageUrl.pathname);
    return cachedPage || (await cache.match('./index.html')) || Response.error();
   }
  }
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
