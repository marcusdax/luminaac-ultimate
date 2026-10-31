// End-to-end API test. Run: node test.mjs  (starts its own server on a random port, temp data dir)
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.LUMINAAC_DATA = mkdtempSync(join(tmpdir(), "luminaac-"));
process.env.LUMINAAC_NO_LISTEN = "1";
process.env.LUMINAAC_QUIET = "1";
process.env.FL_PHASE_MS = "1500";
process.env.FL_EPSILON_CAP = "1000";
const { server, checkDeadman } = await import("./server.js");
const acc = await import("./accounts.js");
const mailer = await import("./mailer.js");
const net = await import("node:net");
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const KEY = "test-family-key-0123456789";
let pass = 0, failN = 0;
const t = (name, cond) => { cond ? pass++ : failN++; console.log(`${cond ? "ok  " : "FAIL"} ${name}`); };
const call = async (method, path, body, key = KEY) => {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(key && { Authorization: `Bearer ${key}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const doc = { version: 2, profile: { child: "Sam", place: "home" }, signals: [{ id: "s1", name: "Window hum", cues: ["hum"], meaning: "Park", phrase: "I want to go to the park", confirmations: 6, rejections: 1, contexts: ["home"] }], moments: [{ t: 1, context: "breakfast", meaning: "Park", media: "blob" }], notes: [], personality: [], privacy: { retainDays: 30 } };

t("health", (await call("GET", "/api/health", null, null)).json.data.status === "ok");
t("401 without key", (await call("GET", "/api/sync", null, null)).status === 401);
t("empty sync", (await call("GET", "/api/sync")).json.data.version === 0);
const put = await call("PUT", "/api/sync", { doc, baseVersion: 0 });
t("first push → v1", put.json.data.version === 1);
t("stale push → 409", (await call("PUT", "/api/sync", { doc, baseVersion: 0 })).status === 409);
t("push with base → v2", (await call("PUT", "/api/sync", { doc, baseVersion: 1 })).json.data.version === 2);
t("bad doc → 400", (await call("PUT", "/api/sync", { doc: { version: 1 } })).status === 400);

const gen = await call("POST", "/api/predictions/generate", { context: { location: "home", mood: "happy" } });
t("predictions generate", gen.json.data.suggestions[0].suggestion === "I want to go to the park");
t("predictions current", (await call("GET", "/api/predictions/current")).json.data.suggestions.length === 1);
t("feedback accepted", (await call("POST", "/api/predictions/feedback", { prediction_index: 0, feedback: { accepted: true } })).json.success);
t("feedback validation", (await call("POST", "/api/predictions/feedback", { prediction_index: -1, feedback: {} })).status === 400);
const st = (await call("GET", "/api/predictions/stats")).json.data;
t("stats acceptance_rate 1", st.acceptance_rate === 1 && st.total_predictions === 1);
t("patterns", (await call("GET", "/api/predictions/patterns")).json.data[0].confirmations === 7);
t("pattern update", (await call("POST", "/api/predictions/patterns/s1/update", { success: false })).json.success);
t("adaptive learning", (await call("POST", "/api/predictions/adaptive-learning", { enable: false })).json.data.enabled === false);

const sh = (await call("POST", "/api/share", { role: "teacher", name: "Ms. Rivera", expiresInDays: 7 })).json.data;
t("share created", sh.token.length >= 20);
const view = (await call("GET", sh.path, null, null)).json.data;
t("share view scoped (no media, no privacy)", view.signals.length === 1 && !("privacy" in view) && !JSON.stringify(view).includes("blob"));
const famShare = (await call("POST", "/api/share", { role: "family" })).json.data;
t("family view hides meanings", !("moments" in (await call("GET", famShare.path, null, null)).json.data));
t("revoke share", (await call("DELETE", sh.path)).json.success);
t("revoked → 404", (await call("GET", sh.path, null, null)).status === 404);

// SSE alert stream
const ctrl = new AbortController();
const stream = await fetch(base + "/api/alerts/stream", { headers: { Authorization: `Bearer ${KEY}` }, signal: ctrl.signal });
const reader = stream.body.getReader();
const got = (async () => { let s = ""; while (!s.includes("event: alert")) { const { value } = await reader.read(); s += new TextDecoder().decode(value); } return s; })();
const al = (await call("POST", "/api/alerts", { kind: "help", message: "I need help" })).json.data;
t("alert stored", al.kind === "help" && al.ack === null);
t("alert pushed over SSE", (await got).includes("I need help"));
ctrl.abort();
t("duplicate alert id ignored", (await call("POST", "/api/alerts", { id: al.id, kind: "help" })) && (await call("GET", "/api/alerts")).json.data.length === 1);
t("alert ack", (await call("POST", `/api/alerts/${al.id}/ack`, { by: "Mom" })).json.data.ack.by === "Mom");
t("bad alert kind", (await call("POST", "/api/alerts", { kind: "x" })).status === 400);
t("other family isolated", (await call("GET", "/api/alerts", null, "another-family-key-xyz")).json.data.length === 0);
t("delete all", (await call("DELETE", "/api/sync")).json.success && (await call("GET", "/api/sync")).json.data.version === 0);
t("404 json", (await call("GET", "/api/nope")).status === 404);

// ================= Phase 3 =================
import { generateKeyPairSync, createHash, sign as csign } from "node:crypto";
const fc = await import("../fl-core.js");

// ---- Accounts ----
const reg = await call("POST", "/api/auth/register", { email: "Mom@Example.com", password: "correct horse battery", name: "Ana", familyName: "Rivera family", childName: "Sam" }, null);
t("register parent", reg.json.data.role === "parent" && reg.json.data.family.children[0].name === "Sam");
const TOK = reg.json.data.token;
t("short password rejected", (await call("POST", "/api/auth/register", { email: "x@y.co", password: "short" }, null)).status === 400);
t("duplicate email 409", (await call("POST", "/api/auth/register", { email: "mom@example.com", password: "another long password" }, null)).status === 409);
t("wrong password 401", (await call("POST", "/api/auth/login", { email: "mom@example.com", password: "nope nope nope" }, null)).status === 401);
// ---- Email verification and password reset (dev outbox mailer) ----
const linkFrom = (to, kind) => { const m = mailer.outbox().find((x) => x.to === to && x.text.includes(`#${kind}=`)); return m && new RegExp(`#${kind}=([\\w-]+)`).exec(m.text)[1]; };
const vtok = linkFrom("mom@example.com", "verify");
t("register sends a verification email", !!vtok && mailer.outbox()[0].subject.includes("Confirm"));
t("verification token stored hashed only", !JSON.stringify(acc.db().tokens).includes(vtok));
t("tampered token rejected", (await call("POST", "/api/auth/verify", { token: vtok.slice(0, -2) + "xx" }, null)).status === 400);
t("verify email", (await call("POST", "/api/auth/verify", { token: vtok }, null)).json.data.emailVerified > 0);
t("verification link is single-use", (await call("POST", "/api/auth/verify", { token: vtok }, null)).status === 400);
t("me shows email verified", (await call("GET", "/api/auth/me", null, TOK)).json.data.user.emailVerified > 0);
t("resend when verified says so", /Already/.test((await call("POST", "/api/auth/verify/send", null, TOK)).json.message));
const rr = (await call("POST", "/api/auth/register", { email: "reset@example.com", password: "first long password" }, null)).json.data;
const before = mailer.outbox().length;
const unknown = await call("POST", "/api/auth/reset/request", { email: "nobody@example.com" }, null);
t("reset request for unknown email looks the same, sends nothing", unknown.status === 200 && /If that email/.test(unknown.json.message) && mailer.outbox().length === before);
t("reset request sends a link", (await call("POST", "/api/auth/reset/request", { email: "Reset@Example.com" }, null)).status === 200 && !!linkFrom("reset@example.com", "reset"));
const old = linkFrom("reset@example.com", "reset");
await call("POST", "/api/auth/reset/request", { email: "reset@example.com" }, null);
const rtok = linkFrom("reset@example.com", "reset");
t("a newer reset link replaces the older one", rtok !== old && (await call("POST", "/api/auth/reset", { token: old, password: "some new long password" }, null)).status === 400);
t("reset rate-limited (3 emails an hour per address)", (await call("POST", "/api/auth/reset/request", { email: "reset@example.com" }, null)).status === 429);
t("reset needs a 10+ character password", (await call("POST", "/api/auth/reset", { token: rtok, password: "short" }, null)).status === 400);
t("password reset", (await call("POST", "/api/auth/reset", { token: rtok, password: "brand new long password" }, null)).status === 200);
t("reset link is single-use", (await call("POST", "/api/auth/reset", { token: rtok, password: "another new password" }, null)).status === 400);
t("reset signs out old sessions", !(await call("GET", "/api/auth/me", null, rr.token)).json?.data?.user);
t("old password stops working", (await call("POST", "/api/auth/login", { email: "reset@example.com", password: "first long password" }, null)).status === 401);
t("new password works", (await call("POST", "/api/auth/login", { email: "reset@example.com", password: "brand new long password" }, null)).status === 200);
{ const u = acc.db().users["reset@example.com"]; const tk = acc.issueToken(u, "reset"); for (const v of Object.values(acc.db().tokens)) v.exp = Date.now() - 1;
  t("expired reset link rejected", (await call("POST", "/api/auth/reset", { token: tk, password: "late long password" }, null)).status === 400); }
// SMTP transport against a tiny fake server (no TLS), and refusing plain text by default
{ const got = []; const srv = net.createServer((c) => { c.setEncoding("utf8"); let data = false, buf = "";
    c.write("220 fake ESMTP\r\n");
    c.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\r\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); got.push(line);
      if (data) { if (line === ".") { data = false; c.write("250 queued\r\n"); } continue; }
      if (/^EHLO/.test(line)) c.write("250-fake\r\n250 AUTH PLAIN LOGIN\r\n"); else if (/^AUTH PLAIN/.test(line)) c.write("235 ok\r\n");
      else if (/^(MAIL|RCPT)/.test(line)) c.write("250 ok\r\n"); else if (line === "DATA") { data = true; c.write("354 go\r\n"); } else if (line === "QUIT") { c.write("221 bye\r\n"); c.end(); } } }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const env = { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(srv.address().port), SMTP_USER: "u", SMTP_PASS: "p" };
  let refused = false; try { await mailer.smtp({ id: "1", to: "a@b.co", from: "x@y.co", subject: "Hi", text: "Body", t: Date.now() }, env); } catch (e) { refused = /STARTTLS/.test(e.message); }
  t("smtp refuses a server without STARTTLS by default", refused);
  await mailer.smtp({ id: "2", to: "a@b.co", from: "LuminAAC <x@y.co>", subject: "Reset", text: "Line one\n.dot line", t: Date.now() }, { ...env, SMTP_REQUIRE_TLS: "0" });
  t("smtp sends with AUTH PLAIN, envelope and dot-stuffing", got.includes("AUTH PLAIN " + Buffer.from("\0u\0p").toString("base64")) && got.includes("MAIL FROM:<x@y.co>") && got.includes("RCPT TO:<a@b.co>") && got.includes("Subject: Reset") && got.includes("..dot line"));
  srv.close(); }
t("mail subjects can't inject headers", (await mailer.send({ to: "a@b.co", subject: "Hi\r\nBcc: evil@x.co", text: "x" })) && !mailer.outbox()[0].subject.includes("\n"));
const login = await call("POST", "/api/auth/login", { email: "mom@example.com", password: "correct horse battery" }, null);
t("login", login.json.data.token && login.json.data.role === "parent");
t("me", (await call("GET", "/api/auth/me", null, TOK)).json.data.user.email === "mom@example.com");
t("password stored as scrypt hash", (() => { const raw = JSON.stringify(JSON.parse(readFileSync(join(process.env.LUMINAAC_DATA, "_accounts.json"), "utf8"))); return !raw.includes("correct horse") && !raw.includes(TOK); })());
t("parent pushes doc", (await call("PUT", "/api/sync", { doc: { ...doc, notes: [{ t: 1, text: "private note" }], safety: { consent: true, zones: [{ id: "z1", name: "Home", lat: 41.88, lng: -87.63, r: 150 }, { id: "z2", name: "Creek path", type: "danger", shape: "poly", pts: [[41.881, -87.631], [41.881, -87.629], [41.879, -87.629]], buffer: 0 }], water: { on: true, buffer: 30, radius: 1500, features: [{ id: "w1", name: "Pond", kind: "poly", rings: [[[41.885, -87.635], [41.885, -87.633], [41.884, -87.633]]] }] } } }, baseVersion: 0 }, TOK)).json.data.version === 1);
const inv = await call("POST", "/api/family/invites", { role: "teacher" }, TOK);
t("invite created", inv.json.data.code.length > 8);
const teach = await call("POST", "/api/auth/register", { email: "teacher@school.org", password: "a long teacher password", invite: inv.json.data.code }, null);
t("teacher joins with role", teach.json.data.role === "teacher" && teach.json.data.family.id === reg.json.data.family.id);
const TT = teach.json.data.token;
const tv = (await call("GET", "/api/sync", null, TT)).json.data;
t("teacher gets scoped view only", tv.doc === null && tv.view.role === "teacher" && !JSON.stringify(tv).includes("safety"));
t("teacher cannot write", (await call("PUT", "/api/sync", { doc, baseVersion: 1 }, TT)).status === 403);
t("teacher cannot pair devices", (await call("POST", "/api/devices/pair", {}, TT)).status === 403);
t("invite single use", (await call("POST", "/api/auth/register", { email: "t2@school.org", password: "a long teacher password", invite: inv.json.data.code }, null)).status === 400);
t("family members listed", (await call("GET", "/api/family", null, TOK)).json.data.members.length === 2);
t("add child profile", (await call("POST", "/api/family/children", { name: "Leo" }, TOK)).json.data.name === "Leo");
t("legacy family key adopted by account", (await (async () => { const r = await call("POST", "/api/auth/register", { email: "dad@example.com", password: "dad long password", familyKey: KEY }, null); await call("PUT", "/api/sync", { doc, baseVersion: 0 }); return (await call("GET", "/api/sync", null, r.json.data.token)).json.data.version >= 1; })()));
const lo = login.json.data.token;
await call("POST", "/api/auth/logout", null, lo);
t("logout kills session", (await call("GET", "/api/auth/me", null, lo)).status === 401 || (await call("GET", "/api/auth/me", null, lo)).json.data.familyKey === true);

// ---- Passkeys (software authenticator) ----
const cborEnc = (v) => {
  const hd = (mt, n) => n < 24 ? Buffer.from([mt << 5 | n]) : n < 256 ? Buffer.from([mt << 5 | 24, n]) : Buffer.from([mt << 5 | 25, n >> 8, n & 255]);
  if (typeof v === "number") return v >= 0 ? hd(0, v) : hd(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([hd(2, v.length), v]);
  if (typeof v === "string") { const b = Buffer.from(v); return Buffer.concat([hd(3, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([hd(5, v.size), ...[...v].flatMap(([k, x]) => [cborEnc(k), cborEnc(x)])]);
};
const ORIGIN = "http://localhost:8765";
const callO = async (method, path, body, key) => { const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: ORIGIN, ...(key && { Authorization: `Bearer ${key}` }) }, body: body && JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };
const { privateKey: pk, publicKey: pubk } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = pubk.export({ format: "jwk" });
const credId = Buffer.from("cred-0001-test");
const rpHash = createHash("sha256").update("localhost").digest();
const b64 = (b) => Buffer.from(b).toString("base64url");
const ro = (await callO("POST", "/api/auth/passkey/register/options", {}, TOK)).json.data;
t("passkey options", ro.rp.id === "localhost" && ro.challenge.length > 20);
const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]);
const cnt = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const authData = Buffer.concat([rpHash, Buffer.from([0x45]), cnt(0), Buffer.alloc(16), Buffer.from([0, credId.length]), credId, cborEnc(cose)]);
const cdj = (type, challenge) => b64(JSON.stringify({ type, challenge, origin: ORIGIN }));
const rv = await callO("POST", "/api/auth/passkey/register/verify", { challenge: ro.challenge, name: "Test key", credential: { id: b64(credId), response: { clientDataJSON: cdj("webauthn.create", ro.challenge), attestationObject: b64(cborEnc(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]))) } } }, TOK);
t("passkey registered", rv.json?.data?.passkeys?.length === 1);
const lo2 = (await callO("POST", "/api/auth/passkey/login/options", {})).json.data;
const ad2 = Buffer.concat([rpHash, Buffer.from([0x05]), cnt(1)]);
const cd2 = cdj("webauthn.get", lo2.challenge);
const sigv = csign("sha256", Buffer.concat([ad2, createHash("sha256").update(Buffer.from(cd2, "base64url")).digest()]), pk);
const pl = await callO("POST", "/api/auth/passkey/login/verify", { challenge: lo2.challenge, credential: { id: b64(credId), response: { clientDataJSON: cd2, authenticatorData: b64(ad2), signature: b64(sigv) } } });
t("passkey sign-in", pl.json?.data?.user?.email === "mom@example.com");
const lo3 = (await callO("POST", "/api/auth/passkey/login/options", {})).json.data;
t("passkey bad signature rejected", (await callO("POST", "/api/auth/passkey/login/verify", { challenge: lo3.challenge, credential: { id: b64(credId), response: { clientDataJSON: cdj("webauthn.get", lo3.challenge), authenticatorData: b64(Buffer.concat([rpHash, Buffer.from([0x05]), cnt(2)])), signature: b64(sigv) } } })).status === 401);
t("passkey challenge single use", (await callO("POST", "/api/auth/passkey/login/verify", { challenge: lo2.challenge, credential: { id: b64(credId), response: {} } })).status === 400);

// ---- Device pairing ----
const pr = (await call("POST", "/api/devices/pair", { kind: "myvoice" }, TOK)).json.data;
t("pairing code", /^\d{6}$/.test(pr.code));
t("bad code rejected", (await call("POST", "/api/devices/claim", { code: pr.code === "000000" ? "111111" : "000000" }, null)).status === 400);
const cl = (await call("POST", "/api/devices/claim", { code: pr.code, name: "Sam's tablet" }, null)).json.data;
t("device claimed", cl.deviceKey.startsWith(cl.deviceId + "."));
t("code single use", (await call("POST", "/api/devices/claim", { code: pr.code }, null)).status === 400);
const DK = cl.deviceKey;
const cv = (await call("GET", "/api/sync", null, DK)).json.data;
t("device sync is child-scoped", cv.role === "child" && cv.doc.safety.zones.length === 2 && !cv.doc.notes);
t("device gets drawn shapes and water", cv.doc.safety.zones[1].shape === "poly" && cv.doc.safety.zones[1].pts.length === 3 && cv.doc.safety.water.on && cv.doc.safety.water.features[0].name === "Pond");
t("device cannot push doc", (await call("PUT", "/api/sync", { doc, baseVersion: 1 }, DK)).status === 403);
t("device cannot list alerts", (await call("GET", "/api/alerts", null, DK)).status === 403);
const za = await call("POST", "/api/alerts", { kind: "zone-leave", zone: "Home", message: "Left Home", loc: { lat: 41.889123456, lng: -87.6301, acc: 12 } }, DK);
t("geofence leave alert with location", za.json.data.kind === "zone-leave" && za.json.data.loc.lat === 41.88912 && za.json.data.from === "Sam's tablet");
t("bad location rejected", (await call("POST", "/api/alerts", { kind: "home", loc: { lat: 200, lng: 0 } }, DK)).status === 400);
const wa = await call("POST", "/api/alerts", { kind: "danger-enter", zone: "Pond", water: true, message: "Near water: Pond", loc: { lat: 41.8849, lng: -87.6341, acc: 8 } }, DK);
t("water danger alert accepted and marked urgent", wa.status === 200 && wa.json.data.kind === "danger-enter" && wa.json.data.urgent === true && wa.json.data.water === true && wa.json.data.loc.acc === 8);
t("danger-leave alert accepted", (await call("POST", "/api/alerts", { kind: "danger-leave", zone: "Pond", water: true }, DK)).json.data.urgent === undefined);
t("unknown alert kind rejected", (await call("POST", "/api/alerts", { kind: "danger-maybe" }, DK)).status === 400);
t("parent sees zone alert", (await call("GET", "/api/alerts", null, TOK)).json.data.some((a) => a.kind === "zone-leave"));
t("device list", (await call("GET", "/api/devices", null, TOK)).json.data.some((d) => d.name === "Sam's tablet" && !d.keyHash));
// ---- Dead-man check: a location-sharing device that goes quiet ----
const hb = await call("POST", "/api/devices/heartbeat", { sharing: true, silentAfterMin: 5, loc: { lat: 41.89, lng: -87.63, acc: 20 } }, DK);
t("heartbeat accepted", hb.status === 200 && hb.json.data.silentAfterMin === 5);
t("only devices send heartbeats", (await call("POST", "/api/devices/heartbeat", { sharing: true }, TOK)).status === 403);
t("no alert while checking in", checkDeadman(Date.now() + 4 * 60e3).length === 0);
const silent = checkDeadman(Date.now() + 6 * 60e3);
t("silent alert after the threshold", silent.length === 1 && silent[0].kind === "silent" && silent[0].loc.lat === 41.89 && /hasn't checked in/.test(silent[0].message));
t("silent alert raised once", checkDeadman(Date.now() + 20 * 60e3).length === 0);
t("parent sees the silent alert", (await call("GET", "/api/alerts", null, TOK)).json.data.some((a) => a.kind === "silent"));
await call("POST", "/api/devices/heartbeat", { sharing: true }, DK);
t("back online alert", (await call("GET", "/api/alerts", null, TOK)).json.data.some((a) => a.kind === "back"));
await call("POST", "/api/devices/heartbeat", { sharing: false }, DK);
t("no dead-man alert when sharing is off", checkDeadman(Date.now() + 60 * 60e3).length === 0);
t("revoke device", (await call("DELETE", `/api/devices/${cl.deviceId}`, null, TOK)).json.success);
t("revoked key stops working", (await call("GET", "/api/sync", null, DK)).status === 401);

// ---- Federated learning: 3 simulated families, secure aggregation + DP ----
// Synthetic truth: suggestions get used in the morning at home, ignored at night.
const truth = (x) => (x[1] + x[5] - x[4] * 1.5 + x[16] - 0.6 > 0 ? 1 : 0);
const rnd = (i) => { const pods = fc.PODS, pl = fc.PLACES; return fc.featurize({ pod: pods[i % 4], place: pl[(i * 7) % 4], arousal: Math.sin(i), valence: Math.cos(i), intent: fc.INTENT_KEYS[i % 6], confidence: ((i * 37) % 100) / 100 }); };
const dataFor = (c) => Array.from({ length: 60 }, (_, i) => { const x = rnd(i * 3 + c * 101); return { x, y: truth(x) }; });
const clients = [0, 1, 2].map(dataFor);
const testSet = Array.from({ length: 200 }, (_, i) => { const x = rnd(i * 11 + 5000); return { x, y: truth(x) }; });
const m0 = (await call("GET", "/api/fl/model", null, TOK)).json.data;
t("fl model download", m0.dim === fc.DIM && m0.version === 0);
const acc0 = fc.accuracy(m0.weights, testSet);
// secure aggregation check: masks cancel exactly
{
  const ks = await Promise.all([0, 1, 2].map(() => fc.maskKeys()));
  const peers = ks.map((k, i) => ({ client: i, publicKey: k.publicKey }));
  const vs = [[0.5, -0.25], [0.1, 0.2], [-0.3, 0.05]].map((v) => fc.encode(v.concat(new Array(fc.DIM - 2).fill(0))));
  const ms = await Promise.all(vs.map((v, i) => fc.mask(v, i, ks[i].privateKey, peers, "r-test")));
  const sum = fc.decodeSum(ms.reduce((a, v) => fc.addMod(a, v)), 1);
  t("masks cancel in the sum", Math.abs(sum[0] - 0.3) < 1e-6 && Math.abs(sum[1] - 0) < 1e-6 && ms[0][0] !== vs[0][0]);
}
t("delta clipped to norm 1", Math.hypot(...fc.clip(new Array(fc.DIM).fill(3))) <= 1 + 1e-9);
const keys = [TOK, KEY, "third-family-key-abcdef"];
const api = (key) => async (method, path, body) => { const r = await call(method, path, body, key); if (r.status >= 400) throw Object.assign(new Error(r.json?.error || r.status), { status: r.status }); return r.json.data; };
for (let r = 0; r < 6; r++) {
  const g = (await call("GET", "/api/fl/model", null, TOK)).json.data.weights;
  const outs = await Promise.all(keys.map(async (k, i) => fc.runRound({ call: api(k), update: (await fc.clientUpdate(g, clients[i], { epochs: 10, noise: 0.05 })).encoded, poll: 50 })));
  if (r === 0) t("round completes with 3 clients (shares → masks → unmask)", outs.every((o) => o.done) && outs[0].version === 1);
}
const m1 = (await call("GET", "/api/fl/model", null, TOK)).json.data;
const acc1 = fc.accuracy(m1.weights, testSet);
console.log(`     federated accuracy ${acc0.toFixed(2)} → ${acc1.toFixed(2)} after ${m1.version} rounds`);
t("global model improves", m1.version === 6 && acc1 > acc0 && acc1 >= 0.75);
// Shamir t-of-n
{ const sh = fc.split(0xdeadbeefn, 5, 3);
  t("shamir: any 3 of 5 shares rebuild the secret", fc.combine([sh[0], sh[2], sh[4]]) === 0xdeadbeefn && fc.combine([sh[1], sh[3], sh[4]]) === 0xdeadbeefn);
  t("shamir: 2 of 5 shares reveal nothing useful", fc.combine([sh[1], sh[3]]) !== 0xdeadbeefn); }
// Dropout simulation: 4 clients, quorum 3, exact expected sum.
process.env.FL_ROUND_SIZE = "4"; process.env.FL_QUORUM = "3";
const keys4 = [...keys, "fourth-family-key-abcdef"];
const known = [0.2, -0.1, 0.05, 0.3].map((v) => fc.encode([v, ...new Array(fc.DIM - 1).fill(0)]));
async function sim(dropAt) {
  const before = (await call("GET", "/api/fl/model", null, TOK)).json.data;
  const outs = await Promise.all(keys4.map((k, i) => fc.runRound({ call: api(k), update: known[i], poll: 50, dropAt: dropAt[i] }).catch((e) => ({ error: e.message, status: e.status }))));
  const after = (await call("GET", "/api/fl/model", null, TOK)).json.data;
  return { outs, dw: +(after.weights[0] - before.weights[0]).toFixed(6), dv: after.version - before.version, after };
}
{ const r = await sim([null, null, null, "shares"]); // client 3 vanishes after sharing its key
  t("dropout after sharing: round still completes with 3 survivors", r.dv === 1 && r.outs.slice(0, 3).every((o) => o.done));
  t("dropout: server unmasks the exact survivors' average", Math.abs(r.dw - (0.2 - 0.1 + 0.05) / 3) < 1e-5);
  t("dropout recorded in history", r.after.history.at(-1).dropped === 1 && r.after.history.at(-1).clients === 3); }
{ const r = await sim([null, null, "update", null]); // client 2 sends its update then never helps unmask
  t("silent after sending: others' shares still unmask it", r.dv === 1 && Math.abs(r.dw - (0.2 - 0.1 + 0.05 + 0.3) / 4) < 1e-5); }
{ const r = await sim([null, null, "join", "shares"]); // two drop: below quorum
  t("below quorum: round abandoned, nothing applied", r.dv === 0 && r.outs[0].status === 410 && r.after.history.at(-1).aborted === true); }
{ const r = await sim([null, null, "join", null]); // one drops before sharing: roster shrinks to 3
  t("dropout before sharing: roster shrinks, round completes", r.dv === 1 && Math.abs(r.dw - (0.2 - 0.1 + 0.3) / 3) < 1e-5); }
{ // joining timeout with quorum: 3 of 4 join, the round starts when the join phase times out
  const outs = await Promise.all(keys4.slice(0, 3).map((k, i) => fc.runRound({ call: api(k), update: known[i], poll: 50 })));
  t("join timeout with quorum: round goes ahead with 3 of 4", outs.every((o) => o.done)); }
{ // a client never reveals both kinds of share for one peer
  let threw = false; try { fc.reveal({ 0: { x: 1, d: "1", b: "2" } }, 0, { survivors: [0, 1], dropped: [1] }); } catch { threw = true; }
  t("client refuses an unsafe unmask request", threw); }
// Privacy budget
const bud = (await call("GET", "/api/fl/budget", null, TOK)).json.data;
t("privacy budget tracked per device", bud.rounds >= 10 && bud.epsilon > 0 && bud.cap === 1000);
process.env.FL_EPSILON_CAP = String(bud.epsilon);
const cap = await call("POST", "/api/fl/round/join", { publicKey: (await fc.maskKeys()).publicKey }, TOK);
t("join refused once ε would pass the cap", cap.status === 403 && /privacy budget/.test(cap.json.error));
process.env.FL_EPSILON_CAP = "1000"; process.env.FL_ROUND_SIZE = "3"; delete process.env.FL_QUORUM;
t("zCDP accounting: more clients per round → less ε", fc.epsilon(fc.rhoPerRound(100)) < fc.epsilon(fc.rhoPerRound(3)));
t("fl rejects malformed update", (await call("POST", `/api/fl/round/${(await call("GET", "/api/fl/round", null, TOK)).json.data.id}/update`, { client: 0, masked: [1, 2] }, TOK)).status >= 400);
t("teacher cannot delete family data", (await call("DELETE", "/api/sync", null, TT)).status === 403);

console.log(`\n${pass} passed, ${failN} failed`);

server.close(); process.exit(failN ? 1 : 0);
