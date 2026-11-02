// End-to-end encryption for the family server, using only WebCrypto (browser and Node 20+).
// - One family key (AES-GCM-256) made on a parent's device. The server never sees it.
// - A new device gets the key at pairing: it makes an ECDH P-256 key pair and posts only its
//   public key; an existing device that the parent approves wraps the family key for it.
//   Both screens show the same 6-digit safety code, so the parent can check nobody swapped keys.
// - The server stores ciphertext and public keys only.
const C = globalThis.crypto, S = C.subtle, enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (u8) => { let s = ""; for (const x of u8) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export const newFamilyKey = () => b64(C.getRandomValues(new Uint8Array(32)));
const aes = (k, use = ["encrypt", "decrypt"]) => S.importKey("raw", typeof k === "string" ? unb64(k) : k, "AES-GCM", false, use);

export async function seal(key, value, aad = "") {
  const iv = C.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await S.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, await aes(key), enc.encode(JSON.stringify(value))));
  return `e2ee:v1:${b64(new Uint8Array([...iv, ...ct]))}`;
}
export async function open(key, sealed, aad = "") {
  if (!isSealed(sealed)) return null;
  try {
    const raw = unb64(sealed.slice(8));
    const pt = await S.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12), additionalData: enc.encode(aad) }, await aes(key), raw.slice(12));
    return JSON.parse(dec.decode(pt));
  } catch { return null; }
}
export const isSealed = (s) => typeof s === "string" && s.startsWith("e2ee:v1:");

// ---- Key exchange ----
export async function newDeviceKeys() {
  const kp = await S.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return { pub: await S.exportKey("jwk", kp.publicKey), priv: await S.exportKey("jwk", kp.privateKey) };
}
const pubOnly = ({ kty, crv, x, y }) => ({ kty, crv, x, y });
async function shared(privJwk, pubJwk, info) {
  const priv = await S.importKey("jwk", privJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const pub = await S.importKey("jwk", pubOnly(pubJwk), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await S.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hk = await S.importKey("raw", bits, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await S.deriveBits({ name: "HKDF", hash: "SHA-256", salt: enc.encode("luminaac-e2ee-v1"), info: enc.encode(info) }, hk, 256));
}
// Order-independent fingerprint of the two public keys -> 6 digits both people read out.
export async function safetyCode(pubA, pubB) {
  const [a, b] = [pubA, pubB].map((k) => `${k.x}.${k.y}`).sort();
  const h = new Uint8Array(await S.digest("SHA-256", enc.encode(`${a}|${b}`)));
  const n = (((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % 1e6;
  return String(n).padStart(6, "0");
}
// Approver side: wrap the family key for the requesting device's public key.
export async function wrapFor(familyKey, approver, requesterPub, requestId) {
  return seal(await shared(approver.priv, requesterPub, requestId), { k: familyKey }, requestId);
}
// Requester side: unwrap with its own private key and the approver's public key.
export async function unwrapFrom(wrapped, mine, approverPub, requestId) {
  const v = await open(await shared(mine.priv, approverPub, requestId), wrapped, requestId);
  return v?.k && unb64(v.k).length === 32 ? v.k : null;
}

// ---- Documents ----
// The full Bridge document for adults, and a smaller child part for the My Voice device.
export const CHILD_KEYS = ["signals", "stories", "practice", "safety", "videos", "games", "access"];
export async function sealDoc(key, doc) {
  const child = Object.fromEntries(CHILD_KEYS.filter((k) => doc[k] !== undefined).map((k) => [k, doc[k]]));
  child.profile = { child: doc.profile?.child || "" };
  return { version: 2, e2ee: await seal(key, doc, "doc"), e2eeChild: await seal(key, child, "child") };
}
export async function openDoc(key, wire) {
  if (!wire?.e2ee && !wire?.e2eeChild) return wire;
  return wire.e2ee ? open(key, wire.e2ee, "doc") : open(key, wire.e2eeChild, "child");
}
