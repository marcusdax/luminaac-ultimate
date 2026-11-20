// Bridge, Phase 7: the caregiver-picked video board, sound game settings and goals,
// and Insights from history (interests, words, growth, feelings, weekly digest,
// printable therapist summary). Same in-memory document as bridge.js (window.__bridge).
import { uid } from "./shared.js";
import { TOPICS, parseYouTube, videoStats, topicInterest, suggestWords, topWords, growth, byPartOfDay, moodLinks, digest, reportHTML, goalProgress, GAME_NAMES } from "./interests.js";
import { streak } from "./games.js";
import { LABELS } from "./emotion.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const V = () => (db().videos ||= { on: true, thumbs: false, list: [], sessions: [], talk: [] });
const G = () => (db().games ||= { settings: { mic: false, volume: 0.7, quiet: false, calm: false, choices: 3, reward: "stickers" }, goals: [], plays: [] });
const appLog = () => { try { return JSON.parse(localStorage.getItem("luminaac:log") || "[]"); } catch { return []; } };
const appCounts = () => { try { return JSON.parse(localStorage.getItem("luminaac:counts") || "{}"); } catch { return {}; } };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Video board ----------
$("#topicPick").innerHTML = Object.entries(TOPICS).map(([k, t]) => `<label class="topic-chip"><input type="checkbox" name="topics" value="${k}" /> <span aria-hidden="true">${t.e}</span> ${esc(t.label)}</label>`).join("");

function renderVideos() {
  const v = V();
  $("#vOn").checked = !!v.on; $("#vThumbs").checked = !!v.thumbs;
  $("#vCount").textContent = `${v.list.length} video${v.list.length === 1 ? "" : "s"}`;
  const ul = $("#videoList"); ul.textContent = "";
  if (!v.list.length) ul.innerHTML = `<li class="soft">No videos yet. Add one your child already loves.</li>`;
  const st = Object.fromEntries(videoStats(v.list, v.sessions, v.talk).map((s) => [s.id, s]));
  for (const x of v.list) {
    const li = document.createElement("li"); li.className = "video-row";
    const s = st[x.id];
    li.innerHTML = `<span class="video-e" aria-hidden="true">${esc(x.e || "🎬")}</span><span class="video-meta"><b>${esc(x.title)}</b><span class="soft">${x.topics.map((k) => esc(TOPICS[k]?.label || k)).join(", ") || "No topic"} · ${s.opens ? `chosen ${s.opens} time${s.opens > 1 ? "s" : ""}` : "not watched yet"}</span><span class="soft">Words: ${esc(x.words.join(", ") || "from topics")}</span></span>`;
    const b = Object.assign(document.createElement("button"), { type: "button", className: "link-btn", textContent: "Remove" });
    b.setAttribute("aria-label", `Remove ${x.title}`);
    b.addEventListener("click", () => { v.list = v.list.filter((y) => y !== x); B.save(`Removed video "${x.title}"`); renderVideos(); });
    li.append(b); ul.append(li);
  }
}
$("#formVideo").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = new FormData(e.target), err = $("#vUrlErr"), url = $("#formVideo [name=url]");
  const p = parseYouTube(f.get("url"));
  const title = String(f.get("title") || "").trim();
  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; el.setAttribute("aria-invalid", "true"); el.focus(); };
  url.removeAttribute("aria-invalid"); err.hidden = true;
  if (!p) return fail("That doesn't look like a YouTube video link. Copy the link from the Share button and try again.", url);
  if (!title) return fail("Give the video a short name for its button.", $("#formVideo [name=title]"));
  if (V().list.some((x) => x.yt === p.id)) return fail("That video is already on the board.", url);
  const words = String(f.get("words") || "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  V().list.push({ id: uid("v"), yt: p.id, start: p.start, title, e: String(f.get("e") || "").trim() || "🎬", topics: f.getAll("topics"), words, added: Date.now() });
  e.target.reset(); B.save(`Added video "${title}"`); B.toast(`Added "${title}" to the video board`); renderVideos();
});
$("#vOn").addEventListener("change", (e) => { V().on = e.target.checked; B.save(e.target.checked ? "Turned on My videos" : "Turned off My videos"); });
$("#vThumbs").addEventListener("change", (e) => { V().thumbs = e.target.checked; B.save("Changed video pictures"); });

// ---------- Game settings and goals ----------
const setForm = $("#formGameSet");
function renderGames() {
  const s = G().settings;
  for (const k of ["mic", "quiet", "calm"]) setForm.elements[k].checked = !!s[k];
  setForm.elements.volume.value = s.volume; setForm.elements.choices.value = String(s.choices); setForm.elements.reward.value = s.reward;
  setForm.elements.volume.setAttribute("aria-valuetext", `${Math.round(s.volume * 100)} percent`);
  const ul = $("#goalList"); ul.textContent = "";
  const gp = goalProgress(G().goals, G().plays);
  if (!gp.length) ul.innerHTML = `<li class="soft">No goals yet. A small goal, like 10 turns a week, works well.</li>`;
  for (const g of gp) {
    const li = document.createElement("li");
    li.innerHTML = `<span><b>${esc(g.label)}</b> <span class="soft">${g.done} of ${g.target} this week</span><span class="meter" role="img" aria-label="${g.pct} percent of the goal"><i style="--w:${g.pct}%"></i></span></span>`;
    const b = Object.assign(document.createElement("button"), { type: "button", className: "link-btn", textContent: "Remove" });
    b.setAttribute("aria-label", `Remove goal ${g.label}`);
    b.addEventListener("click", () => { G().goals = G().goals.filter((x) => x.id !== g.id); B.save("Removed a game goal"); renderGames(); });
    li.append(b); ul.append(li);
  }
}
setForm.addEventListener("change", () => {
  const f = setForm.elements, s = G().settings;
  Object.assign(s, { mic: f.mic.checked, quiet: f.quiet.checked, calm: f.calm.checked, volume: +f.volume.value, choices: +f.choices.value, reward: f.reward.value });
  f.volume.setAttribute("aria-valuetext", `${Math.round(s.volume * 100)} percent`);
  B.save("Changed sound game settings");
});
$("#formGoal").addEventListener("submit", (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  G().goals.push({ id: uid("g"), game: f.get("game"), perWeek: Math.max(1, Math.min(100, +f.get("perWeek") || 10)) });
  B.save("Added a game goal"); renderGames();
});

// ---------- Insights ----------
const bars = (rows, label) => rows.length ? `<ul class="hbars">${rows.map((r) => `<li><span>${r.l}</span><i style="--w:${r.pct}%"></i><b>${r.v}</b></li>`).join("")}</ul>` : `<p class="soft">${label}</p>`;
function renderInsights7() {
  const v = V(), g = G(), log = appLog(), counts = appCounts();
  const st = videoStats(v.list, v.sessions, v.talk), ti = topicInterest(st);
  $("#interestMap").innerHTML = ti.length
    ? `<div class="interest-map" role="list">${ti.map((t) => `<div role="listitem" class="interest" style="--s:${0.7 + t.pct / 200}"><span aria-hidden="true">${t.e}</span><b>${esc(t.label)}</b><span class="soft">${t.pct >= 70 ? "Loves" : t.pct >= 35 ? "Likes" : "Sometimes"}</span></div>`).join("")}</div>`
    : `<p class="soft">Add videos with topics in Videos and games. Interests appear as your child chooses them.</p>`;
  const tw = topWords(counts, 8), twMax = Math.max(1, ...tw.map((w) => w.n));
  $("#topWordsChart").innerHTML = bars(tw.map((w) => ({ l: esc(w.word), v: w.n, pct: (w.n / twMax) * 100 })), "Words appear here as My Voice is used.");
  const gr = growth(log, 8), gMax = Math.max(1, ...gr.map((w) => w.msgs)), nMax = Math.max(1, ...gr.map((w) => w.newWords.length));
  const pts = gr.map((w, i) => `${i * 35 + 17},${105 - (w.newWords.length / nMax) * 90}`).join(" ");
  $("#growthChart").innerHTML = `<svg viewBox="0 0 280 125" class="chart growth" role="img" aria-label="Messages and new words per week for 8 weeks. This week: ${gr[7].msgs} messages, ${gr[7].newWords.length} new words.">
    ${gr.map((w, i) => `<rect x="${i * 35 + 6}" y="${105 - (w.msgs / gMax) * 90}" width="22" height="${Math.max(2, (w.msgs / gMax) * 90)}" rx="4"/>`).join("")}
    <polyline points="${pts}" class="line"/>${gr.map((w, i) => `<circle cx="${i * 35 + 17}" cy="${105 - (w.newWords.length / nMax) * 90}" r="4" class="dot"/>`).join("")}
    <line x1="0" y1="106" x2="280" y2="106"/><text x="0" y="122" class="ax">8 weeks ago</text><text x="280" y="122" text-anchor="end" class="ax">This week</text></svg>
    <p class="legend-row"><span class="key bar"></span> Messages <span class="key line"></span> New words</p>
    <table class="sr-only"><caption>Messages and new words per week</caption><tr><th>Week ending</th><th>Messages</th><th>New words</th></tr>${gr.map((w) => `<tr><td>${new Date(w.end).toLocaleDateString()}</td><td>${w.msgs}</td><td>${w.newWords.length}</td></tr>`).join("")}</table>`;
  const extra = [...new Set(st.slice(0, 3).flatMap((s) => v.list.find((x) => x.id === s.id)?.words || []))];
  const tryW = suggestWords(ti, counts, extra, 10);
  $("#tryWords").innerHTML = tryW.length
    ? `<p class="soft">From the videos and topics your child enjoys, not yet said in My Voice. Add them as buttons or model them while watching.</p><div class="chips">${tryW.map((w) => `<span class="chip static">${esc(w)}</span>`).join("")}</div>`
    : `<p class="soft">Ideas appear once a few videos have been watched.</p>`;
  const watched = st.filter((s) => s.opens);
  $("#videoStats").innerHTML = watched.length
    ? `<table class="data"><thead><tr><th scope="col">Video</th><th scope="col">Chosen</th><th scope="col">Again</th><th scope="col">Finished</th><th scope="col">Talked about</th></tr></thead><tbody>${watched.slice(0, 6).map((s) => `<tr><th scope="row">${esc(s.title)}</th><td>${s.opens}</td><td>${s.replays}</td><td>${Math.round(s.completion * 100)}%</td><td>${s.talk}</td></tr>`).join("")}</tbody></table><p class="soft small">Quick skips: ${watched.reduce((a, s) => a + s.skips, 0)}. A skip can mean "not now" as much as "don't like".</p>`
    : `<p class="soft">Nothing watched yet.</p>`;
  const ml = moodLinks(db().moments, v.sessions, v.list);
  $("#moodLinks").innerHTML = ml.length
    ? `<ul class="mini-list">${ml.slice(0, 5).map((m) => `<li><span>${LABELS[m.mood]?.e || ""} <b>${esc(LABELS[m.mood]?.t || m.mood)}</b> near ${esc(TOPICS[m.topic]?.label.toLowerCase() || m.topic)} videos <span class="soft">${m.n} time${m.n > 1 ? "s" : ""}</span></span></li>`).join("")}</ul><p class="soft small">Seen within 30 minutes of each other, using feelings you checked. It's a pattern to notice, not a cause.</p>`
    : `<p class="soft">When you confirm feelings on moments near video time, patterns show here.</p>`;
  const plays = g.plays, wk = plays.filter((p) => p.t > Date.now() - 7 * 864e5);
  const byGame = Object.keys(GAME_NAMES).map((k) => ({ l: GAME_NAMES[k], v: wk.filter((p) => p.game === k).length }));
  const bm = Math.max(1, ...byGame.map((x) => x.v));
  const tod = byPartOfDay(plays.map((p) => p.t)), bestTod = Object.entries(tod).sort((a, b) => b[1] - a[1])[0];
  $("#gameProgress").innerHTML = `<div class="stats"><div class="stat"><b>${streak(plays)}</b><span>day streak</span></div><div class="stat"><b>${wk.length}</b><span>turns this week</span></div><div class="stat"><b>${plays.length}</b><span>stickers earned</span></div></div>
    ${bars(byGame.map((x) => ({ l: esc(x.l), v: x.v, pct: (x.v / bm) * 100 })), "")}
    ${goalProgress(g.goals, plays).map((p) => `<p>${esc(p.label)}: ${p.done} of ${p.target} <span class="meter" role="img" aria-label="${p.pct} percent of the goal"><i style="--w:${p.pct}%"></i></span></p>`).join("")}
    ${bestTod?.[1] ? `<p class="soft">Most games are played in the ${bestTod[0]}.</p>` : ""}`;
  const dg = digest({ log, counts, sessions: v.sessions, videos: v.list, plays, moments: db().moments });
  $("#digestList").innerHTML = dg.map((x) => `<li>${esc(x)}</li>`).join("");
}
$("#btnReport").addEventListener("click", () => {
  const v = V();
  $("#reportBody").innerHTML = reportHTML({ child: db().profile.child, log: appLog(), counts: appCounts(), sessions: v.sessions, videos: v.list, plays: G().plays, goals: G().goals, moments: db().moments });
  $("#reportDlg").showModal(); $("#btnPrint").focus();
});
$("#btnPrint").addEventListener("click", () => { document.body.classList.add("printing-report"); window.print(); });
addEventListener("afterprint", () => document.body.classList.remove("printing-report"));
$("#btnReportClose").addEventListener("click", () => $("#reportDlg").close());

function onShow(tab) { if (tab === "play") { renderVideos(); renderGames(); } if (tab === "insights") renderInsights7(); }
addEventListener("bridge:show", (e) => onShow(e.detail));
addEventListener("storage", (e) => { if (e.key?.startsWith("luminaac:")) setTimeout(() => onShow(B.current), 50); });
onShow(B.current);
B.renderInsights7 = renderInsights7;
