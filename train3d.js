// Word Train (docs/MOTION-CONCEPT.md §5, increment M4). Each word tile becomes a
// carriage; "Go, train!" sends the train once round a loop while the voice reads
// the carriages in order. Swap two carriages to change the word order.
// 3D uses three.js (MIT, vendor/three, loaded only here) at motion level 2+;
// otherwise, or if WebGL fails, the same train is a flat SVG side view.
// The camera never moves by itself, and nothing renders while the train is still.
import * as M from "./motion-core.js";

export default function wordTrain(k, { wordItem, esc, turn }) {
  let cars = [], pick = null, view = null, gone = false;
  k.scene(`<div class="pk-t3"><div class="pk-t3-stage" aria-hidden="true"></div>
    <ol class="pk-cars" aria-label="Carriages, in order. Tap two to swap them."></ol>
    <div class="pk-t3-row"><button type="button" class="pk-go" disabled>Go, train!</button><button type="button" class="ghost-btn pk-off" disabled>Take one off</button></div></div>`);
  k.note("Tap words to add carriages. Then send the train.");
  const stage = k.el(".pk-t3-stage"), list = k.el(".pk-cars"), go = k.el(".pk-go"), off = k.el(".pk-off");
  k.onClose(() => { gone = true; view?.dispose(); });

  // Carriage colours are the board's own word colours (Fitzgerald Key).
  const probe = document.createElement("span"); probe.className = "tile"; probe.hidden = true; document.body.append(probe);
  const colour = (c) => { probe.dataset.c = c; probe.hidden = false; const v = getComputedStyle(probe).backgroundColor; probe.hidden = true; return v; };
  k.onClose(() => probe.remove());
  const item = (w) => { const it = wordItem(w); return { ...it, bg: colour(it.c) }; };

  const draw = () => {
    list.innerHTML = cars.map((w, i) => { const it = wordItem(w); return `<li><button type="button" class="pk-car${pick === i ? " is-lit" : ""}" data-i="${i}" data-c="${esc(it.c)}"><span aria-hidden="true">${esc(it.e || "")}</span> ${esc(w)}</button></li>`; }).join("");
    go.disabled = !cars.length; off.disabled = !cars.length;
    k.strip(cars);
    view?.set(cars.map(item));
  };
  list.addEventListener("click", (e) => {
    const b = e.target.closest(".pk-car"); if (!b) return;
    const i = +b.dataset.i;
    if (pick == null) { pick = i; k.say(cars[i]); }
    else { if (pick !== i) { cars = M.trainSwap(cars, pick, i); k.chime(700); k.say(cars.join(" ")); } pick = null; }
    draw();
  });
  k.tiles(M.TRAIN_WORDS.slice(0, Math.max(6, k.settings.tiles)), (w) => {
    if (cars.length >= M.TRAIN_MAX) { k.note("The train is full. Send it, or take one off."); return; }
    cars = M.trainCouple(cars, w); pick = null; k.chime(560 + cars.length * 40); k.piece(); draw();
    k.note(cars.length === 1 ? "Add more words, or send the train." : `${cars.length} carriages. Tap two to swap them.`);
  });
  off.addEventListener("click", () => { cars = M.trainUncouple(cars); pick = null; draw(); });
  go.addEventListener("click", () => {
    if (!cars.length) return;
    turn(); const s = cars.join(" "); k.say(s); k.chime(880); k.piece(cars.length >= 3 ? "landmark" : "try");
    go.disabled = true;
    const ms = view?.run(cars.length) ?? 0;
    cars.forEach((_, i) => k.timer(() => { list.querySelectorAll(".pk-car").forEach((b) => b.classList.toggle("is-lit", +b.dataset.i === i)); view?.light(i); }, 250 + i * 600));
    k.timer(() => { list.querySelectorAll(".pk-car").forEach((b) => b.classList.remove("is-lit")); view?.light(-1); go.disabled = false; k.note(`${s}. All aboard!`); }, Math.max(ms, 250 + cars.length * 600 + 300));
  });

  const flat = () => { if (!gone) { view = flatTrain(stage, k); draw(); } };
  if (k.level() < 2 || !hasWebGL()) return flat();
  import("./vendor/three/three.module.min.js")
    .then((THREE) => { if (gone) return; try { view = threeTrain(THREE, stage, k); draw(); } catch { flat(); } })
    .catch(flat);
}

function hasWebGL() {
  try { const c = document.createElement("canvas"); return !!c.getContext("webgl"); } catch { return false; }
}

// ---------- Flat SVG train (motion levels 0 and 1, older tablets) ----------
function flatTrain(stage, k) {
  stage.classList.add("is-flat");
  let n = 0;
  const render = (cs) => {
    n = cs.length;
    const w = 120 + cs.length * 110;
    stage.innerHTML = `<svg class="pk-flat" viewBox="0 0 ${w} 110" role="img" aria-label="The train">
      <line x1="0" y1="96" x2="${w}" y2="96" class="pk-rail"/>
      <g class="pk-flat-train">
      ${cs.map((c, i) => `<g class="pk-fcar" data-i="${i}" transform="translate(${(cs.length - 1 - i) * 110 + 4},20)"><rect width="100" height="62" rx="10" fill="${c.bg}" stroke="#22313d" stroke-width="3"/><text x="50" y="30" text-anchor="middle" font-size="22">${c.e || ""}</text><text x="50" y="54" text-anchor="middle" font-size="16" font-weight="800" fill="#1c2630">${c.w.replace(/[<&]/g, "")}</text><circle cx="24" cy="70" r="9" fill="#22313d"/><circle cx="76" cy="70" r="9" fill="#22313d"/></g>`).join("")}
      <g transform="translate(${cs.length * 110 + 4},8)"><rect x="0" y="22" width="70" height="52" rx="8" fill="#2f6fb3"/><rect x="40" y="0" width="34" height="74" rx="7" fill="#22313d"/><rect x="47" y="8" width="20" height="16" rx="3" fill="#f2b33d"/><circle cx="20" cy="82" r="10" fill="#22313d"/><circle cx="56" cy="82" r="10" fill="#22313d"/></g>
      </g></svg>`;
  };
  return {
    set: render,
    light(i) { stage.querySelectorAll(".pk-fcar").forEach((g) => g.classList.toggle("is-lit", +g.dataset.i === i)); },
    run() {
      const t = stage.querySelector(".pk-flat-train");
      if (k.level() < 2 || !t?.animate) return 0;
      const ms = 2400 + n * 300;
      t.animate([{ transform: "translateX(0)" }, { transform: "translateX(6%)" }, { transform: "translateX(0)" }], { duration: ms, easing: "ease-in-out" });
      return ms;
    },
    dispose() {},
  };
}

// ---------- 3D train (three.js) ----------
function threeTrain(THREE, stage, k) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 6.2, 8.8); camera.lookAt(0, 0, 0.6);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 10, 6); scene.add(sun);

  // Ground and a loop of track, flat shapes with no outlines (DESIGN.md §7).
  const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshLambertMaterial({ color: 0xcbc4b3 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const loop = (rx, rz) => new THREE.CatmullRomCurve3(Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * rx, 0.06, Math.sin(a) * rz); }), true);
  const path = loop(5, 2.7);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x5b5346 });
  for (const d of [-0.28, 0.28]) scene.add(new THREE.Mesh(new THREE.TubeGeometry(loop(5 + d, 2.7 + d), 200, 0.05, 6, true), railMat));
  const bed = new THREE.Mesh(new THREE.TubeGeometry(path, 200, 0.36, 4, true), new THREE.MeshLambertMaterial({ color: 0xb3ab98 }));
  bed.scale.y = 0.15; scene.add(bed);

  const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14); wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x22313d });
  const wheels = (g, len) => { for (const z of [-len / 2 + 0.3, len / 2 - 0.3]) for (const x of [-0.42, 0.42]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, 0.22, z); g.add(w); } };

  // The engine leads; its long side runs along +z so lookAt points it down the track.
  const engine = new THREE.Group();
  const eb = box(0.9, 0.7, 1.5, 0x2f6fb3); eb.position.set(0, 0.6, 0.15); engine.add(eb);
  const cab = box(0.95, 1.1, 0.7, 0x22313d); cab.position.set(0, 0.8, -0.55); engine.add(cab);
  const win = box(0.97, 0.35, 0.4, 0xf2b33d); win.position.set(0, 1.05, -0.55); engine.add(win);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 12), new THREE.MeshLambertMaterial({ color: 0xc7651c })); stack.position.set(0, 1.15, 0.55); engine.add(stack);
  wheels(engine, 1.8); scene.add(engine);

  let carObjs = [], head = 0.27, raf = 0, dead = false, lit = -1;
  const label = (c) => {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(6, 6, 244, 116, 22); g.fill();
    g.lineWidth = 6; g.strokeStyle = "#22313d"; g.stroke();
    g.textAlign = "center"; g.fillStyle = "#1c2630";
    g.font = "44px system-ui, sans-serif"; g.fillText(c.e || "", 128, 56);
    g.font = "800 34px 'Atkinson Hyperlegible Next', system-ui, sans-serif"; g.fillText(c.w, 128, 104);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false })); s.scale.set(2.1, 1.05, 1); s.position.y = 1.95; s.renderOrder = 2;
    return s;
  };
  const makeCar = (c) => {
    const g = new THREE.Group();
    const body = box(0.9, 0.75, 1.3, new THREE.Color(c.bg)); body.position.y = 0.62; g.add(body);
    const roof = box(1, 0.1, 1.4, 0x22313d); roof.position.y = 1.04; g.add(roof);
    wheels(g, 1.3); g.add(label(c)); g.userData = { body, w: c.w };
    return g;
  };
  const place = (obj, t) => { const p = path.getPointAt(t), d = path.getTangentAt(t); obj.position.set(p.x, 0, p.z); obj.lookAt(p.x + d.x, 0, p.z + d.z); };
  const layout = () => { place(engine, head); carObjs.forEach((o, i) => place(o, M.carT(i + 1, head) )); };

  const size = () => {
    const w = stage.clientWidth || 600, h = stage.clientHeight || 300; renderer.setSize(w, h, false); camera.aspect = w / h;
    const far = Math.min(2.6, Math.max(1, 1.45 / camera.aspect)); // a tall, narrow phone pulls the camera back so the whole loop fits
    camera.position.set(0, 6.2 * far, 8.8 * far); camera.lookAt(0, 0, 0.6); camera.updateProjectionMatrix(); render();
  };
  const render = () => { if (!dead) renderer.render(scene, camera); };
  const ro = new ResizeObserver(size); ro.observe(stage);

  return {
    set(cs) {
      const keep = new Map(carObjs.map((o) => [o.userData.w + "|" + o.userData.body.material.color.getHexString(), o]));
      carObjs.forEach((o) => scene.remove(o));
      carObjs = cs.map((c) => { const key = c.w + "|" + new THREE.Color(c.bg).getHexString(); const o = keep.get(key) || makeCar(c); keep.delete(key); scene.add(o); return o; });
      keep.forEach((o) => o.traverse((x) => { x.geometry?.dispose?.(); x.material?.map?.dispose?.(); x.material?.dispose?.(); }));
      layout(); size();
    },
    light(i) {
      lit = i;
      carObjs.forEach((o, j) => { o.userData.body.material.emissive?.setHex(j === i ? 0x5a4210 : 0x000000); o.scale.setScalar(j === i ? 1.08 : 1); });
      render();
    },
    // Once round the loop. Gentle ease in and out; skies-on is slower than "Small".
    run(n) {
      if (k.level() < 2) return 0;
      const ms = (k.level() >= 3 ? 5200 : 3800) + n * 250, t0 = performance.now(), from = head;
      cancelAnimationFrame(raf);
      const step = (now) => {
        if (dead) return;
        const x = Math.min(1, (now - t0) / ms), e = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        head = (from + e) % 1; layout(); render();
        if (x < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return ms;
    },
    dispose() {
      dead = true; cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((x) => { x.geometry?.dispose?.(); x.material?.map?.dispose?.(); x.material?.dispose?.(); });
      renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
    },
  };
}
