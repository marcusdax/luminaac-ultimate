// Federated learning core, shared by the browser (Bridge) and the Node backend/tests.
// Model: logistic regression that predicts "this suggestion will be used"
// from context features. Raw moments, recordings and words never leave the device:
// a client trains locally, then sends only a weight delta that is
//   1. clipped to L2 norm ≤ CLIP,
//   2. noised with Gaussian noise (sigma = NOISE × CLIP) for differential privacy,
//   3. encoded to fixed point and masked with pairwise secrets (secure aggregation),
// so the server can only ever read the sum of everyone's updates.
const C = globalThis.crypto;

export const PODS = ["morning", "afternoon", "evening", "night"];
export const PLACES = ["home", "school", "therapy", "out"];
export const INTENT_KEYS = ["help", "emotion", "need", "social", "preference", "request"];
export const FEATURES = ["bias", ...PODS.map((p) => "time:" + p), ...PLACES.map((p) => "place:" + p), "arousal", "valence", ...INTENT_KEYS.map((k) => "intent:" + k), "confidence"];
export const DIM = FEATURES.length; // 17
export const CLIP = 1.0, NOISE = 0.3, SCALE = 1e6;

export function featurize({ pod, place, arousal = 0, valence = 0, intent, confidence = 0.5 } = {}) {
  const x = new Array(DIM).fill(0);
  x[0] = 1;
  const i = PODS.indexOf(pod); if (i >= 0) x[1 + i] = 1;
  const j = PLACES.indexOf(place); if (j >= 0) x[5 + j] = 1;
  x[9] = Math.max(-1, Math.min(1, arousal)); x[10] = Math.max(-1, Math.min(1, valence));
  const k = INTENT_KEYS.indexOf(intent); if (k >= 0) x[11 + k] = 1;
  x[16] = confidence;
  return x;
}
const sig = (z) => 1 / (1 + Math.exp(-z));
export const zeros = () => new Array(DIM).fill(0);
export const predict = (w, x) => sig(w.reduce((s, wi, i) => s + wi * x[i], 0));

// Plain SGD with a little L2. samples: [{x, y}] with y in {0,1}.
export function train(w0, samples, { epochs = 20, lr = 0.2, l2 = 1e-3 } = {}) {
  const w = w0.slice();
  for (let e = 0; e < epochs; e++) for (const { x, y } of samples) {
    const g = predict(w, x) - y;
    for (let i = 0; i < DIM; i++) w[i] -= lr * (g * x[i] + l2 * w[i]);
  }
  return w;
}
export function accuracy(w, samples) { return samples.length ? samples.filter(({ x, y }) => (predict(w, x) >= 0.5) === (y === 1)).length / samples.length : 0; }

export function clip(v, c = CLIP) { const n = Math.hypot(...v); return n > c ? v.map((x) => (x * c) / n) : v.slice(); }
function gauss() { const u = new Uint32Array(2); C.getRandomValues(u); const a = (u[0] + 1) / 4294967297, b = u[1] / 4294967296; return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }
export function privatize(delta, { clipTo = CLIP, noise = NOISE } = {}) { return clip(delta, clipTo).map((x) => x + gauss() * noise * clipTo); }

// Fixed-point encode/decode modulo 2^32 so pairwise masks cancel exactly.
export const encode = (v) => v.map((x) => (Math.round(x * SCALE) >>> 0));
export const addMod = (a, b) => a.map((x, i) => (x + b[i]) >>> 0);
export const subMod = (a, b) => a.map((x, i) => (x - b[i]) >>> 0);
export const decodeSum = (u, n = 1) => u.map((x) => (x | 0) / SCALE / n);

// ----- Secure aggregation that survives dropouts -----
// Follows Bonawitz et al. 2017 ("Practical Secure Aggregation"), simplified:
//  • each client has an ECDH P-256 key pair and a random self-mask seed b;
//  • pairwise masks PRG(ECDH(i,j)) cancel between every pair of clients;
//  • the self-mask PRG(b) hides each update even if pairwise keys leak;
//  • both the ECDH private key and b are Shamir-shared t-of-n with the other
//    clients (shares encrypted to each peer with a key derived from the pair's ECDH).
// After a round, for each survivor the server collects shares of b (to remove
// its self-mask) and for each dropped client shares of its ECDH key (to remove
// the pairwise masks survivors added with it). An honest client never reveals
// both kinds of share for the same peer, so no single update is ever exposed.
const b64u = (buf) => { let s = ""; for (const c of new Uint8Array(buf)) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h, n = 32) => Uint8Array.from(h.padStart(n * 2, "0").match(/../g), (x) => parseInt(x, 16));

// Shamir secret sharing over GF(2^521 − 1) (a Mersenne prime, bigger than any 32-byte secret).
export const P = (1n << 521n) - 1n;
const mod = (a) => ((a % P) + P) % P;
function randField() { const u = new Uint8Array(66); C.getRandomValues(u); return mod(BigInt("0x" + hex(u))); }
function powMod(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; } return r; }
export function split(secret, n, t) { // secret: BigInt < P; returns [{x, y}] for x = 1..n
  const coef = [mod(secret), ...Array.from({ length: t - 1 }, randField)];
  return Array.from({ length: n }, (_, k) => { const x = BigInt(k + 1); let y = 0n; for (let i = coef.length - 1; i >= 0; i--) y = mod(y * x + coef[i]); return { x: k + 1, y: y.toString(16) }; });
}
export function combine(shares) { // Lagrange interpolation at 0
  let s = 0n;
  for (const a of shares) {
    let num = 1n, den = 1n; const xa = BigInt(a.x);
    for (const b of shares) if (b !== a) { num = mod(num * -BigInt(b.x)); den = mod(den * (xa - BigInt(b.x))); }
    s = mod(s + BigInt("0x" + a.y) * num * powMod(den, P - 2n));
  }
  return s;
}

export async function maskKeys() {
  const kp = await C.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const jwk = await C.subtle.exportKey("jwk", kp.privateKey);
  const seed = new Uint8Array(32); C.getRandomValues(seed);
  return { privateKey: kp.privateKey, publicKey: b64u(await C.subtle.exportKey("raw", kp.publicKey)), d: hex(unb64u(jwk.d)), seed: hex(seed) };
}
const pubKey = (raw) => C.subtle.importKey("raw", unb64u(raw), { name: "ECDH", namedCurve: "P-256" }, false, []);
export async function privFromD(dHex, publicKey) { // rebuild a P-256 private key from its scalar and public point
  const pt = unb64u(publicKey);
  return C.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: b64u(unhex(dHex)), x: b64u(pt.slice(1, 33)), y: b64u(pt.slice(33, 65)), ext: true }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}
const ecdh = async (priv, pubRaw) => new Uint8Array(await C.subtle.deriveBits({ name: "ECDH", public: await pubKey(pubRaw) }, priv, 256));
async function prg(secret, label, n) {
  const key = await C.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out = new Uint32Array(n);
  for (let blk = 0; blk * 8 < n; blk++) {
    const words = new Uint32Array(await C.subtle.sign("HMAC", key, new TextEncoder().encode(`${label}:${blk}`)));
    for (let k = 0; k < 8 && blk * 8 + k < n; k++) out[blk * 8 + k] = words[k];
  }
  return Array.from(out);
}
export const pairMask = async (priv, peerPub, round, n) => prg(await ecdh(priv, peerPub), `mask:${round}`, n);
export const selfMask = (seedHex, round, n) => prg(unhex(seedHex), `self:${round}`, n);
async function boxKey(priv, peerPub, usage) {
  const s = await ecdh(priv, peerPub);
  const k = await C.subtle.digest("SHA-256", new Uint8Array([...new TextEncoder().encode("luminaac-share"), ...s]));
  return C.subtle.importKey("raw", k, "AES-GCM", false, [usage]);
}
// Split my key and seed t-of-n, one encrypted share per peer (peers include me; x = client + 1).
export async function shareOut(me, keys, peers, t, round) {
  const n = Math.max(...peers.map((p) => p.client)) + 1;
  const dS = split(BigInt("0x" + keys.d), n, t), bS = split(BigInt("0x" + keys.seed), n, t), out = {};
  for (const p of peers) {
    const plain = new TextEncoder().encode(JSON.stringify({ from: me, to: p.client, round, x: p.client + 1, d: dS[p.client].y, b: bS[p.client].y }));
    const iv = new Uint8Array(12); C.getRandomValues(iv);
    const ct = await C.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${round}:${me}:${p.client}`) }, await boxKey(keys.privateKey, p.publicKey, "encrypt"), plain);
    out[p.client] = b64u(iv) + "." + b64u(ct);
  }
  return out;
}
// Decrypt the shares other clients sent me: { from: {x, d, b} }.
export async function shareIn(me, keys, peers, inbox, round) {
  const held = {};
  for (const [from, box] of Object.entries(inbox)) {
    const p = peers.find((q) => q.client === +from); if (!p) continue;
    const [iv, ct] = box.split(".");
    const plain = await C.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv), additionalData: new TextEncoder().encode(`${round}:${from}:${me}`) }, await boxKey(keys.privateKey, p.publicKey, "decrypt"), unb64u(ct));
    const s = JSON.parse(new TextDecoder().decode(plain));
    if (s.from !== +from || s.to !== me || s.round !== round) throw new Error("share doesn't match this round");
    held[from] = { x: s.x, d: s.d, b: s.b };
  }
  return held;
}
// Answer the server's unmask request. Refuses a request that would expose anyone.
export function reveal(held, me, { survivors, dropped }) {
  const S = new Set(survivors), D = new Set(dropped);
  if (!S.has(me) || survivors.some((c) => D.has(c))) throw new Error("unsafe unmask request");
  const seeds = {}, keysOut = {};
  for (const c of survivors) if (held[c]) seeds[c] = { x: held[c].x, y: held[c].b };
  for (const c of dropped) if (held[c]) keysOut[c] = { x: held[c].x, y: held[c].d };
  return { seeds, keys: keysOut };
}
// peers: the round's roster [{client, publicKey}] including me (skipped).
export async function mask(encoded, me, keys, peers, round) {
  const privateKey = keys.privateKey || keys; // (older callers passed the CryptoKey)
  let v = encoded.slice();
  if (keys.seed) v = addMod(v, await selfMask(keys.seed, round, v.length));
  for (const p of peers) {
    if (p.client === me) continue;
    const m = await pairMask(privateKey, p.publicKey, round, v.length);
    v = me < p.client ? addMod(v, m) : subMod(v, m);
  }
  return v;
}
// Server side: strip self-masks of survivors and dangling pairwise masks of dropped clients.
export async function unmask(sum, { roster, survivors, dropped, seeds, dKeys, round, selfMasked = true }) {
  let v = sum.slice();
  if (selfMasked) for (const s of survivors) v = subMod(v, await selfMask(seeds[s], round, v.length));
  for (const d of dropped) {
    const dp = roster.find((p) => p.client === d), priv = await privFromD(dKeys[d], dp.publicKey);
    for (const s of survivors) {
      const m = await pairMask(priv, roster.find((p) => p.client === s).publicKey, round, v.length);
      v = s < d ? subMod(v, m) : addMod(v, m); // undo what survivor s added for the pair (s, d)
    }
  }
  return v;
}
export const seedHex = (big) => big.toString(16).padStart(64, "0");

// ----- Privacy budget (zero-concentrated DP accounting) -----
// With secure aggregation the server sees only the sum of n clipped updates, each
// carrying N(0, (noise·clip)²) noise, so one device's contribution (sensitivity = clip)
// is protected by total noise σ√n: ρ = 1 / (2·noise²·n) per round (Bun & Steinke 2016),
// and ε(δ) = ρ + 2·√(ρ·ln(1/δ)). This assumes the other clients' noise is honest.
export const DELTA = 1e-5;
export const rhoPerRound = (n, noise = NOISE) => 1 / (2 * noise * noise * Math.max(1, n));
export const epsilon = (rho, delta = DELTA) => (rho > 0 ? rho + 2 * Math.sqrt(rho * Math.log(1 / delta)) : 0);

// One full client step: local training from the global model → protected update.
export async function clientUpdate(globalW, samples, opts = {}) {
  const local = train(globalW, samples, opts);
  const delta = privatize(local.map((x, i) => x - globalW[i]), opts);
  return { local, delta, encoded: encode(delta), n: samples.length };
}

// ----- The whole client side of one round, shared by the Bridge and the tests -----
// call(method, path, body) must return the response's data or throw.
// dropAt simulates a device going away: "join" | "shares" | "update" (tests only).
export async function runRound({ call, update, onStatus = () => {}, poll = 1500, maxWait = 180000, dropAt = null }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, what) => { const end = Date.now() + maxWait; for (;;) { const r = await fn(); if (r) return r; if (Date.now() > end) throw new Error(`timed out ${what}`); await sleep(poll); } };
  const keys = await maskKeys();
  const j = await call("POST", "/api/fl/round/join", { publicKey: keys.publicKey });
  const base = `/api/fl/round/${j.round}`;
  const pr = await until(async () => { const r = await call("GET", `${base}/peers`); if (r.waiting) onStatus({ step: "waiting", waiting: r.waiting }); return r.peers && r; }, "waiting for others to join");
  if (dropAt === "join") return { dropped: "join", round: j.round, client: j.client };
  await call("POST", `${base}/shares`, { client: j.client, shares: await shareOut(j.client, keys, pr.peers, pr.threshold, j.round) });
  onStatus({ step: "shared" });
  if (dropAt === "shares") return { dropped: "shares", round: j.round, client: j.client };
  const ib = await until(async () => { const r = await call("GET", `${base}/inbox?client=${j.client}`); return r.roster && r; }, "waiting for keys");
  const held = await shareIn(j.client, keys, ib.roster, ib.shares, j.round);
  const masked = await mask(update, j.client, keys, ib.roster, j.round);
  await call("POST", `${base}/update`, { client: j.client, masked });
  onStatus({ step: "sent" });
  if (dropAt === "update") return { dropped: "update", round: j.round, client: j.client };
  const um = await until(async () => { const r = await call("GET", `${base}/unmask`); return (r.survivors || r.done) && r; }, "waiting for the round to close");
  if (um.done) return { done: true, version: um.version, round: j.round, client: j.client };
  const out = await call("POST", `${base}/reveal`, { client: j.client, ...reveal(held, j.client, um) });
  if (out.done) return { ...out, round: j.round, client: j.client };
  const fin = await until(async () => { const r = await call("GET", `${base}/unmask`); return r.done && r; }, "waiting for the result");
  return { done: true, version: fin.version, round: j.round, client: j.client, dropped: um.dropped.length };
}
