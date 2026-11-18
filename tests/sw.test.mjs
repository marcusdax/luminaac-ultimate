// The service worker's offline list must match the files on disk. Run: node tests/sw.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
let pass = 0, fail = 0;
const t = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " " + extra}`); };

const src = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const listed = JSON.parse(/const OPENMOJI = (\[[^\]]*\]);/.exec(src)[1]);
const onDisk = readdirSync(new URL("../vendor/openmoji/", import.meta.url)).filter((f) => f.endsWith(".svg")).sort();
t("every OpenMoji symbol on disk is precached", onDisk.every((f) => listed.includes(f)), onDisk.filter((f) => !listed.includes(f)).join(","));
t("every precached OpenMoji symbol exists", listed.every((f) => onDisk.includes(f)), listed.filter((f) => !onDisk.includes(f)).join(","));

const files = JSON.parse("[" + /const FILES = \[([\s\S]*?)\];/.exec(src)[1].replace(/,\s*$/, "") + "]");
const missing = files.filter((f) => f !== "./" && !existsSync(new URL("../" + f, import.meta.url)));
t("every app-shell file in sw.js exists", missing.length === 0, missing.join(","));

// Every local script and stylesheet the two pages load must work offline too.
for (const page of ["index.html", "bridge.html"]) {
  const html = readFileSync(new URL("../" + page, import.meta.url), "utf8");
  const refs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="stylesheet"[^>]*\shref)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));
  const notCached = refs.filter((u) => !files.includes(u));
  t(`every script and stylesheet ${page} loads is precached`, notCached.length === 0, notCached.join(","));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
