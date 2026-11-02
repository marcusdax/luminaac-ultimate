// Registers the service worker (installable, works offline) and offers an
// "Install app" button where the browser supports it.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  // When an update takes over, the open page may mix old and new files, so
  // reload once: the Bridge straight away, My Voice only while it is out of
  // sight, so a child is never interrupted mid-sentence.
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!had) { had = true; return; } // first install, nothing old to replace
    const go = () => location.reload();
    if (document.hidden || /bridge\.html/.test(location.pathname)) go();
    else addEventListener("visibilitychange", () => document.hidden && go(), { once: false });
  });
}
let deferred = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferred = e;
  document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = false));
});
addEventListener("click", async (e) => {
  const b = e.target.closest("[data-install]"); if (!b || !deferred) return;
  deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; b.hidden = true;
});
addEventListener("appinstalled", () => document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = true)));
