// Minimal WebAuthn (passkey) verification with node:crypto only.
// Supports "none" attestation and ES256 (-7) / RS256 (-257) credentials, which
// covers platform passkeys on iOS, Android, macOS, Windows and Chrome.
// Checks: type, challenge, origin, rpIdHash, user-present flag, signature, signCount.
import { createHash, createPublicKey, verify as cverify } from "node:crypto";

const b64u = (b) => Buffer.from(b).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");

// Tiny CBOR decoder: enough for attestationObject and COSE keys.
export function cbor(buf) {
  let i = 0;
  const u = (n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + buf[i++]; return v; };
  function item() {
    const ib = buf[i++], mt = ib >> 5, ai = ib & 31;
    let len = ai < 24 ? ai : ai === 24 ? u(1) : ai === 25 ? u(2) : ai === 26 ? u(4) : ai === 27 ? u(8) : NaN;
    if (Number.isNaN(len)) throw new Error("Unsupported CBOR");
    switch (mt) {
      case 0: return len;
      case 1: return -1 - len;
      case 2: { const v = buf.subarray(i, i + len); i += len; return Buffer.from(v); }
      case 3: { const v = buf.subarray(i, i + len).toString("utf8"); i += len; return v; }
      case 4: { const a = []; for (let k = 0; k < len; k++) a.push(item()); return a; }
      case 5: { const m = new Map(); for (let k = 0; k < len; k++) { const key = item(); m.set(key, item()); } return m; }
      case 7: return ai === 20 ? false : ai === 21 ? true : null;
      default: throw new Error("Unsupported CBOR type");
    }
  }
  const out = item();
  return { value: out, end: i };
}

function parseAuthData(ad) {
  const rpIdHash = ad.subarray(0, 32), flags = ad[32], signCount = ad.readUInt32BE(33);
  const out = { rpIdHash, flags, up: !!(flags & 1), uv: !!(flags & 4), signCount };
  if (flags & 0x40) {
    const credIdLen = ad.readUInt16BE(53);
    out.credId = ad.subarray(55, 55 + credIdLen);
    const { value } = cbor(ad.subarray(55 + credIdLen));
    out.cose = value;
  }
  return out;
}
function coseToJwk(m) {
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === -7) return { alg, jwk: { kty: "EC", crv: "P-256", x: b64u(m.get(-2)), y: b64u(m.get(-3)) } };
  if (kty === 3 && alg === -257) return { alg, jwk: { kty: "RSA", n: b64u(m.get(-1)), e: b64u(m.get(-2)) } };
  throw new Error("Unsupported key type");
}
function checkClient(clientDataJSON, type, challenge, origins) {
  const c = JSON.parse(unb64u(clientDataJSON).toString("utf8"));
  if (c.type !== type) throw new Error("Wrong ceremony type");
  if (c.challenge !== challenge) throw new Error("Challenge mismatch");
  if (!origins.includes(c.origin)) throw new Error(`Origin not allowed: ${c.origin}`);
  return c;
}
const sha = (b) => createHash("sha256").update(b).digest();

export function verifyRegistration({ clientDataJSON, attestationObject }, { challenge, origins, rpId }) {
  checkClient(clientDataJSON, "webauthn.create", challenge, origins);
  const att = cbor(unb64u(attestationObject)).value;
  const ad = parseAuthData(att.get("authData"));
  if (!ad.rpIdHash.equals(sha(rpId))) throw new Error("rpId mismatch");
  if (!ad.up) throw new Error("User not present");
  if (!ad.credId) throw new Error("No credential data");
  const { alg, jwk } = coseToJwk(ad.cose);
  return { credentialId: b64u(ad.credId), alg, jwk, signCount: ad.signCount };
}

export function verifyAssertion({ clientDataJSON, authenticatorData, signature }, cred, { challenge, origins, rpId }) {
  checkClient(clientDataJSON, "webauthn.get", challenge, origins);
  const adBuf = unb64u(authenticatorData);
  const ad = parseAuthData(adBuf);
  if (!ad.rpIdHash.equals(sha(rpId))) throw new Error("rpId mismatch");
  if (!ad.up) throw new Error("User not present");
  const data = Buffer.concat([adBuf, sha(unb64u(clientDataJSON))]);
  const key = createPublicKey({ key: cred.jwk, format: "jwk" });
  const good = cverify("sha256", data, cred.alg === -7 ? { key, dsaEncoding: "der" } : key, unb64u(signature));
  if (!good) throw new Error("Bad signature");
  if (ad.signCount && cred.signCount && ad.signCount <= cred.signCount) throw new Error("Possible cloned authenticator");
  return { signCount: ad.signCount };
}
