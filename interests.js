// Phase 7: interests from caregiver-picked videos, and history insights.
// Pure functions (no DOM, no network) shared by My Voice, the Bridge and the tests.
// Everything is computed on the device from data that never leaves it unless the
// family turns on sync. Nothing here guesses at a diagnosis: it counts what happened.

export const TOPICS = {
  animals: { e: "🐶", label: "Animals", words: ["dog", "cat", "cow", "duck", "fish", "big", "little", "loud", "eat", "run"] },
  vehicles: { e: "🚂", label: "Trains and cars", words: ["train", "car", "bus", "go", "stop", "fast", "slow", "up", "down", "again"] },
  music: { e: "🎵", label: "Music and songs", words: ["sing", "dance", "clap", "loud", "quiet", "more", "again", "happy"] },
  nature: { e: "🌊", label: "Water and nature", words: ["water", "tree", "rain", "sun", "outside", "look", "splash", "wet"] },
  food: { e: "🍎", label: "Food and cooking", words: ["eat", "drink", "yummy", "yucky", "cook", "more", "all done", "hot"] },
  people: { e: "🧑", label: "People and friends", words: ["friend", "mom", "dad", "hello", "bye", "play", "help", "hug"] },
  building: { e: "🧱", label: "Building and making", words: ["build", "fall", "tall", "make", "open", "close", "again", "uh oh"] },
  space: { e: "🚀", label: "Space", words: ["rocket", "moon", "star", "up", "fly", "big", "dark", "blast off"] },
  calm: { e: "🐠", label: "Calm and sensory", words: ["calm", "slow", "quiet", "look", "breathe", "nice", "soft", "more"] },
  letters: { e: "🔤", label: "Letters and numbers", words: ["letter", "number", "count", "read", "say", "sing", "one", "two"] },
};

// ---------- YouTube links ----------
const ID = /^[A-Za-z0-9_-]{11}$/;
// Accepts watch, youtu.be, shorts, embed, live, music and nocookie links, or a bare 11-character id.
export function parseYouTube(input) {
  const s = String(input || "").trim();
  if (ID.test(s)) return { id: s, start: 0 };
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return null; }
  const host = u.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else { const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/); if (m) id = m[2]; }
  }
  if (!id || !ID.test(id)) return null;
  const t = u.searchParams.get("t") || u.searchParams.get("start") || "";
  const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  const start = m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  return { id, start };
}

// Privacy-enhanced mode, no related videos from other channels, no annotations,
// no fullscreen or keyboard shortcuts, captions on, never autoplay.
export const PLAYER_VARS = { controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, cc_load_policy: 1, autoplay: 0, enablejsapi: 1 };
export const NOCOOKIE = "https://www.youtube-nocookie.com";
export function embedSrc(id, { origin = "", start = 0 } = {}) {
  if (!ID.test(id)) throw new Error("bad id");
  const p = new URLSearchParams({ ...PLAYER_VARS, ...(origin ? { origin } : {}), ...(start ? { start } : {}) });
  return `${NOCOOKIE}/embed/${id}?${p}`;
}

// ---------- Engagement ----------
// A session is one opening of one video: { t, v, w: seconds watched, d: duration, r: replays, e: reached the end, sk: closed early }
export function closeSession(s) {
  const watched = Math.max(0, Math.round(s.w || 0)), d = Math.max(0, Math.round(s.d || 0));
  return { t: s.t, v: s.v, w: watched, d, r: s.r || 0, e: !!s.e, sk: !s.e && d > 0 && watched < Math.min(20, d * 0.25) };
}

export function videoStats(videos = [], sessions = [], talk = []) {
  return videos.map((v) => {
    const ss = sessions.filter((s) => s.v === v.id), tk = talk.filter((x) => x.v === v.id);
    const opens = ss.length, replays = ss.reduce((a, s) => a + (s.r || 0), 0), skips = ss.filter((s) => s.sk).length;
    const comp = ss.filter((s) => s.d).map((s) => Math.min(1, s.w / s.d));
    const completion = comp.length ? comp.reduce((a, b) => a + b, 0) / comp.length : 0;
    const minutes = ss.reduce((a, s) => a + (s.w || 0), 0) / 60;
    // A simple, explainable score: choosing it, coming back, finishing, talking about it count up; quick skips count down.
    const score = opens + 2 * replays + 2 * completion * opens + 1.5 * tk.length - skips;
    return { id: v.id, title: v.title, topics: v.topics || [], opens, replays, skips, completion, minutes, talk: tk.length, score: Math.max(0, score) };
  }).sort((a, b) => b.score - a.score);
}

export function topicInterest(stats) {
  const raw = {};
  for (const s of stats) for (const k of s.topics) raw[k] = (raw[k] || 0) + s.score / Math.max(1, s.topics.length);
  const max = Math.max(0, ...Object.values(raw));
  return Object.entries(raw).filter(([k]) => TOPICS[k]).map(([k, v]) => ({ topic: k, ...TOPICS[k], score: v, pct: max ? Math.round((v / max) * 100) : 0 })).sort((a, b) => b.score - a.score);
}

// Words from the child's favourite topics that they haven't said yet: a fringe set to try next.
export function suggestWords(interest, counts = {}, extra = [], n = 8) {
  const out = [];
  for (const w of extra) if (!counts[w.toLowerCase()] && !out.includes(w.toLowerCase())) out.push(w.toLowerCase());
  for (const it of interest) for (const w of TOPICS[it.topic]?.words || []) if (!counts[w] && !out.includes(w)) out.push(w);
  return out.slice(0, n);
}

// ---------- History ----------
export const wordsOf = (text) => String(text || "").toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter((w) => w.length > 0);
export function topWords(counts = {}, n = 10) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([word, n]) => ({ word, n }));
}

const WEEK = 7 * 864e5;
// Messages and first-time words per week, oldest first.
export function growth(log = [], weeks = 8, now = Date.now()) {
  const first = new Map();
  for (const l of [...log].sort((a, b) => a.t - b.t)) for (const w of wordsOf(l.text)) if (!first.has(w)) first.set(w, l.t);
  return Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * WEEK, start = end - WEEK;
    const msgs = log.filter((l) => l.t > start && l.t <= end).length;
    const newWords = [...first.entries()].filter(([, t]) => t > start && t <= end).map(([w]) => w);
    return { start, end, msgs, newWords };
  });
}

export function partOfDay(t) { const h = new Date(t).getHours(); return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night"; }
export function byPartOfDay(times = []) {
  const c = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const t of times) c[partOfDay(t)]++;
  return c;
}

// Feelings a caregiver confirmed (or a confident estimate not rejected), seen within
// 30 minutes of a video. "Seen together", never "caused".
export function moodLinks(moments = [], sessions = [], videos = [], windowMs = 30 * 60e3) {
  const topicsOf = Object.fromEntries(videos.map((v) => [v.id, v.topics || []]));
  const rows = {};
  for (const m of moments) {
    const e = m.emotion; if (!e || e.confirmed === false || !(e.confirmed || e.conf >= 0.6)) continue;
    const near = sessions.filter((s) => Math.abs(s.t - m.t) <= windowMs);
    for (const s of near) for (const k of topicsOf[s.v] || []) { const key = `${e.label}|${k}`; rows[key] = (rows[key] || 0) + 1; }
  }
  return Object.entries(rows).map(([k, n]) => { const [mood, topic] = k.split("|"); return { mood, topic, n }; }).sort((a, b) => b.n - a.n);
}

export const WORD_MILESTONES = [10, 25, 50, 100, 200, 300, 500];
export function milestones(log = [], plays = []) {
  const out = [], seen = new Set();
  for (const l of [...log].sort((a, b) => a.t - b.t)) {
    for (const w of wordsOf(l.text)) {
      if (seen.has(w)) continue; seen.add(w);
      if (WORD_MILESTONES.includes(seen.size)) out.push({ t: l.t, text: `${seen.size} different words used` });
    }
  }
  const multi = [...log].sort((a, b) => a.t - b.t).find((l) => wordsOf(l.text).length >= 2);
  if (multi) out.push({ t: multi.t, text: `First message with two or more words: "${multi.text}"` });
  const g = [...plays].sort((a, b) => a.t - b.t);
  if (g[0]) out.push({ t: g[0].t, text: "First sound game played" });
  if (g[49]) out.push({ t: g[49].t, text: "50 sound game turns" });
  return out.sort((a, b) => b.t - a.t);
}

// Plain-language weekly summary. Strengths first, no scores out of 100, no judgements.
export function digest({ log = [], counts = {}, sessions = [], videos = [], plays = [], moments = [], now = Date.now() }) {
  const wk = (t) => t > now - WEEK, prev = (t) => t <= now - WEEK && t > now - 2 * WEEK;
  const g = growth(log, 2, now), out = [];
  const m1 = log.filter((l) => wk(l.t)).length, m0 = log.filter((l) => prev(l.t)).length;
  out.push(m1 ? `${m1} messages this week${m0 ? (m1 >= m0 ? `, up from ${m0}` : `, compared with ${m0} last week`) : ""}.` : "No messages this week yet. That's okay; quiet weeks happen.");
  const nw = g[1].newWords;
  if (nw.length) out.push(`New words this week: ${nw.slice(0, 8).join(", ")}${nw.length > 8 ? ` and ${nw.length - 8} more` : ""}.`);
  const ss = sessions.filter((s) => wk(s.t));
  if (ss.length) {
    const st = videoStats(videos, ss).filter((s) => s.opens);
    if (st[0]) out.push(`Most enjoyed video: "${st[0].title}" (chosen ${st[0].opens} time${st[0].opens > 1 ? "s" : ""}${st[0].replays ? `, watched again ${st[0].replays}` : ""}).`);
  }
  const pl = plays.filter((p) => wk(p.t));
  if (pl.length) out.push(`${pl.length} sound game turns on ${new Set(pl.map((p) => new Date(p.t).toDateString())).size} day(s).`);
  const tod = byPartOfDay(log.filter((l) => wk(l.t)).map((l) => l.t)), best = Object.entries(tod).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1]) out.push(`Most talking happened in the ${best[0]}.`);
  const ml = moodLinks(moments.filter((m) => wk(m.t)), ss, videos)[0];
  if (ml && ml.n >= 2) out.push(`"${ml.mood}" moments were seen near ${TOPICS[ml.topic]?.label.toLowerCase() || ml.topic} videos ${ml.n} times. Worth watching, not a conclusion.`);
  return out;
}

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// A one-page summary a parent can print or save as PDF for a speech therapist.
export function reportHTML({ child = "", log = [], counts = {}, sessions = [], videos = [], plays = [], goals = [], moments = [], now = Date.now() }) {
  const g = growth(log, 8, now), st = videoStats(videos, sessions), ti = topicInterest(st);
  const tw = topWords(counts, 12), ms = milestones(log, plays).slice(0, 6), dg = digest({ log, counts, sessions, videos, plays, moments, now });
  const gp = goalProgress(goals, plays, now), date = new Date(now).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
  return `<article class="report">
<h1>Communication summary${child ? ` for ${esc(child)}` : ""}</h1>
<p class="soft">Prepared by the family with LuminAAC on ${esc(date)}. Counts come from this device only. This is a record of what happened, not an assessment or diagnosis.</p>
<h2>This week</h2><ul>${dg.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h2>Growth over 8 weeks</h2><table><thead><tr><th scope="col">Week ending</th><th scope="col">Messages</th><th scope="col">New words</th></tr></thead><tbody>${g.map((w) => `<tr><td>${esc(new Date(w.end).toLocaleDateString([], { month: "short", day: "numeric" }))}</td><td>${w.msgs}</td><td>${w.newWords.length}</td></tr>`).join("")}</tbody></table>
<h2>Most used words</h2><p>${tw.length ? tw.map((w) => `${esc(w.word)} (${w.n})`).join(", ") : "None yet."}</p>
<h2>Interests</h2><p>${ti.length ? ti.slice(0, 5).map((t) => `${esc(t.label)}`).join(", ") : "Add videos in the Bridge to see interests."}</p>
<h2>Sound practice goals</h2>${gp.length ? `<ul>${gp.map((p) => `<li>${esc(p.label)}: ${p.done} of ${p.target} this week</li>`).join("")}</ul>` : "<p>No goals set.</p>"}
<h2>Milestones</h2>${ms.length ? `<ul>${ms.map((m) => `<li>${esc(new Date(m.t).toLocaleDateString())}: ${esc(m.text)}</li>`).join("")}</ul>` : "<p>None yet.</p>"}
<h2>Notes for the therapist</h2><p class="lines"></p>
</article>`;
}

// ---------- Goals (shared with games.js) ----------
export const GAME_NAMES = { echo: "Copy my sound", match: "Sound and picture", first: "First sounds", turns: "My turn, your turn" };
export function goalProgress(goals = [], plays = [], now = Date.now()) {
  return goals.map((g) => {
    const done = plays.filter((p) => p.t > now - WEEK && (g.game === "any" || p.game === g.game)).length;
    return { ...g, label: g.game === "any" ? "Any sound game" : GAME_NAMES[g.game] || g.game, done, target: g.perWeek, pct: Math.min(100, Math.round((done / Math.max(1, g.perWeek)) * 100)) };
  });
}
