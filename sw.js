const CACHE = 'studyflow-v29';
// Fonts change rarely and are kept separately, so the handwritten headings also show offline.
const FONTS = 'studyflow-fonts-v1';
// Paths are relative to where the app is hosted (/ locally, /StudyFlow/ on GitHub Pages).
const BASE = new URL('./', self.location).pathname;
const SHELL = ['', 'index.html', 'manifest.json', 'src/studyflow/brand/mark.svg', 'src/studyflow/brand/app-icon-180.png', 'src/studyflow/brand/app-icon-192.png', 'src/studyflow/brand/app-icon-512.png', 'src/studyflow/brand/app-icon-maskable-512.png',
  'src/studyflow/bootstrap.mjs', 'src/studyflow/app.mjs', 'src/studyflow/util.mjs', 'src/studyflow/store.mjs', 'src/studyflow/schedule.mjs', 'src/studyflow/propose.mjs',
  'src/studyflow/tell.mjs', 'src/studyflow/ics.mjs', 'src/studyflow/syllabus.mjs', 'src/studyflow/progress.mjs', 'src/studyflow/work.mjs','src/studyflow/screens.mjs', 'src/studyflow/dialogs.mjs', 'src/studyflow/timetable.mjs', 'src/studyflow/config.mjs', 'src/studyflow/cloud.mjs', 'src/studyflow/onboarding.mjs', 'src/studyflow/tour.mjs', 'src/studyflow/insights.mjs',
  'src/studyflow/styles.css', 'src/studyflow/depth.css', 'src/studyflow/app.css'].map(path => BASE + path);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('studyflow-') && key !== CACHE && key !== FONTS).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
// Network first, so a new version arrives as soon as there is a connection; the cache is the offline fallback.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com')) {
    event.respondWith(caches.open(FONTS).then(async cache => (await cache.match(event.request)) || fetch(event.request).then(response => {
      if (response.ok || response.type === 'opaque') cache.put(event.request, response.clone());
      return response;
    })));
    return;
  }
  const appAsset = SHELL.includes(url.pathname) || (url.pathname.startsWith(BASE + 'src/studyflow/') && /\.(mjs|css|svg|png|webp)$/.test(url.pathname));
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !appAsset) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request, {ignoreSearch: true})) || new Response('אין חיבור. יש לפתוח את האפליקציה פעם אחת כשהמכשיר מחובר.', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}})));
});
