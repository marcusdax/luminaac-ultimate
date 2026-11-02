// LuminAAC service worker: offline app shell + offline AI libraries.
//  • App files: precached on install, served cache-first, refreshed in the background.
//  • Pages: network first, falling back to the cached copy when offline.
//  • Pinned CDN libraries (Transformers.js, kokoro-js, Human) and Google Fonts:
//    cache-first after the first use, so on-device AI keeps working offline.
//  • Model weights from the Hugging Face hub are cached by Transformers.js itself
//    ("transformers-cache"); Human's models are vendored locally under vendor/human.
//  • The backend API (/api/…) and map tiles are never cached here.
const VERSION = "luminaac-v0.14.1";
const SHELL = `${VERSION}-shell`, CDN = `${VERSION}-cdn`;
const FILES = [
  "./", "index.html", "bridge.html", "guide.html", "guide.css", "manifest.webmanifest", "bridge.webmanifest", "favicon.svg",
  "tokens.css", "app.css", "myvoice.css", "bridge.css", "phase3.css", "phase4.css", "phase6.css", "phase7.css", "potty.css", "sound.css", "redesign.css", "brand/brand-tokens.css",
  "app.js", "myvoice.js", "access.js", "shared.js", "vocab.js", "myvoice-p3.js", "myvoice-p4.js", "myvoice-p7.js", "potty.js", "potty-core.js", "potty-store.js", "potty-icons.js", "sound-core.js", "sound-store.js", "myvoice-sound.js", "bridge-sound.js", "nav-core.js", "myvoice-redesign.js", "bridge-hubs.js", "bridge-chat.js", "bridge-iot.js", "bridge-yt.js", "bridge-notify.js", "bridge-r2.js", "bridge-symbols.js", "symbols.js", "scan-core.js", "e2ee-core.js", "asr.js", "labels-core.js", "bridge-labels.js", "e2ee-store.js", "bridge-e2ee.js",
  "bridge.js", "bridge-plus.js", "bridge-p3.js", "bridge-p4.js", "bridge-p6.js", "bridge-p7.js", "bridge-potty.js", "interests.js", "games.js", "water.js", "water-tiles.js", "emotion.js", "geo.js", "fl-core.js", "motion-lite.js",
  "ai.js", "ai-worker.js", "pwa.js",
  "vendor/motion.js", "vendor/qrcode.js", "vendor/simplify.js", "vendor/jsQR.js", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(new Request(f, { cache: "reload" })).catch(() => {})) /* reload: never copy a stale browser-cached file into a new version */)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("luminaac-") && !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    if (req.mode === "navigate") { e.respondWith(networkFirst(req)); return; }
    e.respondWith(cacheFirst(req, SHELL, true)); return;
  }
  if (CDN_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req, CDN, false));
});
async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
  catch { return (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html")) || Response.error(); }
}
async function cacheFirst(req, name, revalidate) {
  const c = await caches.open(name), hit = await c.match(req, { ignoreSearch: name === SHELL });
  const refresh = fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; });
  if (hit) { if (revalidate) refresh.catch(() => {}); return hit; }
  return refresh.catch(() => Response.error());
}

// Web Push: the server sends a short, encrypted { title, body, tag, url, urgent }.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  const title = d.title || "LuminAAC";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "", tag: d.tag || "luminaac", renotify: !!d.urgent, requireInteraction: !!d.urgent,
    icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "bridge.html" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "bridge.html", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.split("#")[0] === target.split("#")[0]);
    if (c) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
