/**
 * masternex-prince-fl.js — MASTERNEX.os PRINCE v2 Federated Learning Engine for LuminAAC Ultimate.
 *
 * Upgrades LuminAAC's assistive communication model with:
 *   1. 4-bit TurboQuant gradient compression (R·S·R Walsh–Hadamard rotation + Lloyd-Max Gaussian codebook).
 *   2. Certified Rényi Differential Privacy (RDP) accounting protecting child identity.
 *   3. Smoothed Weiszfeld Geometric Median (0.5 Byzantine breakdown point) + MAD outlier flagging.
 *   4. Adaptive Robust DP clipping & Server Momentum (ported from MASTERNEX.os/masternex/prince/).
 */

import { DIM, CLIP } from './fl-core.js';

// Optimal 16-level (4-bit) Lloyd-Max quantizer centroids for N(0, 1).
export const LLOYD_MAX_4BIT = Object.freeze([
  -2.7326, -2.0690, -1.6180, -1.2562,
  -0.9423, -0.6568, -0.3881, -0.1284,
   0.1284,  0.3881,  0.6568,  0.9423,
   1.2562,  1.6180,  2.0690,  2.7326,
]);

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fwhtNormalized(vec) {
  const n = vec.length;
  const out = vec.slice();
  for (let h = 1; h < n; h <<= 1) {
    for (let i = 0; i < n; i += h << 1) {
      for (let j = i; j < i + h; j++) {
        const x = out[j];
        const y = out[j + h];
        out[j] = x + y;
        out[j + h] = x - y;
      }
    }
  }
  const invSqrtN = 1 / Math.sqrt(n);
  for (let i = 0; i < n; i++) out[i] *= invSqrtN;
  return out;
}

function signVector(n, seed) {
  const rng = mulberry32(seed);
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = rng() < 0.5 ? -1 : 1;
  return s;
}

// Orthogonal R·S·R rotation (self-inverse because H and S are symmetric orthogonal).
function rotateRSR(vec, seed) {
  const s = signVector(vec.length, seed);
  const h1 = fwhtNormalized(vec);
  for (let i = 0; i < h1.length; i++) h1[i] *= s[i];
  return fwhtNormalized(h1);
}

function gaussianNoise() {
  const u1 = Math.max(1e-15, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function nearestCentroidIndex(val, codebook) {
  let bestIdx = 0;
  let bestDist = Math.abs(val - codebook[0]);
  for (let i = 1; i < codebook.length; i++) {
    const d = Math.abs(val - codebook[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function medianOf(arr) {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : 0.5 * (s[mid - 1] + s[mid]);
}

function l2Norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function madOutliers(U, center, zThreshold = 2.5) {
  const n = U.length;
  const dists = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let d = 0; d < center.length; d++) {
      const diff = U[i][d] - center[d];
      s += diff * diff;
    }
    dists[i] = Math.sqrt(s);
  }
  const medD = medianOf(dists);
  const absDev = dists.map((x) => Math.abs(x - medD));
  const mad = medianOf(absDev);
  let scale = 1.4826 * mad;
  if (scale <= 1e-12) {
    const meanD = dists.reduce((a, b) => a + b, 0) / Math.max(1, n);
    const variance = dists.reduce((a, b) => a + (b - meanD) ** 2, 0) / Math.max(1, n);
    scale = Math.sqrt(variance) || 1.0;
  }
  const flagged = [];
  for (let i = 0; i < n; i++) {
    const z = (dists[i] - medD) / scale;
    if (z > zThreshold) flagged.push(i);
  }
  return flagged;
}

/**
 * 4-Bit TurboQuant Compressor (R·S·R Walsh–Hadamard rotation + Lloyd-Max Gaussian codebook).
 * Achieves ~7.5x–8x compression with near-optimal MSE distortion and least-squares scale recovery.
 */
export function turboQuantCompress(
  weightsDelta,
  { noiseSigma = 0.3, clipThreshold = CLIP, seed = 1337 } = {}
) {
  const dim = weightsDelta.length;
  const paddedDim = nextPow2(Math.max(1, dim));

  // 1. L2 Norm Sensitivity Clipping + Gaussian DP Noise
  const norm = l2Norm(weightsDelta);
  const clipScale = norm > clipThreshold ? clipThreshold / norm : 1.0;
  const padded = new Array(paddedDim).fill(0);
  for (let i = 0; i < dim; i++) {
    const noise = noiseSigma > 0 ? gaussianNoise() * (noiseSigma * clipThreshold) : 0;
    padded[i] = weightsDelta[i] * clipScale + noise;
  }

  // 2. R·S·R Randomized Orthogonal Rotation
  const rotated = rotateRSR(padded, seed);

  // 3. RMS Normalization + 4-bit Lloyd-Max Quantization
  const rms = l2Norm(rotated) / Math.sqrt(paddedDim);
  const indices = new Array(paddedDim);
  const qVals = new Array(paddedDim);
  for (let i = 0; i < paddedDim; i++) {
    const u = rms > 1e-12 ? rotated[i] / rms : 0;
    const idx = nearestCentroidIndex(u, LLOYD_MAX_4BIT);
    indices[i] = idx;
    qVals[i] = LLOYD_MAX_4BIT[idx];
  }

  // 4. Least-squares per-group scale (eliminates codebook norm shrinkage)
  let num = 0;
  let den = 0;
  for (let i = 0; i < paddedDim; i++) {
    num += rotated[i] * qVals[i];
    den += qVals[i] * qVals[i];
  }
  const scale = den > 1e-12 ? num / den : 0;

  // 5. Pack 4-bit nibbles
  const packedNibbles = [];
  for (let i = 0; i < paddedDim; i += 2) {
    const q0 = indices[i] & 0x0f;
    const q1 = (i + 1 < paddedDim ? indices[i + 1] : 0) & 0x0f;
    packedNibbles.push((q1 << 4) | q0);
  }

  const alpha = 4.0;
  const eps = alpha / (2.0 * (noiseSigma * noiseSigma));

  return {
    schema: 'masternex.turboquant/v2',
    dim,
    paddedDim,
    seed,
    scale,
    packedNibbles,
    rdp_alpha: alpha,
    rdp_epsilon: eps,
  };
}

/**
 * Decompress 4-bit TurboQuant R·S·R payload back into a Float array.
 */
export function turboQuantDecompress(pkg) {
  const paddedDim = pkg.paddedDim;
  const rotatedRecon = new Array(paddedDim);
  for (let i = 0; i < paddedDim; i += 2) {
    const byte = pkg.packedNibbles[i >> 1] || 0;
    rotatedRecon[i] = LLOYD_MAX_4BIT[byte & 0x0f] * pkg.scale;
    if (i + 1 < paddedDim) {
      rotatedRecon[i + 1] = LLOYD_MAX_4BIT[(byte >> 4) & 0x0f] * pkg.scale;
    }
  }
  const unrotated = rotateRSR(rotatedRecon, pkg.seed);
  return unrotated.slice(0, pkg.dim);
}

/**
 * Smoothed Weiszfeld Geometric Median (Pillutla et al., IEEE TSP RFA).
 * Direct JS port of MASTERNEX.os/masternex/prince/aggregators.py::geometric_median.
 * Preserves vector direction on non-IID data with a 0.5 Byzantine breakdown point.
 */
export function aggregateGeometricMedian(
  clientDeltas,
  { weights = null, reliabilities = null, maxIter = 25, eps = 1e-6, zThreshold = 2.5 } = {}
) {
  const n = clientDeltas.length;
  if (n === 0) return { update: new Array(DIM).fill(0), flagged: [], weights: [] };
  const dim = clientDeltas[0].length;

  const alpha = new Array(n);
  let alphaSum = 0;
  for (let i = 0; i < n; i++) {
    let a = weights ? weights[i] : 1.0;
    if (reliabilities) a *= reliabilities[i];
    alpha[i] = a;
    alphaSum += a;
  }
  for (let i = 0; i < n; i++) alpha[i] = alphaSum > 0 ? alpha[i] / alphaSum : 1.0 / n;

  // Initialize at coordinate-wise median
  let v = new Array(dim);
  for (let d = 0; d < dim; d++) {
    v[d] = medianOf(clientDeltas.map((u) => u[d]));
  }

  let w = alpha.slice();
  for (let iter = 0; iter < maxIter; iter++) {
    let wSum = 0;
    for (let i = 0; i < n; i++) {
      let sq = eps * eps;
      for (let d = 0; d < dim; d++) {
        const diff = clientDeltas[i][d] - v[d];
        sq += diff * diff;
      }
      const dist = Math.max(Math.sqrt(sq), eps);
      w[i] = alpha[i] / dist;
      wSum += w[i];
    }
    if (wSum <= 0) break;
    for (let i = 0; i < n; i++) w[i] /= wSum;

    const vNext = new Array(dim).fill(0);
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < dim; d++) vNext[d] += w[i] * clientDeltas[i][d];
    }

    let deltaSq = 0;
    for (let d = 0; d < dim; d++) {
      const diff = vNext[d] - v[d];
      deltaSq += diff * diff;
    }
    v = vNext;
    if (Math.sqrt(deltaSq) <= eps) break;
  }

  const flagged = madOutliers(clientDeltas, v, zThreshold);
  return { update: v, flagged, weights: w };
}

/**
 * Adaptive Robust DP Clipping: calibrates clip radius to the median L2 norm of
 * participating client updates so DP noise does not drown small gradients.
 */
export function adaptiveRobustClip(clientDeltas, { baseClip = CLIP } = {}) {
  if (!clientDeltas || clientDeltas.length === 0) {
    return { clipRadius: baseClip, medianNorm: 0 };
  }
  const norms = clientDeltas.map(l2Norm);
  const medianNorm = medianOf(norms);
  const clipRadius = Math.max(0.1 * baseClip, Math.min(baseClip, medianNorm || baseClip));
  return { clipRadius, medianNorm };
}

/**
 * Server-side Polyak momentum to stabilize noisy DP + Byzantine-robust rounds.
 */
export function applyServerMomentum(prevVelocity, update, beta = 0.7) {
  const dim = update.length;
  const prev = prevVelocity && prevVelocity.length === dim ? prevVelocity : new Array(dim).fill(0);
  const velocity = new Array(dim);
  for (let i = 0; i < dim; i++) {
    velocity[i] = beta * prev[i] + (1 - beta) * update[i];
  }
  return { velocity, step: velocity };
}

/**
 * 4-Bit Uniform Quantizer for Local Mobile AAC Updates (v1 compatibility).
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
  const norm = l2Norm(weightsDelta);
  const scale = norm > clipThreshold ? clipThreshold / norm : 1.0;

  // 2. Gaussian Noise Perturbation for Differential Privacy
  const noised = new Array(len);
  for (let i = 0; i < len; i++) {
    const z = noiseSigma > 0 ? gaussianNoise() : 0;
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
 * Decompress 4-bit v1 payload back into Float array.
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
 * Byzantine-Robust Trimmed-Mean Aggregator for LuminAAC flserver (v1 compatibility).
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
