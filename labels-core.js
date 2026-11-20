// Validation labelling: two or more caregivers label the same moments on their own,
// without seeing each other's answers. Agreement (percent and Cohen's kappa) says how
// reliably people who know the child read the same signal, which is the ceiling for
// anything LuminAAC suggests. The export is anonymous: hashed moment ids, rater letters,
// labels and coarse context only. No names, notes, media, times of day or places.

export const UNSURE = "unsure";
// labels: { [momentId]: { [rater]: label } }
export function pairs(labels, a, b) {
  const out = [];
  for (const [id, r] of Object.entries(labels || {})) if (r[a] && r[b] && r[a] !== UNSURE && r[b] !== UNSURE) out.push([r[a], r[b], id]);
  return out;
}
export function agreement(labels, a, b) {
  const p = pairs(labels, a, b), n = p.length;
  if (!n) return { n: 0, agree: null, kappa: null };
  const po = p.filter(([x, y]) => x === y).length / n;
  const cats = new Set(p.flatMap(([x, y]) => [x, y]));
  let pe = 0;
  for (const c of cats) pe += (p.filter(([x]) => x === c).length / n) * (p.filter(([, y]) => y === c).length / n);
  const kappa = pe === 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);
  return { n, agree: po, kappa: Math.round(kappa * 1000) / 1000 };
}
// Landis and Koch's words, used carefully: they are conventions, not proof.
export function kappaWords(k) {
  if (k == null) return "not enough moments yet";
  if (k < 0) return "less than chance";
  if (k <= 0.2) return "slight";
  if (k <= 0.4) return "fair";
  if (k <= 0.6) return "moderate";
  if (k <= 0.8) return "substantial";
  return "almost perfect";
}
export const raters = (labels) => [...new Set(Object.values(labels || {}).flatMap((r) => Object.keys(r)))].sort();
// What one rater still has to label (blind: never shows others' labels).
export const todo = (labels, moments, rater) => moments.filter((m) => !labels?.[m.id]?.[rater]);

async function sha(s) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...h.slice(0, 6)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
// salt is random per export, so ids can't be linked across exports or back to the device.
export async function exportAnon(labels, moments, salt) {
  const byId = new Map(moments.map((m) => [m.id, m])), rs = raters(labels);
  const letter = Object.fromEntries(rs.map((r, i) => [r, String.fromCharCode(65 + i)]));
  const rows = [];
  for (const [id, r] of Object.entries(labels || {})) {
    const m = byId.get(id);
    const row = { item: await sha(`${salt}:${id}`), cues: (m?.cues || []).length, ai: m?.suggested || "" };
    for (const k of rs) row[letter[k]] = r[k] || "";
    rows.push(row);
  }
  rows.sort((x, y) => x.item.localeCompare(y.item));
  const stats = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) stats.push({ raters: `${letter[rs[i]]}-${letter[rs[j]]}`, ...agreement(labels, rs[i], rs[j]) });
  const cols = ["item", "cues", "ai", ...rs.map((k) => letter[k])];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => String(r[c]).replace(/[",\n]/g, " ")).join(","))].join("\n");
  return { rows, stats, csv, raters: rs.length };
}
