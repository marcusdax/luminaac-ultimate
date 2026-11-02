// Unit tests for interests.js and games.js. Run: node tests/interests-games.test.mjs
import * as I from "../interests.js";
import * as G from "../games.js";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const DAY = 864e5, now = Date.UTC(2026, 9, 31, 17);

// YouTube links
t("watch url", I.parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ").id === "dQw4w9WgXcQ");
t("short link with time", (() => { const r = I.parseYouTube("https://youtu.be/dQw4w9WgXcQ?t=1m5s"); return r.id === "dQw4w9WgXcQ" && r.start === 65; })());
t("shorts", I.parseYouTube("https://youtube.com/shorts/dQw4w9WgXcQ").id === "dQw4w9WgXcQ");
t("nocookie embed", I.parseYouTube("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ").id === "dQw4w9WgXcQ");
t("bare id", I.parseYouTube("dQw4w9WgXcQ").id === "dQw4w9WgXcQ");
t("rejects other sites", !I.parseYouTube("https://evil.example/watch?v=dQw4w9WgXcQ"));
t("rejects junk", !I.parseYouTube("hello there"));
const src = I.embedSrc("dQw4w9WgXcQ", { origin: "https://x.test" });
t("embed is privacy-enhanced", src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
t("embed locks controls", /rel=0/.test(src) && /autoplay=0/.test(src) && /fs=0/.test(src) && /disablekb=1/.test(src) && /iv_load_policy=3/.test(src));
t("player vars no autoplay", I.PLAYER_VARS.autoplay === 0 && I.PLAYER_VARS.rel === 0);

// Sessions and stats
const sk = I.closeSession({ t: 1, v: "a", w: 5, d: 200, r: 0, e: false });
t("early close is a skip", sk.sk === true);
t("ended is not a skip", I.closeSession({ t: 1, v: "a", w: 5, d: 6, r: 0, e: true }).sk === false);
const videos = [{ id: "a", title: "Trains", topics: ["vehicles"] }, { id: "b", title: "Rain", topics: ["nature", "calm"] }];
const sessions = [
  { t: now - DAY, v: "a", w: 120, d: 120, r: 2, e: true, sk: false },
  { t: now - 2 * DAY, v: "a", w: 100, d: 120, r: 1, e: false, sk: false },
  { t: now - DAY, v: "b", w: 5, d: 300, r: 0, e: false, sk: true },
];
const st = I.videoStats(videos, sessions, [{ v: "a", word: "go" }]);
t("stats sorted by score", st[0].id === "a" && st[0].opens === 2 && st[0].replays === 3);
t("skips lower score", st[1].skips === 1 && st[1].score < st[0].score);
const ti = I.topicInterest(st);
t("top topic is vehicles", ti[0].topic === "vehicles" && ti[0].pct === 100);
const sw = I.suggestWords(ti, { train: 4 }, ["Choo choo"], 6);
t("suggests unused words", !sw.includes("train") && sw[0] === "choo choo" && sw.length <= 6);

// History
const log = [{ t: now - 20 * DAY, text: "want juice" }, { t: now - 2 * DAY, text: "want train" }, { t: now - DAY, text: "go train go" }];
const gr = I.growth(log, 4, now);
t("growth has weeks", gr.length === 4 && gr[3].msgs === 2);
t("new words this week", gr[3].newWords.includes("train") && !gr[3].newWords.includes("want"));
t("top words", I.topWords({ a: 1, b: 5, c: 3 }, 2).map((x) => x.word ?? x[0]).join() === "b,c");
t("part of day", ["morning", "afternoon", "evening", "night"].includes(I.partOfDay(now)));
const ml = I.moodLinks([{ t: now - DAY + 60e3, emotion: { label: "happy", conf: 0.9 } }, { t: now - DAY, emotion: { label: "upset", conf: 0.2 } }], sessions, videos);
t("mood links only confident moods", ml.some((x) => x.mood === "happy") && !ml.some((x) => x.mood === "upset"));
const many = Array.from({ length: 12 }, (_, i) => ({ t: now - i * 1000, text: "abcdefghijkl"[i] + "oo" }));
t("word milestone", I.milestones(many, []).some((m) => /10 different words/.test(m.text)));
const dg = I.digest({ log, counts: { train: 2 }, sessions, videos, plays: [], now });
t("digest has sentences", dg.length >= 2 && /messages this week/.test(dg[0]));
t("quiet week is kind", /That's okay/.test(I.digest({ log: [], now })[0]));
const rep = I.reportHTML({ child: "Sam <b>", log, counts: { train: 2 }, sessions, videos, now });
t("report escapes and disclaims", rep.includes("Sam &lt;b&gt;") && /not an assessment or diagnosis/.test(rep));
const gp = I.goalProgress([{ id: "g", game: "echo", perWeek: 4 }], [{ t: now - DAY, game: "echo" }, { t: now - 9 * DAY, game: "echo" }, { t: now - DAY, game: "match" }], now);
t("goal progress counts this week", gp[0].done === 1 && gp[0].pct === 25 && gp[0].label === "Copy my sound");

// Games
const r = G.rng(42);
const m = G.matchRound(r, 3);
t("match round has target among 3", m.options.length === 3 && m.options.includes(m.target));
t("match clamps choices", G.matchRound(r, 9).options.length === 4 && G.matchRound(r, 1).options.length === 2);
const f = G.firstRound("b", r, 3);
t("first round target starts with sound", f.sound === "b" && f.target.w.startsWith("b") && f.options.length === 3);
t("first round others differ", f.options.filter((o) => o !== f.target).every((o) => !o.w.startsWith("b")));
t("seeded rng repeatable", G.rng(7)() === G.rng(7)());
const rate = 48000, sine = (hz, amp = 0.5, n = 2048) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));
for (const hz of [110, 220, 440, 800]) t(`pitch ${hz} Hz`, Math.abs(G.pitch(sine(hz), rate) - hz) / hz < 0.03);
t("silence has no pitch", !G.pitch(new Float32Array(2048), rate));
t("level loud vs quiet", G.level(sine(220, 0.5)) > 0.8 && G.level(sine(220, 0.001)) < 0.1);
const fr = (n, lv) => Array.from({ length: n }, () => ({ level: lv, hz: 200 }));
t("hears a voice", G.judgeTry([...fr(10, 0.6), ...fr(10, 0)]).heard === true);
t("long sound gets big cheer", G.judgeTry(fr(12, 0.6)).long === true);
t("silence is not heard, never 'wrong'", G.judgeTry(fr(20, 0.05)).heard === false && !("wrong" in G.judgeTry(fr(20, 0.05))));
t("streak counts days", G.streak([{ t: now }, { t: now - DAY }, { t: now - 2 * DAY }, { t: now - 5 * DAY }], now) === 3);
t("streak survives not-yet-played today", G.streak([{ t: now - DAY }], now) === 1);
t("praise is kind for a quiet try", ["Nice trying!", "Thank you for playing.", "Let's do it together.", "Good listening."].includes(G.praise({ heard: false })));
t("stickers cycle", G.stickerFor(0) === G.stickerFor(G.STICKERS.length));


// word strip and topic pages
const sw2 = I.stripWords({ words: ["choo choo"], topics: ["vehicles"] });
t("strip: video words first, core words last", sw2[0] === "choo choo" && sw2.includes("train") && sw2.includes("stop") && sw2.length === 8);
t("strip: works for a channel video with no topics", I.stripWords({}).join() === I.STRIP_CORE.join());
const tp = I.topicPages([{ topic: "animals", score: 3 }, { topic: "space", score: 0 }], [{ topics: ["animals"], words: ["Moo"] }]);
t("topic pages: only watched topics", tp.length === 1 && tp[0].label === "Animals");
t("topic pages: video words join the page", tp[0].words.includes("moo") && tp[0].words.length <= 12);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
