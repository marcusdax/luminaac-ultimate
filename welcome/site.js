/* LuminAAC website interactions. GSAP + ScrollTrigger + SplitText (GreenSock
   standard licence), Lenis (MIT), and the Luminous Field (field.js).
   Everything has a still version: prefers-reduced-motion or the Still button. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  root.classList.add("js");
  const field = window.LuminField || { ripple() {}, setStill() {}, redraw() {} };
  const mobile = matchMedia("(max-width: 760px)");
  const rm = matchMedia("(prefers-reduced-motion: reduce)");
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  let still = rm.matches || store.get("luminaac-site:still") === "1";
  let sound = store.get("luminaac-site:sound") !== "0";
  const hasGsap = !!window.gsap && !!window.ScrollTrigger;
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ---------- header ---------- */
  const top = $("#top");
  const onScroll = () => top.classList.toggle("is-band", scrollY > 80);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- sky: each section sets the field ---------- */
  function applySky(sec) {
    const day = +(sec.dataset.sky || 0);
    const c = ((mobile.matches && sec.dataset.centerM) || sec.dataset.center || "0.5,0.5").split(",").map(Number);
    field.dayTarget = day; field.warmT = +(sec.dataset.warm || 0);
    field.cxT = c[0]; field.cyT = 1 - c[1]; field.zoomT = +(sec.dataset.zoom || 1) * (innerWidth < innerHeight ? 0.6 : 1); field.glowT = +(sec.dataset.glow || 0.55);
    document.body.classList.toggle("is-day", day > 0.5);
    root.style.setProperty("color-scheme", day > 0.5 ? "light" : "dark");
    $$(".nav a").forEach((a) => a.classList.toggle("is-on", a.getAttribute("href") === "#" + sec.id));
    field.redraw();
  }
  const skies = $$("main > section, .foot");
  const skyIO = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) applySky(e.target); });
  }, { rootMargin: "-50% 0px -50% 0px" });
  skies.forEach((s) => skyIO.observe(s));
  applySky($("#hero"));

  /* ---------- hero: tap the light, it speaks ---------- */
  const WORDS = [["I", "people"], ["want", "action"], ["more", "describe"], ["help", "action"], ["love", "action"], ["you", "people"], ["yes", "social"], ["play", "action"],
    ["hug", "thing"], ["go", "action"], ["hello", "social"], ["me too", "people"], ["again", "describe"], ["happy", "describe"], ["thank you", "social"], ["look", "action"]];
  let wi = 0;
  const lanterns = $("#lanterns");
  function say(text) {
    if (!sound || !("speechSynthesis" in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.92; u.pitch = 1.05; speechSynthesis.speak(u); } catch (e) {}
  }
  function lantern(x, y) {
    const [w, c] = WORDS[wi++ % WORDS.length];
    const el = document.createElement("span");
    el.className = "lantern"; el.dataset.c = c; el.textContent = w;
    el.style.left = x + "px"; el.style.top = y + "px";
    lanterns.appendChild(el);
    field.ripple(x / innerWidth, y / innerHeight, 1);
    say(w);
    if (still) { el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200 }).onfinish = () => el.remove(); return; }
    const drift = (Math.random() - 0.5) * 120;
    el.animate([
      { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
      { transform: "translate(-50%,-70%) scale(1.05)", opacity: 1, offset: 0.12 },
      { transform: `translate(calc(-50% + ${drift}px), calc(-50% - ${Math.min(y, 420)}px)) scale(.75) rotate(${drift / 20}deg)`, opacity: 0 },
    ], { duration: 4200, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => el.remove();
  }
  $("#hero").addEventListener("pointerdown", (e) => {
    if (e.target.closest("a,button")) return;
    lantern(e.clientX, e.clientY);
  });

  /* ---------- sound and still toggles ---------- */
  const soundBtn = $("#soundBtn"), stillBtn = $("#stillBtn");
  soundBtn.setAttribute("aria-pressed", String(sound));
  soundBtn.onclick = () => { sound = !sound; store.set("luminaac-site:sound", sound ? "1" : "0"); soundBtn.setAttribute("aria-pressed", String(sound)); if (!sound) try { speechSynthesis.cancel(); } catch (e) {} };

  /* ---------- manifesto words ---------- */
  const scrub = $(".scrub");
  const KEYS = /^(box,|price|tag|subscription\.)$/;
  scrub.innerHTML = scrub.textContent.trim().split(/\s+/).map((w) => `<span class="w${KEYS.test(w) ? " key" : ""}">${w}</span>`).join(" ");
  const words = $$(".w", scrub);

  /* ---------- story mandala (SVG, drawn on scroll) ---------- */
  (function buildMandala() {
    const svg = $("#storyMandala"); const NS = "http://www.w3.org/2000/svg";
    const g = (cls) => { const e = document.createElementNS(NS, "g"); e.setAttribute("class", cls); svg.appendChild(e); return e; };
    const add = (p, tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.classList.add("m"); p.appendChild(e); return e; };
    const R = 26;
    const outer = g("rot-slow");
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; add(outer, "line", { x1: Math.cos(a) * 82, y1: Math.sin(a) * 82, x2: Math.cos(a) * (i % 2 ? 96 : 104), y2: Math.sin(a) * (i % 2 ? 96 : 104), stroke: i % 4 ? "#64b5f6" : "#f2b33d", "stroke-width": 0.8 }); }
    [80, 84, 106].forEach((r, i) => add(outer, "circle", { cx: 0, cy: 0, r, stroke: i === 1 ? "#f2a7c3" : "#f2b33d", "stroke-width": i === 1 ? 0.5 : 0.9 }));
    const fl = g("rot-rev");
    const centers = [[0, 0]];
    for (let ring = 1; ring <= 2; ring++) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      for (let s = 0; s < ring; s++) {
        const b = a + (2 * Math.PI) / 3; const x = Math.cos(a) * R * ring + Math.cos(b) * R * s, y = Math.sin(a) * R * ring + Math.sin(b) * R * s;
        centers.push([x, y]);
      }
    }
    centers.forEach(([x, y], i) => add(fl, "circle", { cx: x.toFixed(2), cy: y.toFixed(2), r: R, stroke: i === 0 ? "#ffd27a" : i < 7 ? "#f2b33d" : "#7fd6cf", "stroke-width": i < 7 ? 1 : 0.7, opacity: i < 7 ? 0.95 : 0.7 }));
    add(fl, "circle", { cx: 0, cy: 0, r: R * 3, stroke: "#f2b33d", "stroke-width": 1.2 });
    const heart = g("heart");
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(heart, "line", { x1: 0, y1: 0, x2: Math.cos(a) * 20, y2: Math.sin(a) * 20, stroke: "#ffe2a3", "stroke-width": 0.6 }); }
    add(heart, "circle", { cx: 0, cy: 0, r: 5, fill: "#ffd27a", stroke: "none" }).style.filter = "drop-shadow(0 0 6px #f2b33d)";
    $$(".m", svg).forEach((el) => { if (el.getTotalLength) { const L = el.getTotalLength(); el.style.strokeDasharray = L; el.style.strokeDashoffset = still ? 0 : L; el.dataset.len = L; } });
  })();

  /* ---------- constellation of differences ---------- */
  const DIFF = [
    ["Free, forever", "The full app for every family. No trial, no tier, no ads."],
    ["Learns their voice", "It notices the sounds and moments your child already uses, then asks you what they mean."],
    ["Words stay put", "Core words never move, so hands can learn where they live."],
    ["Private by default", "Words and recordings stay on your own devices unless you choose to sync."],
    ["Works offline", "No signal at the doctor's? It still speaks."],
    ["Calm by design", "No ads, no clutter, no flashing. One lit word at a time."],
    ["Plays well with others", "Bring boards from other AAC apps, or take yours with you."],
    ["Open source", "MIT licensed. No one can lock it away, not even us."],
  ];
  const nodesWrap = $(".c-nodes"), panel = $("#cPanel"), lines = $(".c-lines");
  const NS = "http://www.w3.org/2000/svg";
  [70, 128, 168, 196].forEach((r, i) => { const c = document.createElementNS(NS, "circle"); c.setAttribute("r", r); c.setAttribute("stroke", i % 2 ? "rgba(100,181,246,.35)" : "rgba(242,179,61,.4)"); c.setAttribute("stroke-width", i === 2 ? 1.2 : 0.7); c.setAttribute("stroke-dasharray", i === 3 ? "2 6" : ""); lines.appendChild(c); });
  const pts = DIFF.map((_, i) => { const a = (i / DIFF.length) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * 168, Math.sin(a) * 168]; });
  pts.forEach(([x, y], i) => {
    const l = document.createElementNS(NS, "line"); l.setAttribute("x1", 0); l.setAttribute("y1", 0); l.setAttribute("x2", x); l.setAttribute("y2", y);
    l.setAttribute("stroke", "rgba(242,179,61,.45)"); l.setAttribute("stroke-width", 0.9); l.dataset.i = i; lines.appendChild(l);
    const [nx, ny] = pts[(i + 3) % pts.length];
    const s = document.createElementNS(NS, "line"); s.setAttribute("x1", x); s.setAttribute("y1", y); s.setAttribute("x2", nx); s.setAttribute("y2", ny);
    s.setAttribute("stroke", "rgba(127,214,207,.22)"); s.setAttribute("stroke-width", 0.6); lines.appendChild(s);
  });
  let cSel = 0, cAuto = null;
  DIFF.forEach(([t], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "c-node"; b.role = "tab"; b.id = "cn" + i; b.setAttribute("aria-controls", "cPanel");
    b.innerHTML = `<span class="star" aria-hidden="true"></span>${t}`;
    b.style.left = 50 + (pts[i][0] / 400) * 100 + "%"; b.style.top = 50 + (pts[i][1] / 400) * 100 + "%";
    b.onclick = () => { stopAuto(); pick(i, true); };
    b.onkeydown = (e) => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (d) { e.preventDefault(); stopAuto(); pick((cSel + d + DIFF.length) % DIFF.length, true); $("#cn" + cSel).focus(); } };
    nodesWrap.appendChild(b);
  });
  function pick(i, fromUser) {
    cSel = i;
    $$(".c-node").forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    $$("line[data-i]", lines).forEach((l) => { const on = +l.dataset.i === i; l.setAttribute("stroke", on ? "#f2b33d" : "rgba(242,179,61,.45)"); l.setAttribute("stroke-width", on ? 2.2 : 0.9); });
    panel.setAttribute("aria-labelledby", "cn" + i);
    panel.innerHTML = `<h3 class="display">${DIFF[i][0]}</h3><p>${DIFF[i][1]}</p>`;
    if (fromUser && !mobile.matches) { const r = $("#cn" + i).getBoundingClientRect(); field.ripple((r.left + r.width / 2) / innerWidth, (r.top + r.height / 2) / innerHeight, 0.7); }
  }
  function stopAuto() { clearInterval(cAuto); cAuto = null; }
  pick(0, false);
  new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting && !still && cAuto === null) cAuto = setInterval(() => pick((cSel + 1) % DIFF.length, false), 4200);
    if (!e.isIntersecting && cAuto) stopAuto();
  }), { threshold: 0.4 }).observe($("#constellation"));
  $("#constellation").addEventListener("pointerenter", stopAuto);

  /* ---------- walkthroughs ---------- */
  const video = $("#seeVideo"), playBtn = $("#playBtn"), cap = $("#seeCap");
  const chapters = $$(".chapter");
  let cur = "talk", seeVisible = false;
  const EXT = video.canPlayType('video/mp4; codecs="avc1.640028"') ? "mp4" : "webm";
  function playIfOk() {
    if (still || !seeVisible) { video.pause(); playBtn.hidden = !still; return; }
    playBtn.hidden = true;
    const p = video.play(); if (p) p.catch(() => (playBtn.hidden = false));
  }
  function showChapter(name) {
    if (name === cur) return; cur = name;
    chapters.forEach((c) => c.classList.toggle("is-on", c.dataset.vid === name));
    const title = $(`.chapter[data-vid="${name}"] .ch-t`).textContent;
    cap.textContent = title;
    video.classList.add("is-fading");
    setTimeout(() => {
      video.poster = `media/${name}.jpg`; video.src = `media/${name}.${EXT}`; video.setAttribute("aria-label", "Walkthrough of LuminAAC: " + title);
      video.load(); playIfOk(); video.classList.remove("is-fading");
    }, still ? 0 : 280);
  }
  chapters.forEach((c, i) => $("button", c).addEventListener("click", () => {
    if (seeST && !still) { const y = seeST.start + (seeST.end - seeST.start) * ((i + 0.5) / chapters.length); lenis ? lenis.scrollTo(y, { duration: 1.1 }) : scrollTo({ top: y, behavior: "smooth" }); }
    showChapter(c.dataset.vid);
  }));
  playBtn.onclick = () => { playBtn.hidden = true; video.play().catch(() => {}); };
  new IntersectionObserver((es) => es.forEach((e) => { seeVisible = e.isIntersecting; playIfOk(); }), { threshold: 0.35 }).observe(video);

  /* ---------- pledge ---------- */
  const PER = ["per month", "per year", "for the full app", "for every family", "forever"];
  const perEl = $("#per"), numEl = $(".zero .num");
  let perI = 0, perT = null, counted = false;
  new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) {
      if (!counted && !still && hasGsap) { counted = true; const o = { v: 300 }; gsap.to(o, { v: 0, duration: 2.2, ease: "power3.out", onUpdate: () => (numEl.textContent = Math.round(o.v)) }); }
      if (!perT) perT = setInterval(() => { perI = Math.min(perI + 1, PER.length - 1); perEl.textContent = PER[perI]; if (perI === PER.length - 1) { clearInterval(perT); } }, still ? 900 : 1300);
    }
  }), { threshold: 0.5 }).observe($(".zero"));

  /* ---------- install ---------- */
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $$("[data-install]").forEach((b) => (b.hidden = false)); });
  $$("[data-install]").forEach((b) => b.addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; b.hidden = true; }));
  if ("serviceWorker" in navigator && location.protocol !== "file:") addEventListener("load", () => navigator.serviceWorker.register("../sw.js").catch(() => {}));

  /* ---------- motion (GSAP) ---------- */
  let lenis = null, seeST = null, ctx = null;
  function startMotion() {
    if (!hasGsap) return;
    ctx = gsap.context(() => {
      // hero title
      gsap.from(".hero-title .line", { yPercent: 40, opacity: 0, filter: "blur(10px)", duration: 1.4, ease: "expo.out", stagger: 0.14, delay: 0.15 });

      // manifesto words light up with scroll
      ScrollTrigger.create({ trigger: ".manifesto", start: "top 60%", end: "bottom 90%", scrub: true,
        onUpdate: (st) => { const n = Math.round(st.progress * 1.25 * words.length); words.forEach((w, i) => w.classList.toggle("on", i < n)); } });

      // the box opens
      const s = gsap.utils.toArray(".ftile");
      const tl = gsap.timeline({ scrollTrigger: { trigger: ".box-sec", start: "top top", end: "+=140%", pin: ".box-pin", scrub: 0.6,
        onUpdate: (st) => { const open = st.progress > 0.5; const sec = $(".box-sec"); if (open !== sec.classList.contains("is-open")) { sec.classList.toggle("is-open", open); if (open) field.ripple(0.5, 0.45, 1.4); } } } });
      gsap.set(".face.lid", { "--lid": "90deg" }); gsap.set(".face.front", { "--front": "0deg" });
      tl.to(".box3d", { rotateY: -20, rotateX: -24, duration: 1 }, 0)
        .to(".lock", { y: 120, rotate: 35, opacity: 0, duration: 0.5, ease: "power2.in" }, 0.25)
        .to(".price", { opacity: 0, duration: 0.3 }, 0.2)
        .to(".face.lid", { "--lid": "215deg", duration: 0.7, ease: "power2.inOut" }, 0.45)
        .to(".face.front", { "--front": "-88deg", duration: 0.7, ease: "bounce.out" }, 0.55)
        .to(".face", { background: "linear-gradient(#f2d48f,#c99a3d)", opacity: 0.5, duration: 0.6 }, 0.7);
      s.forEach((el, i) => {
        const a = (-150 + i * 30) * (Math.PI / 180), R = mobile.matches ? 120 : 190;
        tl.fromTo(el, { opacity: 0, x: 0, y: 30, scale: 0.4 }, { opacity: 1, x: Math.cos(a) * R, y: Math.sin(a) * R * 0.9 - 40, scale: 1, duration: 0.7, ease: "back.out(1.6)" }, 0.8 + i * 0.08);
      });
      tl.to(".box3d", { opacity: 0.35, scale: 0.85, duration: 0.5 }, 1.3);

      // story mandala draws itself, and turns gently
      gsap.to("#storyMandala .m", { strokeDashoffset: 0, ease: "none", stagger: 0.004, scrollTrigger: { trigger: ".story", start: "top 80%", end: "center 45%", scrub: 0.8 } });
      gsap.to("#storyMandala .rot-slow", { rotation: 360, transformOrigin: "50% 50%", duration: 240, repeat: -1, ease: "none" });
      gsap.to("#storyMandala .rot-rev", { rotation: -360, transformOrigin: "50% 50%", duration: 180, repeat: -1, ease: "none" });
      gsap.to("#storyMandala .heart", { scale: 1.12, transformOrigin: "50% 50%", duration: 4, yoyo: true, repeat: -1, ease: "sine.inOut" });

      // constellation rings breathe
      gsap.from(".c-lines circle, .c-lines line", { opacity: 0, duration: 1.4, stagger: 0.03, scrollTrigger: { trigger: "#constellation", start: "top 75%" } });
      gsap.to(".c-lines", { rotation: 6, transformOrigin: "50% 50%", duration: 18, yoyo: true, repeat: -1, ease: "sine.inOut" });

      // walkthrough chapters follow the scroll
      const pin = $(".see-grid");
      pin.style.minHeight = chapters.length * (mobile.matches ? 75 : 70) + "vh";
      seeST = ScrollTrigger.create({ trigger: pin, start: "top 30%", end: "bottom 70%",
        onUpdate: (st) => { const i = Math.min(chapters.length - 1, Math.floor(st.progress * chapters.length)); showChapter(chapters[i].dataset.vid); } });
      gsap.from(".device-frame", { y: 60, rotateX: 12, transformPerspective: 1200, opacity: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".see", start: "top 60%" } });

      // pledge zero glows in
      gsap.from(".zero", { scale: 0.7, opacity: 0, duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: ".pledge", start: "top 60%" } });
      gsap.from(".get-card", { y: 40, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: ".get-grid", start: "top 80%" } });
    });

    if (window.Lenis) {
      lenis = new Lenis({ duration: 1.15, smoothWheel: true, anchors: { offset: -72 } });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis && lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }
  }
  function stopMotion() {
    if (ctx) { ctx.revert(); ctx = null; }
    if (lenis) { lenis.destroy(); lenis = null; }
    ScrollTrigger.getAll && ScrollTrigger.getAll().forEach((t) => t.kill());
    seeST = null; $(".see-grid").style.minHeight = "";
    words.forEach((w) => w.classList.add("on"));
    $$(".m", $("#storyMandala")).forEach((el) => (el.style.strokeDashoffset = 0));
    $(".box-sec").classList.add("is-open");
    numEl.textContent = "0";
  }
  function setStill(s) {
    still = s; root.classList.toggle("still", s);
    stillBtn.setAttribute("aria-pressed", String(s));
    field.setStill(s);
    if (s) { stopMotion(); stopAuto(); video.pause(); playBtn.hidden = false; }
    else { $(".box-sec").classList.remove("is-open"); startMotion(); playIfOk(); }
  }
  stillBtn.onclick = () => { store.set("luminaac-site:still", still ? "0" : "1"); setStill(!still); };
  rm.addEventListener?.("change", (e) => setStill(e.matches));
  if (still) setStill(true); else startMotion();
})();
