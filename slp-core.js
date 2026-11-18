// Speech-language tools for My Voice and the Bridge (milestone M2).
// Pure functions and data, no DOM, so they run in the browser and in node tests.
//  - Word endings (morphology): "eat" -> eating, eats, ate; "dog" -> dogs.
//  - Vocabulary search across every folder.
//  - Body map: where it hurts and how it feels, as a sentence to speak.
//  - Gestalt scripts: whole phrases, with "/" marking parts a child can mix.
//  - Choice boards and routines shown in Plans.

// ---------- Word endings ----------
const PAST = {
  be: "was", go: "went", eat: "ate", drink: "drank", see: "saw", come: "came", get: "got", give: "gave",
  make: "made", take: "took", have: "had", do: "did", say: "said", run: "ran", sit: "sat", sleep: "slept",
  feel: "felt", find: "found", hear: "heard", hold: "held", know: "knew", leave: "left", read: "read",
  ride: "rode", sing: "sang", swim: "swam", tell: "told", think: "thought", throw: "threw", win: "won",
  write: "wrote", buy: "bought", bring: "brought", catch: "caught", draw: "drew", fall: "fell", fly: "flew",
  hide: "hid", hurt: "hurt", put: "put", cut: "cut", stand: "stood", break: "broke", wear: "wore", blow: "blew",
};
const THIRD = { be: "is", have: "has", do: "does", go: "goes" };
const PLURAL = { child: "children", man: "men", woman: "women", person: "people", foot: "feet", tooth: "teeth", mouse: "mice", fish: "fish", sheep: "sheep", leaf: "leaves", knife: "knives", wolf: "wolves" };
const VOWEL = /[aeiou]/;
// Short verbs that end consonant-vowel-consonant double the last letter: stop -> stopping.
const doubles = (w) => w.length <= 4 && /[^aeiou][aeiou][^aeiouwxy]$/.test(w) && !/^(open|visit)$/.test(w);

export function verbForms(w) {
  const ing = w === "be" ? "being" : /ie$/.test(w) ? w.slice(0, -2) + "ying" : /[^e]e$/.test(w) && w !== "see" ? w.slice(0, -1) + "ing" : doubles(w) ? w + w.at(-1) + "ing" : w + "ing";
  const s = THIRD[w] || (/(s|sh|ch|x|z|o)$/.test(w) ? w + "es" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : w + "s");
  const ed = PAST[w] || (/e$/.test(w) ? w + "d" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ied" : doubles(w) ? w + w.at(-1) + "ed" : w + "ed");
  return [ing, s, ed];
}
export function plural(w) {
  if (PLURAL[w]) return PLURAL[w];
  if (/(s|sh|ch|x|z)$/.test(w)) return w + "es";
  if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + "ies";
  return w + "s";
}
// Other forms of a board word, for the endings chips. Only single, lowercase words:
// phrases, names and words that are already changed get none.
export function wordForms(item) {
  const w = String(item?.w || "");
  if (!/^[a-z]+$/.test(w) || w.length < 2 || !VOWEL.test(w)) return [];
  if (item.c === "action") return [...new Set(verbForms(w))].filter((x) => x !== w);
  if (item.c === "thing") { const p = plural(w); return p === w ? [] : [p]; }
  return [];
}

// ---------- Vocabulary search ----------
// sources: [{ id, label, words: [{w, e, c}] }]. Exact matches first, then words that
// start with the query, then words that contain it. Each word is listed once, in the
// first folder that has it, so the child learns one place to find it.
export function searchWords(query, sources, limit = 12) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const seen = new Set(), hits = [];
  for (const src of sources) for (const item of src.words || []) {
    const w = String(item.w || "").toLowerCase();
    if (!w || seen.has(w)) continue;
    const rank = w === q ? 0 : w.startsWith(q) ? 1 : w.split(/\s+/).some((p) => p.startsWith(q)) ? 2 : w.includes(q) ? 3 : -1;
    if (rank < 0) continue;
    seen.add(w); hits.push({ item, folder: { id: src.id, label: src.label }, rank });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.item.w.length - b.item.w.length).slice(0, limit);
}

// ---------- Body map ----------
// x, y, w, h place each part on a 200 x 400 front-view figure (body-map in myvoice-slp.js).
export const BODY = [
  { id: "head", label: "head", x: 70, y: 6, w: 60, h: 40 },
  { id: "ears", label: "ears", x: 42, y: 34, w: 28, h: 34, plural: true },
  { id: "eyes", label: "eyes", x: 76, y: 46, w: 48, h: 24, plural: true },
  { id: "mouth", label: "mouth", x: 80, y: 70, w: 40, h: 26 },
  { id: "teeth", label: "teeth", x: 130, y: 66, w: 44, h: 30, plural: true },
  { id: "throat", label: "throat", x: 82, y: 96, w: 36, h: 24 },
  { id: "chest", label: "chest", x: 64, y: 122, w: 72, h: 48 },
  { id: "tummy", label: "tummy", x: 66, y: 170, w: 68, h: 50 },
  { id: "arms", label: "arm", x: 26, y: 124, w: 34, h: 90 },
  { id: "hands", label: "hand", x: 14, y: 216, w: 36, h: 32 },
  { id: "bottom", label: "bottom", x: 66, y: 222, w: 68, h: 30 },
  { id: "legs", label: "leg", x: 64, y: 254, w: 72, h: 100 },
  { id: "feet", label: "feet", x: 56, y: 356, w: 88, h: 34, plural: true },
];
export const SENSATIONS = [
  { id: "hurts", w: "hurts", e: "😣" }, { id: "sharp", w: "sharp", e: "📌" }, { id: "itchy", w: "itchy", e: "🐜" },
  { id: "hot", w: "hot", e: "🔥" }, { id: "cold", w: "cold", e: "🧊" }, { id: "tight", w: "tight", e: "🪢" },
  { id: "sick", w: "sick", e: "🤢" }, { id: "tingly", w: "tingly", e: "✨" },
];
export const RELIEF = [
  { w: "I need medicine", e: "💊" }, { w: "I need ice", e: "🧊" }, { w: "I need to lie down", e: "🛏️" },
  { w: "Please hold me", e: "🤗" }, { w: "I need a doctor", e: "🩺" }, { w: "Stop, please", e: "✋" },
  { w: "Water, please", e: "💧" }, { w: "It's getting better", e: "🙂" },
];
// "My tummy hurts." / "My teeth feel sharp." / "My head feels hot."
export function bodySentence(partId, sensationId) {
  const part = BODY.find((p) => p.id === partId);
  if (!part) return "";
  const s = SENSATIONS.find((x) => x.id === sensationId);
  const many = part.plural;
  if (!s) return `My ${part.label} ${many ? "hurt" : "hurts"}.`;
  if (s.id === "hurts") return `My ${part.label} ${many ? "hurt" : "hurts"}.`;
  return `My ${part.label} ${many ? "feel" : "feels"} ${s.w}.`;
}

// ---------- Gestalt (whole phrase) scripts ----------
// Natural Language Acquisition stages (Blanc, 2012), as SLPs commonly describe them.
export const NLA_STAGES = {
  1: "Stage 1: whole phrases",
  2: "Stage 2: mixing parts of phrases",
  3: "Stage 3: single words and two-word combinations",
  4: "Stage 4: first original sentences",
  5: "Stage 5: more complex sentences",
  6: "Stage 6: full grammar",
};
// "let's go / to the park" -> ["let's go", "to the park"]. No "/" means one whole part.
export function scriptParts(text) {
  return String(text || "").split("/").map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean);
}
export const scriptText = (s) => scriptParts(s.text).join(" ");
// Stage 1 scripts are said whole, straight away. From stage 2 the parts go to the
// message strip one by one, so the child can mix them with other phrases.
export const canMix = (s) => Number(s.stage || 1) >= 2 && scriptParts(s.text).length > 1;
export function normalizeScript(s) {
  const text = scriptParts(s.text).join(" / ").slice(0, 120);
  const stage = Math.min(6, Math.max(1, Math.round(Number(s.stage) || 1)));
  return { id: s.id, text, e: String(s.e || "").trim().slice(0, 16) || "💬", stage, source: String(s.source || "").trim().slice(0, 60) };
}

// ---------- Choice boards ----------
// A choice board needs 2 to 8 options. Lines are "emoji word", like the story editor.
export function parseOptions(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u.exec(l);
    return m ? { e: m[1], w: (m[2] || m[1]).slice(0, 40) } : { e: "", w: l.slice(0, 40) };
  }).filter((o) => o.w);
}
export function validChoice(c) {
  const n = c?.options?.length || 0;
  if (!String(c?.title || "").trim()) return "Give the choice a question, like \"What snack?\"";
  if (n < 2) return "Add at least 2 options, one per line.";
  if (n > 8) return "Use 8 options or fewer, so each one stays big enough to press.";
  return "";
}
// What the child says when they pick: the option itself ("apple"), or a lead-in the
// caregiver set ("I want" -> "I want apple").
export const choiceSentence = (board, opt) => [String(board.lead || "").trim(), opt.w].filter(Boolean).join(" ");

// ---------- Plans: built-in plans plus the routines written in the Bridge ----------
export function allPlans(builtIn, stories = []) {
  const routines = stories.filter((s) => s.kind === "routine" && s.steps?.length).map((s) => ({
    id: "routine:" + s.id, title: s.title, e: s.steps[0]?.e || "🗓️", routine: true,
    steps: s.steps.map((st) => ({ t: st.text, e: st.e || "•", say: st.say || [] })),
  }));
  return [...builtIn, ...routines];
}
