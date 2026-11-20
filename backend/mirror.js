// Hosted mode (Vercel). The server keeps reading and writing its JSON files,
// but on Vercel those live in /tmp and vanish between instances. So around
// every request this mirror copies them from and back to Upstash Redis:
//   lum:files  hash  file name -> file text
//   lum:rev    hash  file name -> change counter
// Before a request, one HGETALL of lum:rev tells us which files another
// instance changed; only those are fetched. After it, files whose text
// changed are written back. Last writer wins per file, which is fine at
// family scale (sync itself still checks versions).
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hosted = () => !!(URL_() && TOKEN());

const seen = new Map(); // data folder -> what this instance last saw: { rev: name -> counter, text: name -> file text }
const state = (dir) => seen.get(dir) || seen.set(dir, { rev: {}, text: {} }).get(dir);

export async function redis(cmds, fetchImpl = fetch) {
  const r = await fetchImpl(URL_().replace(/\/+$/, "") + "/pipeline", { method: "POST", headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error(`Database said ${r.status}`);
  const out = await r.json();
  const bad = out.find((x) => x.error); if (bad) throw new Error(bad.error);
  return out.map((x) => x.result);
}
const pairs = (a) => { const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = a[i + 1]; return o; };
const files = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []);

// Bring /tmp up to date. Returns true when anything changed (callers reload caches).
export async function pull(dir, fetchImpl) {
  const { rev, text } = state(dir);
  const [all] = await redis([["HGETALL", "lum:rev"]], fetchImpl);
  const remote = pairs(all), stale = Object.keys(remote).filter((n) => String(rev[n]) !== String(remote[n]));
  let changed = false;
  if (stale.length) {
    const [vals] = await redis([["HMGET", "lum:files", ...stale]], fetchImpl);
    stale.forEach((n, i) => {
      if (vals[i] == null) return;
      writeFileSync(join(dir, n), vals[i]); text[n] = vals[i]; rev[n] = remote[n]; changed = true;
    });
  }
  for (const n of files(dir)) if (!(n in remote) && n in rev) { rmSync(join(dir, n)); delete rev[n]; delete text[n]; changed = true; } // deleted elsewhere
  return changed;
}

// Write back what this request changed (or deleted).
export async function push(dir, fetchImpl) {
  const { rev, text } = state(dir);
  const now = new Set(files(dir)), cmds = [], names = [];
  for (const n of now) {
    const t = readFileSync(join(dir, n), "utf8");
    if (t !== text[n]) { cmds.push(["HSET", "lum:files", n, t], ["HINCRBY", "lum:rev", n, 1]); names.push(n); text[n] = t; }
  }
  for (const n of Object.keys(text)) if (!now.has(n)) { cmds.push(["HDEL", "lum:files", n], ["HDEL", "lum:rev", n]); delete text[n]; delete rev[n]; }
  if (!cmds.length) return 0;
  const out = await redis(cmds, fetchImpl);
  names.forEach((n, i) => (rev[n] = out[i * 2 + 1]));
  return names.length;
}
