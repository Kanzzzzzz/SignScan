/* SignScan service worker: makes the app work offline after the first visit.
 * - Pages and model files: network first (picks up new exports), cache fallback.
 * - Everything else (hashed JS/CSS, WASM): cache first.
 * Only same-origin GET requests are handled. Nothing is ever sent anywhere.
 */
const CACHE = 'signscan-v1';
const CORE = [
  './',
  './index.html',
  './icon.svg',
  './manifest.webmanifest',
  './models/hand_landmarker.task',
  './models/signscan.onnx',
  './models/labels.json',
  './models/model_meta.json',
  './mediapipe/wasm/vision_wasm_internal.js',
  './mediapipe/wasm/vision_wasm_internal.wasm',
  // Hashed JS/CSS and the onnxruntime .wasm are cached from the first visit (see main.tsx).
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // Optional files (e.g. no trained model yet) must not break installation.
      Promise.all(CORE.map((u) => c.add(u).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        event.data.urls.map((u) =>
          c.match(u).then((hit) => hit || c.add(u).catch(() => undefined)),
        ),
      ),
    ),
  );
});

function isHtml(res) {
  return (res.headers.get('content-type') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const networkFirst = req.mode === 'navigate' || url.pathname.includes('/models/');
  if (networkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Don't cache SPA fallbacks served in place of missing model files.
          if (res.ok && (req.mode === 'navigate' || !isHtml(res))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('./index.html'))
            .then((hit) => hit || new Response('Offline', { status: 503 })),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
