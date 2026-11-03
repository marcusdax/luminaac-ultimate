// One small WebGL sky (docs/MOTION-CONCEPT.md §4). A single fragment shader on
// one canvas, behind whatever the host holds. Runs only at motion level 3: 30
// frames a second at most, half resolution, paused when hidden. Below level 3,
// or if WebGL fails, the host's own CSS background is the sky, so nothing flashes.
import { level, onChange } from "./motion-gate.js";
import { FRAG, VERT, MODES } from "./shaders/sky.js";
import { skyParams, breathPhase } from "./motion-core.js";
import { load } from "./shared.js";

export function mountSky(host, { scene = "day", mode, a, b, c, speed } = {}) {
  if (!host) return null;
  const sp = skyParams(scene, 3);
  const u = { a: a || sp.a, b: b || sp.b, c: c || sp.c, mode: mode ?? sp.mode, speed: speed ?? sp.speed, breath: 0.35, rip: [] };
  let cv = null, gl = null, prog = null, loc = {}, raf = 0, last = 0, t0 = performance.now(), seen = true, dead = false;

  function build() {
    cv = document.createElement("canvas");
    cv.className = "sky-canvas"; cv.setAttribute("aria-hidden", "true");
    gl = cv.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) { cv = null; return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { cv = null; return false; }
    prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { cv = null; return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["u_res", "u_time", "u_speed", "u_breath", "u_mode", "u_a", "u_b", "u_c", "u_rip"]) loc[n] = gl.getUniformLocation(prog, n);
    cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); });
    host.classList.add("has-sky");
    host.prepend(cv);
    new IntersectionObserver(([en]) => { seen = en.isIntersecting; if (seen) loop(); }).observe(cv);
    return true;
  }
  function draw(now) {
    const w = Math.max(1, Math.round(cv.clientWidth / 2)), h = Math.max(1, Math.round(cv.clientHeight / 2));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    const s = (now - t0) / 1000;
    gl.uniform2f(loc.u_res, w, h); gl.uniform1f(loc.u_time, s); gl.uniform1f(loc.u_speed, u.speed);
    gl.uniform1f(loc.u_breath, typeof u.breath === "function" ? u.breath() : u.breath);
    gl.uniform1i(loc.u_mode, u.mode); gl.uniform3fv(loc.u_a, u.a); gl.uniform3fv(loc.u_b, u.b); gl.uniform3fv(loc.u_c, u.c);
    const r = new Float32Array(16);
    u.rip = u.rip.filter((x) => s - x.t < 3).slice(-4);
    u.rip.forEach((x, i) => r.set([x.x, x.y, s - x.t, x.v], i * 4));
    gl.uniform4fv(loc.u_rip, r);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop() {
    cancelAnimationFrame(raf);
    if (dead || !cv || !seen || document.hidden || level() < 3) return;
    raf = requestAnimationFrame((now) => { if (now - last >= 33) { last = now; draw(now); } loop(); });
  }
  function start() {
    if (dead || level() < 3) return;
    if (!cv && !build()) return;
    cv.hidden = false; loop();
  }
  function stop() { dead = true; cancelAnimationFrame(raf); cv?.remove(); cv = null; host.classList.remove("has-sky"); off(); removeEventListener("visibilitychange", vis); }
  const vis = () => loop();
  addEventListener("visibilitychange", vis);
  const off = onChange((lv) => { if (lv < 3) { cancelAnimationFrame(raf); if (cv) cv.hidden = true; } else start(); });
  start();
  return {
    get on() { return !!cv && !cv.hidden; },
    set(o) { Object.assign(u, o); },
    // A ripple from (x, y), 0..1 from the top-left, growing at v pool-heights a second.
    ripple(x, y, v = 0.25) { u.rip.push({ x, y: 1 - y, t: (performance.now() - t0) / 1000, v }); },
    stop,
  };
}

// Calm: a horizon that rises as he breathes in (4 s) and settles as he breathes
// out (6 s). The grown-up picks the sky in the Bridge. The panel stays dark, so
// its text keeps its contrast.
const CALM = {
  night: { a: [0.133, 0.192, 0.239], b: [0.078, 0.11, 0.141], c: [0.949, 0.702, 0.239] },
  sea: { a: [0.114, 0.227, 0.227], b: [0.071, 0.141, 0.141], c: [0.81, 0.89, 0.886] },
  dawn: { a: [0.29, 0.227, 0.196], b: [0.165, 0.129, 0.114], c: [0.949, 0.702, 0.239] },
};
export function mountCalmSky(host) {
  let sky = null, since = null;
  const pick = () => CALM[load().games?.settings?.play?.calmSky] || CALM.night;
  const breath = () => (since == null ? 0.35 : 0.15 + 0.5 * breathPhase(Date.now() - since));
  return {
    active(on) {
      if (!on) { sky?.stop(); sky = null; return; }
      if (!sky) sky = mountSky(host, { ...pick(), mode: MODES.breath, speed: 1 / 90 });
      sky?.set({ ...pick(), breath });
    },
    breathe(t) { since = t; },
  };
}
