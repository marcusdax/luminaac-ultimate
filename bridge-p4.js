// Bridge, Phase 4: speech-model download and status, live face-estimate check,
// install/offline status. Everything here runs on this device.
import * as ai from "./ai.js";
import * as emo from "./emotion.js";
const $ = (s, el = document) => el.querySelector(s);

// ---- Speech feelings model ----
async function serState() {
  const have = await ai.cached("ser");
  $("#serState").textContent = have ? "The speech feelings model is on this device and works offline." : `The speech feelings model isn't downloaded yet (about ${ai.MODELS.ser.mb} MB). It downloads the first time it's needed, or now.`;
  $("#btnSerLoad").hidden = have;
}
async function loadSer() {
  const prog = $("#serProg"), btn = $("#btnSerLoad");
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  try {
    const r = await ai.load("ser", { onProgress: (p) => { prog.value = p.pct; $("#serState").textContent = `Downloading the speech feelings model… ${p.pct}% (${p.mb} of about ${ai.MODELS.ser.mb} MB)`; } });
    $("#serState").textContent = `Ready. Running on this device with ${r.backend === "webgpu" ? "the graphics chip (WebGPU)" : "WebAssembly"}. It works offline from now on.`;
    btn.hidden = true;
  } catch (e) { $("#serState").textContent = `Couldn't get the model (${e.message}). Feelings still come from pitch, loudness and pace.`; }
  finally { btn.disabled = false; prog.hidden = true; }
}
$("#btnSerLoad").addEventListener("click", loadSer);
$("#formFeel").addEventListener("change", (e) => { if (e.target.name === "ser" && e.target.checked) ai.cached("ser").then((h) => !h && loadSer()); });
window.addEventListener("bridge:feelprefs", serState);

// ---- Live face estimate check (camera, opt-in, nothing recorded) ----
let stream = null;
async function stopCam() { stream?.getTracks().forEach((t) => t.stop()); stream = null; $("#faceTry").hidden = true; $("#btnFaceTry").textContent = "Try the face estimate with the camera"; }
$("#btnFaceTry").addEventListener("click", async () => {
  if (stream) return stopCam();
  const out = $("#faceOut"); $("#faceTry").hidden = false;
  if (window.__pottyBusy?.()) { out.textContent = "The camera stays off during a toilet try."; return; }
  if (!navigator.mediaDevices?.getUserMedia) { out.textContent = "This browser can't use a camera here. Face estimates still work on recorded videos."; return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640 }, audio: false }); }
  catch (e) { out.textContent = e.name === "NotFoundError" || e.name === "OverconstrainedError" ? "No camera found on this device. Face estimates still work on recorded videos." : "Camera permission wasn't given, so nothing was checked. You can allow it in the browser's site settings."; $("#faceTry").hidden = false; return; }
  const v = $("#faceVid"); v.srcObject = stream; await v.play().catch(() => {});
  $("#btnFaceTry").textContent = "Stop the camera";
  out.textContent = "Loading the face models (they're part of the app)…";
  const tick = async () => {
    if (!stream) return;
    const r = await emo.fromImage(v).catch((e) => ({ status: "unavailable", error: e.message }));
    const L = r.label && emo.LABELS[r.label];
    out.textContent = L ? `${L.e} Looks ${L.t} (${Math.round(r.conf * 100)}% sure). Only a guess, checked right here.` : r.status === "no-face" ? "No face in view. Try facing the camera in good light." : r.status === "no-video" ? "Waiting for the camera…" : `The face estimate can't run here (${r.error || r.status}).`;
    setTimeout(tick, 1200);
  };
  tick();
});
window.addEventListener("bridge:show", (e) => { if (e.detail !== "privacy") stopCam(); });

// ---- Install / offline status ----
function pwaState() {
  const el = $("#pwaState"); if (!el) return;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  el.textContent = standalone ? "Installed. It opens on its own and works offline." : "serviceWorker" in navigator ? "Works offline in this browser after the first visit." : "This browser can't keep the app offline.";
}
pwaState(); navigator.serviceWorker?.ready.then(pwaState);
serState();
