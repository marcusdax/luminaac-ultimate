// Tiny JSON-file store. One file per family keeps data separable and easy to delete.
// Swap for MongoDB later (the original LuminAAC-Repository server.js targets it);
// the route layer only calls these five functions.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DIR = process.env.LUMINAAC_DATA || join(process.cwd(), "data");
mkdirSync(DIR, { recursive: true });

// Callers pass a family id: the SHA-256 of the family key (see fid). Raw keys are never stored.
export const fid = (key) => createHash("sha256").update(String(key)).digest("hex").slice(0, 32);
const file = (id) => join(DIR, String(id).replace(/[^a-f0-9]/g, "") + ".json");
const empty = () => ({ doc: null, version: 0, updated: 0, alerts: [], shares: [], feedback: [], patterns: {}, adaptive: { enabled: true, user_profile: null }, current: null });

export function read(family) {
  const f = file(family);
  if (!existsSync(f)) return empty();
  try { return { ...empty(), ...JSON.parse(readFileSync(f, "utf8")) }; } catch { return empty(); }
}
export function write(family, data) {
  const f = file(family), tmp = f + ".tmp";
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, f); // atomic replace
}
export function update(family, fn) { const d = read(family); const out = fn(d); write(family, d); return out; }
export function remove(family) { const f = file(family); if (existsSync(f)) rmSync(f); }
export const list = () => readdirSync(DIR).filter((f) => /^[a-f0-9]{32}\.json$/.test(f)).map((f) => f.slice(0, 32));
export { DIR };
