// Word games (docs/GAMES-CONCEPT.md): the rules of all eight games, pure, so
// they run in node tests. Pillars: the board is the controller, every try is
// right, rules never change mid-game, "All done" always works, the grown-up
// owns the sensory dial, and rewards only grow.

export const GAMES = [
  { id: "garden", name: "Word Garden", e: "🌻", scene: "day", sub: "Words make things grow" },
  { id: "conductor", name: "Conductor", e: "🚂", scene: "rails", sub: "You drive the train" },
  { id: "weather", name: "Feelings Weather", e: "⛅", scene: "dusk", sub: "What is my sky?" },
  { id: "stage", name: "Story Stage", e: "🎭", scene: "day", sub: "Make a little show" },
  { id: "sort", name: "Pattern Lab", e: "🔷", scene: "sea", sub: "Sort it out" },
  { id: "turns", name: "My Turn, Your Turn", e: "🤝", scene: "dawn", sub: "Play together" },
  { id: "pond", name: "Sound Pond", e: "🐟", scene: "sea", sub: "My voice makes ripples" },
  { id: "robot", name: "Copy the Robot", e: "🤖", scene: "night", sub: "Move like me" },
];

// ---------- Settings (set in the Bridge, synced in games.settings.play) ----------
export const DEFAULTS = { off: [], motion: "gentle", sound: "soft", minutes: 10, tiles: 6, combos: true, camera: false };
export function playSettings(gamesSettings = {}) {
  const p = { ...DEFAULTS, ...(gamesSettings.play || {}) };
  p.minutes = [0, 5, 10, 15, 20].includes(+p.minutes) ? +p.minutes : 10;
  p.tiles = Math.min(12, Math.max(4, +p.tiles || 6));
  if (gamesSettings.calm) p.motion = "still"; // the older "Calm visuals" switch still wins
  if (gamesSettings.quiet && p.sound !== "off") p.sound = "off";
  return p;
}
export const shown = (s) => GAMES.filter((g) => !(s.off || []).includes(g.id));

// Session cap: a rest point, never a punishment. 0 minutes = no cap.
export function minutesLeft(startedAt, minutes, now = Date.now()) {
  if (!minutes) return Infinity;
  return Math.max(0, minutes - (now - startedAt) / 60e3);
}

// ---------- The World: add-only, shared by every game ----------
export const PIECES = {
  garden: ["🌱", "🌷", "🌼", "🌳"], conductor: ["🚃", "🛤️", "🚉"], weather: ["☁️", "🌈", "⭐"], stage: ["🎪", "🎈", "🏰"],
  sort: ["🔷", "🔶", "💎"], turns: ["🤝", "🧩", "🏠"], pond: ["🐟", "🪷", "🐸"], robot: ["🤖", "🔩", "🛰️"],
};
// One piece per try; "landmark" for asking, two-word combos and finishing a story.
export function addPiece(world = { pieces: [] }, game, kind = "try", now = Date.now()) {
  const set = PIECES[game] || ["⭐"], n = world.pieces.filter((p) => p.g === game).length;
  const e = kind === "landmark" ? set[set.length - 1] : set[n % (set.length - 1)];
  return { ...world, pieces: [...world.pieces, { g: game, e, kind, t: now }] };
}

// ---------- Board bridge: real tiles in their Talk places ----------
// Core words keep their Talk column (index % 6) so the hand goes to the same place.
export function layoutTiles(words, core, cols = 6) {
  const pos = new Map(core.map((c, i) => [c.w.toLowerCase(), i]));
  const placed = [], free = [];
  for (const w of words) { const i = pos.get(w.toLowerCase()); i === undefined ? free.push(w) : placed.push({ w, col: (i % cols) + 1, row: Math.floor(i / cols) }); }
  placed.sort((a, b) => a.row - b.row || a.col - b.col);
  const rows = []; // pack into rows without moving columns
  for (const p of placed) { let r = rows.find((x) => !x.has(p.col)); if (!r) rows.push((r = new Set())); r.add(p.col); p.r = rows.indexOf(r); }
  for (const w of free) { let r = rows.findIndex((x) => x.size < cols), set = rows[r]; if (r < 0) { rows.push((set = new Set())); r = rows.length - 1; } let col = 1; while (set.has(col)) col++; set.add(col); placed.push({ w, col, r }); }
  return placed.map(({ w, col, r }) => ({ w, col, row: r + 1 }));
}

// ---------- 1. Word Garden ----------
// A word sprouts its plant; the same word grows it (up to 3); two different
// words within 8 s make the second one bloom. Nothing ever wilts.
export function gardenStep(state = { plants: [], last: null }, word, now = Date.now(), combos = true) {
  const plants = state.plants.map((p) => ({ ...p }));
  let p = plants.find((x) => x.w === word), event;
  const combo = combos && state.last && state.last.w !== word && now - state.last.t < 8000;
  if (!p) { p = { w: word, stage: 1 }; plants.push(p); event = "sprout"; }
  else if (p.stage < 3) { p.stage += 1; event = "grow"; } else event = "sway";
  if (combo) { p.stage = 3; event = "bloom"; }
  return { state: { plants, last: { w: word, t: now } }, event, say: combo ? `${state.last.w} ${word}!` : word };
}

// ---------- 2. Conductor ----------
// Nothing moves until he asks. Words: go, stop, fast, slow, more, again, and places.
export const PLACES = ["park", "home", "school"];
export function conductorStep(s = { moving: false, speed: 1, dest: null, lastTrip: null }, word) {
  const n = { ...s }; let anim = null, say = word;
  if (PLACES.includes(word)) { n.dest = word; say = `To the ${word}!`; if (n.moving) anim = "trip"; }
  else if (word === "go") { n.moving = true; anim = n.dest ? "trip" : "roll"; say = "Go!"; }
  else if (word === "stop") { n.moving = false; anim = "stop"; say = "Stop."; }
  else if (word === "fast") { n.speed = 2; anim = n.moving ? "speed" : null; say = "Fast!"; }
  else if (word === "slow") { n.speed = 1; anim = n.moving ? "speed" : null; say = "Slow."; }
  else if (word === "more") { n.speed = Math.min(3, n.speed + 1); n.moving = true; anim = n.dest ? "trip" : "roll"; say = "More!"; }
  else if (word === "again") { if (n.lastTrip) { n.dest = n.lastTrip; n.moving = true; anim = "trip"; say = `Again! To the ${n.lastTrip}.`; } else { n.moving = true; anim = "roll"; say = "Again!"; } }
  if (anim === "trip") n.lastTrip = n.dest;
  return { state: n, anim, say };
}
export const tripMs = (speed) => [0, 6000, 4000, 2800][speed] || 4000;

// ---------- 3. Feelings Weather ----------
export const WEATHER = [
  { id: "sunny", e: "☀️", feel: "happy", sky: "#f6e7c1" },
  { id: "cloudy", e: "☁️", feel: "okay", sky: "#d9dee3" },
  { id: "windy", e: "🌬️", feel: "wiggly", sky: "#d6e6ee" },
  { id: "rainy", e: "🌧️", feel: "sad", sky: "#b9c6d2" },
  { id: "stormy", e: "⛈️", feel: "angry", sky: "#8e97a6" },
  { id: "foggy", e: "🌫️", feel: "tired", sky: "#e2e2dc" },
];
// A storm (or rain) shrinks one step per breath he chooses to take; it never shrinks by itself.
export const stormSteps = (id) => (id === "stormy" ? 3 : id === "rainy" ? 2 : 0);
export const afterBreath = (left) => Math.max(0, left - 1);

// ---------- 4. Story Stage ----------
export const CAST = [{ w: "dino", e: "🦖" }, { w: "cat", e: "🐱" }, { w: "train", e: "🚂" }, { w: "fish", e: "🐟" }, { w: "dog", e: "🐶" }];
export const ACTS = [{ w: "jump", e: "⤴️", s: "jumps" }, { w: "run", e: "💨", s: "runs" }, { w: "sleep", e: "💤", s: "sleeps" }, { w: "eat", e: "🍽️", s: "eats" }, { w: "dance", e: "💃", s: "dances" }, { w: "swim", e: "🌊", s: "swims" }];
export const STAGES = [{ w: "park", e: "🌳" }, { w: "home", e: "🏠" }, { w: "sea", e: "🌊" }, { w: "space", e: "🚀" }];
export function sentence({ who, act, where }) {
  const a = ACTS.find((x) => x.w === act);
  return `The ${who} ${a ? a.s : act}${where ? ` ${where === "home" ? "at home" : `in the ${where}`}` : ""}.`;
}

// ---------- 5. Pattern Lab ----------
export const SORT_SETS = {
  kind: [{ box: "animals", e: "🐾", items: ["🐶", "🐱", "🐮", "🐸", "🐟", "🦆"] }, { box: "food", e: "🍎", items: ["🍎", "🍌", "🍞", "🧀", "🍕", "🥕"] }, { box: "vehicles", e: "🚗", items: ["🚗", "🚂", "🚌", "✈️", "🚲", "🚀"] }, { box: "clothes", e: "👕", items: ["👕", "👖", "🧦", "👟", "🧢", "🧤"] }],
  color: [{ box: "red", e: "🟥", items: ["🍎", "🍓", "🌹", "🚒"] }, { box: "yellow", e: "🟨", items: ["🍌", "🌻", "🐤", "🧀"] }, { box: "green", e: "🟩", items: ["🥦", "🐸", "🍀", "🥒"] }, { box: "blue", e: "🟦", items: ["🐳", "🫐", "💧", "🧢"] }],
};
export function sortRound(kind = "kind", boxes = 2, rnd = Math.random) {
  const sets = SORT_SETS[kind].slice().sort(() => rnd() - 0.5).slice(0, Math.min(4, Math.max(2, boxes)));
  const target = sets[Math.floor(rnd() * sets.length)];
  return { boxes: sets.map(({ box, e }) => ({ box, e })), item: target.items[Math.floor(rnd() * target.items.length)], answer: target.box };
}
// A wrong box is never "wrong": the item just waits and the right box glows.
export const sortTry = (round, box) => (box === round.answer ? { ok: true, say: `Yes, ${box}!` } : { ok: false, say: `Let's try the ${round.answer} box.`, hint: round.answer });

// ---------- 6. My Turn, Your Turn ----------
export const TURN_ROUNDS = ["blocks", "drum", "picture"];
export function nextTurn(s = { who: "child", n: 0, round: "blocks" }) {
  const n = s.n + 1;
  return { who: s.who === "child" ? "grown-up" : "child", n, round: TURN_ROUNDS[Math.floor(n / 6) % TURN_ROUNDS.length] };
}

// ---------- 7. Sound Pond ----------
// Loudness makes ripples, pitch moves the fish, a long sound swims it across.
export function pondFrame(s = { held: 0, x: 0 }, level, hz, dtMs = 100) {
  const on = level > 0.3, held = on ? s.held + dtMs : 0;
  const y = hz ? Math.max(0, Math.min(1, (Math.log2(hz) - Math.log2(120)) / (Math.log2(600) - Math.log2(120)))) : null;
  const x = held > 600 ? Math.min(1, s.x + dtMs / 4000) : s.x;
  return { held, x, ripple: on, y, arrived: s.x < 1 && x >= 1 };
}

// ---------- 8. Copy the Robot ----------
export const POSES = [
  { id: "arms-up", e: "🙌", say: "Arms up!" },
  { id: "arms-out", e: "🫸", say: "Arms out wide!" },
  { id: "hands-head", e: "🙆", say: "Hands on head!" },
  { id: "one-up", e: "🙋", say: "One arm up!" },
];
// MediaPipe Pose landmarks (normalised, y grows downward): 0 nose, 11/12 shoulders, 15/16 wrists.
export function classifyPose(lm) {
  if (!lm || lm.length < 17) return null;
  const n = lm[0], sl = lm[11], sr = lm[12], wl = lm[15], wr = lm[16];
  const sw = Math.hypot(sl.x - sr.x, sl.y - sr.y) || 0.2;
  const upL = wl.y < n.y, upR = wr.y < n.y;
  const near = (w) => Math.hypot(w.x - n.x, w.y - n.y) < 0.9 * sw && w.y < (sl.y + sr.y) / 2;
  if (near(wl) && near(wr)) return "hands-head";
  if (upL && upR) return "arms-up";
  if (upL !== upR) return "one-up";
  const level = (w, s) => Math.abs(w.y - s.y) < 0.6 * sw;
  if (level(wl, sl) && level(wr, sr) && Math.abs(wl.x - wr.x) > 2.2 * sw) return "arms-out";
  return null;
}
