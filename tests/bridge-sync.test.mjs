// persist() tells this tab about Bridge changes, once per real change. Run: node tests/bridge-sync.test.mjs
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "ok  " : "FAIL"} ${name}`); };

// Minimal browser stand-ins: localStorage and a window that can carry events.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = new EventTarget();
globalThis.CustomEvent ??= class extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };

const { load, persist, onBridgeChange } = await import("../shared.js");
const tick = () => new Promise((r) => setTimeout(r, 0));

let calls = 0;
onBridgeChange(() => calls++);

const db = load();
persist(db); await tick();
t("first save signals this tab once", calls === 1);

persist(db); await tick();
t("saving identical data does not signal (no redraw loops)", calls === 1);

db.exploration.push({ t: 1, word: "go" });
persist(db); await tick();
t("a real change signals again", calls === 2);
t("the change is saved", JSON.parse(localStorage.getItem("luminaac:bridge")).exploration.at(-1).word === "go");

const ev = new Event("storage"); ev.key = "luminaac:bridge";
window.dispatchEvent(ev);
t("a change from another tab also signals", calls === 3);
const other = new Event("storage"); other.key = "luminaac:settings";
window.dispatchEvent(other);
t("other keys from another tab do not", calls === 3);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
