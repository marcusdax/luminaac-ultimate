/**
 * masternex-prince-fl.js — MASTERNEX.os PRINCE Federated Learning Engine for LuminAAC Ultimate.
 *
 * Upgrades LuminAAC's assistive communication model with:
 *   1. 4-bit TurboQuant gradient compression (87.5% bandwidth reduction on mobile devices).
 *   2. Certified Rényi Differential Privacy (RDP) accounting protecting child identity.
 *   3. Byzantine-robust trimmed-mean aggregation isolating corrupted sensor drift.
 */

import { DIM, CLIP } from './fl-core.js';

/**
 * 4-Bit TurboQuant Compressor for Local Mobile AAC Updates.
 * @param {number[]} weightsDelta
 * @param {number} noiseSigma
 * @param {number} clipThreshold
 */
export function compressClientUpdate(
  weightsDelta,
  noiseSigma = 0.3,
  clipThreshold = CLIP
) {
  const len = weightsDelta.length;

  // 1. L2 Norm Sensitivity Clipping
  let sumSq = 0;
  for (let i = 0; i < len; i++) sumSq += weightsDelta[i] * weightsDelta[i];
  const l2Norm = Math.sqrt(sumSq);
  const scale = l2Norm > clipThreshold ? clipThreshold / l2Norm : 1.0;

  // 2. Gaussian Noise Perturbation for Differential Privacy
  const noised = new Array(len);
  for (let i = 0; i < len; i++) {
    // Box-Muller transform
    const u1 = Math.max(1e-15, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    noised[i] = weightsDelta[i] * scale + z * (noiseSigma * clipThreshold);
  }

  // 3. Min/Max Range Calculation
  let min = noised[0];
  let max = noised[0];
  for (let i = 1; i < len; i++) {
    if (noised[i] < min) min = noised[i];
    if (noised[i] > max) max = noised[i];
  }

  const range = max - min;
  const packed = [];

  // 4. Uniform 4-bit Quantization [0..15]
  for (let i = 0; i < len; i += 2) {
    const q0 = range > 0 ? Math.round(15 * ((noised[i] - min) / range)) : 0;
    const q1 = (i + 1 < len && range > 0) ? Math.round(15 * ((noised[i + 1] - min) / range)) : 0;
    packed.push(((q1 & 0x0f) << 4) | (q0 & 0x0f));
  }

  // RDP bound for Gaussian mechanism: epsilon(alpha) = alpha / (2 * sigma^2)
  const alpha = 4.0;
  const eps = alpha / (2.0 * (noiseSigma * noiseSigma));

  return {
    min,
    max,
    dim: len,
    packedNibbles: packed,
    rdp_alpha: alpha,
    rdp_epsilon: eps,
  };
}

/**
 * Decompress 4-bit TurboQuant payload back into Float array.
 */
export function decompressClientUpdate(pkg) {
  const out = new Array(pkg.dim);
  const range = pkg.max - pkg.min;

  for (let i = 0; i < pkg.dim; i += 2) {
    const byte = pkg.packedNibbles[Math.floor(i / 2)] || 0;
    const q0 = byte & 0x0f;
    const q1 = (byte >> 4) & 0x0f;

    out[i] = range > 0 ? pkg.min + (q0 / 15) * range : pkg.min;
    if (i + 1 < pkg.dim) {
      out[i + 1] = range > 0 ? pkg.min + (q1 / 15) * range : pkg.min;
    }
  }

  return out;
}

/**
 * Byzantine-Robust Trimmed-Mean Aggregator for LuminAAC flserver.
 * Filters out extreme corrupted device outliers before updating global weights.
 */
export function aggregatePrinceUpdates(
  clientDeltas,
  trimRatio = 0.2
) {
  const numClients = clientDeltas.length;
  if (numClients === 0) return new Array(DIM).fill(0);
  const dim = clientDeltas[0].length;
  const aggregated = new Array(dim);

  const trimK = Math.min(Math.floor((numClients - 1) / 2), Math.max(1, Math.round(numClients * trimRatio)));

  for (let d = 0; d < dim; d++) {
    const vals = [];
    for (let c = 0; c < numClients; c++) {
      vals.push(clientDeltas[c][d]);
    }
    vals.sort((a, b) => a - b);

    let sum = 0;
    let count = 0;
    for (let i = trimK; i < numClients - trimK; i++) {
      sum += vals[i];
      count++;
    }
    aggregated[d] = count > 0 ? sum / count : vals[Math.floor(numClients / 2)];
  }

  return aggregated;
}
