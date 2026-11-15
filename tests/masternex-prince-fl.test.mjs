import test from 'node:test';
import assert from 'node:assert/strict';
import { compressClientUpdate, decompressClientUpdate, aggregatePrinceUpdates } from '../masternex-prince-fl.js';

test('LuminAAC - MASTERNEX PRINCE TurboQuant 4-Bit Compression & Decompression', () => {
  // Simulate 17-dimensional AAC feature delta
  const rawDelta = [
    0.15, -0.42, 0.88, -0.05, 0.33, 0.12, -0.65, 0.0,
    0.55, -0.21, 0.44, 0.08, -0.19, 0.72, -0.31, 0.05, 0.18
  ];

  const compressed = compressClientUpdate(rawDelta, 0.0); // zero noise for deterministic quantization check

  // 17 features: 4-bit packed is Math.ceil(17 / 2) = 9 bytes
  assert.equal(compressed.packedNibbles.length, 9);
  assert.equal(compressed.dim, 17);
  assert.ok(compressed.rdp_epsilon > 0);

  const decompressed = decompressClientUpdate(compressed);
  assert.equal(decompressed.length, 17);

  // Assert reconstruction error is within quantization bound
  const step = (compressed.max - compressed.min) / 15;
  for (let i = 0; i < 17; i++) {
    // Diff should be within step + noise
    assert.ok(Math.abs(decompressed[i] - rawDelta[i]) <= step + 0.35);
  }
});

test('LuminAAC - MASTERNEX PRINCE Byzantine-Robust Trimmed Aggregation', () => {
  // 5 client updates: 4 normal children devices, 1 malfunctioning sensor
  const c1 = new Array(17).fill(0.1);
  const c2 = new Array(17).fill(0.12);
  const c3 = new Array(17).fill(0.09);
  const c4 = new Array(17).fill(0.11);
  const c5_attacker = new Array(17).fill(100.0); // Malfunctioning / Byzantine

  const agg = aggregatePrinceUpdates([c1, c2, c3, c4, c5_attacker], 0.2);

  // The 100.0 outlier should be completely excluded from the aggregated weight
  assert.ok(agg[0] < 0.2, `Expected robust aggregated weight < 0.2, got ${agg[0]}`);
  assert.ok(agg[0] >= 0.09);
});
