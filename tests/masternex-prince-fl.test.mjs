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
  // With no noise there is no privacy: epsilon is infinite. The old check (> 0) passed
  // either way; see docs/RESEARCH_EVALUATION.md section 5.
  assert.equal(compressed.rdp_epsilon, Infinity);
  // With the default noise (sigma 0.3) one release has RDP epsilon(4) = 4 / (2 * 0.09).
  assert.ok(Math.abs(compressClientUpdate(rawDelta).rdp_epsilon - 4 / (2 * 0.3 ** 2)) < 1e-9);

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

test('LuminAAC - MASTERNEX PRINCE v2 TurboQuant R·S·R + Lloyd-Max 4-bit Compression', async () => {
  const { turboQuantCompress, turboQuantDecompress } = await import('../masternex-prince-fl.js');
  const rawDelta = [
    0.15, -0.42, 0.88, -0.05, 0.33, 0.12, -0.65, 0.0,
    0.55, -0.21, 0.44, 0.08, -0.19, 0.72, -0.31, 0.05, 0.18
  ];

  const pkg = turboQuantCompress(rawDelta, { noiseSigma: 0.0, clipThreshold: 5.0, seed: 42 });
  assert.equal(pkg.schema, 'masternex.turboquant/v2');
  assert.equal(pkg.dim, 17);
  assert.equal(pkg.paddedDim, 32);
  assert.equal(pkg.packedNibbles.length, 16); // 32 padded coords * 4 bits = 16 bytes
  assert.equal(pkg.rdp_epsilon, Infinity);

  const recon = turboQuantDecompress(pkg);
  assert.equal(recon.length, 17);

  // Relative L2 MSE should be very small for 4-bit Lloyd-Max after R·S·R rotation
  let errSq = 0;
  let refSq = 0;
  for (let i = 0; i < rawDelta.length; i++) {
    errSq += (recon[i] - rawDelta[i]) ** 2;
    refSq += rawDelta[i] ** 2;
  }
  const relMse = errSq / refSq;
  assert.ok(relMse < 0.05, `Expected relative MSE < 0.05, got ${relMse}`);
});

test('LuminAAC - MASTERNEX PRINCE v2 Smoothed Weiszfeld Geometric Median + MAD Outlier Flagging', async () => {
  const { aggregateGeometricMedian, adaptiveRobustClip, applyServerMomentum } = await import('../masternex-prince-fl.js');
  const c1 = new Array(17).fill(0.10);
  const c2 = new Array(17).fill(0.11);
  const c3 = new Array(17).fill(0.09);
  const c4 = new Array(17).fill(0.105);
  const c5_byzantine = new Array(17).fill(250.0);

  const res = aggregateGeometricMedian([c1, c2, c3, c4, c5_byzantine]);
  assert.equal(res.update.length, 17);
  assert.ok(res.update[0] > 0.08 && res.update[0] < 0.15, `Expected geomed near 0.10, got ${res.update[0]}`);
  assert.ok(res.flagged.includes(4), `Expected Byzantine client 4 to be flagged, got ${JSON.stringify(res.flagged)}`);

  const clip = adaptiveRobustClip([c1, c2, c3, c4, c5_byzantine], { baseClip: 1.0 });
  assert.ok(clip.clipRadius >= 0.1 && clip.clipRadius <= 1.0);
  assert.ok(clip.medianNorm < 1.0, 'Median norm should ignore the 250.0 outlier');

  const m1 = applyServerMomentum(null, res.update, 0.7);
  const m2 = applyServerMomentum(m1.velocity, res.update, 0.7);
  assert.ok(m2.step[0] > m1.step[0], 'Server momentum should accumulate in consistent direction');
});

