// LuminAAC — Holistic Diet/Gut-Brain & Solar/Geomagnetic Storm (Kp Index) Biometrics Tracker
// Grounded in:
//   - Hsiao et al. (2013) Cell, PMID 24315484 (Gut-brain-microbiome axis in neurodevelopment)
//   - Kang et al. (2017) Microbiome, PMID 28122648; Sharon et al. (2019) Cell, PMID 31150625
//   - Alabdulgader, McCraty et al. (2018) Scientific Reports (Nature Portfolio), PMID 29422633 (HRV & geomagnetic Kp)
//   - Burch et al. (1999) Neurosci Lett, PMID 10465710 (Geomagnetic disturbances & nocturnal melatonin)

export const BIOMETRICS_BANNER = "Draft / Estimate — Caregiver or SLP review required";

export const DIET_TEXTURES = Object.freeze([
  { id: "crunchy", label: "Crunchy / Crisp", emoji: "🥨", sensoryNote: "Proprioceptive jaw input (oral-motor organizing)" },
  { id: "smooth", label: "Smooth / Puree", emoji: "🥣", sensoryNote: "Low oral-motor load, predictable texture" },
  { id: "chewy", label: "Chewy / Dense", emoji: "🥯", sensoryNote: "Sustained masseter proprioception" },
  { id: "warm-liquid", label: "Warm / Soothing Liquid", emoji: "🍵", sensoryNote: "Vagal throat relaxation" },
  { id: "cold-crisp", label: "Cold / Refreshing", emoji: "🍉", sensoryNote: "Alerting oral thermoreceptor cue" },
  { id: "mixed", label: "Mixed Texture", emoji: "🍱", sensoryNote: "Higher sensory discrimination demand" }
]);

export const GI_STATES = Object.freeze([
  { id: "comfortable", label: "Comfortable / Settled", emoji: "😊", score: 0 },
  { id: "mild-gas", label: "Mild Bloating / Gas", emoji: "🫧", score: 1 },
  { id: "constipated", label: "Constipated / Backed Up", emoji: "😣", score: 2 },
  { id: "reflux", label: "Reflux / Burping / Chest Discomfort", emoji: "🔥", score: 2 },
  { id: "stomach-ache", label: "Acute Stomach Pain / Cramping", emoji: "😖", score: 3 }
]);

export const KP_BANDS = Object.freeze([
  { min: 0, max: 2, level: "quiet", label: "Quiet Geomagnetic Field (Kp 0–2)", badge: "🟢", guidance: "Baseline geomagnetic environment; standard sensory expectations." },
  { min: 3, max: 4, level: "unsettled", label: "Unsettled Field (Kp 3–4)", badge: "🟡", guidance: "Mild autonomic variability possible; offer proactive hydration and movement breaks." },
  { min: 5, max: 6, level: "storm-minor", label: "Geomagnetic Storm G1–G2 (Kp 5–6)", badge: "🟠", guidance: "Elevated geomagnetic activity (linked to HRV & melatonin shifts in sensitive individuals); consider Warm Pink Noise or 6 Hz Theta co-regulation." },
  { min: 7, max: 9, level: "storm-major", label: "Strong Geomagnetic Storm G3–G5 (Kp 7–9)", badge: "🔴", guidance: "High solar storm activity; prioritize low-arousal sensory accommodations, dim visuals, and high caregiver co-regulation." }
]);

export function classifyKpIndex(kpValue) {
  const kp = Math.max(0, Math.min(9, Number.isFinite(Number(kpValue)) ? Number(kpValue) : 0));
  const rounded = Math.round(kp);
  const band = KP_BANDS.find(b => rounded >= b.min && rounded <= b.max) || KP_BANDS[0];
  return {
    kp: Math.round(kp * 10) / 10,
    level: band.level,
    label: band.label,
    badge: band.badge,
    guidance: band.guidance,
    isStorm: kp >= 5
  };
}

/**
 * Deterministic offline solar Kp estimator based on 27-day Bartels solar rotation
 * synodic cycle + diurnal magnetospheric curve when live NOAA SWPC feed is offline.
 */
export function estimateSolarKp(timestamp = Date.now()) {
  const t = Number(timestamp) || Date.now();
  // Reference epoch: 2025-01-01T00:00:00Z during Solar Cycle 25 maximum
  const epoch = 1735689600000;
  const days = (t - epoch) / 86400000;
  const bartelsPhase = ((days % 27.2753) + 27.2753) % 27.2753;
  const wave1 = Math.sin((bartelsPhase / 27.2753) * Math.PI * 2);
  const wave2 = Math.cos((bartelsPhase / 13.637) * Math.PI * 2);
  const rawKp = 2.8 + 1.8 * wave1 + 1.1 * wave2;
  const info = classifyKpIndex(Math.max(0, Math.min(8.3, rawKp)));
  return {
    ...info,
    source: "offline-bartels-cycle25-model",
    timestamp: t
  };
}

/**
 * Fetches live NOAA SWPC planetary K-index JSON with a fast timeout and clean offline fallback.
 */
export async function fetchLiveSolarKp({ fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  if (typeof fetchImpl !== "function" || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return estimateSolarKp();
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctrl?.abort(); } catch {} }, timeoutMs);
  try {
    const res = await fetchImpl("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", {
      signal: ctrl?.signal
    });
    clearTimeout(timer);
    if (!res || !res.ok) return estimateSolarKp();
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length < 2) return estimateSolarKp();
    const last = rows[rows.length - 1];
    const kpVal = parseFloat(Array.isArray(last) ? last[1] : last?.kp_index ?? last?.Kp);
    if (!Number.isFinite(kpVal)) return estimateSolarKp();
    const info = classifyKpIndex(kpVal);
    return {
      ...info,
      observedAt: Array.isArray(last) ? String(last[0] || "") : String(last?.time_tag || ""),
      source: "noaa-swpc-live",
      timestamp: Date.now()
    };
  } catch {
    clearTimeout(timer);
    return estimateSolarKp();
  }
}

export function logDietEntry(state, entry = {}) {
  const s = state && typeof state === "object" ? state : {};
  if (!Array.isArray(s.dietLog)) s.dietLog = [];
  const textureObj = DIET_TEXTURES.find(t => t.id === entry.texture) || DIET_TEXTURES[0];
  const giObj = GI_STATES.find(g => g.id === entry.giStatus) || GI_STATES[0];
  const record = {
    id: entry.id || "diet-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    t: Number(entry.t) || Date.now(),
    meal: String(entry.meal || "Meal / Snack").trim().slice(0, 120),
    texture: textureObj.id,
    textureLabel: textureObj.label,
    hydrationMl: Math.max(0, Math.min(4000, Math.round(Number(entry.hydrationMl) || 0))),
    giStatus: giObj.id,
    giLabel: giObj.label,
    giScore: giObj.score,
    sleepHours: Number.isFinite(Number(entry.sleepHours)) ? Math.max(0, Math.min(16, Number(entry.sleepHours))) : null,
    notes: String(entry.notes || "").trim().slice(0, 200)
  };
  s.dietLog.push(record);
  if (s.dietLog.length > 500) s.dietLog = s.dietLog.slice(-500);
  return record;
}

export function logSolarObservation(state, obs = {}) {
  const s = state && typeof state === "object" ? state : {};
  if (!Array.isArray(s.solarLog)) s.solarLog = [];
  const classified = classifyKpIndex(obs.kp ?? 2);
  const record = {
    id: obs.id || "solar-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    t: Number(obs.t) || Date.now(),
    kp: classified.kp,
    level: classified.level,
    label: classified.label,
    isStorm: classified.isStorm,
    barometricHpa: Number.isFinite(Number(obs.barometricHpa)) ? Math.round(Number(obs.barometricHpa)) : 1013,
    sensoryState: String(obs.sensoryState || "regulated").trim(),
    source: String(obs.source || "manual")
  };
  s.solarLog.push(record);
  if (s.solarLog.length > 500) s.solarLog = s.solarLog.slice(-500);
  return record;
}

/**
 * Computes transparent, fact-separated correlations between Diet/GI/Hydration,
 * Solar/Geomagnetic Kp activity, Pain/Interoception, and AAC communication output.
 */
export function correlateBiometrics(state = {}) {
  const dietLog = Array.isArray(state?.dietLog) ? state.dietLog : [];
  const solarLog = Array.isArray(state?.solarLog) ? state.solarLog : [];
  const painLog = Array.isArray(state?.painLog) ? state.painLog : [];
  const commLog = Array.isArray(state?.log) ? state.log : [];

  const stormEntries = solarLog.filter(e => Number(e.kp) >= 5 || e.isStorm);
  const quietEntries = solarLog.filter(e => Number(e.kp) < 5 && !e.isStorm);

  const isDysregulated = (e) => /overwhelmed|sensory|loud|meltdown|dysregulated|pain|upset|anxious/i.test(String(e?.sensoryState || ""));
  const stormDysregulated = stormEntries.filter(isDysregulated).length;
  const quietDysregulated = quietEntries.filter(isDysregulated).length;

  const stormDysregulationRate = stormEntries.length > 0
    ? Math.round((stormDysregulated / stormEntries.length) * 100) / 100
    : 0;
  const quietDysregulationRate = quietEntries.length > 0
    ? Math.round((quietDysregulated / quietEntries.length) * 100) / 100
    : 0;

  const giDistressEntries = dietLog.filter(d => (Number(d.giScore) || 0) >= 2 || /constipated|reflux|stomach-ache/i.test(String(d.giStatus)));
  // Check how many GI distress entries co-occur within 12 hours of a pain log entry or refusal/pain communication
  const WINDOW_MS = 12 * 3600 * 1000;
  let giPainCooccurrence = 0;
  for (const g of giDistressEntries) {
    const gt = Number(g.t) || 0;
    const matchedPain = painLog.some(p => Math.abs((Number(p.t) || 0) - gt) <= WINDOW_MS);
    const matchedComm = commLog.some(c => Math.abs((Number(c.t) || 0) - gt) <= WINDOW_MS && /hurt|pain|no|stop|stomach|sick|help/i.test(String(c.w || "")));
    if (matchedPain || matchedComm) giPainCooccurrence++;
  }
  const giPainOverlapRate = giDistressEntries.length > 0
    ? Math.round((giPainCooccurrence / giDistressEntries.length) * 100) / 100
    : 0;

  const totalHydrationMl = dietLog.reduce((acc, d) => acc + (Number(d.hydrationMl) || 0), 0);
  const avgHydrationMl = dietLog.length > 0 ? Math.round(totalHydrationMl / dietLog.length) : 0;

  const insights = [];
  if (stormEntries.length > 0 && stormDysregulationRate > quietDysregulationRate) {
    insights.push(
      `Solar storm days (Kp ≥ 5) showed ${Math.round(stormDysregulationRate * 100)}% sensory dysregulation vs ${Math.round(quietDysregulationRate * 100)}% on quiet geomagnetic days — consider proactive Pink Noise or 6 Hz Theta co-regulation during G1+ alerts.`
    );
  } else {
    insights.push(
      "Geomagnetic Kp baseline logged; continue tracking solar storm windows alongside sensory states to identify individual autonomic patterns."
    );
  }

  if (giDistressEntries.length > 0) {
    insights.push(
      `GI discomfort was logged ${giDistressEntries.length} time(s), with ${Math.round(giPainOverlapRate * 100)}% co-occurring alongside pain/protest communication within 12 hours — review gut-brain comfort and hydration (${avgHydrationMl} mL avg/entry).`
    );
  } else {
    insights.push(
      `Gut-brain log shows settled GI status across ${dietLog.length} meal/hydration entries (${avgHydrationMl} mL avg hydration).`
    );
  }

  return {
    banner: BIOMETRICS_BANNER,
    facts: {
      dietEntriesCount: dietLog.length,
      giDistressCount: giDistressEntries.length,
      totalHydrationMl,
      avgHydrationMl,
      solarObservationsCount: solarLog.length,
      stormObservationsCount: stormEntries.length
    },
    correlations: {
      banner: BIOMETRICS_BANNER,
      stormDysregulationRate,
      quietDysregulationRate,
      giPainOverlapRate,
      insights
    }
  };
}
