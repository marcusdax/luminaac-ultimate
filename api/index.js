// The family server on Vercel, on the same address as the app (/api/…).
// It is the unchanged backend/server.js; backend/mirror.js keeps its JSON files
// in Upstash Redis between requests, because a Vercel instance's disk is temporary.
// vercel.json sends every /api/* path here.
import { mkdirSync } from "node:fs";

process.env.LUMINAAC_DATA ||= "/tmp/luminaac";
process.env.LUMINAAC_NO_LISTEN = "1";
process.env.LUMINAAC_QUIET = "1";
process.env.ALLOWED_ORIGINS ||= "https://luminaac-web.vercel.app";
mkdirSync(process.env.LUMINAAC_DATA, { recursive: true });

const mirror = await import("../backend/mirror.js");
const srv = await import("../backend/server.js");
const DIR = process.env.LUMINAAC_DATA;

let chain = Promise.resolve(); // one request at a time per instance, so pull/handle/push don't interleave

export default function handler(req, res) {
  // A held-open alert stream can't reach other instances here; pages poll /api/updates instead.
  if (req.url.startsWith("/api/alerts/stream")) { res.statusCode = 410; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "Use /api/updates" })); }
  // The YouTube lookup and the health check keep no data, so they work without the database.
  if (/^\/api\/(youtube|health)\b/.test(req.url)) return srv.handle(req, res);
  const run = chain.then(async () => {
    if (!mirror.hosted()) { res.statusCode = 503; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "The family server isn't connected to its database yet." })); }
    try { if (await mirror.pull(DIR)) srv.reload(); }
    catch (e) { console.error("mirror pull failed:", e.message); res.statusCode = 503; res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ error: "Database unavailable. Try again in a minute." })); }
    try { srv.checkDeadman(); } catch {}
    await srv.handle(req, res);
    await mirror.push(DIR).catch((e) => console.error("mirror push failed:", e.message));
  });
  chain = run.catch(() => {});
  return run;
}
