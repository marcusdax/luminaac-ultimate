// Photo symbols and recorded caregiver voices, per word or button.
// Everything stays on this device: blobs in IndexedDB ("luminaac-media"), and a
// small index in localStorage so tiles know what to look for without opening IDB.
// Nothing here is synced or uploaded. Pure helpers are exported for tests.
export const INDEX = "luminaac:symbols";
export const keyOf = (text) => String(text || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);

// Square crop: zoom >= 1, cx/cy in 0..1 pick the centre. Returns the source rectangle.
export function cropRect(w, h, zoom = 1, cx = 0.5, cy = 0.5) {
  const side = Math.min(w, h) / Math.max(1, zoom);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const x = clamp(cx * w - side / 2, 0, w - side), y = clamp(cy * h - side / 2, 0, h - side);
  return { x: Math.round(x), y: Math.round(y), side: Math.round(side) };
}

const hasLS = () => typeof localStorage !== "undefined";
export function index() {
  if (!hasLS()) return { photos: {}, voices: {} };
  try { const v = JSON.parse(localStorage.getItem(INDEX)); return { photos: v?.photos || {}, voices: v?.voices || {} }; } catch { return { photos: {}, voices: {} }; }
}
function setIndex(fn) { const i = index(); fn(i); try { localStorage.setItem(INDEX, JSON.stringify(i)); } catch {} return i; }
export const hasPhoto = (t) => !!index().photos[keyOf(t)];
export const hasVoice = (t) => !!index().voices[keyOf(t)];

function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no idb"));
    const r = indexedDB.open("luminaac-media", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("clips");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function put(id, blob) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction("clips", "readwrite"); tx.objectStore("clips").put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function get(id) { const db = await idb(); return new Promise((res) => { const r = db.transaction("clips").objectStore("clips").get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
async function del(id) { const db = await idb(); return new Promise((res) => { const tx = db.transaction("clips", "readwrite"); tx.objectStore("clips").delete(id); tx.oncomplete = res; }); }

export async function savePhoto(text, blob) { const k = keyOf(text); await put("sym-photo:" + k, blob); setIndex((i) => (i.photos[k] = { t: Date.now(), label: String(text).slice(0, 80) })); }
export async function saveVoice(text, blob) { const k = keyOf(text); await put("sym-voice:" + k, blob); setIndex((i) => (i.voices[k] = { t: Date.now(), label: String(text).slice(0, 80) })); }
export async function remove(text, kind) { const k = keyOf(text); await del(`sym-${kind}:${k}`).catch(() => {}); setIndex((i) => delete i[kind === "photo" ? "photos" : "voices"][k]); }
export const getPhoto = (t) => get("sym-photo:" + keyOf(t)).catch(() => null);
export const getVoice = (t) => get("sym-voice:" + keyOf(t)).catch(() => null);

// Put the photo into a tile's picture spot. Keeps the emoji if there's no photo or it fails.
const urls = new Map();
export async function applyPhoto(pic, text) {
  if (!pic || !hasPhoto(text)) return false;
  const k = keyOf(text);
  let url = urls.get(k);
  if (!url) { const b = await getPhoto(text); if (!b) return false; url = URL.createObjectURL(b); urls.set(k, url); }
  pic.textContent = ""; const img = document.createElement("img"); img.src = url; img.alt = ""; img.className = "sym-photo"; pic.append(img);
  return true;
}
// Play the caregiver's recording for this exact word or phrase. Resolves true if it played.
let playing = null;
export async function playVoice(text, volume = 1) {
  if (!hasVoice(text)) return false;
  const b = await getVoice(text); if (!b) return false;
  try { playing?.pause(); } catch {}
  const url = URL.createObjectURL(b), a = new Audio(url); a.volume = volume; playing = a;
  a.onended = () => URL.revokeObjectURL(url);
  try { await a.play(); return true; } catch { return false; }
}
// Crop a loaded image (HTMLImageElement or ImageBitmap) to a square JPEG blob.
export function cropToBlob(img, { zoom = 1, cx = 0.5, cy = 0.5, size = 320 } = {}) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, r = cropRect(w, h, zoom, cx, cy);
  const c = document.createElement("canvas"); c.width = c.height = size;
  c.getContext("2d").drawImage(img, r.x, r.y, r.side, r.side, 0, 0, size, size);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
}
