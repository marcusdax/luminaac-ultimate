// Meaning-based search and linking (milestone M3). Pure functions, no DOM.
//
// Two ways to find a word by meaning:
//  1. Built in, always on, no download: a small table of everyday ideas
//     ("thirsty" -> drink, water, juice). Works offline from the first launch.
//  2. Optional: a sentence-embedding model (all-MiniLM-L6-v2, about 23 MB, run on
//     the device in ai-worker.js). Turned on by a grown-up in Caregiver.
// The same scoring links a newly explained moment in the Bridge to a signal taught before.

// Everyday ideas a child may mean, and words on the board that say them.
export const CONCEPTS = {
  thirsty: ["drink", "water", "juice", "milk", "cup"],
  hungry: ["eat", "food", "snack", "hungry", "lunch", "breakfast", "dinner"],
  tired: ["sleep", "bed", "rest", "tired", "break", "quiet"],
  sleepy: ["sleep", "bed", "tired", "goodnight"],
  hurt: ["hurt", "ouch", "help", "doctor", "sick", "medicine"],
  pain: ["hurt", "ouch", "doctor", "medicine", "sick"],
  sick: ["sick", "doctor", "medicine", "hurt", "bathroom"],
  toilet: ["bathroom", "potty", "toilet", "wash"],
  potty: ["bathroom", "potty", "toilet"],
  loud: ["quiet", "headphones", "too loud", "break", "stop"],
  noisy: ["quiet", "headphones", "stop"],
  upset: ["sad", "angry", "break", "help", "hug", "calm"],
  mad: ["angry", "stop", "break", "no"],
  scared: ["scared", "help", "hug", "mom", "dad", "home"],
  bored: ["play", "games", "tablet", "outside", "music"],
  outside: ["outside", "park", "play", "walk", "go"],
  hot: ["hot", "water", "drink", "fan"],
  cold: ["cold", "coat", "blanket", "warm"],
  cuddle: ["hug", "hold", "love"],
  sad: ["sad", "hug", "cry", "help"],
  happy: ["happy", "like", "love", "fun", "yay"],
  finished: ["all done", "finished", "stop", "done"],
  more: ["more", "again", "please"],
  again: ["again", "more"],
  music: ["music", "song", "sing", "dance"],
  wash: ["wash", "bath", "hands", "bathroom"],
};
const STOP = new Set("a an the and or but to of in on at for with is are was were be it its this that these those i me my you your he she his her him they them we us our wants want wanted when then than so very just really some any".split(" "));
export const words = (t) => (String(t || "").toLowerCase().match(/[a-z']+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "") || w;

// Board words related to a query by the built-in table. Returns [{ w, why }].
export function related(query) {
  const out = new Map();
  for (const q of words(query)) {
    const key = CONCEPTS[q] ? q : Object.keys(CONCEPTS).find((k) => stem(k) === stem(q));
    for (const w of CONCEPTS[key] || []) if (!out.has(w)) out.set(w, key);
  }
  return [...out].map(([w, why]) => ({ w, why }));
}

export function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
// Rank items by similarity to a query vector. vectors[i] belongs to items[i].
export function rankByVector(qv, items, vectors, { min = 0.35, limit = 8 } = {}) {
  return items.map((item, i) => ({ item, score: cosine(qv, vectors[i]) }))
    .filter((x) => x.score >= min).sort((a, b) => b.score - a.score).slice(0, limit);
}

// Which signal does a caregiver's explanation sound like? Scores shared words
// (stems), and words that share an everyday idea. Returns { signal, score, why[] } or null.
export function linkSignal(text, signals, { min = 1 } = {}) {
  const mine = words(text), ms = new Set(mine.map(stem));
  const ideas = new Set(related(text).map((r) => r.w));
  let best = null;
  for (const s of signals || []) {
    const theirs = words([s.name, s.meaning, s.phrase, ...(s.cues || [])].join(" "));
    const shared = [...new Set(theirs.filter((w) => ms.has(stem(w))))];
    const viaIdea = [...new Set(theirs.filter((w) => ideas.has(w) && !shared.includes(w)))];
    const score = shared.length + viaIdea.length * 0.5;
    if (score >= min && (!best || score > best.score)) best = { signal: s, score, why: [...shared, ...viaIdea] };
  }
  return best;
}
// The same, with embeddings: vectors for the text and for each signal.
export function linkSignalByVector(tv, signals, vectors, { min = 0.5 } = {}) {
  let best = null;
  signals.forEach((s, i) => { const score = cosine(tv, vectors[i]); if (score >= min && (!best || score > best.score)) best = { signal: s, score, why: [] }; });
  return best;
}
export const signalText = (s) => [s.name, s.meaning, s.phrase].filter(Boolean).join(". ");
