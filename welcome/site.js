/* LuminAAC website, "Daylight prism". GSAP + ScrollTrigger (GreenSock standard
   licence), Lenis (MIT) and the light behind the page (prism.js).
   Everything has a still version: prefers-reduced-motion or the Still button. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  root.classList.add("js");
  const light = window.LuminPrism || { ripple() {}, setStill() {}, redraw() {} };
  const mobile = matchMedia("(max-width: 860px)");
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
  const onScroll = () => top.classList.toggle("is-band", scrollY > 60);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* ---------- each section turns the light ---------- */
  function applyLight(sec) {
    const h = sec.dataset.hue, l = sec.dataset.light;
    if (h != null) light.hueT = +h;
    if (l) { const [x, y] = l.split(",").map(Number); light.lxT = x; light.lyT = y; }
    $$(".nav a").forEach((a) => a.classList.toggle("is-on", a.getAttribute("href") === "#" + sec.id));
    light.redraw();
  }
  const secIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) applyLight(e.target); }), { rootMargin: "-50% 0px -50% 0px" });
  $$("main > section").forEach((s) => secIO.observe(s));
  applyLight($("#hero"));

  /* ---------- hero: tap the light, a word comes out ---------- */
  const WORDS = [["I", "people"], ["want", "action"], ["more", "describe"], ["help", "action"], ["love", "action"], ["you", "people"], ["yes", "social"], ["play", "action"],
    ["hug", "thing"], ["go", "action"], ["hello", "social"], ["me too", "people"], ["again", "describe"], ["happy", "describe"], ["thank you", "social"], ["look", "action"]];
  let wi = 0;
  const sparks = $("#sparks");
  function say(text) {
    if (!sound || !("speechSynthesis" in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.92; u.pitch = 1.05; speechSynthesis.speak(u); } catch (e) {}
  }
  function spark(x, y) {
    const [w, c] = WORDS[wi++ % WORDS.length];
    const el = document.createElement("span");
    el.className = "spark"; el.dataset.c = c; el.textContent = w;
    el.style.left = x + "px"; el.style.top = y + "px";
    sparks.appendChild(el);
    light.ripple(x / innerWidth, y / innerHeight, 1);
    say(w);
    if (still) { el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200 }).onfinish = () => el.remove(); return; }
    const dx = (Math.random() - 0.3) * 260, dy = -120 - Math.random() * 160;
    el.animate([
      { transform: "translate(-50%,-50%) scale(.3) rotate(-8deg)", opacity: 0, filter: "blur(6px)" },
      { transform: "translate(-50%,-60%) scale(1.08)", opacity: 1, filter: "blur(0)", offset: 0.14 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8) rotate(${dx / 30}deg)`, opacity: 0, filter: "blur(4px)" },
    ], { duration: 3600, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => el.remove();
  }
  $("#hero").addEventListener("pointerdown", (e) => { if (e.target.closest("a,button")) return; spark(e.clientX, e.clientY); });

  /* ---------- sound and still ---------- */
  const soundBtn = $("#soundBtn"), stillBtn = $("#stillBtn");
  soundBtn.setAttribute("aria-pressed", String(sound));
  soundBtn.onclick = () => { sound = !sound; store.set("luminaac-site:sound", sound ? "1" : "0"); soundBtn.setAttribute("aria-pressed", String(sound)); if (!sound) try { speechSynthesis.cancel(); } catch (e) {} };

  /* ---------- manifesto: words catch the light ---------- */
  const scrub = $(".scrub");
  const KEYS = /^(box,|price|tag|subscription\.)$/;
  scrub.innerHTML = scrub.textContent.trim().split(/\s+/).map((w) => `<span class="w${KEYS.test(w) ? " key" : ""}">${w}</span>`).join(" ");
  const words = $$(".w", scrub);

  /* ---------- spectrum of differences ---------- */
  const DIFF = [
    ["Free, forever", "The full app for every family. No trial, no tier, no ads.", "#e0517f"],
    ["Learns their voice", "It notices the sounds and moments they already use, then asks you what they mean. You are their best translator.", "#ee8b2c"],
    ["Words stay put", "Core words never move, so hands can learn where they live.", "#e8c13a"],
    ["Private by default", "Words and recordings stay on your own devices unless you choose end-to-end encrypted sync. Optional shared learning uses PRINCE v2 (4-bit TurboQuant + Weiszfeld Geometric Median + strict differential privacy), and offline model bundles verify right in the browser with WebCrypto and C2SP transparency logs.", "#3fb98a"],
    ["Works offline", "No signal at the doctor's? It still speaks, runs its calming soundscapes, and verifies its own offline bundles without a single cloud call.", "#2fb3b3"],
    ["Calm by design", "No ads, no clutter, no flashing. One lit word at a time, plus gentle offline ocean and rain soundscapes that automatically duck the moment your child speaks.", "#3d8fe0"],
    ["Plays well with others", "Bring boards from other AAC apps, or take yours with you.", "#6a7fe0"],
    ["Open source", "MIT licensed. No one can lock it away, not even us.", "#8b6fe0"],
  ];
  const nodes = $(".s-nodes"), panel = $("#sPanel");
  let sSel = 0, sAuto = null;
  DIFF.forEach(([t, , h], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "s-node"; b.role = "tab"; b.id = "sn" + i; b.setAttribute("aria-controls", "sPanel");
    b.style.setProperty("--h", h);
    b.innerHTML = `<span class="dot" aria-hidden="true"></span>${t}`;
    b.onclick = () => { stopAuto(); pick(i); };
    b.onkeydown = (e) => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (d) { e.preventDefault(); stopAuto(); pick((sSel + d + DIFF.length) % DIFF.length); $("#sn" + sSel).focus(); } };
    nodes.appendChild(b);
  });
  function pick(i) {
    sSel = i;
    $$(".s-node").forEach((b, j) => { b.setAttribute("aria-selected", String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    panel.setAttribute("aria-labelledby", "sn" + i);
    panel.innerHTML = `<h3>${DIFF[i][0]}</h3><p>${DIFF[i][1]}</p>`;
    if (hasGsap && !still) gsap.fromTo(panel.children, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.06, ease: "expo.out" });
  }
  // Once someone points at, focuses or picks a chip, it stops cycling for good.
  let userTook = false;
  function stopAuto() { clearInterval(sAuto); sAuto = null; userTook = true; }
  pick(0);
  new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting && !still && !userTook && sAuto === null) sAuto = setInterval(() => pick((sSel + 1) % DIFF.length), 4200);
    if (!e.isIntersecting && sAuto) stopAuto();
  }), { threshold: 0.4 }).observe($("#spectrum"));
  $("#spectrum").addEventListener("pointerenter", stopAuto);
  $("#spectrum").addEventListener("focusin", stopAuto);

  /* ---------- walkthroughs (the app's own recordings) ---------- */
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
      video.poster = `/welcome/media/${name}.jpg`; video.src = `/welcome/media/${name}.${EXT}`; video.setAttribute("aria-label", "Walkthrough of LuminAAC: " + title);
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
    if (!e.isIntersecting) return;
    if (!counted && !still && hasGsap) { counted = true; const o = { v: 300 }; gsap.to(o, { v: 0, duration: 2.2, ease: "power3.out", onUpdate: () => (numEl.textContent = Math.round(o.v)) }); }
    if (!perT) perT = setInterval(() => { perI = Math.min(perI + 1, PER.length - 1); perEl.textContent = PER[perI]; if (perI === PER.length - 1) clearInterval(perT); }, still ? 900 : 1300);
  }), { threshold: 0.5 }).observe($(".zero"));

  /* ---------- install ---------- */
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $$("[data-install]").forEach((b) => (b.hidden = false)); });
  $$("[data-install]").forEach((b) => b.addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; b.hidden = true; }));

  /* ---------- the cinematic layer ---------- */
  let lenis = null, seeST = null, ctx = null;
  function startMotion() {
    if (!hasGsap) return;
    ctx = gsap.context(() => {
      // hero: the title rises out of the light, the beam enters the prism, rays fan out, words follow the rays
      const h = gsap.timeline({ delay: 0.15 });
      h.from(".hero-title .line", { yPercent: 50, opacity: 0, filter: "blur(12px)", duration: 1.4, ease: "expo.out", stagger: 0.14 })
        .from(".prism-body", { scale: 0.6, rotate: -18, opacity: 0, transformOrigin: "50% 60%", duration: 1.6, ease: "expo.out" }, 0.1)
        .from(".beam-in", { scaleX: 0, transformOrigin: "0% 50%", opacity: 0, duration: 1, ease: "power2.out" }, 0.5)
        .from(".hero-prism .rays path", { scaleX: 0, transformOrigin: "0% 50%", opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.07 }, 0.9)
        .from(".hero-words li", { x: -140, opacity: 0, scale: 0.6, duration: 1, ease: "back.out(1.5)", stagger: 0.09 }, 1.2);
      gsap.to(".prism-body", { y: -10, rotate: 1.5, transformOrigin: "50% 60%", duration: 5, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(".hero-prism .rays", { opacity: 0.7, duration: 3, yoyo: true, repeat: -1, ease: "sine.inOut" });
      // hero art drifts away and the light shifts as you leave
      gsap.to(".hero-art", { yPercent: -18, scale: 0.92, opacity: 0.3, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".hero-copy", { yPercent: -10, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

      // manifesto: each word catches the light in turn
      ScrollTrigger.create({ trigger: ".manifesto", start: "top 60%", end: "bottom 90%", scrub: true,
        onUpdate: (st) => { const n = Math.round(st.progress * 1.25 * words.length); words.forEach((w, i) => w.classList.toggle("on", i < n)); } });

      // the prism scene: the locked box fades, the beam passes through glass and splits into words
      const why = $(".why");
      const tl = gsap.timeline({ scrollTrigger: { trigger: why, start: "top top", end: "+=150%", pin: ".why-pin", scrub: 0.7,
        onUpdate: (st) => { const open = st.progress > 0.45; if (open !== why.classList.contains("is-open")) { why.classList.toggle("is-open", open); if (open) light.ripple(0.62, 0.5, 1.3); } } } });
      tl.fromTo(".beam2", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.5, ease: "power2.out" }, 0)
        .from(".why-svg .glass", { scale: 0.8, opacity: 0.4, transformOrigin: "50% 60%", duration: 0.5 }, 0)
        .to(".box-lock", { x: -60, opacity: 0.2, duration: 0.6 }, 0.3)
        .fromTo(".why-svg .fan path", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.6, stagger: 0.06, ease: "expo.out" }, 0.45)
        .fromTo(".ftile", { x: -220, opacity: 0, scale: 0.5 }, { x: 0, opacity: 1, scale: 1, duration: 0.6, stagger: 0.07, ease: "back.out(1.6)" }, 0.7);

      // story: rings of light turn slowly, the glass card settles in
      gsap.to(".story-light span:nth-child(1)", { "--a": "360deg", duration: 40, repeat: -1, ease: "none" });
      gsap.to(".story-light span:nth-child(2)", { "--a": "-270deg", duration: 30, repeat: -1, ease: "none" });
      gsap.to(".story-light span:nth-child(3)", { "--a": "540deg", duration: 24, repeat: -1, ease: "none" });
      gsap.from(".story-light", { scale: 0.6, opacity: 0, rotate: -40, duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: ".story", start: "top 70%" } });
      gsap.from(".story-copy", { y: 80, opacity: 0, duration: 1.3, ease: "expo.out", scrollTrigger: { trigger: ".story", start: "top 70%" } });

      // spectrum: the band paints across, the chips land one by one
      gsap.from(".s-band", { scaleX: 0, transformOrigin: "0% 50%", duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: "#spectrum", start: "top 80%" } });
      gsap.from(".s-node", { y: 30, opacity: 0, duration: 0.8, ease: "expo.out", stagger: 0.06, scrollTrigger: { trigger: "#spectrum", start: "top 78%" } });

      // walkthroughs: chapters follow the scroll; the tablet tilts in through the light
      const pin = $(".see-grid");
      pin.style.minHeight = chapters.length * (mobile.matches ? 75 : 70) + "vh";
      seeST = ScrollTrigger.create({ trigger: pin, start: "top 30%", end: "bottom 70%",
        onUpdate: (st) => { const i = Math.min(chapters.length - 1, Math.floor(st.progress * chapters.length)); showChapter(chapters[i].dataset.vid); } });
      gsap.from(".device-frame", { y: 90, rotateX: 18, rotateY: -10, transformPerspective: 1400, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".see", start: "top 60%" } });

      // what's new, get, guides: cards rise in with a little depth
      gsap.utils.toArray(".new-card, .get-card, .res-card").forEach((el, i) => gsap.from(el, { y: 60, rotateX: 8, transformPerspective: 900, opacity: 0, duration: 1.1, ease: "expo.out", delay: (i % 3) * 0.08, scrollTrigger: { trigger: el, start: "top 88%" } }));

      // pledge: the zero blooms out of the light
      gsap.from(".zero", { scale: 0.6, opacity: 0, filter: "blur(16px)", duration: 1.8, ease: "expo.out", scrollTrigger: { trigger: ".pledge", start: "top 60%" } });
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
    $(".why").classList.add("is-open");
    numEl.textContent = "0";
  }
  function setStill(s) {
    still = s; root.classList.toggle("still", s);
    stillBtn.setAttribute("aria-pressed", String(s));
    light.setStill(s);
    if (s) { stopMotion(); stopAuto(); video.pause(); playBtn.hidden = false; }
    else { $(".why").classList.remove("is-open"); startMotion(); playIfOk(); }
  }
  stillBtn.onclick = () => { store.set("luminaac-site:still", still ? "0" : "1"); setStill(!still); };
  rm.addEventListener?.("change", (e) => setStill(e.matches));
  if (still) setStill(true); else startMotion();
})();
