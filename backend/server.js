// LuminAAC backend (zero dependencies, Node 18+).
// Implements the routes the web app uses: sync, sharing, alerts, plus the
// /api/predictions contract from LuminAAC-Repository/backend/src/routes/predictions.js.
// Envelope matches that repo: success → { success: true, data, message? },
// failure → { error, details? } with a 4xx/5xx status.
//
// Auth: every family has a secret "family key" (min 16 chars) created on the
// device and sent as `Authorization: Bearer <key>`. The server stores data in a
// file named by the key's SHA-256 hash, so the key itself is never written down.
// Share links use a separate random token that only unlocks a role-scoped view.
import { createServer } from "node:http";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import * as store from "./store.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate, patterns } from "./predict.js";
import * as acc from "./accounts.js";
import { verifyRegistration, verifyAssertion } from "./webauthn.js";
import * as fl from "./flserver.js";
import * as mailer from "./mailer.js";
import * as potty from "./potty.js";
import * as yt from "./youtube.js";
import * as wp from "./webpush.js";
import * as summary from "./summary.js";

const PORT = Number(process.env.PORT || 3001);
const ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
const MAX_BODY = 2 * 1024 * 1024; // metadata only; media never leaves the device
const shareIndex = new Map(); // share token -> family id
const listeners = new Map(); // family -> Set(res) for SSE alert streams

// ---------- helpers ----------
function cors(req, res) {
  const o = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", ORIGINS.includes("*") ? "*" : ORIGINS.includes(o) ? o : ORIGINS[0]);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}
const ok = (res, data, message) => send(res, 200, { success: true, ...(data !== undefined && { data }), ...(message && { message }) });
const fail = (res, status, error, details) => send(res, status, { error, ...(details && { details }) });

function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error("Body too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); } });
    req.on("error", reject);
  });
}
function bearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  const key = m && m[1].trim();
  return key && key.length >= 16 && key.length <= 200 ? key : null;
}
// Who is calling? A signed-in account (session), a paired device, or a bare family key
// (the Phase 2 local-first path, treated as the parent/admin of that family).
function who(req) {
  const t = bearer(req);
  if (!t) return null;
  const s = acc.session(t);
  if (s) {
    const u = acc.userById(s.uid); if (!u) return null;
    const m = u.memberships.find((x) => x.family === s.family);
    if (!m) return null;
    return { fid: s.family, role: m.role, user: u, token: t, kind: "account" };
  }
  if (/^[0-9a-f-]{36}\./.test(t)) {
    const dv = acc.device(t);
    if (dv) return { fid: dv.family, role: dv.kind === "bridge" ? "parent" : "child", device: dv, kind: "device", scopes: acc.DEVICE_SCOPES[dv.kind] };
    return null;
  }
  return { fid: store.fid(t), role: "parent", kind: "familyKey" };
}
// Permissions per role. Share scopes (SCOPES below) decide what a read-only role sees.
const PERMS = {
  parent: ["sync:read", "sync:write", "alerts:read", "alerts:write", "share", "devices", "family", "fl:write", "predict", "potty:read", "potty:write", "chat"],
  teacher: ["sync:scoped", "alerts:read", "alerts:write", "fl:write", "chat"],
  therapist: ["sync:scoped", "fl:write", "predict", "chat"],
  family: ["sync:scoped", "alerts:read", "alerts:write", "fl:write", "chat"],
  child: ["sync:child", "alerts:write", "location:write", "fl:write", "potty:read", "potty:write"],
};
const can = (w, perm) => (w.role === "child" ? w.scopes || PERMS.child : PERMS[w.role] || []).includes(perm);
// What a paired My Voice device may read: only what it needs to run (no notes, team, audit, alerts).
function childView(doc) {
  if (!doc) return null;
  if (doc.e2ee) return { version: 2, scope: "child", e2eeChild: doc.e2eeChild || null }; // end-to-end encrypted: the server can't read it

  const { profile = {}, signals = [], stories = [], practice, access, safety, videos, games, potty: pp } = doc;
  return { version: 2, scope: "child", profile: { child: profile.child, place: profile.place }, signals: signals.map(({ id, name, phrase, cues, contexts, confirmations, rejections, moods }) => ({ id, name, phrase, cues, contexts, confirmations, rejections, moods })), stories, practice, access, safety: safety && { consent: safety.consent, zones: safety.zones, sendLocation: safety.sendLocation, water: safety.water },
    // Phase 7: the video list and game settings only. Watch history and game turns stay on each device.
    videos: videos && { on: videos.on, thumbs: videos.thumbs, list: (videos.list || []).map(({ id, yt, start, title, e, topics, words }) => ({ id, yt, start, title, e, topics, words })),
      channels: (videos.channels || []).map(({ id, playlist, name, e, on, videos: vs }) => ({ id, playlist, name, e, on, videos: vs })) },
    games: games && { settings: games.settings, goals: games.goals },
    // Potty Path: the plan and whether it is paused. Never the toilet log, screening or reasons.
    potty: pp && { protocol: pp.protocol, paused: !!pp.paused } };
}
const failedLogins = new Map(); // email -> [timestamps]
const claimTries = new Map(); // ip -> [timestamps]
const mailTries = new Map(); // "email:<addr>" or "ip:<addr>" -> [timestamps]
const tokenTries = new Map(); // ip -> [timestamps] for token redemption
function appUrl(req) { // where links in emails point; APP_URL wins over the request's Origin
  const u = process.env.APP_URL || req.headers.origin || "http://localhost:8765";
  return u.replace(/\/+$/, "");
}
function mailLimited(req, email) { // 3 per address and 10 per IP an hour
  const ip = req.socket.remoteAddress || "?";
  if (limited(mailTries, "email:" + email, 3, 3600e3) || limited(mailTries, "ip:" + ip, 10, 3600e3)) return true;
  bump(mailTries, "email:" + email); bump(mailTries, "ip:" + ip); return false;
}
async function sendVerify(req, u) {
  const token = acc.issueToken(u, "verify"); acc.save();
  return mailer.send({ to: u.email, subject: "Confirm your email for LuminAAC", text: `Hello${u.name ? " " + u.name : ""},\n\nPlease confirm this is your email address by opening this link within 24 hours:\n\n${appUrl(req)}/bridge.html#verify=${token}\n\nIf you didn't create a LuminAAC account, you can ignore this email.\n` });
}
function limited(map, k, max, ms) { const now = Date.now(); const a = (map.get(k) || []).filter((t) => t > now - ms); map.set(k, a); return a.length >= max; }
const bump = (map, k) => map.set(k, [...(map.get(k) || []), Date.now()]);
function rp(req) {
  const origin = req.headers.origin || "";
  let host = "localhost"; try { host = new URL(origin).hostname || host; } catch {}
  const rpId = process.env.RP_ID || host;
  const origins = (process.env.RP_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!origins.length && origin) { try { if (new URL(origin).hostname === rpId) origins.push(origin); } catch {} }
  return { rpId, origins };
}
const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified || null, passkeys: u.passkeys.map(({ id, name, created }) => ({ id, name, created })) });
function authOut(u, family, role, token) {
  const f = acc.db().families[family];
  return { token, user: userOut(u), role, family: f ? { id: f.id, name: f.name, children: f.children } : { id: family }, families: u.memberships.map((m) => ({ id: m.family, role: m.role, name: acc.db().families[m.family]?.name })) };
}
const LOC = (l) => isObj(l) && Number.isFinite(l.lat) && Number.isFinite(l.lng) && Math.abs(l.lat) <= 90 && Math.abs(l.lng) <= 180 ? { lat: +l.lat.toFixed(5), lng: +l.lng.toFixed(5), acc: Math.min(Math.round(Number(l.acc) || 0), 100000) } : null;
const LOC_KEEP_MS = 24 * 3600e3; // precise location on alerts is dropped after 24 hours
const sha = (s) => createHash("sha256").update(String(s)).digest("hex");
const hookIndex = new Map(); // sha256(sensor link secret) -> family id
const hookTries = new Map();
const SENSOR_KINDS = ["door", "gate", "window", "pool", "motion", "bed", "wearable", "other"];
const SENSOR_SAYS = { door: "door opened", gate: "gate opened", window: "window opened", pool: "pool alarm", motion: "movement seen", bed: "out of bed", wearable: "tracker alert" };
const ROLE_NAME = { parent: "Parent", teacher: "Teacher", therapist: "Therapist", family: "Family" };
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const audit = (d, what) => { d.audit = [{ t: Date.now(), what }, ...(d.audit || [])].slice(0, 100); };

// ---------- role-scoped share view (mirrors the web app's preview) ----------
const SCOPES = {
  teacher: { signals: true, meanings: true, notes: true, personality: true },
  therapist: { signals: true, meanings: true, notes: true, personality: true, insights: true },
  family: { signals: true, meanings: false, notes: false, personality: true },
  parent: { signals: true, meanings: true, notes: true, personality: true, insights: true },
};
function scopedView(doc, role) {
  const s = SCOPES[role] || SCOPES.family;
  if (doc?.e2ee) return { child: "", role, encrypted: true, generated: new Date().toISOString() };
  const out = { child: doc?.profile?.child || "", role, generated: new Date().toISOString() };
  if (s.signals) out.signals = (doc?.signals || []).map(({ name, cues, meaning, phrase, confirmations, rejections }) => ({ name, cues, meaning, phrase, confidence: Math.round(((confirmations + 1) / (confirmations + rejections + 2)) * 100) }));
  if (s.meanings) out.moments = (doc?.moments || []).filter((m) => m.meaning).map(({ t, context, meaning, intent }) => ({ t, context, meaning, intent }));
  if (s.notes) out.notes = doc?.notes || [];
  if (s.personality) out.personality = (doc?.personality || []).map(({ label, e, kind }) => ({ label, e, kind }));
  if (s.insights) out.insights = { moments: (doc?.moments || []).length, explained: (doc?.moments || []).filter((m) => m.meaning).length, signals: (doc?.signals || []).length };
  return out; // never includes media, privacy settings, alerts, or the audit log
}

// ---------- SSE ----------
function broadcast(key, event, data) {
  for (const res of listeners.get(key) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------- Web Push ----------
const URGENT_KINDS = ["help", "home", "danger-enter", "silent"];
const ALERT_TITLE = { help: "Help needed", home: "Wants to go home", "danger-enter": "Entered a danger area", "danger-leave": "Left a danger area", "zone-enter": "Arrived", "zone-leave": "Left a place", silent: "Device went quiet", back: "Sharing again", sensor: "Sensor", potty: "Toilet", custom: "Message" };
const isUrgent = (a) => !!a.urgent || URGENT_KINDS.includes(a.kind);
const pushLog = []; // last few results, for tests and the status route
// Send to everyone in the family whose preferences allow it. Only short text goes
// in the payload, never a location. Dead subscriptions are removed.
async function notify(key, ev) {
  const d = store.read(key), subs = wp.recipients(d.push, ev);
  if (!subs.length) return [];
  const k = wp.keys(store.DIR);
  const out = await Promise.all(subs.map(async (s) => ({ id: s.id, ...(await wp.send(s, ev.payload, k, { urgency: ev.urgent ? "high" : "normal", ttl: ev.urgent ? 600 : 3600, topic: ev.topic })) })));
  const gone = out.filter((r) => r.gone).map((r) => r.id);
  if (gone.length) store.update(key, (x) => { x.push = (x.push || []).filter((s) => !gone.includes(s.id)); });
  pushLog.unshift(...out.map((r) => ({ ...r, type: ev.type, t: Date.now() }))); pushLog.length = Math.min(pushLog.length, 50);
  return out;
}
// Urgent alerts fall back to email for signed-in members (verified address, alerts role)
// who have no browser that accepted the push, unless they turned the fallback off.
// One email per person per alert kind every 10 minutes.
const mailedAt = new Map();
async function emailFallback(key, a, results) {
  if (!isUrgent(a)) return 0;
  const d = store.read(key), okIds = new Set(results.filter((r) => r.status >= 200 && r.status < 300).map((r) => r.id));
  let n = 0;
  for (const u of Object.values(acc.db().users)) {
    const mem = u.memberships.find((m) => m.family === key);
    if (!mem || !u.emailVerified || !(PERMS[mem.role] || []).includes("alerts:read")) continue;
    const subs = (d.push || []).filter((s) => s.uid === u.id);
    if (subs.some((s) => okIds.has(s.id)) || subs.some((s) => s.prefs?.emailFallback === false)) continue;
    const k = `${u.id}:${a.kind}`; if (Date.now() - (mailedAt.get(k) || 0) < 10 * 60e3) continue;
    mailedAt.set(k, Date.now()); n++;
    await mailer.send({ to: u.email, subject: `Urgent: ${ALERT_TITLE[a.kind] || "alert"} from LuminAAC`, text: `${a.message || ALERT_TITLE[a.kind]}\n\nFrom: ${a.from || "My Voice"}\nTime: ${new Date(a.t).toUTCString()}\n\nOpen the Bridge to see where and to say you're on it: ${process.env.APP_URL || ""}/bridge.html#today\n\nYou get this email because no phone or computer of yours accepted the notification. Turn this off in the Bridge under Account and devices, Notifications.\n` }).catch((e) => console.error("alert mail failed:", e.message));
  }
  return n;
}
const alertOut = (key, a) => notify(key, alertEvent(a)).then((r) => emailFallback(key, a, r).then(() => r));
const soon = (pr, ms = 2500) => Promise.race([pr.catch(() => []), new Promise((r) => setTimeout(() => r([]), ms))]);
function alertEvent(a) {
  const urgent = isUrgent(a);
  return { type: "alert", urgent, topic: a.kind, payload: { kind: "alert", title: `${urgent ? "Urgent: " : ""}${ALERT_TITLE[a.kind] || "Alert"}`, body: (a.message || `${a.from || "My Voice"}: ${ALERT_TITLE[a.kind] || a.kind}`).slice(0, 140), tag: "alert-" + a.id, url: "bridge.html#today", urgent } };
}
export { notify, pushLog, emailFallback };

// Weekly summary: the family turns it on; each person picks push (in Notifications)
// and/or email here. Every email carries a one-click unsubscribe link.
const unsubToken = (fam, uid) => createHash("sha256").update(`unsub:${fam}:${uid}:${process.env.UNSUB_SECRET || wp.keys(store.DIR).privateKey}`).digest("base64url").slice(0, 32);
export async function sendWeekly(now = Date.now(), base = process.env.APP_URL || "") {
  let sent = 0;
  for (const fam of store.list()) {
    const d = store.read(fam);
    if (!summary.due(d.summaryCfg, now) || d.doc?.e2ee) continue; // encrypted families: the server can't count anything, so no summary
    const s = summary.build(d, now);
    store.update(fam, (x) => { x.summaryCfg.last = now; });
    const r = await notify(fam, { type: "summary", topic: "weekly", payload: { kind: "summary", title: s.title, body: s.short, tag: "weekly", url: "bridge.html#insights" } }).catch(() => []);
    sent += r.filter((x) => x.status >= 200 && x.status < 300).length;
    for (const uid of d.summaryCfg.emails || []) {
      const u = acc.userById(uid); if (!u || !u.emailVerified || !u.memberships.some((m) => m.family === fam)) continue;
      const link = `${base.replace(/\/+$/, "")}/api/summary/unsubscribe?f=${fam}&u=${uid}&t=${unsubToken(fam, uid)}`;
      await mailer.send({ to: u.email, subject: s.title, headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        text: `${s.lines.join("\n")}\n\nOpen the Bridge for the full picture: ${base}/bridge.html#insights\n\nThis summary has counts only. It never includes notes, places, videos or recordings.\nStop these emails: ${link}\n` }).then(() => sent++).catch((e) => console.error("weekly mail failed:", e.message));
    }
  }
  return sent;
}

// ---------- routes ----------
async function route(req, res, url) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const M = req.method;

  if (p === "/api/health" && M === "GET") return ok(res, { status: "ok", version: "0.15.0", uptime: Math.round(process.uptime()), time: new Date().toISOString() });

  // Public: read a share link (no family key needed)
  let m;
  if ((m = /^\/api\/share\/([A-Za-z0-9_-]{20,})$/.exec(p)) && M === "GET") {
    const key = shareIndex.get(m[1]);
    if (!key) return fail(res, 404, "Share link not found");
    const d = store.read(key);
    const sh = d.shares.find((s) => s.token === m[1]);
    if (!sh || sh.revoked) return fail(res, 404, "Share link not found");
    if (sh.expires && sh.expires < Date.now()) return fail(res, 410, "Share link expired");
    return ok(res, scopedView(d.doc, sh.role));
  }

  // ---- Sensor webhooks (public: the secret is in the URL) ----
  // Door, gate and pool sensors, smart-home hubs (Home Assistant, SmartThings,
  // IFTTT, Alexa routines through IFTTT) and trackers that can call a URL post here.
  if ((m = /^\/api\/hooks\/([A-Za-z0-9_-]{24,})$/.exec(p)) && (M === "POST" || M === "GET")) {
    const th = sha(m[1]), family = hookIndex.get(th);
    if (!family) return fail(res, 404, "Unknown sensor link");
    if (limited(hookTries, th, 30, 10 * 60e3)) return fail(res, 429, "Too many alerts from this sensor. Wait a few minutes.");
    bump(hookTries, th);
    const b = M === "POST" ? await body(req).catch(() => ({})) : {};
    const said = String(b.message ?? b.value1 ?? b.state ?? url.searchParams.get("message") ?? "").slice(0, 140);
    const sensor = store.read(family).sensors?.find((x) => x.tokenHash === th);
    if (!sensor) return fail(res, 404, "Unknown sensor link");
    const a = raise(family, { kind: "sensor", from: sensor.name, message: `${sensor.name}: ${said || SENSOR_SAYS[sensor.kind] || "triggered"}`, sensor: sensor.id, ...(sensor.urgent && { urgent: true }) });
    store.update(family, (d) => { const x = d.sensors?.find((y) => y.id === sensor.id); if (x) x.last = a.t; });
    return ok(res, { id: a.id, t: a.t });
  }

  // ---- YouTube channel lookup (public, read-only, youtube.com only) ----
  if (p === "/api/summary/unsubscribe" && (M === "GET" || M === "POST")) {
    const f = url.searchParams.get("f") || "", u = url.searchParams.get("u") || "", t = url.searchParams.get("t") || "";
    const good = /^[a-f0-9]{32}$/.test(f) && t.length === 32 && t === unsubToken(f, u);
    if (good) store.update(f, (d) => { if (d.summaryCfg) d.summaryCfg.emails = (d.summaryCfg.emails || []).filter((x) => x !== u); });
    res.writeHead(good ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>LuminAAC</title><body style="font:18px/1.5 system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem"><h1 style="font-size:1.4rem">${good ? "You're unsubscribed" : "That link didn't work"}</h1><p>${good ? "You won't get the weekly summary by email any more. You can turn it back on in the Bridge." : "It may be incomplete. You can turn the summary off in the Bridge under Progress."}</p></body>`);
  }
  if (p === "/api/cron/weekly" && (M === "GET" || M === "POST")) {
    const sec = process.env.CRON_SECRET;
    if (!sec || req.headers.authorization !== `Bearer ${sec}`) return fail(res, 401, "Unauthorized");
    return ok(res, { sent: await sendWeekly() });
  }
  if (p === "/api/push/key" && M === "GET") return ok(res, { publicKey: wp.keys(store.DIR).publicKey });
  if (p === "/api/youtube" && M === "GET") {
    try { return ok(res, await yt.channel(url.searchParams.get("channel"))); }
    catch (e) { return fail(res, e.status || 502, e.message); }
  }

  // ---- Accounts (public endpoints) ----
  if (p === "/api/auth/register" && M === "POST") {
    const b = await body(req);
    const email = acc.normEmail(b.email);
    if (!acc.validEmail(email)) return fail(res, 400, "Validation failed", "A valid email is required");
    if (typeof b.password !== "string" || b.password.length < 10 || b.password.length > 200) return fail(res, 400, "Validation failed", "Password must be at least 10 characters");
    const A = acc.db();
    if (A.users[email]) return fail(res, 409, "An account with this email already exists");
    let family, role = "parent";
    if (b.invite) {
      const inv = acc.takeInvite(b.invite);
      if (!inv) return fail(res, 400, "Invite code is invalid or expired");
      family = inv.family; role = inv.role;
    } else {
      if (b.familyKey && (typeof b.familyKey !== "string" || b.familyKey.length < 16)) return fail(res, 400, "Validation failed", "familyKey must be 16+ characters");
      family = acc.createFamily({ name: b.familyName, child: b.childName, familyKey: b.familyKey }).id;
    }
    const u = acc.createUser({ email, password: b.password, name: b.name });
    u.memberships.push({ family, role, since: Date.now() });
    const token = acc.newSession(u, family); acc.save();
    store.update(family, (d) => audit(d, `${role} account joined`));
    if (!mailLimited(req, email)) await sendVerify(req, u).catch((e) => console.error("verify mail failed:", e.message));
    return ok(res, authOut(u, family, role, token));
  }
  if (p === "/api/auth/login" && M === "POST") {
    const b = await body(req);
    const email = acc.normEmail(b.email);
    if (limited(failedLogins, email, 5, 15 * 60e3)) return fail(res, 429, "Too many attempts. Try again in 15 minutes.");
    const u = acc.db().users[email];
    if (!u || typeof b.password !== "string" || !acc.checkPassword(b.password, u)) { bump(failedLogins, email); return fail(res, 401, "Email or password is incorrect"); }
    failedLogins.delete(email);
    const m = u.memberships.find((x) => x.family === b.family) || u.memberships[0];
    const token = acc.newSession(u, m.family); acc.save();
    return ok(res, authOut(u, m.family, m.role, token));
  }
  // ---- Email verification and password reset (public, rate limited) ----
  if (p === "/api/auth/verify" && M === "POST") {
    const ip = req.socket.remoteAddress || "?";
    if (limited(tokenTries, ip, 20, 15 * 60e3)) return fail(res, 429, "Too many tries. Wait a few minutes.");
    const b = await body(req);
    const u = typeof b.token === "string" && b.token.length < 100 && acc.takeToken(b.token, "verify");
    if (!u) { bump(tokenTries, ip); acc.save(); return fail(res, 400, "This link has expired or was already used. Ask for a new one."); }
    u.emailVerified = Date.now(); acc.save();
    return ok(res, { email: u.email, emailVerified: u.emailVerified }, "Email confirmed");
  }
  if (p === "/api/auth/reset/request" && M === "POST") {
    const b = await body(req); const email = acc.normEmail(b.email);
    const generic = () => ok(res, undefined, "If that email has an account, a reset link is on its way.");
    if (!acc.validEmail(email)) return fail(res, 400, "Validation failed", "A valid email is required");
    if (mailLimited(req, email)) return fail(res, 429, "Too many requests. Try again in an hour.");
    const u = acc.db().users[email];
    if (!u) return generic(); // same answer either way: no account discovery
    const token = acc.issueToken(u, "reset"); acc.save();
    await mailer.send({ to: u.email, subject: "Reset your LuminAAC password", text: `Someone asked to reset the password for this LuminAAC account.\n\nTo choose a new password, open this link within 30 minutes. It works once:\n\n${appUrl(req)}/bridge.html#reset=${token}\n\nIf it wasn't you, ignore this email. Your password stays the same.\n` }).catch((e) => console.error("reset mail failed:", e.message));
    return generic();
  }
  if (p === "/api/auth/reset" && M === "POST") {
    const ip = req.socket.remoteAddress || "?";
    if (limited(tokenTries, ip, 20, 15 * 60e3)) return fail(res, 429, "Too many tries. Wait a few minutes.");
    const b = await body(req);
    if (typeof b.password !== "string" || b.password.length < 10 || b.password.length > 200) return fail(res, 400, "Validation failed", "Password must be at least 10 characters");
    const u = typeof b.token === "string" && b.token.length < 100 && acc.takeToken(b.token, "reset");
    if (!u) { bump(tokenTries, ip); acc.save(); return fail(res, 400, "This link has expired or was already used. Ask for a new one."); }
    acc.setPassword(u, b.password); acc.endAllSessions(u.id);
    u.emailVerified = u.emailVerified || Date.now(); // they proved they read this inbox
    failedLogins.delete(u.email); acc.save();
    return ok(res, undefined, "Password changed. You've been signed out everywhere; sign in with the new password.");
  }
  if (p === "/api/auth/passkey/login/options" && M === "POST") {
    const { rpId } = rp(req);
    return ok(res, { challenge: acc.newChallenge("login"), rpId, timeout: 60000, userVerification: "preferred", allowCredentials: [] });
  }
  if (p === "/api/auth/passkey/login/verify" && M === "POST") {
    const b = await body(req); const c = b.credential;
    if (!acc.takeChallenge(String(b.challenge), "login")) return fail(res, 400, "Challenge expired. Try again.");
    const u = Object.values(acc.db().users).find((x) => x.passkeys.some((k) => k.id === c?.id));
    const cred = u?.passkeys.find((k) => k.id === c?.id);
    if (!cred) return fail(res, 401, "Passkey not recognised");
    try { const r = verifyAssertion(c.response, cred, { challenge: b.challenge, ...rp(req) }); cred.signCount = r.signCount; }
    catch (e) { return fail(res, 401, "Passkey check failed", e.message); }
    const m = u.memberships[0]; const token = acc.newSession(u, m.family); acc.save();
    return ok(res, authOut(u, m.family, m.role, token));
  }
  // ---- Device pairing: claim with the short code (public, rate limited) ----
  if (p === "/api/devices/claim" && M === "POST") {
    const ip = req.socket.remoteAddress || "?";
    if (limited(claimTries, ip, 10, 10 * 60e3)) return fail(res, 429, "Too many tries. Wait a few minutes.");
    const b = await body(req);
    const out = /^\d{6}$/.test(String(b.code)) && acc.claimPairing(String(b.code), b.name);
    if (!out) { bump(claimTries, ip); return fail(res, 400, "That code didn't work. Codes last 10 minutes and work once."); }
    acc.save(); store.update(out.family, (d) => audit(d, `Device paired: ${String(b.name || "New device").slice(0, 60)}`));
    return ok(res, { deviceId: out.deviceId, deviceKey: out.deviceKey, kind: out.kind });
  }

  const w = who(req);
  if (!w) return fail(res, 401, "Missing or invalid credentials", "Send Authorization: Bearer <session token, device key, or family key (16+ chars)>");
  const key = w.fid;
  const deny = () => fail(res, 403, "Not allowed for this role", w.role);

  // ---- Accounts (signed in) ----
  if (p === "/api/auth/me" && M === "GET") {
    if (w.kind === "account") return ok(res, authOut(w.user, w.fid, w.role));
    if (w.kind === "device") { const { keyHash, ...dv } = w.device; return ok(res, { device: dv, role: w.role }); }
    return ok(res, { familyKey: true, role: "parent" });
  }
  if (p === "/api/auth/verify/send" && M === "POST") {
    if (w.kind !== "account") return deny();
    if (w.user.emailVerified) return ok(res, { emailVerified: w.user.emailVerified }, "Already confirmed");
    if (mailLimited(req, w.user.email)) return fail(res, 429, "Too many emails. Try again in an hour.");
    try { await sendVerify(req, w.user); } catch (e) { return fail(res, 502, "Couldn't send the email", e.message); }
    return ok(res, undefined, "Confirmation email sent");
  }
  if (p === "/api/auth/logout" && M === "POST") { if (w.kind === "account") { acc.endSession(w.token); acc.save(); } return ok(res, undefined, "Signed out"); }
  if (p === "/api/auth/logout-all" && M === "POST") { if (w.kind !== "account") return deny(); acc.endAllSessions(w.user.id); acc.save(); return ok(res, undefined, "Signed out everywhere"); }
  if (p === "/api/auth/passkey/register/options" && M === "POST") {
    if (w.kind !== "account") return fail(res, 401, "Sign in first");
    const { rpId } = rp(req);
    const challenge = acc.newChallenge("register", { uid: w.user.id }); acc.save();
    return ok(res, { challenge, rp: { id: rpId, name: "LuminAAC" }, user: { id: Buffer.from(w.user.id).toString("base64url"), name: w.user.email, displayName: w.user.name || w.user.email }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], timeout: 60000, attestation: "none", authenticatorSelection: { residentKey: "required", userVerification: "preferred" }, excludeCredentials: w.user.passkeys.map((k) => ({ type: "public-key", id: k.id })) });
  }
  if (p === "/api/auth/passkey/register/verify" && M === "POST") {
    if (w.kind !== "account") return fail(res, 401, "Sign in first");
    const b = await body(req);
    const ch = acc.takeChallenge(String(b.challenge), "register");
    if (!ch || ch.uid !== w.user.id) return fail(res, 400, "Challenge expired. Try again.");
    try {
      const r = verifyRegistration(b.credential?.response || {}, { challenge: b.challenge, ...rp(req) });
      w.user.passkeys.push({ id: r.credentialId, alg: r.alg, jwk: r.jwk, signCount: r.signCount, name: String(b.name || "Passkey").slice(0, 60), created: Date.now() });
      acc.save(); return ok(res, userOut(w.user), "Passkey added");
    } catch (e) { return fail(res, 400, "Passkey could not be added", e.message); }
  }
  if ((m = /^\/api\/auth\/passkeys\/([\w-]+)$/.exec(p)) && M === "DELETE") {
    if (w.kind !== "account") return deny();
    const n = w.user.passkeys.length; w.user.passkeys = w.user.passkeys.filter((k) => k.id !== m[1]); acc.save();
    return n !== w.user.passkeys.length ? ok(res, userOut(w.user), "Passkey removed") : fail(res, 404, "Passkey not found");
  }

  // ---- Family / child profiles / members ----
  if (p === "/api/family" && M === "GET") {
    const A = acc.db(), f = A.families[key] || { id: key, name: "Our family", children: [] };
    const members = Object.values(A.users).flatMap((u) => u.memberships.filter((x) => x.family === key).map((x) => ({ id: u.id, name: u.name, email: can(w, "family") ? u.email : undefined, role: x.role })));
    return ok(res, { id: f.id, name: f.name, children: f.children, members, you: w.role });
  }
  if (p === "/api/family" && M === "PUT") {
    if (!can(w, "family")) return deny();
    const b = await body(req); const A = acc.db();
    A.families[key] = A.families[key] || { id: key, name: "Our family", children: [], created: Date.now() };
    if (b.name) A.families[key].name = String(b.name).slice(0, 80);
    acc.save(); return ok(res, A.families[key]);
  }
  if (p === "/api/family/children" && M === "POST") {
    if (!can(w, "family")) return deny();
    const b = await body(req); if (!String(b.name || "").trim()) return fail(res, 400, "Validation failed", "name is required");
    const A = acc.db(); A.families[key] = A.families[key] || { id: key, name: "Our family", children: [], created: Date.now() };
    const c = { id: randomUUID(), name: String(b.name).slice(0, 60), birthYear: Number(b.birthYear) || null, created: Date.now() };
    A.families[key].children.push(c); acc.save(); return ok(res, c);
  }
  if (p === "/api/family/invites" && M === "POST") {
    if (!can(w, "family")) return deny();
    const b = await body(req); if (!acc.ROLES.includes(b.role)) return fail(res, 400, "Validation failed", "role must be parent, teacher, therapist or family");
    const code = acc.newInvite(key, b.role, w.user?.id || "family-key"); acc.save();
    store.update(key, (d) => audit(d, `Invite created for ${b.role}`));
    return ok(res, { code, role: b.role, expiresInDays: 7 });
  }
  if ((m = /^\/api\/family\/members\/([\w-]+)$/.exec(p)) && M === "DELETE") {
    if (!can(w, "family")) return deny();
    const u = acc.userById(m[1]); if (!u) return fail(res, 404, "Member not found");
    u.memberships = u.memberships.filter((x) => x.family !== key);
    for (const [k, s] of Object.entries(acc.db().sessions)) if (s.uid === u.id && s.family === key) delete acc.db().sessions[k];
    acc.save(); store.update(key, (d) => audit(d, "Member removed")); return ok(res, undefined, "Member removed");
  }

  // ---- Devices ----
  if (p === "/api/devices/pair" && M === "POST") {
    if (!can(w, "devices")) return deny();
    const b = await body(req); const out = acc.openPairing(key, b.kind, w.user?.id || "family-key"); acc.save();
    return ok(res, out);
  }
  if (p === "/api/devices" && M === "GET") { if (!can(w, "devices")) return deny(); return ok(res, acc.devicesOf(key)); }
  if ((m = /^\/api\/devices\/([\w-]+)$/.exec(p)) && M === "DELETE") {
    const dv = acc.db().devices[m[1]];
    const self = w.kind === "device" && w.device.id === m[1];
    if (!dv || dv.family !== key) return fail(res, 404, "Device not found");
    if (!self && !can(w, "devices")) return deny();
    dv.revoked = true; dv.revokedAt = Date.now(); acc.save();
    store.update(key, (d) => audit(d, `Device removed: ${dv.name}`));
    return ok(res, undefined, "Device removed. Its key no longer works.");
  }

  // ---- Federated learning ----
  if (p.startsWith("/api/fl/")) {
    if (!can(w, "fl:write")) return deny();
    if (p === "/api/fl/model" && M === "GET") return ok(res, fl.model());
    if (p === "/api/fl/round" && M === "GET") return ok(res, fl.current());
    const P = w.kind === "account" ? "u:" + w.user.id : w.kind === "device" ? "d:" + w.device.id : "f:" + w.fid; // whose privacy budget
    const R = (r) => (r.error ? fail(res, r.status || 400, r.error, r.budget) : ok(res, r));
    if (p === "/api/fl/budget" && M === "GET") return ok(res, fl.budget(P));
    if (p === "/api/fl/round/join" && M === "POST") { const b = await body(req); return R(fl.join(b.publicKey, P)); }
    if ((m = /^\/api\/fl\/round\/([\w-]+)\/peers$/.exec(p)) && M === "GET") return R(fl.peers(m[1]));
    if ((m = /^\/api\/fl\/round\/([\w-]+)\/shares$/.exec(p)) && M === "POST") { const b = await body(req); return R(fl.postShares(m[1], b.client, b.shares, P)); }
    if ((m = /^\/api\/fl\/round\/([\w-]+)\/inbox$/.exec(p)) && M === "GET") return R(fl.inbox(m[1], Number(url.searchParams.get("client")), P));
    if ((m = /^\/api\/fl\/round\/([\w-]+)\/update$/.exec(p)) && M === "POST") { const b = await body(req); return R(fl.submit(m[1], b.client, b.masked, P)); }
    if ((m = /^\/api\/fl\/round\/([\w-]+)\/unmask$/.exec(p)) && M === "GET") return R(fl.unmaskRequest(m[1]));
    if ((m = /^\/api\/fl\/round\/([\w-]+)\/reveal$/.exec(p)) && M === "POST") { const b = await body(req); return R(await fl.reveal(m[1], b.client, b, P)); }
  }

  // ---- Weekly summary ----
  if (p === "/api/summary" || p === "/api/summary/preview") {
    if (!can(w, "alerts:read") && !can(w, "chat")) return deny();
    const d = store.read(key), cfg = d.summaryCfg || { on: false, emails: [] };
    const me = w.user ? cfg.emails?.includes(w.user.id) : false;
    if (p === "/api/summary/preview" && M === "GET") return ok(res, { ...summary.build(d), on: !!cfg.on, emailMe: me, canEmail: !!w.user?.emailVerified, last: cfg.last || null });
    if (p === "/api/summary" && M === "PUT") {
      const b = await body(req);
      if (typeof b.on === "boolean" && w.role !== "parent") return deny();
      if (typeof b.emailMe === "boolean" && !w.user) return fail(res, 400, "Validation failed", "sign in to get the summary by email");
      if (b.emailMe && !w.user.emailVerified) return fail(res, 400, "Validation failed", "confirm your email address first");
      const out = store.update(key, (x) => { const c = (x.summaryCfg ||= { on: false, emails: [], last: 0 }); if (typeof b.on === "boolean") { c.on = b.on; audit(x, `Weekly summary turned ${b.on ? "on" : "off"}`); } if (typeof b.emailMe === "boolean") c.emails = b.emailMe ? [...new Set([...(c.emails || []), w.user.id])] : (c.emails || []).filter((y) => y !== w.user.id); return { on: c.on, emailMe: w.user ? c.emails.includes(w.user.id) : false }; });
      return ok(res, out, "Saved");
    }
  }

  // ---- Web Push subscriptions (one per browser; preferences are per person) ----
  if (p === "/api/push" || p.startsWith("/api/push/")) {
    if (!can(w, "alerts:read") && !can(w, "chat")) return deny();
    const mine = (s) => (w.user ? s.uid === w.user.id : !s.uid) || w.role === "parent";
    const QUIET = (q) => isObj(q) ? { on: !!q.on, from: /^\d\d:\d\d$/.test(q.from) ? q.from : "21:00", to: /^\d\d:\d\d$/.test(q.to) ? q.to : "07:00", tz: String(q.tz || "UTC").slice(0, 60) } : { on: false, from: "21:00", to: "07:00", tz: "UTC" };
    const PREFS = (b = {}) => ({ alerts: b.alerts !== false, urgentOnly: !!b.urgentOnly, chat: b.chat !== false, summary: !!b.summary, emailFallback: b.emailFallback !== false, quiet: QUIET(b.quiet) });
    const out = (s) => ({ id: s.id, name: s.name, role: s.role, prefs: s.prefs, created: s.created, mine: w.user ? s.uid === w.user.id : !s.uid });
    if (p === "/api/push" && M === "GET") return ok(res, (store.read(key).push || []).filter(mine).map(out));
    if (p === "/api/push" && M === "POST") {
      const b = await body(req), sub = b.subscription || {};
      let ep; try { ep = new URL(sub.endpoint); } catch { return fail(res, 400, "Validation failed", "subscription.endpoint must be a URL"); }
      if (ep.protocol !== "https:" && !process.env.PUSH_ALLOW_HTTP) return fail(res, 400, "Validation failed", "endpoint must be https");
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(sub.keys?.p256dh || "") || !/^[A-Za-z0-9_-]{16,32}$/.test(sub.keys?.auth || "")) return fail(res, 400, "Validation failed", "subscription.keys are missing");
      const s = store.update(key, (d) => {
        d.push = (d.push || []).filter((x) => x.endpoint !== sub.endpoint);
        const x = { id: randomUUID(), endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, name: String(b.name || "This browser").slice(0, 60), role: w.role, canChat: can(w, "chat"), canAlerts: can(w, "alerts:read"), ...(w.user && { uid: w.user.id }), prefs: PREFS(b.prefs), created: Date.now() };
        d.push = [...d.push, x].slice(-50); audit(d, "Notifications turned on for a browser"); return x;
      });
      return ok(res, out(s), "Notifications are on for this browser");
    }
    if (p === "/api/push/test" && M === "POST") {
      const b = await body(req), d = store.read(key), s = (d.push || []).find((x) => x.id === b.id && mine(x));
      if (!s) return fail(res, 404, "Subscription not found");
      const r = await wp.send(s, { kind: "test", title: "LuminAAC test", body: "Notifications are working.", tag: "test", url: "bridge.html" }, wp.keys(store.DIR), { ttl: 60 });
      return r.status >= 200 && r.status < 300 ? ok(res, r, "Test sent") : fail(res, 502, "The push service did not accept it", String(r.status || r.error));
    }
    if ((m = /^\/api\/push\/([\w-]+)$/.exec(p)) && (M === "PUT" || M === "DELETE")) {
      const b = M === "PUT" ? await body(req) : {};
      const s = store.update(key, (d) => { const x = (d.push || []).find((y) => y.id === m[1] && mine(y)); if (!x) return null; if (M === "DELETE") d.push = d.push.filter((y) => y !== x); else x.prefs = PREFS({ ...x.prefs, ...b.prefs, quiet: { ...x.prefs.quiet, ...(b.prefs?.quiet || {}) } }); return x; });
      if (!s) return fail(res, 404, "Subscription not found");
      return M === "DELETE" ? ok(res, undefined, "Notifications are off for this browser") : ok(res, out(s), "Saved");
    }
  }

  // ---- Team chat (parents, teachers, therapists, family; never the child's device) ----
  if (p === "/api/chat") {
    if (!can(w, "chat")) return deny();
    if (M === "GET") { const since = Number(url.searchParams.get("since") || 0); return ok(res, (store.read(key).chat || []).filter((c) => c.t > since).slice(-200)); }
    if (M === "POST") {
      const b = await body(req), sealed = /^e2ee:v1:[\w-]+$/.test(String(b.text || "")), text = String(b.text || "").trim().slice(0, sealed ? 6000 : 1000);
      if (!text) return fail(res, 400, "Validation failed", "text is required");
      const c = { id: String(b.id || randomUUID()).slice(0, 64), t: Date.now(), text, role: w.role, from: String(w.user?.name || b.from || ROLE_NAME[w.role] || "Parent").slice(0, 60), ...(w.user && { uid: w.user.id }) };
      store.update(key, (d) => { if ((d.chat ||= []).some((x) => x.id === c.id)) return; d.chat = [...d.chat, c].slice(-500); });
      broadcast(key, "chat", c);
      await soon(notify(key, { type: "chat", excludeUid: w.user?.id, topic: "chat", payload: { kind: "chat", title: `${c.from} in team chat`, body: sealed ? "New message. Open the Bridge to read it." : text.slice(0, 120), tag: "chat", url: "bridge.html#team" } }));
      return ok(res, c);
    }
  }
  if ((m = /^\/api\/chat\/([\w-]+)$/.exec(p)) && M === "DELETE") {
    if (!can(w, "chat")) return deny();
    const gone = store.update(key, (d) => { const x = (d.chat || []).find((y) => y.id === m[1]); if (!x || (w.role !== "parent" && x.uid !== w.user?.id)) return false; d.chat = d.chat.filter((y) => y !== x); return true; });
    return gone ? ok(res, undefined, "Message deleted") : fail(res, 404, "Message not found");
  }
  // One cheap check for anything new, so pages can poll instead of holding a stream open.
  if (p === "/api/updates" && M === "GET") {
    const since = Number(url.searchParams.get("since") || 0), d = store.read(key), cut = Date.now() - LOC_KEEP_MS;
    return ok(res, { now: Date.now(), version: d.version,
      alerts: can(w, "alerts:read") ? d.alerts.filter((a) => a.t > since).map((a) => (a.loc && a.t < cut ? { ...a, loc: null } : a)) : [],
      chat: can(w, "chat") ? (d.chat || []).filter((c) => c.t > since) : [] });
  }

  // ---- Sensors and wearables (parents set them up) ----
  if (p === "/api/sensors") {
    if (!can(w, "devices")) return deny();
    if (M === "GET") return ok(res, (store.read(key).sensors || []).map(({ tokenHash, ...x }) => x));
    if (M === "POST") {
      const b = await body(req), name = String(b.name || "").trim().slice(0, 60);
      if (!name) return fail(res, 400, "Validation failed", "name is required");
      const kind = SENSOR_KINDS.includes(b.kind) ? b.kind : "other", token = randomBytes(24).toString("base64url");
      const sn = { id: randomUUID(), name, kind, urgent: typeof b.urgent === "boolean" ? b.urgent : ["pool", "door", "gate", "wearable"].includes(kind), created: Date.now(), last: null, tokenHash: sha(token) };
      store.update(key, (d) => { (d.sensors ||= []).push(sn); audit(d, `Sensor added: ${name}`); });
      hookIndex.set(sn.tokenHash, key); saveHooks();
      const { tokenHash, ...out } = sn;
      return ok(res, { ...out, path: `/api/hooks/${token}` }, "Copy this link now. It is shown only once.");
    }
  }
  if ((m = /^\/api\/sensors\/([\w-]+)$/.exec(p)) && M === "DELETE") {
    if (!can(w, "devices")) return deny();
    const sn = store.update(key, (d) => { const x = (d.sensors || []).find((y) => y.id === m[1]); if (x) { d.sensors = d.sensors.filter((y) => y !== x); audit(d, `Sensor removed: ${x.name}`); } return x; });
    if (!sn) return fail(res, 404, "Sensor not found");
    hookIndex.delete(sn.tokenHash); saveHooks();
    return ok(res, undefined, "Sensor removed. Its link no longer works.");
  }

  // ---- End-to-end encryption key exchange (the server only relays public keys and wrapped keys) ----
  if (p === "/api/e2ee/requests" && M === "POST") {
    const b = await body(req), pub = b.pub;
    if (!isObj(pub) || pub.kty !== "EC" || pub.crv !== "P-256" || typeof pub.x !== "string" || typeof pub.y !== "string" || "d" in pub) return fail(res, 400, "Validation failed", "pub must be a public P-256 key");
    const r = { id: randomUUID(), t: Date.now(), name: String(b.name || (w.kind === "device" ? w.device?.name : w.user?.name) || "A device").slice(0, 60), role: w.role, pub: { kty: "EC", crv: "P-256", x: pub.x.slice(0, 64), y: pub.y.slice(0, 64) }, grant: null };
    store.update(key, (d) => { d.e2eeReq = [...(d.e2eeReq || []).filter((x) => Date.now() - x.t < 864e5), r].slice(-20); audit(d, `Encryption key requested by ${r.name}`); });
    return ok(res, { id: r.id });
  }
  if (p === "/api/e2ee/requests" && M === "GET") {
    if (!can(w, "devices")) return deny();
    return ok(res, (store.read(key).e2eeReq || []).filter((x) => !x.grant && Date.now() - x.t < 864e5).map(({ grant, ...x }) => x));
  }
  if ((m = /^\/api\/e2ee\/requests\/([\w-]+)$/.exec(p))) {
    if (M === "PUT") {
      if (!can(w, "devices")) return deny();
      const b = await body(req);
      if (!/^e2ee:v1:[\w-]+$/.test(String(b.wrapped || "")) || !isObj(b.from)) return fail(res, 400, "Validation failed", "wrapped and from are required");
      const done = store.update(key, (d) => { const x = (d.e2eeReq || []).find((y) => y.id === m[1]); if (!x) return false; x.grant = { wrapped: String(b.wrapped).slice(0, 2000), from: { kty: "EC", crv: "P-256", x: String(b.from.x).slice(0, 64), y: String(b.from.y).slice(0, 64) } }; audit(d, `Encryption key shared with ${x.name}`); return true; });
      return done ? ok(res, undefined, "Shared") : fail(res, 404, "Request not found");
    }
    if (M === "GET") {
      const x = (store.read(key).e2eeReq || []).find((y) => y.id === m[1]);
      if (!x) return fail(res, 404, "Request not found");
      if (x.grant) store.update(key, (d) => { d.e2eeReq = (d.e2eeReq || []).filter((y) => y.id !== m[1]); }); // hand over once
      return ok(res, { grant: x.grant });
    }
    if (M === "DELETE") {
      if (!can(w, "devices")) return deny();
      store.update(key, (d) => { d.e2eeReq = (d.e2eeReq || []).filter((y) => y.id !== m[1]); });
      return ok(res, undefined, "Declined");
    }
  }

  // ---- Sync ----
  if (p === "/api/sync" && M === "GET") {
    const d = store.read(key);
    if (can(w, "sync:read")) return ok(res, { doc: d.doc, version: d.version, updated: d.updated, role: w.role });
    if (can(w, "sync:child")) return ok(res, { doc: childView(d.doc), version: d.version, updated: d.updated, role: "child" });
    if (can(w, "sync:scoped")) return ok(res, { doc: null, view: scopedView(d.doc, w.role), version: d.version, updated: d.updated, role: w.role });
    return deny();
  }
  if (p.startsWith("/api/sync") && !can(w, "sync:write")) return deny();
  if (p.startsWith("/api/share") && !can(w, "share")) return deny();
  if (p.startsWith("/api/predictions") && !can(w, "predict")) return deny();
  if (p === "/api/sync" && M === "PUT") {
    const b = await body(req);
    if (!isObj(b.doc) || b.doc.version !== 2) return fail(res, 400, "Validation failed", "doc must be a LuminAAC version 2 document");
    const base = Number(b.baseVersion ?? -1);
    return store.update(key, (d) => {
      if (d.version && base !== d.version && !b.force) return fail(res, 409, "Version conflict", { serverVersion: d.version, doc: d.doc, updated: d.updated });
      d.doc = b.doc; d.version += 1; d.updated = Date.now(); audit(d, "Synced from a device");
      return ok(res, { version: d.version, updated: d.updated });
    });
  }
  if (p === "/api/sync" && M === "DELETE") {
    const d = store.read(key); d.shares.forEach((s) => shareIndex.delete(s.token)); saveIndex();
    store.remove(key);
    const A = acc.db(); for (const dv of Object.values(A.devices)) if (dv.family === key) dv.revoked = true; acc.save();
    return ok(res, undefined, "All server data for this family was deleted, and its paired devices were signed out");
  }

  // ---- Potty Path events (opt-in, separate from the document; may be end-to-end encrypted) ----
  if (p === "/api/potty/events") {
    if (M === "POST") {
      if (!can(w, "potty:write")) return deny();
      const b = await body(req);
      const out = store.update(key, (d) => { const r = potty.post(d, b); if (r.added) audit(d, "Updated toilet log"); return r; });
      if (out.error) return fail(res, 400, "Validation failed", out.error);
      if (out.added) broadcast(key, "potty", { cursor: out.cursor });
      return ok(res, out);
    }
    if (M === "GET") { if (!can(w, "potty:read")) return deny(); return ok(res, potty.since(store.read(key), url.searchParams.get("since"))); }
    if (M === "DELETE") { if (!can(w, "sync:write")) return deny(); const n = store.update(key, (d) => { const x = potty.wipe(d); audit(d, "Deleted toilet log"); return x; }); return ok(res, { deleted: n }, "Toilet log deleted from the server"); }
  }

  // ---- Sharing ----
  if (p === "/api/share" && M === "GET") { const d = store.read(key); return ok(res, d.shares.map(({ token, role, name, created, expires, revoked }) => ({ token, role, name, created, expires, revoked }))); }
  if (p === "/api/share" && M === "POST") {
    const b = await body(req);
    if (!SCOPES[b.role]) return fail(res, 400, "Validation failed", "role must be teacher, therapist, family or parent");
    const days = Math.min(Math.max(Number(b.expiresInDays) || 30, 1), 365);
    const token = randomBytes(24).toString("base64url");
    const share = { token, role: b.role, name: String(b.name || "").slice(0, 80), created: Date.now(), expires: Date.now() + days * 864e5, revoked: false };
    store.update(key, (d) => { d.shares.push(share); audit(d, `Share link created for ${share.role}`); });
    shareIndex.set(token, key); saveIndex();
    return ok(res, { ...share, path: `/api/share/${token}` });
  }
  if ((m = /^\/api\/share\/([A-Za-z0-9_-]{20,})$/.exec(p)) && M === "DELETE") {
    const found = store.update(key, (d) => { const s = d.shares.find((x) => x.token === m[1]); if (s) { s.revoked = true; audit(d, "Share link revoked"); } return !!s; });
    shareIndex.delete(m[1]); saveIndex();
    return found ? ok(res, undefined, "Share link revoked") : fail(res, 404, "Share link not found");
  }

  // ---- Location heartbeat (dead-man check) ----
  // A paired device that shares location pings every few minutes. If it goes quiet
  // for longer than its threshold, the server raises a "silent" alert by itself:
  // the phone may be off, out of battery, offline, or the app was closed.
  if (p === "/api/devices/heartbeat" && M === "POST") {
    if (w.kind !== "device" || !can(w, "location:write")) return deny();
    const b = await body(req), loc = b.loc ? LOC(b.loc) : null;
    if (b.loc && !loc) return fail(res, 400, "Validation failed", "loc must be { lat, lng, acc }");
    const dv = acc.db().devices[w.device.id], was = dv.silentSince;
    dv.sharing = b.sharing !== false; dv.lastBeat = Date.now();
    const floor = Number(process.env.DEADMAN_FLOOR_MIN ?? 5); // lower only for demos/tests
    dv.silentAfterMin = Math.min(1440, Math.max(floor, Number(b.silentAfterMin) || dv.silentAfterMin || DEADMAN_MIN()));
    if (loc) dv.lastLoc = { ...loc, t: Date.now() };
    dv.silentSince = null; acc.save();
    if (was) raise(dv.family, { kind: "back", message: `${dv.name} is sharing location again`, from: dv.name, ...(loc && { loc }) });
    return ok(res, { sharing: dv.sharing, silentAfterMin: dv.silentAfterMin, nextBeatSec: Math.min(300, dv.silentAfterMin * 20) });
  }

  // ---- Alerts ("I need help", "Take me home") ----
  if (p.startsWith("/api/alerts") && !(M === "POST" && p === "/api/alerts" ? can(w, "alerts:write") : can(w, "alerts:read"))) return deny();
  if (p === "/api/alerts/stream" && M === "GET") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(": connected\n\n");
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => { clearInterval(ping); listeners.get(key)?.delete(res); });
    return;
  }
  if (p === "/api/alerts" && M === "GET") {
    const since = Number(url.searchParams.get("since") || 0);
    const d = store.read(key), cut = Date.now() - LOC_KEEP_MS;
    return ok(res, d.alerts.filter((a) => a.t > since).map((a) => (a.loc && a.t < cut ? { ...a, loc: null } : a)));
  }
  if (p === "/api/alerts" && M === "POST") {
    const b = await body(req);
    if (!["help", "home", "custom", "sensor", "zone-enter", "zone-leave", "danger-enter", "danger-leave", "potty"].includes(b.kind)) return fail(res, 400, "Validation failed", "kind must be help, home, custom, potty, zone-enter, zone-leave, danger-enter or danger-leave");
    const loc = b.loc ? LOC(b.loc) : null;
    if (b.loc && !loc) return fail(res, 400, "Validation failed", "loc must be { lat, lng, acc }");
    const a = { id: String(b.id || randomUUID()).slice(0, 64), kind: b.kind, message: String(b.message || "").slice(0, 200), t: Number(b.t) || Date.now(), ack: null, from: String(b.from || w.device?.name || "My Voice").slice(0, 60), ...(loc && { loc }), ...(b.zone && { zone: String(b.zone).slice(0, 60) }), ...(b.water === true && { water: true }), ...(b.kind === "danger-enter" && { urgent: true }) };
    const dup = store.update(key, (d) => { if (d.alerts.some((x) => x.id === a.id)) return true; d.alerts = [a, ...d.alerts].slice(0, 500); audit(d, `Alert: ${a.kind}`); return false; });
    if (!dup) { broadcast(key, "alert", a); await soon(alertOut(key, a), 4000); }
    return ok(res, a);
  }
  if ((m = /^\/api\/alerts\/([\w-]+)\/ack$/.exec(p)) && M === "POST") {
    const b = await body(req);
    const a = store.update(key, (d) => { const x = d.alerts.find((y) => y.id === m[1]); if (x && !x.ack) x.ack = { by: String(b.by || "caregiver").slice(0, 60), t: Date.now() }; return x; });
    if (!a) return fail(res, 404, "Alert not found");
    broadcast(key, "ack", a); return ok(res, a);
  }

  // ---- Predictions (contract from LuminAAC-Repository) ----
  if (p === "/api/predictions/generate" && M === "POST") {
    const b = await body(req);
    for (const f of ["visual", "audio", "context"]) if (b[f] !== undefined && !isObj(b[f])) return fail(res, 400, "Validation failed", [{ param: f, msg: "must be an object" }]);
    const out = store.update(key, (d) => (d.current = generate(d.doc, b.context || {})));
    return ok(res, out);
  }
  if (p === "/api/predictions/current" && M === "GET") { const d = store.read(key); return d.current ? ok(res, d.current) : send(res, 200, { success: true, data: null, message: "No predictions available yet" }); }
  if (p === "/api/predictions/feedback" && M === "POST") {
    const b = await body(req);
    if (!Number.isInteger(b.prediction_index) || b.prediction_index < 0 || !isObj(b.feedback) || typeof b.feedback.accepted !== "boolean") return fail(res, 400, "Validation failed", "prediction_index (int ≥ 0) and feedback.accepted (boolean) are required");
    store.update(key, (d) => {
      const sug = d.current?.suggestions?.[b.prediction_index];
      d.feedback.push({ t: Date.now(), index: b.prediction_index, suggestion: sug?.suggestion || b.suggestion || null, confidence: sug?.confidence ?? b.confidence ?? null, ...b.feedback });
      d.feedback = d.feedback.slice(-5000);
      const sig = sug?.signal_id && d.doc?.signals?.find((s) => s.id === sug.signal_id);
      if (sig) b.feedback.accepted ? sig.confirmations++ : sig.rejections++;
    });
    return ok(res, undefined, "Feedback recorded successfully");
  }
  if (p === "/api/predictions/stats" && M === "GET") {
    const f = store.read(key).feedback, acc = f.filter((x) => x.accepted).length, withC = f.filter((x) => typeof x.confidence === "number");
    return ok(res, { total_predictions: f.length, accepted_predictions: acc, rejected_predictions: f.length - acc, acceptance_rate: f.length ? +(acc / f.length).toFixed(3) : 0, average_confidence: withC.length ? +(withC.reduce((s, x) => s + x.confidence, 0) / withC.length).toFixed(3) : 0 });
  }
  if (p === "/api/predictions/patterns" && M === "GET") return ok(res, patterns(store.read(key).doc));
  if ((m = /^\/api\/predictions\/patterns\/([\w-]+)$/.exec(p)) && M === "GET") { const x = patterns(store.read(key).doc).find((q) => q.id === m[1]); return x ? ok(res, x) : fail(res, 404, "Pattern not found"); }
  if ((m = /^\/api\/predictions\/patterns\/([\w-]+)\/update$/.exec(p)) && M === "POST") {
    const b = await body(req);
    if (typeof b.success !== "boolean") return fail(res, 400, "Validation failed", "success (boolean) is required");
    const found = store.update(key, (d) => { const s = d.doc?.signals?.find((q) => q.id === m[1]); if (s) { b.success ? s.confirmations++ : s.rejections++; d.version += 1; } return !!s; });
    return found ? ok(res, undefined, "Pattern updated successfully") : fail(res, 404, "Pattern not found");
  }
  if (p === "/api/predictions/adaptive-learning" && M === "POST") {
    const b = await body(req);
    if (typeof b.enable !== "boolean") return fail(res, 400, "Validation failed", "enable (boolean) is required");
    store.update(key, (d) => (d.adaptive = { enabled: b.enable, user_profile: b.user_profile ?? null }));
    return ok(res, { enabled: b.enable, user_profile: b.user_profile ?? null }, `Adaptive learning ${b.enable ? "enabled" : "disabled"}`);
  }

  return fail(res, 404, "Not found", `${M} ${p}`);
}

export async function handle(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, "http://x");
  try { await route(req, res, url); }
  catch (e) { if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : "Server error", e.status ? undefined : e.message); }
}
export const server = createServer(handle);

// ---------- dead-man check ----------
const DEADMAN_MIN = () => Number(process.env.DEADMAN_MINUTES || 30);
function raise(family, x) {
  const a = { id: randomUUID(), t: Date.now(), ack: null, message: "", ...x };
  store.update(family, (d) => { d.alerts = [a, ...d.alerts].slice(0, 500); audit(d, `Alert: ${a.kind}`); });
  broadcast(family, "alert", a);
  alertOut(family, a).catch(() => {});
  return a;
}
export function checkDeadman(now = Date.now()) {
  const raised = [];
  for (const dv of Object.values(acc.db().devices)) {
    if (dv.revoked || !dv.sharing || !dv.lastBeat || dv.silentSince) continue;
    const limit = (dv.silentAfterMin || DEADMAN_MIN()) * 60e3;
    if (now - dv.lastBeat <= limit) continue;
    dv.silentSince = now;
    const mins = Math.round((now - dv.lastBeat) / 60e3);
    const last = dv.lastLoc && now - dv.lastLoc.t < LOC_KEEP_MS ? { lat: dv.lastLoc.lat, lng: dv.lastLoc.lng, acc: dv.lastLoc.acc } : null;
    raised.push(raise(dv.family, { kind: "silent", from: dv.name, message: `${dv.name} hasn't checked in for ${mins < 1 ? "under a minute" : `${mins} minute${mins === 1 ? "" : "s"}`}. Location sharing may be off, the battery may be flat, or it may be offline.`, ...(last && { loc: last, locAt: dv.lastLoc.t }) }));
  }
  if (raised.length) acc.save();
  return raised;
}
setInterval(() => { try { checkDeadman(); } catch (e) { console.error("dead-man check:", e.message); } }, Number(process.env.DEADMAN_CHECK_MS || 60000)).unref();

// Share tokens map to a family id (a hash), persisted so links survive restarts.
const IDX = join(store.DIR, "_shares.json"), HOOKS = join(store.DIR, "_hooks.json");
const saveIndex = () => writeFileSync(IDX, JSON.stringify(Object.fromEntries(shareIndex)));
const saveHooks = () => writeFileSync(HOOKS, JSON.stringify(Object.fromEntries(hookIndex)));
// Hosted mode calls this after another instance changed the files.
export function reload() {
  acc.forget(); fl.forget();
  for (const [file, map] of [[IDX, shareIndex], [HOOKS, hookIndex]]) { map.clear(); try { for (const [k, f] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) map.set(k, f); } catch {} }
}
reload();

// Self-hosted: check hourly for families whose weekly summary is due. On Vercel a cron calls /api/cron/weekly.
if (!process.env.VERCEL && process.env.LUMINAAC_NO_LISTEN !== "1") setInterval(() => sendWeekly().catch((e) => console.error("weekly:", e.message)), 3600e3).unref();

if (process.env.LUMINAAC_NO_LISTEN !== "1") {
  server.listen(PORT, () => console.log(`LuminAAC backend on http://localhost:${PORT}  (data: ${store.DIR})`));
}
