import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, sha256Hex, verifyEdgeBundle } from '../edge-bundle.js';

async function makeValidBundle(overrides = {}) {
  const manifest = {
    platform: 'luminaac-ultimate',
    model_preset: 'nano-mtp',
    quantization: 'turboquant-4bit',
    offline_capable: true,
    zero_cloud_pii: true,
    packet_id: 'pkt-001',
    tree_size: 4,
    root_hash: 'a'.repeat(64),
    ...(overrides.manifest || {}),
  };
  const manifest_sha256 = await sha256Hex(canonicalJson(manifest));
  return {
    schema: 'masternex.pwa.edge-bundle/v1',
    manifest,
    manifest_sha256,
    signature: 'deadbeef',
    signature_alg: 'shield-hybrid-ed25519-mldsa',
    c2sp_checkpoint: {
      origin: 'masternex.os/pwa/luminaac-ultimate',
      tree_size: 4,
      root_hash: 'a'.repeat(64),
      cosignatures: { 'witness.luminaac-ultimate.edge': 'sig-hex-1' },
      ...(overrides.c2sp_checkpoint || {}),
    },
    ...overrides.top,
  };
}

test('edge-bundle: canonicalJson sorts nested keys deterministically', () => {
  const a = canonicalJson({ b: 1, a: { z: true, m: [3, 2] } });
  const b = canonicalJson({ a: { m: [3, 2], z: true }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"m":[3,2],"z":true},"b":1}');
});

test('edge-bundle: verifies valid MASTERNEX PWA edge bundle offline', async () => {
  const bundle = await makeValidBundle();
  const res = await verifyEdgeBundle(bundle);
  assert.equal(res.ok, true);
  assert.equal(res.platform, 'luminaac-ultimate');
  assert.equal(res.modelPreset, 'nano-mtp');
  assert.equal(res.quantization, 'turboquant-4bit');
  assert.equal(res.treeSize, 4);
  assert.equal(res.witnessCount, 1);
  assert.equal(res.zeroCloudPii, true);
});

test('edge-bundle: rejects tampered manifest digest', async () => {
  const bundle = await makeValidBundle();
  bundle.manifest.quantization = 'fp32-tampered';
  const res = await verifyEdgeBundle(bundle);
  assert.equal(res.ok, false);
  assert.ok(res.reasons.some((r) => /SHA-256 mismatch/i.test(r)));
});

test('edge-bundle: rejects missing witness quorum or wrong platform', async () => {
  const bundle = await makeValidBundle({
    manifest: { platform: 'other-app' },
    c2sp_checkpoint: { cosignatures: {} },
  });
  const res = await verifyEdgeBundle(bundle, { minWitnesses: 1 });
  assert.equal(res.ok, false);
  assert.ok(res.reasons.some((r) => /platform/i.test(r)));
  assert.ok(res.reasons.some((r) => /quorum/i.test(r)));
});
