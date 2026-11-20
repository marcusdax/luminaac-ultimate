// Potty Path step icons and companion art. Inline SVG drawn in currentColor so the
// day, night and contrast themes work for free. Dignity rules: no anatomy, no body
// fluids, no strained faces; a rounded, gender-neutral figure from the waist up or side.
const svg = (body, label = "") => `<svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;
// Shared parts
const head = (x, y) => `<circle cx="${x}" cy="${y}" r="4.5"/>`;
const toilet = `<path d="M24 30h16v3a8 8 0 0 1-8 8h0a8 8 0 0 1-8-8z"/><path d="M36 30V14h5v16"/><path d="M28 41v3h8v-3"/>`;
const stool = `<path d="M8 44h12M10 44v-4h8v4"/>`;
const seated = `${head(15, 11)}<path d="M15 16v10h10M15 26l2 12M17 38h-4"/><path d="M15 19l6 4"/>`;

export const ICON = {
  approach: svg(`<rect x="27" y="6" width="15" height="36" rx="1.5"/><path d="M39 24h0.5"/>${head(13, 10)}<path d="M13 15v13M13 28l-4 12M13 28l5 11M13 18l-5 6M13 18l6 5"/><path d="M30 34h9v2a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4z" stroke-width="2"/>`),
  pants_down: svg(`${head(24, 8)}<path d="M24 13v12M16 18l6 7M32 18l-6 7"/><rect x="15" y="25" width="18" height="6" rx="2"/><path d="M24 34v10M19 39l5 5 5-5"/>`),
  sit: svg(`${seated}${toilet.replace(/M24 30/g, "M18 30").replace("M36 30V14", "M30 30V14").replace("M28 41", "M22 41")}${stool}`),
  timer: svg(`<circle cx="24" cy="24" r="17"/><path d="M24 7a17 17 0 0 1 17 17H24z" fill="currentColor" stroke="none" opacity=".35"/>`),
  void: svg(`${seated}<path d="M18 30h14v3a7 7 0 0 1-7 7h0a7 7 0 0 1-7-7z"/><path d="M24 33v2M27 34v2M21 34v2" stroke-width="2"/>`),
  wipe: svg(`<rect x="9" y="16" width="16" height="16" rx="2" transform="rotate(-8 17 24)"/><path d="M12 22h10M12 27h8" stroke-width="2"/><path d="M27 33c3-2 5-6 6-10l3-9a2 2 0 0 1 4 1l-2 9 3-1a2 2 0 0 1 2 3l-6 9c-2 3-5 4-9 3"/>`),
  stand: svg(`${head(20, 10)}<path d="M20 15v14M20 29l-3 12M20 29l3 12M20 19l-5 6M20 19l5 6"/><path d="M34 34V12M29 17l5-5 5 5"/>`),
  pants_up: svg(`${head(24, 8)}<path d="M24 13v12M16 18l6 7M32 18l-6 7"/><rect x="15" y="25" width="18" height="6" rx="2"/><path d="M24 44V34M19 39l5-5 5 5"/>`),
  flush: svg(`<path d="M10 22h22v4a11 11 0 0 1-11 11h0a11 11 0 0 1-11-11z"/><path d="M28 22V8h8v14"/><path d="M36 12h6"/><path d="M38 9c2 1 3 2 3 3" stroke-dasharray="2 3"/><rect x="4" y="4" width="40" height="40" rx="8" stroke-dasharray="3 4" stroke-width="1.5"/>`),
  wash: svg(`<path d="M14 6h14v6H20v4"/><path d="M20 20v3M23 22v3M17 22v3" stroke-width="2"/><path d="M10 34c2-4 6-6 10-6h8c4 0 8 2 10 6l2 8H8z"/>`),
  dry: svg(`<rect x="10" y="8" width="28" height="30" rx="3"/><path d="M10 16h28"/><path d="M16 30c2-3 5-4 8-4s6 1 8 4l2 10H14z"/>`),
  done: svg(`<circle cx="24" cy="24" r="17"/><path d="M15 25l6 6 12-13" stroke-width="3.5"/>`),
  pants_off: svg(`${head(24, 8)}<path d="M24 13v12M16 18l6 7M32 18l-6 7"/><rect x="15" y="25" width="18" height="6" rx="2"/><path d="M24 34v10M19 39l5 5 5-5"/>`),
  new_pants: svg(`<path d="M14 10h20l3 30h-8l-5-18-5 18h-8z"/><path d="M14 15h20"/><path d="M38 6l1.5 3 3 1.5-3 1.5L38 15l-1.5-3-3-1.5 3-1.5z" stroke-width="1.8"/>`),
  toilet: svg(`<path d="M10 22h24v4a12 12 0 0 1-12 12h0a12 12 0 0 1-12-12z"/><path d="M30 22V7h8v15"/><path d="M16 38v4h12v-4"/>`, ""),
  body: svg(`${head(24, 9)}<path d="M16 18h16v16a8 8 0 0 1-16 0z"/><circle cx="24" cy="28" r="4" stroke-dasharray="2 2"/>`),
  stop: svg(`<path d="M17 40V22a2.5 2.5 0 0 1 5 0V12a2.5 2.5 0 0 1 5 0v10-2a2.5 2.5 0 0 1 5 0v4a2.5 2.5 0 0 1 5 0v8c0 6-4 10-10 10h-3c-4 0-6-2-7-4z"/>`),
  more: svg(`<circle cx="24" cy="24" r="17"/><path d="M24 15v18M15 24h18" stroke-width="3"/>`),
  break: svg(`<path d="M8 30c4 6 10 8 16 8s12-2 16-8"/><path d="M14 22c2-3 6-5 10-5s8 2 10 5"/><path d="M20 12h8" />`),
  help: svg(`${head(24, 10)}<path d="M24 15v14M24 29l-4 12M24 29l4 12M24 19l-8 2M24 19l9-12"/>`),
};

// Companion: soft rounded forms, dot eyes, no eyebrows (it can't frown).
// Expressions: content, wait, proud (eyes closed arcs), wave, sleepy.
function face(x, y, mood, gap = 7) {
  const eyes = mood === "proud" || mood === "sleepy"
    ? `<path d="M${x - gap - 2} ${y}q2 -2 4 0M${x + gap - 2} ${y}q2 -2 4 0" stroke-width="2"/>`
    : `<circle cx="${x - gap}" cy="${y}" r="2" fill="currentColor" stroke="none"/><circle cx="${x + gap}" cy="${y}" r="2" fill="currentColor" stroke="none"/>`;
  const mouth = mood === "wait" || mood === "sleepy" ? "" : `<path d="M${x - 4} ${y + 6}q4 ${mood === "proud" ? 4 : 2.5} 8 0" stroke-width="2"/>`;
  return eyes + mouth;
}
const C = (body) => `<svg class="pp-cbody" viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const COMPANIONS = {
  train: { label: "Train", draw: (m) => C(`<rect x="22" y="34" width="46" height="36" rx="12" fill="var(--pp-comp-fill)"/><rect x="58" y="22" width="18" height="48" rx="8" fill="var(--pp-comp-fill)"/><path d="M30 34v-8h12v8"/><circle cx="34" cy="78" r="7"/><circle cx="60" cy="78" r="7"/>${m === "proud" ? '<circle cx="36" cy="14" r="5"/><circle cx="46" cy="8" r="3.5"/>' : ""}${face(45, 50, m)}${m === "wave" ? '<path d="M76 30l10-10"/>' : ""}`) },
  dino: { label: "Dinosaur", draw: (m) => C(`<path d="M20 74c0-18 12-30 30-30h8c10 0 16-8 16-18a8 8 0 0 1 16 0c0 18-8 30-20 34v14z" fill="var(--pp-comp-fill)"/><path d="M20 74c-6 0-10-4-12-${m === "proud" ? 14 : 8}"/><path d="M32 74v10M58 74v10"/>${face(82, 24, m, 4)}${m === "wave" ? '<path d="M62 50l12 -6"/>' : ""}`) },
  blob: { label: "Blob", draw: (m) => C(`<path d="M50 18c20 0 32 16 32 34s-12 30-32 30-32-12-32-30 12-34 32-34z" fill="var(--pp-comp-fill)"/>${face(50, 48, m, 9)}${m === "wave" ? '<path d="M82 46l10-10"/>' : ""}`) },
  blob_nf: { label: "Pebble (no face)", draw: () => C(`<path d="M50 22c20 0 32 14 32 30s-12 28-32 28-32-10-32-28 12-30 32-30z" fill="var(--pp-comp-fill)"/>`) },
  cat: { label: "Cat", draw: (m) => C(`<path d="M24 36l4-18 12 10h20l12-10 4 18c6 6 6 14 6 20 0 16-14 26-34 26S16 72 16 56c0-6 2-14 8-20z" fill="var(--pp-comp-fill)"/>${face(50, 52, m, 10)}${m === "wave" ? '<path d="M84 60l10-8"/>' : ""}`) },
};
// Companion sitting on its own little potty (Sit mode) — same art, lowered, with a seat.
export const littlePotty = `<svg class="pp-cseat" viewBox="0 0 100 30" width="100%" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 4h64v6a20 20 0 0 1-20 18H38A20 20 0 0 1 18 10z" fill="var(--pp-sit-tile)"/></svg>`;
