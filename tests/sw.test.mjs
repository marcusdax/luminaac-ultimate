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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
