// Offline-first MASTERNEX.os PWA Edge Bundle & C2SP tlog-checkpoint verifier.
// Compatible with MASTERNEX.os/masternex/edge/pwa_bundle.py (schema: masternex.pwa.edge-bundle/v1).
// Zero external dependencies; uses native WebCrypto SHA-256 in both browsers and Node 22+.

const STORAGE_KEY = "luminaac:edge-bundle:v1";

/**
 * Deterministic canonical JSON matching Python's json.dumps(..., sort_keys=True, separators=(",", ":")).
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}

export async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto subtle API unavailable");
  const data = new TextEncoder().encode(text);
  const hash = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a MASTERNEX.os PWA edge bundle offline:
 *   1. Schema & platform match (`masternex.pwa.edge-bundle/v1`).
 *   2. SHA-256 digest of canonicalized manifest matches `manifest_sha256`.
 *   3. C2SP tlog-checkpoint structure, tree size, root hash, and witness cosignature quorum.
 */
export async function verifyEdgeBundle(bundle, { minWitnesses = 1, expectedPlatform = "luminaac-ultimate" } = {}) {
  const reasons = [];
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, reasons: ["Bundle must be a JSON object"] };
  }
  if (bundle.schema !== "masternex.pwa.edge-bundle/v1") {
    reasons.push(`Unsupported bundle schema: ${String(bundle.schema || "missing")}`);
  }
  const m = bundle.manifest;
  if (!m || typeof m !== "object") {
    reasons.push("Bundle manifest is missing");
  } else {
    if (expectedPlatform && m.platform !== expectedPlatform) {
      reasons.push(`Bundle platform "${m.platform}" does not match "${expectedPlatform}"`);
    }
    if (m.zero_cloud_pii !== true) {
      reasons.push("Bundle manifest does not attest zero_cloud_pii: true");
    }
  }

  let computedSha256 = "";
  if (m && typeof m === "object") {
    const canon = canonicalJson(m);
    computedSha256 = await sha256Hex(canon);
    if (typeof bundle.manifest_sha256 !== "string" || computedSha256 !== bundle.manifest_sha256) {
      reasons.push("Manifest SHA-256 mismatch (bundle may have been altered)");
    }
  }

  const cp = bundle.c2sp_checkpoint;
  let witnessCount = 0;
  let treeSize = 0;
  if (!cp || typeof cp !== "object") {
    reasons.push("C2SP transparency checkpoint is missing");
  } else {
    treeSize = Number(cp.tree_size || 0);
    if (!Number.isInteger(treeSize) || treeSize < 1) {
      reasons.push("C2SP checkpoint tree_size must be >= 1");
    }
    if (typeof cp.origin !== "string" || !cp.origin.trim()) {
      reasons.push("C2SP checkpoint origin is missing");
    }
    const rootHash = cp.root_hash_hex || cp.root_hash_b64 || cp.root_hash;
    if (typeof rootHash !== "string" || rootHash.length < 32) {
      reasons.push("C2SP checkpoint root_hash is missing or invalid");
    }
    witnessCount = Array.isArray(cp.cosignatures)
      ? cp.cosignatures.length
      : (cp.cosignatures && typeof cp.cosignatures === "object" ? Object.keys(cp.cosignatures).length : 0);
    if (witnessCount < minWitnesses) {
      reasons.push(`Witness quorum not met (${witnessCount} of ${minWitnesses} required)`);
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
    schema: bundle.schema || null,
    platform: m?.platform || null,
    modelPreset: m?.model_preset || null,
    quantization: m?.quantization || null,
    offlineCapable: !!m?.offline_capable,
    zeroCloudPii: !!m?.zero_cloud_pii,
    treeSize,
    witnessCount,
    origin: cp?.origin || null,
    signatureAlg: bundle.signature_alg || null,
    computedSha256,
  };
}

export function loadStoredBundle() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredBundle(bundle) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(bundle));
  } catch {}
}

export function clearStoredBundle() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {}
}
