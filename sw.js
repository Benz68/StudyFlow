const CACHE = 'studyflow-personal-week-v3';
const SHELL = ['/', '/index.html', '/manifest.json', '/src/studyflow/brand/mark.svg', '/src/studyflow/brand/app-icon-180.png', '/src/studyflow/brand/app-icon-192.png', '/src/studyflow/brand/app-icon-512.png', '/src/studyflow/bootstrap.mjs', '/src/studyflow/app.mjs', '/src/studyflow/styles.css', '/src/studyflow/forms.mjs', '/src/studyflow/views.mjs', '/src/studyflow/planner.mjs', '/src/studyflow/store.mjs'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('studyflow-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const appAsset = SHELL.includes(url.pathname) || (url.pathname.startsWith('/src/studyflow/') && /\.(mjs|css|svg|png|webp)$/.test(url.pathname));
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !appAsset) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || new Response('אין חיבור. יש לפתוח את האפליקציה פעם אחת כשהמכשיר מחובר.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
