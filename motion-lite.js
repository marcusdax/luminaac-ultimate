// Restrained motion, using Motion (MIT, vendor/motion.js) when present.
// Only three moments move: an alert arriving, a gentle "pop" when something
// is confirmed, and a soft fade for new cards. Everything is skipped when the
// person prefers reduced motion or turned motion off in LuminAAC.
(function () {
  // motion-gate.js decides (docs/MOTION-CONCEPT.md): these need level 2, "UI".
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "off" || +(document.documentElement.dataset.ml ?? 3) < 2;
  const A = () => (window.Motion && window.Motion.animate) || null;
  function run(el, kf, opts) { if (!el || reduced() || !A()) return; try { A()(el, kf, opts); } catch (e) {} }
  window.LuminMotion = {
    arrive: (el) => run(el, { opacity: [0, 1], transform: ["translateY(-8px)", "translateY(0)"] }, { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }),
    pop: (el) => run(el, { transform: ["scale(1)", "scale(1.06)", "scale(1)"] }, { duration: 0.3 }),
    fade: (el) => run(el, { opacity: [0, 1] }, { duration: 0.25 }),
  };
})();
