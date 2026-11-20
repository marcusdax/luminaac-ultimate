// Regression for the v0.14.2 lock-up: a modal dialog opened inside a hidden view.
// Run: node tests/dialog-guard.test.mjs  (the full browser check is tests/browser/talk-games.py)
import { readFileSync } from "node:fs";
import vm from "node:vm";
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

for (const page of ["index.html", "bridge.html"]) {
  const h = read(page), g = h.indexOf("dialog-guard.js"), m = h.indexOf('type="module"');
  t(`${page} loads the guard before any module`, g > 0 && (m < 0 || g < m));
}
t("service worker precaches the guard", /"dialog-guard\.js"/.test(read("sw.js")));

// Fake DOM: body, a hidden view, a dialog inside it.
const body = { children: [], append(el) { el.parentElement?.children.splice(el.parentElement.children.indexOf(el), 1); el.parentElement = body; body.children.push(el); } };
let raf = [];
class HTMLDialogElement { constructor(parent) { this.open = false; this.parentElement = parent; this.opens = 0; this.sized = true; }
  showModal() { if (this.open) throw new Error("InvalidStateError"); this.open = true; this.opens++; }
  close() { this.open = false; } getClientRects() { return this.sized ? [1] : []; } }
const ctx = { HTMLDialogElement, document: { body }, requestAnimationFrame: (f) => raf.push(f) };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(read("dialog-guard.js"), ctx);
const view = { hidden: true, children: [] };
const d = new HTMLDialogElement(view);
d.showModal();
t("dialog in a hidden view is moved to body before opening", d.parentElement === body && d.open);
let threw = false; try { d.showModal(); } catch { threw = true; }
t("a second showModal does not throw or stack", !threw && d.opens === 1);
d.close();
const z = new HTMLDialogElement(body); z.sized = false; z.showModal(); raf.forEach((f) => f()); raf = [];
t("a modal that still has no size is closed so the page never locks", !z.open);
for (let i = 0; i < 3; i++) { d.showModal(); raf.forEach((f) => f()); raf = []; d.close(); }
t("open and close three times leaves nothing open", !d.open && d.opens === 4);
t("the guard installs once", (vm.runInContext(read("dialog-guard.js"), ctx), ctx.HTMLDialogElement.prototype.__lumGuard === true));

// The Talk game code: closing the game releases the mic even if permission resolves later.
const p7 = read("myvoice-p7.js"), sp = read("myvoice-sound.js");
t("games: startMic drops a stream that arrives after close", /gen !== micGen \|\| !game/.test(p7) && /function stopMic\(\) \{ micGen\+\+/.test(p7));
t("games: no turn timer or score runs after close", /function playTurns\(\) \{\n  if \(!game\) return;/.test(p7) && /function record\(ok, item, extra = \{\}\) \{\n  if \(!game\) return;/.test(p7));
t("sound path: startMic drops a late stream", /my !== running \|\| !game/.test(sp));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
