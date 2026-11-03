// The website hero (docs/MOTION-CONCEPT.md, zone 5): the logo's lit wave as a
// slow 3D ribbon over the dusk band. three.js loads only on this page. With
// reduced motion it draws one still frame; without WebGL the logo stays.
const host = document.getElementById("heroArt");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const webgl = (() => { try { return !!document.createElement("canvas").getContext("webgl"); } catch { return false; } })();

if (host && webgl) import("./vendor/three/three.module.min.js").then((THREE) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 50);
  camera.position.set(0, 1.2, 9); camera.lookAt(0, 0, 0);

  // Two ribbons: the lit wave, and a fainter echo behind it.
  const ribbon = (color, opacity, z, amp) => {
    const geo = new THREE.PlaneGeometry(12, 0.5, 160, 1);
    const base = geo.attributes.position.array.slice();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide }));
    mesh.position.z = z; mesh.rotation.x = -0.35; scene.add(mesh);
    return (t) => {
      const p = geo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const x = base[i];
        p[i + 1] = base[i + 1] + Math.sin(x * 0.55 + t) * amp + Math.sin(x * 0.21 - t * 0.6) * amp * 0.5;
        p[i + 2] = Math.cos(x * 0.4 + t * 0.8) * 0.35;
      }
      geo.attributes.position.needsUpdate = true;
    };
  };
  const waves = [ribbon(0xf2b33d, 0.95, 0, 0.55), ribbon(0x8f9ea9, 0.35, -1.2, 0.8)];

  const size = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const frame = (ms) => { const t = ms / 1000 * 0.35; waves.forEach((f) => f(t)); renderer.render(scene, camera); };
  size(); frame(2000); host.classList.add("is-3d");
  new ResizeObserver(() => { size(); frame(performance.now()); }).observe(host);
  if (reduced) return;

  // Slow, about 18 s a full sway, 30 frames a second, and only while on screen.
  let raf = 0, last = 0, seen = true;
  const loop = (now) => { raf = requestAnimationFrame(loop); if (!seen || document.hidden || now - last < 33) return; last = now; frame(now); };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; }).observe(host);
  raf = requestAnimationFrame(loop);
}).catch(() => {});
