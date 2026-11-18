// LuminAAC service worker: offline app shell + offline AI libraries.
//  • App files: precached on install, served cache-first, refreshed in the background.
//  • Pages: network first, falling back to the cached copy when offline.
//  • Pinned CDN libraries (Transformers.js, kokoro-js, Human) and Google Fonts:
//    cache-first after the first use, so on-device AI keeps working offline.
//  • Model weights from the Hugging Face hub are cached by Transformers.js itself
//    ("transformers-cache"); Human's models are vendored locally under vendor/human.
//  • The backend API (/api/…) and map tiles are never cached here.
const VERSION = "luminaac-v0.18.1";
const SHELL = `${VERSION}-shell`, CDN = `${VERSION}-cdn`;
const FILES = [
  "./", "index.html", "bridge.html", "guide.html", "guide.css", "manifest.webmanifest", "bridge.webmanifest", "favicon.svg",
  "tokens.css", "app.css", "myvoice.css", "bridge.css", "phase3.css", "phase4.css", "phase6.css", "phase7.css", "potty.css", "sound.css", "redesign.css", "brand/brand-tokens.css",
  "app.js", "myvoice.js", "access.js", "shared.js", "vocab.js", "myvoice-p3.js", "myvoice-p4.js", "myvoice-p7.js", "potty.js", "potty-core.js", "potty-store.js", "potty-icons.js", "sound-core.js", "sound-store.js", "myvoice-sound.js", "bridge-sound.js", "nav-core.js", "myvoice-redesign.js", "bridge-hubs.js", "bridge-chat.js", "bridge-iot.js", "bridge-links.js", "safety-core.js", "found.html", "found.js", "bridge-yt.js", "bridge-play.js", "play.js", "play-core.js", "play.css", "bridge-notify.js", "bridge-r2.js", "bridge-symbols.js", "symbols.js", "scan-core.js", "e2ee-core.js", "asr.js", "labels-core.js", "bridge-labels.js", "e2ee-store.js", "bridge-e2ee.js",
  "bridge.js", "bridge-plus.js", "bridge-p3.js", "bridge-p4.js", "bridge-p6.js", "bridge-p7.js", "bridge-potty.js", "interests.js", "games.js", "water.js", "water-tiles.js", "emotion.js", "geo.js", "fl-core.js", "motion-lite.js", "motion-core.js", "motion-gate.js", "shader-sky.js", "shaders/sky.js", "train3d.js", "bridge-motion.js", "motion.css", "about.html", "about.css", "hero-wave.js",
  "ai.js", "ai-worker.js", "pwa.js", "dialog-guard.js", "obf-core.js",
  "vendor/motion.js", "vendor/qrcode.js", "vendor/simplify.js", "vendor/jsQR.js", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-shadow.png",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png",
];
// Board symbols (OpenMoji), so a picture never seen before still shows offline. tests/sw.test.mjs keeps this in step with vendor/openmoji/.
const OPENMOJI = ["1F198.svg", "1F300.svg", "1F333.svg", "1F34C.svg", "1F34E.svg", "1F355.svg", "1F357.svg", "1F358.svg", "1F35D.svg", "1F36A.svg", "1F373.svg", "1F37D.svg", "1F388.svg", "1F3A0.svg", "1F3A7.svg", "1F3B5.svg", "1F3C1.svg", "1F3CA.svg", "1F3E0.svg", "1F3EB.svg", "1F418.svg", "1F420.svg", "1F42D.svg", "1F440.svg", "1F446.svg", "1F449.svg", "1F44B.svg", "1F44D.svg", "1F455.svg", "1F45F.svg", "1F465.svg", "1F466.svg", "1F467.svg", "1F468-200D-1F469-200D-1F467.svg", "1F468.svg", "1F469.svg", "1F474.svg", "1F475.svg", "1F49B.svg", "1F4A7.svg", "1F4AC.svg", "1F4AD.svg", "1F4B3.svg", "1F4CB.svg", "1F4CD.svg", "1F4D6.svg", "1F4DA.svg", "1F4DD.svg", "1F4ED.svg", "1F4F1.svg", "1F4FA.svg", "1F501.svg", "1F506.svg", "1F50A.svg", "1F527.svg", "1F552.svg", "1F57A.svg", "1F58D.svg", "1F5E3.svg", "1F5FA.svg", "1F602.svg", "1F60A.svg", "1F60C.svg", "1F610.svg", "1F620.svg", "1F622.svg", "1F624.svg", "1F628.svg", "1F634.svg", "1F645.svg", "1F64B.svg", "1F64F.svg", "1F68C.svg", "1F697.svg", "1F6AA.svg", "1F6AB.svg", "1F6B6.svg", "1F6BB.svg", "1F6BD.svg", "1F6CF.svg", "1F6D2.svg", "1F6DD.svg", "1F912.svg", "1F914.svg", "1F915.svg", "1F917.svg", "1F929.svg", "1F92B.svg", "1F932.svg", "1F937.svg", "1F95B.svg", "1F963.svg", "1F964.svg", "1F96A.svg", "1F971.svg", "1F9B7.svg", "1F9C3.svg", "1F9D1-200D-1F3EB.svg", "1F9D1-200D-2695.svg", "1F9D1.svg", "1F9D2.svg", "1F9E3.svg", "1F9E5.svg", "1F9F1.svg", "1F9F4.svg", "1F9F8.svg", "1FA7A.svg", "1FA91.svg", "1FAA5.svg", "1FAE7.svg", "1FAF4.svg", "1FAF6.svg", "2194.svg", "23F3.svg", "23F8.svg", "2600.svg", "261D.svg", "26BD.svg", "2705.svg", "270B.svg", "274C.svg", "2753.svg", "2757.svg", "2795.svg", "2B50.svg", "2B55.svg"];
FILES.push(...OPENMOJI.map((f) => "vendor/openmoji/" + f));
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
