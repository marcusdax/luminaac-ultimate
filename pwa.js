// Registers the service worker (installable, works offline) and offers an
// "Install app" button where the browser supports it.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
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
