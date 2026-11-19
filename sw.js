// LuminAAC service worker: offline app shell + offline AI libraries.
//  • App files: precached on install, served cache-first, refreshed in the background.
//  • Pages: network first, falling back to the cached copy when offline.
//  • Pinned CDN libraries (Transformers.js, kokoro-js, Human) and Google Fonts:
//    cache-first after the first use, so on-device AI keeps working offline.
//  • Model weights from the Hugging Face hub are cached by Transformers.js itself
//    ("transformers-cache"); Human's models are vendored locally under vendor/human.
//  • The backend API (/api/…) and map tiles are never cached here.
const VERSION = "luminaac-v0.8.0";
const SHELL = `${VERSION}-shell`, CDN = `${VERSION}-cdn`;
const FILES = [
  "./", "index.html", "bridge.html", "manifest.webmanifest", "bridge.webmanifest", "favicon.svg",
  "tokens.css", "app.css", "myvoice.css", "bridge.css", "phase3.css", "phase4.css", "support.css", "brand/brand-tokens.css",
  "brand/logo-mark.svg",
  "app.js", "myvoice.js", "access.js", "shared.js", "speech.js", "vocab.js", "slp.js", "obf.js", "support.js", "myvoice-p3.js", "myvoice-p4.js",
  "bridge.js", "bridge-plus.js", "bridge-p3.js", "bridge-p4.js", "emotion.js", "geo.js", "fl-core.js", "motion-lite.js",
  "ai.js", "ai-worker.js", "byok.js", "clinical.js", "masternex-prince-fl.js", "symphony.js", "biometrics.js", "safety-blanket.js", "pwa.js",
  "vendor/motion.js", "vendor/qrcode.js", "vendor/jsQR.js", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png",
  "vendor/openmoji/1F198.svg", "vendor/openmoji/1F300.svg", "vendor/openmoji/1F333.svg", "vendor/openmoji/1F34C.svg",
  "vendor/openmoji/1F34E.svg", "vendor/openmoji/1F355.svg", "vendor/openmoji/1F357.svg", "vendor/openmoji/1F358.svg",
  "vendor/openmoji/1F35D.svg", "vendor/openmoji/1F36A.svg", "vendor/openmoji/1F373.svg", "vendor/openmoji/1F37D.svg",
  "vendor/openmoji/1F388.svg", "vendor/openmoji/1F3A0.svg", "vendor/openmoji/1F3A7.svg", "vendor/openmoji/1F3B5.svg",
  "vendor/openmoji/1F3C1.svg", "vendor/openmoji/1F3CA.svg", "vendor/openmoji/1F3E0.svg", "vendor/openmoji/1F3EB.svg",
  "vendor/openmoji/1F418.svg", "vendor/openmoji/1F420.svg", "vendor/openmoji/1F42D.svg", "vendor/openmoji/1F440.svg",
  "vendor/openmoji/1F446.svg", "vendor/openmoji/1F449.svg", "vendor/openmoji/1F44B.svg", "vendor/openmoji/1F44D.svg",
  "vendor/openmoji/1F455.svg", "vendor/openmoji/1F45F.svg", "vendor/openmoji/1F465.svg", "vendor/openmoji/1F466.svg",
  "vendor/openmoji/1F467.svg", "vendor/openmoji/1F468-200D-1F469-200D-1F467.svg", "vendor/openmoji/1F468.svg", "vendor/openmoji/1F469.svg",
  "vendor/openmoji/1F474.svg", "vendor/openmoji/1F475.svg", "vendor/openmoji/1F49B.svg", "vendor/openmoji/1F4A7.svg",
  "vendor/openmoji/1F4AC.svg", "vendor/openmoji/1F4AD.svg", "vendor/openmoji/1F4B3.svg", "vendor/openmoji/1F4CB.svg",
  "vendor/openmoji/1F4CD.svg", "vendor/openmoji/1F4D6.svg", "vendor/openmoji/1F4DA.svg", "vendor/openmoji/1F4DD.svg",
  "vendor/openmoji/1F4ED.svg", "vendor/openmoji/1F4F1.svg", "vendor/openmoji/1F4FA.svg", "vendor/openmoji/1F501.svg",
  "vendor/openmoji/1F506.svg", "vendor/openmoji/1F50A.svg", "vendor/openmoji/1F527.svg", "vendor/openmoji/1F552.svg",
  "vendor/openmoji/1F57A.svg", "vendor/openmoji/1F58D.svg", "vendor/openmoji/1F5E3.svg", "vendor/openmoji/1F5FA.svg",
  "vendor/openmoji/1F602.svg", "vendor/openmoji/1F60A.svg", "vendor/openmoji/1F60C.svg", "vendor/openmoji/1F610.svg",
  "vendor/openmoji/1F620.svg", "vendor/openmoji/1F622.svg", "vendor/openmoji/1F624.svg", "vendor/openmoji/1F628.svg",
  "vendor/openmoji/1F634.svg", "vendor/openmoji/1F645.svg", "vendor/openmoji/1F64B.svg", "vendor/openmoji/1F64F.svg",
  "vendor/openmoji/1F68C.svg", "vendor/openmoji/1F697.svg", "vendor/openmoji/1F6AA.svg", "vendor/openmoji/1F6AB.svg",
  "vendor/openmoji/1F6B6.svg", "vendor/openmoji/1F6BB.svg", "vendor/openmoji/1F6BD.svg", "vendor/openmoji/1F6CF.svg",
  "vendor/openmoji/1F6D2.svg", "vendor/openmoji/1F6DD.svg", "vendor/openmoji/1F912.svg", "vendor/openmoji/1F914.svg",
  "vendor/openmoji/1F915.svg", "vendor/openmoji/1F917.svg", "vendor/openmoji/1F929.svg", "vendor/openmoji/1F92B.svg",
  "vendor/openmoji/1F932.svg", "vendor/openmoji/1F937.svg", "vendor/openmoji/1F95B.svg", "vendor/openmoji/1F963.svg",
  "vendor/openmoji/1F964.svg", "vendor/openmoji/1F96A.svg", "vendor/openmoji/1F971.svg", "vendor/openmoji/1F9B7.svg",
  "vendor/openmoji/1F9C3.svg", "vendor/openmoji/1F9D1-200D-1F3EB.svg", "vendor/openmoji/1F9D1-200D-2695.svg", "vendor/openmoji/1F9D1.svg",
  "vendor/openmoji/1F9D2.svg", "vendor/openmoji/1F9E3.svg", "vendor/openmoji/1F9E5.svg", "vendor/openmoji/1F9F1.svg",
  "vendor/openmoji/1F9F4.svg", "vendor/openmoji/1F9F8.svg", "vendor/openmoji/1FA7A.svg", "vendor/openmoji/1FA91.svg",
  "vendor/openmoji/1FAA5.svg", "vendor/openmoji/1FAE7.svg", "vendor/openmoji/1FAF4.svg", "vendor/openmoji/1FAF6.svg",
  "vendor/openmoji/2194.svg", "vendor/openmoji/23F3.svg", "vendor/openmoji/23F8.svg", "vendor/openmoji/2600.svg",
  "vendor/openmoji/261D.svg", "vendor/openmoji/26BD.svg", "vendor/openmoji/2705.svg", "vendor/openmoji/270B.svg",
  "vendor/openmoji/274C.svg", "vendor/openmoji/2753.svg", "vendor/openmoji/2757.svg", "vendor/openmoji/2795.svg",
  "vendor/openmoji/2B50.svg", "vendor/openmoji/2B55.svg",
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
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
