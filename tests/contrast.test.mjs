// WCAG contrast for every theme in tokens.css. Run: node tests/contrast.test.mjs [--table]
// Text needs 4.5:1 (AA, 1.4.3). Non-text parts that carry meaning (the word-class band,
// borders, the focus ring) need 3:1 (1.4.11). AAA (7:1) is reported, not required.
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const rows = [];

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
function block(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error("missing " + selector);
  const open = css.indexOf("{", i);
  let depth = 0, j = open;
  for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}" && --depth === 0) break; }
  const vars = {};
  for (const m of css.slice(open + 1, j).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const brand = (() => { const b = readFileSync(new URL("../brand/brand-tokens.css", import.meta.url), "utf8"); const v = {}; for (const m of b.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) v[m[1]] = m[2].trim(); return v; })();
const day = { ...brand, ...block(":root {") };
const themes = {
  day,
  night: { ...day, ...block(':root[data-theme="night"]') },
  "night (system dark)": { ...day, ...block(":root:not([data-theme])") },
  contrast: { ...day, ...block(':root[data-theme="contrast"]') },
};

function resolve(vars, v, seen = 0) {
  v = String(v).trim();
  const m = /^var\(--([\w-]+)(?:,\s*([^)]+))?\)$/.exec(v);
  if (m && seen < 10) return resolve(vars, vars[m[1]] ?? m[2], seen + 1);
  return v;
}
function rgb(c) {
  c = c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(c);
  if (m) {
    let h = m[1]; if (h.length <= 4) h = [...h].map((x) => x + x).join("");
    return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  }
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) return m[1].split(",").slice(0, 3).map((x) => parseFloat(x));
  throw new Error("not a colour: " + c);
}
const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const CLASSES = ["people", "action", "describe", "thing", "social", "question", "negate", "little", "folder"];
for (const [name, V] of Object.entries(themes)) {
  const c = (k) => resolve(V, `var(--${k})`);
  const pairs = [];
  for (const k of CLASSES) {
    pairs.push(["text", `ink on ${k} tile`, c("ink"), c(`wc-${k}-tint`)]);
    pairs.push(["part", `${k} band on its tile`, c(`wc-${k}`), c(`wc-${k}-tint`)]);
  }
  pairs.push(["text", "ink on paper", c("ink"), c("paper")]);
  pairs.push(["text", "ink on background", c("ink"), c("fog")]);
  pairs.push(["text", "soft ink on paper", c("ink-soft"), c("paper")]);
  pairs.push(["text", "soft ink on background", c("ink-soft"), c("fog")]);
  pairs.push(["text", "message words on strip", c("dusk-ink"), c("dusk")]);
  pairs.push(["text", "lit word text on gold", c("lit-ink"), c("lumen")]);
  pairs.push(["text", "success text on paper", c("ok-ink"), c("paper")]);
  pairs.push(["text", "warning text on paper", c("alert"), c("paper")]);
  pairs.push(["text", "warning text on background", c("alert"), c("fog")]);
  pairs.push(["text", "accent text on paper", c("ember-deep"), c("paper")]);
  pairs.push(["text", "accent text on raised card", c("ember-deep"), c("paper-raised")]);
  pairs.push(["text", "sky text on paper", c("sky-deep"), c("paper")]);
  pairs.push(["text", "warm text on ember tint", c("warm-ink"), c("ember-tint")]);
  pairs.push(["text", "soft ink on ember tint", c("ink-soft"), c("ember-tint")]);
  pairs.push(["text", "help button label", c("sos-ink"), c("paper")]);
  pairs.push(["text", "go home button label", c("home-ink"), c("paper")]);
  pairs.push(["part", "focus ring on background", c("focus"), c("fog")]);
  pairs.push(["part", "focus ring on paper", c("focus"), c("paper")]);
  for (const k of CLASSES) pairs.push(["part", `focus ring beside ${k} tile`, c("focus"), c(`wc-${k}-tint`)]);
  for (const k of CLASSES.slice(0, 8)) pairs.push(["part", `${k} phrase border on paper`, c(`wc-${k}`), c("paper")]);

  for (const [kind, label, fg, bg] of pairs) {
    const r = ratio(fg, bg), need = kind === "text" ? 4.5 : 3, ok = r >= need;
    ok ? pass++ : fail++;
    rows.push({ theme: name, kind, label, fg, bg, r: Math.round(r * 100) / 100, need, ok, aaa: kind === "text" && r >= 7 });
    if (!ok) console.log(`FAIL ${name}: ${label} ${fg} on ${bg} = ${r.toFixed(2)}:1 (needs ${need}:1)`);
  }
}

if (process.argv.includes("--table")) {
  console.log("| Theme | Pair | Colours | Ratio | Needs | AAA text |");
  console.log("|---|---|---|---|---|---|");
  for (const x of rows) console.log(`| ${x.theme} | ${x.label} | \`${x.fg}\` on \`${x.bg}\` | ${x.r}:1 | ${x.need}:1 | ${x.kind === "text" ? (x.aaa ? "yes" : "no") : "n/a"} |`);
}
const textRows = rows.filter((x) => x.kind === "text");
console.log(`\n${pass} passed, ${fail} failed · text pairs at AAA (7:1): ${textRows.filter((x) => x.aaa).length}/${textRows.length}`);
process.exit(fail ? 1 : 0);
