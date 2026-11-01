// Bridge, Phase 6: draw zones by hand, stylus or point by point, and water danger zones.
// Shapes are saved with the other zones (db.safety.zones) so they sync to My Voice
// and the native app, which check them on the device. Same document as bridge.js.
import { fetchWater } from "./water.js";
import { scanWaterTiles } from "./water-tiles.js";
import { currentPosition, distToShape } from "./geo.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const safety = () => db().safety;
const water = () => (safety().water ||= { on: false, buffer: 30, radius: 1500, features: [], fetchedAt: 0, centers: [] });
water();
const box = $("#zoneMap");
const map = () => B.safetyMap;
const Lf = () => window.L;
const status = (t) => ($("#drawStatus").textContent = t);
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const DRAW = { color: "#c9781a", weight: 3, dashArray: "6 6", fillOpacity: 0.12 };

// =============== Drawing ===============
let mode = null, pts = [], hist = [], stroke = null, live = null, preview = null, penSeen = false, activePointer = null, edit = null;

function buttons() {
  const busy = !!mode || !!edit;
  $("#btnDrawFree").setAttribute("aria-pressed", String(mode === "free"));
  $("#btnDrawPoints").setAttribute("aria-pressed", String(mode === "points"));
  $("#btnDrawHere").hidden = mode !== "points";
  $("#drawCross").hidden = mode !== "points";
  for (const id of ["#btnDrawUndo", "#btnDrawDone", "#btnDrawCancel"]) $(id).hidden = !busy;
  $("#btnDrawUndo").disabled = !(edit ? edit.hist.length : pts.length || hist.length);
}
function setMode(m) {
  mode = m; B.drawing = !!m;
  const M = map();
  box.classList.toggle("is-drawing", m === "free");
  if (M) for (const h of ["dragging", "touchZoom", "doubleClickZoom", "boxZoom"]) M[h][m === "free" ? "disable" : "enable"]();
  buttons();
}
function showPreview() {
  preview?.remove(); preview = null;
  const L = Lf(); if (!L || !map() || !pts.length) return;
  preview = L.layerGroup([pts.length > 2 ? L.polygon(pts, DRAW) : L.polyline(pts, DRAW), ...pts.map((p) => L.circleMarker(p, { radius: 5, color: "#22313d", weight: 2, fillColor: "#fff", fillOpacity: 1 }))]).addTo(map());
}
// Turn a raw stroke into a tidy polygon: Douglas-Peucker on screen pixels (simplify-js),
// so a shaky finger and a precise stylus both give a handful of clean corners.
export function simplifyStroke(latlngs, M, tolPx = 4) {
  const px = latlngs.map((ll) => M.latLngToLayerPoint(ll));
  let s = window.simplify ? window.simplify(px.map((p) => ({ x: p.x, y: p.y })), tolPx, false) : px;
  if (s.length > 1 && Math.hypot(s[0].x - s[s.length - 1].x, s[0].y - s[s.length - 1].y) < tolPx * 3) s = s.slice(0, -1);
  while (s.length > 200) s = s.filter((_, i) => i % 2 === 0);
  return s.map((p) => { const ll = M.layerPointToLatLng(Lf().point(p.x, p.y)); return [r5(ll.lat), r5(ll.lng)]; });
}
function startDraw(m) {
  if (!map()) return B.toast("The map isn't available. Add a zone with the form instead.");
  cancelEdit(); pts = []; hist = []; showPreview(); $("#formShape").hidden = true;
  setMode(mode === m ? null : m);
  if (mode === "free") status("Draw around the place with your finger, mouse or pen. Lift to finish the loop. With a pen, resting your hand on the screen is ignored.");
  else if (mode === "points") { status("Move the map with the arrow keys or by dragging so the cross is on a corner, then choose Add point at the centre. You can also tap the map. Add at least 3 points."); box.focus(); }
  else status("");
}
const toLL = (e) => { const ll = map().mouseEventToLatLng(e); return [ll.lat, ll.lng]; };
const width = (e) => (e.pointerType === "pen" && e.pressure > 0 ? 2 + e.pressure * 6 : 4);
box.addEventListener("pointerdown", (e) => {
  if (mode !== "free") return;
  if (e.pointerType === "pen") penSeen = true;
  if (penSeen && e.pointerType === "touch") { e.stopPropagation(); return; } // palm rejection: once a pen is used, touches don't draw
  if (activePointer !== null || !e.isPrimary || e.button > 0) return;
  e.preventDefault(); e.stopPropagation();
  activePointer = e.pointerId; try { box.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
  stroke = [toLL(e)];
  live = Lf().polyline(stroke, { color: "#22313d", weight: width(e), opacity: 0.9 }).addTo(map());
}, true);
box.addEventListener("pointermove", (e) => {
  if (e.pointerId !== activePointer) return;
  e.preventDefault(); e.stopPropagation();
  const co = e.getCoalescedEvents?.(); for (const c of co?.length ? co : [e]) stroke.push(toLL(c));
  live.setLatLngs(stroke); live.setStyle({ weight: width(e) });
}, true);
function endStroke(e) {
  if (e.pointerId !== activePointer) return;
  e.stopPropagation(); activePointer = null; live?.remove(); live = null;
  const shape = stroke.length > 2 ? simplifyStroke(stroke, map()) : [];
  stroke = null;
  if (shape.length < 3) return status("That was too small to make a shape. Draw a bigger loop around the place.");
  hist.push(pts); pts = shape; showPreview(); buttons();
  status(`Shape drawn with ${pts.length} corners. Choose Finish shape to name it, Undo, or draw again to replace it.`);
}
box.addEventListener("pointerup", endStroke, true);
box.addEventListener("pointercancel", endStroke, true);

function addPoint(ll) { pts = [...pts, [r5(ll.lat), r5(ll.lng)]]; showPreview(); buttons(); status(`${pts.length} point${pts.length === 1 ? "" : "s"} added.${pts.length < 3 ? ` Add ${3 - pts.length} more.` : " Add more, or choose Finish shape."}`); }
let hooked = null;
document.addEventListener("safety:drawn", ({ detail: { map: M } }) => {
  if (hooked !== M) {
    hooked = M;
    M.on("click", (e) => { if (mode === "points") addPoint(e.latlng); });
    M.on("zoomend", drawWater);
  }
  drawWater(); showPreview(); if (edit) drawEdit();
});
$("#btnDrawFree").addEventListener("click", () => startDraw("free"));
$("#btnDrawPoints").addEventListener("click", () => startDraw("points"));
$("#btnDrawHere").addEventListener("click", () => addPoint(map().getCenter()));
$("#btnDrawUndo").addEventListener("click", () => {
  if (edit) { if (edit.hist.length) { edit.pts = edit.hist.pop(); drawEdit(); status("Undone."); } return buttons(); }
  if (mode === "points") pts = pts.slice(0, -1); else pts = hist.pop() || [];
  showPreview(); buttons(); status(pts.length ? `Undone. ${pts.length} points.` : "Undone. Nothing drawn yet.");
});
$("#btnDrawCancel").addEventListener("click", () => { if (edit) return cancelEdit(true); pts = []; hist = []; showPreview(); setMode(null); $("#formShape").hidden = true; status("Drawing cancelled."); });
$("#btnDrawDone").addEventListener("click", () => {
  if (edit) return saveEdit();
  if (pts.length < 3) return status("A shape needs at least 3 points.");
  setMode(null); const f = $("#formShape"); f.hidden = false; f.name.focus();
  status("Name the shape and choose what kind of place it is.");
});
$("#btnShapeDiscard").addEventListener("click", () => { pts = []; hist = []; showPreview(); $("#formShape").hidden = true; buttons(); status("Shape discarded."); });
$("#formShape").addEventListener("submit", (e) => {
  e.preventDefault(); const f = e.currentTarget, name = f.name.value.trim();
  if (!name) return f.name.focus();
  const z = { id: "z" + Math.random().toString(36).slice(2, 8), name, type: f.type.value, shape: "poly", pts, buffer: 0 };
  safety().zones.push(z); pts = []; hist = []; showPreview(); f.reset(); f.hidden = true; buttons();
  B.save(`Drew a ${z.type === "danger" ? "danger area" : "safe zone"} "${z.name}"`); B.renderSafety();
  status(`Saved "${z.name}". It syncs to My Voice with your other zones.`);
});

// ---- Edit an existing drawn shape: drag the corners, or focus one and use the arrow keys ----
let editLayer = null;
function drawEdit() {
  editLayer?.remove(); const L = Lf(), M = map(); if (!edit || !L || !M) return;
  const poly = L.polygon(edit.pts, DRAW);
  const handles = edit.pts.map((p, i) => {
    const m = L.marker(p, { draggable: true, keyboard: true, title: `Corner ${i + 1} of ${edit.pts.length}`, alt: `Corner ${i + 1}`, icon: L.divIcon({ className: "vertex-handle", iconSize: [22, 22] }) });
    m.on("dragstart", () => edit.hist.push(edit.pts.map((q) => q.slice())));
    m.on("drag", (ev) => { const ll = ev.target.getLatLng(); edit.pts[i] = [r5(ll.lat), r5(ll.lng)]; poly.setLatLngs(edit.pts); });
    m.on("dragend", buttons);
    m.on("add", () => {
      const el = m.getElement(); el.setAttribute("role", "button"); el.setAttribute("aria-label", `Corner ${i + 1} of ${edit.pts.length}. Arrow keys move it, Delete removes it.`);
      el.addEventListener("keydown", (k) => {
        const step = k.shiftKey ? 20 : 4, d = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[k.key];
        if (d) {
          k.preventDefault(); k.stopPropagation(); edit.hist.push(edit.pts.map((q) => q.slice()));
          const pt = M.latLngToContainerPoint(edit.pts[i]).add(d), ll = M.containerPointToLatLng(pt);
          edit.pts[i] = [r5(ll.lat), r5(ll.lng)]; drawEdit(); editLayer.getLayers()[i + 1].getElement()?.focus(); buttons();
        } else if ((k.key === "Delete" || k.key === "Backspace") && edit.pts.length > 3) {
          k.preventDefault(); edit.hist.push(edit.pts.map((q) => q.slice())); edit.pts.splice(i, 1); drawEdit(); status(`Corner removed. ${edit.pts.length} corners left.`); buttons();
          editLayer.getLayers()[Math.min(i, edit.pts.length - 1) + 1]?.getElement()?.focus();
        }
      });
    });
    return m;
  });
  editLayer = L.layerGroup([poly, ...handles]).addTo(M);
}
function cancelEdit(say) {
  if (!edit) return; edit = null; B.editingZone = null; editLayer?.remove(); editLayer = null; buttons(); B.renderSafety();
  if (say) status("Edit cancelled. The shape wasn't changed.");
}
function saveEdit() {
  const z = safety().zones.find((x) => x.id === edit.id); if (z) z.pts = edit.pts;
  const name = z?.name; edit = null; B.editingZone = null; editLayer?.remove(); editLayer = null;
  B.save(`Changed the shape of "${name}"`); buttons(); B.renderSafety(); status(`Saved the new shape of "${name}".`);
}
$("#zoneList").addEventListener("click", (e) => {
  const id = e.target.closest("[data-editzone]")?.dataset.editzone; if (!id) return;
  const z = safety().zones.find((x) => x.id === id); if (!z || !map()) return;
  setMode(null); pts = []; showPreview();
  edit = { id, pts: z.pts.map((p) => p.slice()), hist: [] }; B.editingZone = id; B.renderSafety();
  map().fitBounds(z.pts, { padding: [30, 30] }); drawEdit(); buttons();
  status(`Editing "${z.name}". Drag a corner, or press Tab to reach a corner and use the arrow keys. Delete removes a corner. Choose Finish shape to save.`);
  editLayer?.getLayers()[1]?.getElement()?.focus();
});

// =============== Water danger zones ===============
let waterLayer = null;
const fmtM = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(/\.0$/, "")} km` : `${m} m`);
function centres() {
  return safety().zones.map((z) => (z.shape === "poly" ? { lat: z.pts.reduce((a, p) => a + p[0], 0) / z.pts.length, lng: z.pts.reduce((a, p) => a + p[1], 0) / z.pts.length } : { lat: z.lat, lng: z.lng }));
}
function drawWater() {
  const L = Lf(), M = map(); if (!L || !M) return;
  waterLayer?.remove(); waterLayer = null;
  const w = water(); if (!w.features.length) return;
  const mpp = (40075016.686 * Math.cos((M.getCenter().lat * Math.PI) / 180)) / 2 ** (M.getZoom() + 8);
  const halo = Math.max(3, (2 * w.buffer) / mpp);
  const layers = [];
  for (const f of w.features) {
    if (f.ignored) continue;
    const ll = f.kind === "poly" ? f.rings.map((r) => [r]) : f.rings[0]; // every ring is an outer edge (holes were dropped), so draw them as separate shapes
    if (w.on) layers.push(f.kind === "point" ? L.circle(ll[0], { radius: w.buffer, color: "#b8372f", weight: 2, dashArray: "4 4", fillOpacity: 0.12, interactive: false }) : (f.kind === "poly" ? L.polygon : L.polyline)(ll, { color: "#b8372f", opacity: 0.22, weight: halo, fill: false, interactive: false, lineJoin: "round" }));
    layers.push(f.kind === "point" ? L.circleMarker(ll[0], { radius: 6, color: "#1d5f8f", fillColor: "#5aa9d6", fillOpacity: 0.9, weight: 2 }).bindTooltip(esc(f.name)) : (f.kind === "poly" ? L.polygon : L.polyline)(ll, { color: "#1d5f8f", weight: f.kind === "line" ? 4 : 2, fillColor: "#5aa9d6", fillOpacity: 0.45 }).bindTooltip(esc(f.name)));
  }
  waterLayer = L.featureGroup(layers).addTo(M);
}
function renderWater() {
  const s = safety(), w = water(), f = $("#formWater");
  $("#waterNeedsConsent").hidden = !!s.consent; f.hidden = !s.consent;
  const live = w.features.filter((x) => !x.ignored).length;
  $("#waterState").textContent = s.consent && w.on ? `On · ${live} place${live === 1 ? "" : "s"}` : "Off";
  f.on.checked = !!w.on; f.buffer.value = w.buffer; f.radius.value = w.radius;
  $("#waterBufOut").textContent = fmtM(w.buffer); $("#waterRadOut").textContent = fmtM(w.radius);
  if (!$("#waterStatus").dataset.busy) $("#waterStatus").textContent = w.fetchedAt ? `${w.features.length} place${w.features.length === 1 ? "" : "s"} with water saved on ${B.fmtDay(w.fetchedAt)} at ${B.fmtTime(w.fetchedAt)}.` : "No water looked up yet.";
  // Closest first, so the list starts with the water that matters most.
  const c0 = w.centers?.[0], dist = (x) => (c0 ? distToShape(c0, x.kind, x.rings) : 0);
  const shown = w.features.map((x) => [dist(x), x]).sort((a, b) => a[0] - b[0]).slice(0, 12);
  $("#waterList").innerHTML = shown.map(([d, x]) => `<li class="water-row${x.ignored ? " is-ignored" : ""}"><b>${esc(x.name)}</b><span class="soft">${{ poly: "area", line: "river or stream", point: "pool" }[x.kind]}${c0 ? ` · ${fmtM(Math.round(d / 10) * 10)} from ${esc(w.from || "the centre")}` : ""}${x.ignored ? " · ignored" : ""}</span><button class="btn quiet small" type="button" data-wignore="${esc(x.id)}" aria-pressed="${!!x.ignored}" aria-label="${x.ignored ? "Watch" : "Ignore"} ${esc(x.name)}">${x.ignored ? "Watch again" : "Ignore"}</button></li>`).join("") + (w.features.length > shown.length ? `<li class="soft">and ${w.features.length - shown.length} more on the map.</li>` : "");
  drawWater();
}
B.renderWater = renderWater;
let saveT = null;
$("#formWater").addEventListener("input", (e) => {
  const w = water(), t = e.target;
  if (t.name === "on") w.on = t.checked; else if (t.name === "buffer") w.buffer = +t.value; else if (t.name === "radius") w.radius = +t.value; else return;
  renderWater(); clearTimeout(saveT);
  saveT = setTimeout(() => B.save(t.name === "on" ? `${w.on ? "Turned on" : "Turned off"} water alerts` : `Water alert setting: ${t.name} ${t.value} m`), t.name === "on" ? 0 : 600);
});
// Two passes. First the blue on the map pictures (water-tiles.js, a few
// seconds), saved and alerting straight away. Then the slower named search
// (Overpass), which replaces it when it answers; if it times out, the map
// shapes stay.
async function find(centers, where) {
  const st = $("#waterStatus"); st.dataset.busy = "1";
  const many = (n, s) => `${n} ${s}${n === 1 ? "" : s.endsWith("h") ? "es" : "s"}`;
  const keep = (found, src) => {
    const w = water(), ignored = new Set(w.features.filter((x) => x.ignored).map((x) => x.id));
    Object.assign(w, { features: found.map((x) => ({ ...x, ...(ignored.has(x.id) && { ignored: true }) })), fetchedAt: Date.now(), src, centers: centers.map((c) => ({ lat: r5(c.lat), lng: r5(c.lng) })), from: where === "you" ? "where you were" : safety().zones[0]?.name || "your zone", on: found.length ? true : w.on });
    B.save(`Found ${many(found.length, "place")} with water near ${where} (${src === "map" ? "map picture" : "OpenStreetMap search"})`); renderWater();
    if (found.length && map()) map().setView([centers[0].lat, centers[0].lng], 15);
  };
  st.textContent = `Looking at the map near ${where}…`;
  for (const b of ["#btnWaterZones", "#btnWaterHere"]) $(b).disabled = true;
  let quick = [];
  try {
    quick = await scanWaterTiles(centers, water().radius, { simplify: window.simplify });
    if (quick.length) keep(quick, "map");
    st.textContent = quick.length ? `Found ${many(quick.length, "patch")} of water on the map. Alerts are on. Looking up their names…` : "No water seen on the map. Double-checking with the map search…";
  } catch { st.textContent = `Looking for water near ${where}… this can take up to a minute.`; }
  try {
    const named = await fetchWater(centers, water().radius, { simplify: window.simplify });
    if (named.length || !quick.length) keep(named, "osm");
    delete st.dataset.busy;
    st.textContent = named.length ? `Found ${many(named.length, "place")} with water. Water alerts are on and will sync to My Voice.` : quick.length ? `Found ${many(quick.length, "patch")} of water on the map. Water alerts are on and will sync to My Voice.` : "No mapped water found nearby. You can still draw a danger area by hand.";
  } catch (err) {
    delete st.dataset.busy;
    st.textContent = quick.length ? `Found ${many(quick.length, "patch")} of water on the map. Alerts are on. (Names couldn't be looked up: ${err.message.toLowerCase()})` : err.message + (water().features.length ? " Your saved water is still being watched." : "");
  } finally { for (const b of ["#btnWaterZones", "#btnWaterHere"]) $(b).disabled = false; }
}
$("#btnWaterZones").addEventListener("click", () => { const c = centres(); if (!c.length) return ($("#waterStatus").textContent = "Add a safe zone first, or choose Find water near me."); find(c, "your zones"); });
$("#btnWaterHere").addEventListener("click", async () => {
  $("#waterStatus").textContent = "Finding where you are…";
  const p = await currentPosition(); if (!p) return ($("#waterStatus").textContent = "Couldn't get your location. Add a safe zone and use Find water near my zones.");
  find([p], "you");
});
$("#waterList").addEventListener("click", (e) => {
  const id = e.target.closest("[data-wignore]")?.dataset.wignore; if (!id) return;
  const f = water().features.find((x) => x.id === id); if (!f) return;
  f.ignored = !f.ignored; B.save(`${f.ignored ? "Ignored" : "Watching"} water: ${f.name}`); renderWater();
});

// Keep in step with the rest of the Safety tab.
const orig = B.renderSafety;
B.renderSafety = () => { orig(); renderWater(); };
document.addEventListener("click", (e) => { if (e.target.closest('[data-tab="safety"]')) setTimeout(renderWater, 0); });
$("#formGeoConsent")?.addEventListener("submit", () => setTimeout(renderWater, 0));
$("#btnGeoOff")?.addEventListener("click", () => setTimeout(() => { if (!safety().water) water(); renderWater(); }, 0));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (mode || edit) && !document.querySelector("dialog[open]")) $("#btnDrawCancel").click(); });
renderWater(); buttons();
