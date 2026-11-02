// Web Push with no npm dependencies (Node 18+): VAPID (RFC 8292) and
// aes128gcm payload encryption (RFC 8291), the same protocol the MIT-licensed
// `web-push` package speaks. Push services only ever see ciphertext.
//
// Keys: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (base64url, from
// `node backend/webpush.js keys`) and VAPID_SUBJECT (mailto: or https: contact).
// Without them, a key pair is made once and kept in <data>/_vapid.json, which is
// fine for one server but changes if that file is lost (everyone re-subscribes).
import { createECDH, createHmac, createCipheriv, createDecipheriv, randomBytes, generateKeyPairSync, createPrivateKey, sign, createPublicKey, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const b64u = (b) => Buffer.from(b).toString("base64url");
export const unb64u = (s) => Buffer.from(String(s), "base64url");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

export function makeKeys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const j = privateKey.export({ format: "jwk" });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(j.x), unb64u(j.y)])), privateKey: j.d };
}
let cached = null;
export function keys(dir) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, fromEnv: true };
  if (cached) return cached;
  const f = join(dir, "_vapid.json");
  try { cached = JSON.parse(readFileSync(f, "utf8")); } catch { cached = makeKeys(); try { writeFileSync(f, JSON.stringify(cached)); } catch {} }
  return cached;
}
const subject = () => process.env.VAPID_SUBJECT || "mailto:admin@localhost";

// A signed VAPID JWT for the push service's origin, valid 12 hours.
export function vapidAuth(endpoint, k, now = Date.now()) {
  const pub = unb64u(k.publicKey);
  const key = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: k.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject() }));
  const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${k.publicKey}`;
}
export function verifyVapid(header, publicKey) { // for tests
  const m = /t=([^,]+),\s*k=(.+)$/.exec(header); if (!m) return false;
  const [h, c, s] = m[1].split("."); const pub = unb64u(m[2]);
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  return m[2] === publicKey && verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, unb64u(s));
}

// RFC 8291: encrypt `payload` for one subscription ({ keys: { p256dh, auth } }).
export function encrypt(payload, sub, salt = randomBytes(16)) {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const asPub = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(ua);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = 65;
  return Buffer.concat([head, asPub, body]);
}
// The browser's side, for tests: decrypt with the subscriber's private key.
export function decrypt(buf, uaEcdh, auth) {
  const salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
  const ua = uaEcdh.getPublicKey(), shared = uaEcdh.computeSecret(asPub);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const d = createDecipheriv("aes-128-gcm", hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16), hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return out.subarray(0, out.lastIndexOf(2)).toString("utf8");
}

// Send one push. Resolves { status, gone } where gone means the subscription is dead (404/410).
export async function send(sub, data, k, { ttl = 3600, urgency = "normal", topic } = {}) {
  const body = encrypt(JSON.stringify(data), sub);
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(sub.endpoint, { method: "POST", signal: ctl.signal, body, headers: {
      Authorization: vapidAuth(sub.endpoint, k), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
      TTL: String(ttl), Urgency: urgency, ...(topic && { Topic: String(topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) }) } });
    return { status: r.status, gone: r.status === 404 || r.status === 410 };
  } catch (e) { return { status: 0, gone: false, error: e.message }; }
  finally { clearTimeout(tm); }
}

// Quiet hours: "HH:MM" to "HH:MM" in the person's own time zone; the window may cross midnight.
export function inQuiet(q, now = Date.now()) {
  if (!q?.on || !q.from || !q.to) return false;
  let hm;
  try { hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: q.tz || "UTC" }).format(now); } catch { return false; }
  const cur = hm.replace(":", ""), a = q.from.replace(":", ""), b = q.to.replace(":", "");
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
// Who should get this event: role allowed, kind switched on, and not inside quiet hours unless urgent.
export function recipients(subs, ev, now = Date.now()) {
  return (subs || []).filter((s) => {
    const p = s.prefs || {};
    if (ev.excludeUid && s.uid && s.uid === ev.excludeUid) return false;
    if (ev.type === "chat" && (p.chat === false || !s.canChat)) return false;
    if (ev.type === "alert" && (p.alerts === false || !s.canAlerts)) return false;
    if (ev.type === "summary" && !p.summary) return false;
    if (ev.urgent) return true;
    if (p.urgentOnly && ev.type === "alert") return false;
    return !inQuiet(p.quiet, now);
  });
}

if (process.argv[1] && process.argv[1].endsWith("webpush.js") && process.argv[2] === "keys") {
  const k = makeKeys();
  console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@example.org`);
}
