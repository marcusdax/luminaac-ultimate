import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

globalThis.__LUMINAAC_NO_AUTO_INIT__ = true;

// ---------- Minimal Storage / Event / DOM Mocks ----------
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
    _raw: map,
  };
}

function makeSynth({ speaking = false } = {}) {
  const calls = [];
  let cancelled = 0;
  return {
    speaking,
    calls,
    get cancelled() { return cancelled; },
    getVoices() { return [{ name: "TestVoice", lang: "en-US" }]; },
    cancel() { cancelled += 1; this.speaking = false; },
    speak(u) {
      calls.push(u);
      u.onstart?.();
      u.onend?.();
    },
  };
}

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.rate = 1;
    this.volume = 1;
    this.voice = null;
  }
}

function createMockElement(tag = "button", attrs = {}) {
  const classes = new Set((attrs.className || "").split(/\s+/).filter(Boolean));
  const listeners = new Map();
  const children = [];
  let textVal = attrs.textContent || "";
  const parseMiniHtml = (html) => {
    const rootStack = [{ children }];
    const tokenRe = /<\/([a-zA-Z0-9-]+)>|<([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
    let m;
    while ((m = tokenRe.exec(String(html)))) {
      const parent = rootStack[rootStack.length - 1];
      if (m[1]) {
        if (rootStack.length > 1) rootStack.pop();
      } else if (m[2]) {
        const tagName = m[2];
        const attrStr = m[3] || "";
        const selfClose = /\/\s*$/.test(attrStr) || ["input", "img", "br", "hr"].includes(tagName.toLowerCase());
        const parsedAttrs = {};
        let id = "";
        let className = "";
        let type = "";
        for (const am of attrStr.matchAll(/([a-zA-Z0-9:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
          const k = am[1];
          if (k === "/") continue;
          const v = am[2] ?? am[3] ?? am[4] ?? "";
          if (k === "id") id = v;
          else if (k === "class") className = v;
          else if (k === "type") type = v;
          else parsedAttrs[k] = v;
        }
        const child = createMockElement(tagName, { id, className, type, attrs: parsedAttrs, ownerDoc: attrs.ownerDoc });
        if ("hidden" in parsedAttrs) child.hidden = true;
        if ("open" in parsedAttrs) child.open = true;
        child.parentElement = parent === rootStack[0] ? el : parent;
        parent.children.push(child);
        if (!selfClose) rootStack.push(child);
      } else if (m[4]) {
        if (parent === rootStack[0]) textVal += m[4];
        else parent._appendText(m[4]);
      }
    }
  };
  const el = {
    tagName: tag.toUpperCase(),
    id: attrs.id || "",
    type: attrs.type || "",
    disabled: !!attrs.disabled,
    hidden: !!attrs.hidden,
    open: !!attrs.open,
    checked: !!attrs.checked,
    offsetParent: attrs.offsetParent === undefined ? {} : attrs.offsetParent,
    dataset: { ...(attrs.dataset || {}) },
    _appendText(t) { textVal += t; },
    get textContent() {
      if (!children.length) return textVal;
      return textVal + children.map((c) => c.textContent).join("");
    },
    set textContent(v) {
      children.length = 0;
      textVal = String(v ?? "");
    },
    get innerHTML() {
      return textVal;
    },
    set innerHTML(v) {
      children.length = 0;
      textVal = "";
      if (v) parseMiniHtml(v);
    },
    children,
    parentElement: null,
    _rect: attrs.rect || { left: 10, top: 10, right: 110, bottom: 110, width: 100, height: 100 },
    _attrs: { ...(attrs.attrs || {}) },
    _clicks: 0,
    _focused: false,
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      getPropertyValue(k) { return this._props[k] || ""; },
    },
    get className() {
      return [...classes].join(" ");
    },
    set className(v) {
      classes.clear();
      for (const c of String(v || "").split(/\s+/).filter(Boolean)) classes.add(c);
    },
    classList: {
      add(...cs) { cs.forEach((c) => classes.add(c)); },
      remove(...cs) { cs.forEach((c) => classes.delete(c)); },
      contains(c) { return classes.has(c); },
      toggle(c, f) { if (f === undefined) f = !classes.has(c); f ? classes.add(c) : classes.delete(c); },
    },
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === "string") {
          textVal += n;
        } else if (n) {
          n.parentElement = el;
          children.push(n);
        }
      }
    },
    prepend(...nodes) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (typeof n === "string") textVal = n + textVal;
        else if (n) {
          n.parentElement = el;
          children.unshift(n);
        }
      }
    },
    getAttribute(k) { return this._attrs[k] ?? null; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    removeAttribute(k) { delete this._attrs[k]; },
    hasAttribute(k) { return k in this._attrs; },
    getBoundingClientRect() { return this._rect; },
    contains(other) {
      let cur = other;
      while (cur) {
        if (cur === el) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    matches(sel) {
      return sel.split(",").map((s) => s.trim()).some((part) => matchSimple(el, part));
    },
    closest(sel) {
      let cur = el;
      while (cur) {
        if (cur.matches?.(sel)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        for (const ch of node.children || []) {
          if (ch.matches?.(sel)) out.push(ch);
          walk(ch);
        }
      };
      walk(el);
      return out;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type);
      if (arr) listeners.set(type, arr.filter((x) => x !== fn));
    },
    dispatchEvent(ev) {
      ev.target ||= el;
      for (const fn of listeners.get(ev.type) || []) fn(ev);
    },
    click() {
      this._clicks += 1;
      attrs.onClick?.();
    },
    focus() {
      this._focused = true;
      if (attrs.ownerDoc) attrs.ownerDoc.activeElement = el;
    },
  };
  return el;
}

function matchSingle(el, part) {
  if (!el || !el.tagName) return false;
  if (part === "*") return true;
  let rest = part;
  const tagMatch = /^([a-zA-Z0-9-]+)/.exec(rest);
  if (tagMatch) {
    if (el.tagName !== tagMatch[1].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  while (rest.length) {
    if (rest.startsWith("#")) {
      const m = /^#([a-zA-Z0-9_-]+)/.exec(rest);
      if (!m || el.id !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith(".")) {
      const m = /^\.([a-zA-Z0-9_-]+)/.exec(rest);
      if (!m || !el.classList.contains(m[1])) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith(":not(")) {
      const end = rest.indexOf(")");
      const inner = rest.slice(5, end);
      if (matchSingle(el, inner)) return false;
      rest = rest.slice(end + 1);
    } else if (rest.startsWith("[")) {
      const end = rest.indexOf("]");
      const attr = rest.slice(1, end);
      if (attr.includes("=")) {
        const [k, rawV] = attr.split("=");
        const v = rawV.replace(/^['"]|['"]$/g, "");
        if (k === "type") { if (el.type !== v) return false; }
        else if (el.getAttribute(k) !== v) return false;
      } else if (attr === "hidden") {
        if (!el.hidden && !el.hasAttribute("hidden")) return false;
      } else if (attr === "open") {
        if (!el.open && !el.hasAttribute("open")) return false;
      } else if (attr === "disabled") {
        if (!el.disabled) return false;
      } else if (attr === "contenteditable") {
        if (!el.hasAttribute("contenteditable")) return false;
      } else if (!el.hasAttribute(attr)) {
        return false;
      }
      rest = rest.slice(end + 1);
    } else {
      return false;
    }
  }
  return true;
}

function matchSimple(el, selector) {
  const parts = selector.trim().split(/\s+/);
  if (parts.includes(">")) {
    // Handle `details:not([open]) > :not(summary)`
    const idx = parts.indexOf(">");
    const parentSel = parts.slice(0, idx).join(" ");
    const childSel = parts.slice(idx + 1).join(" ");
    return matchSingle(el, childSel) && matchSingle(el.parentElement, parentSel);
  }
  let cur = el;
  if (!matchSingle(cur, parts[parts.length - 1])) return false;
  for (let i = parts.length - 2; i >= 0; i--) {
    cur = cur.parentElement;
    while (cur && !matchSingle(cur, parts[i])) cur = cur.parentElement;
    if (!cur) return false;
  }
  return true;
}

function createMockEnv() {
  const root = createMockElement("html");
  const body = createMockElement("body");
  const docListeners = new Map();
  const winListeners = new Map();
  const moInstances = [];
  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      moInstances.push(this);
    }
    observe(target, opts) {
      this.targets.push({ target, opts });
    }
    disconnect() {
      this.targets = [];
    }
    trigger(target) {
      if (this.targets.some((t) => t.target === target || t.opts?.subtree)) {
        queueMicrotask(() => this.cb([{ target }], this));
      }
    }
  }
  const doc = {
    documentElement: root,
    body,
    activeElement: body,
    createElement(tag) { return createMockElement(tag, { ownerDoc: doc }); },
    getElementById(id) { return body.querySelector(`#${id}`); },
    querySelector(sel) { return body.querySelector(sel); },
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
    addEventListener(type, fn, cap = false) {
      const k = `${type}:${!!cap}`;
      if (!docListeners.has(k)) docListeners.set(k, []);
      docListeners.get(k).push(fn);
    },
    removeEventListener(type, fn, cap = false) {
      const k = `${type}:${!!cap}`;
      if (docListeners.has(k)) docListeners.set(k, docListeners.get(k).filter((x) => x !== fn));
    },
    dispatch(type, ev, cap = false) {
      for (const fn of docListeners.get(`${type}:${!!cap}`) || []) fn(ev);
    },
  };
  const win = {
    MutationObserver: MockMutationObserver,
    getComputedStyle: () => ({ display: "block", visibility: "visible", position: "static" }),
    addEventListener(type, fn, cap = false) {
      const k = `${type}:${!!cap}`;
      if (!winListeners.has(k)) winListeners.set(k, []);
      winListeners.get(k).push(fn);
    },
    removeEventListener(type, fn, cap = false) {
      const k = `${type}:${!!cap}`;
      if (winListeners.has(k)) winListeners.set(k, winListeners.get(k).filter((x) => x !== fn));
    },
    dispatch(type, ev, cap = false) {
      for (const fn of winListeners.get(`${type}:${!!cap}`) || []) fn(ev);
    },
    dispatchEvent(ev) {
      win.dispatch(ev.type, ev, false);
    },
  };
  const notifyMutations = (target) => {
    for (const mo of moInstances) mo.trigger(target);
  };
  return { root, body, doc, win, notifyMutations };
}

// =====================================================================
// Feature 1 & 2: speech.js + Explore Quietly isolation
// =====================================================================
test("Feature 1 & 2: speech.js modes (child, modeling, preview, explore) isolate audio and counts/pairs", async () => {
  const { speakUtterance, configureSpeech } = await import("../../speech.js");
  const storage = makeStorage({ "luminaac:settings": { voice: "", rate: 0.9 } });
  let db = { exploration: [], access: { modelingAudio: true } };
  let synth = makeSynth();
  const events = [];
  const win = {
    dispatchEvent(e) { events.push(e); },
  };
  let exploreFlag = false;

  configureSpeech({
    load: () => db,
    persist: (next) => { db = next; },
    getMedia: async () => null,
    storage,
    synth,
    Utterance: MockUtterance,
    win,
    isExploring: () => exploreFlag,
  });

  // 1. child mode (default)
  const rChild = speakUtterance("I want more", { mode: "child", kind: "message" });
  assert.equal(rChild.mode, "child");
  assert.equal(rChild.spoken, true);
  assert.equal(synth.calls.length, 1);
  assert.equal(synth.calls[0].text, "I want more");

  const log1 = JSON.parse(storage.getItem("luminaac:log"));
  assert.equal(log1.length, 1);
  assert.equal(log1[0].mode, "child");
  assert.equal(log1[0].actor, "child");
  assert.deepEqual(log1[0].words, ["I", "want", "more"]);
  assert.equal(events.some((e) => e.type === "luminaac:logged"), true);

  const counts1 = JSON.parse(storage.getItem("luminaac:counts"));
  const pairs1 = JSON.parse(storage.getItem("luminaac:pairs"));
  assert.equal(counts1.i, 1);
  assert.equal(counts1.want, 1);
  assert.equal(counts1.more, 1);
  assert.equal(pairs1.i.want, 1);
  assert.equal(pairs1.want.more, 1);

  // 2. modeling mode: audible, logs partner, NEVER increments counts/pairs
  const rModel = speakUtterance("you stop now", { mode: "modeling", functionTag: "protest" });
  assert.equal(rModel.mode, "modeling");
  assert.equal(rModel.spoken, true);
  assert.equal(synth.calls.length, 2);

  const log2 = JSON.parse(storage.getItem("luminaac:log"));
  assert.equal(log2.length, 2);
  assert.equal(log2[1].mode, "modeling");
  assert.equal(log2[1].actor, "partner");
  assert.equal(log2[1].fn, "protest");
  assert.deepEqual(JSON.parse(storage.getItem("luminaac:counts")), counts1);
  assert.deepEqual(JSON.parse(storage.getItem("luminaac:pairs")), pairs1);

  // 2b. silent modeling (modelingAudio: false)
  db.access.modelingAudio = false;
  const wordTrail = [];
  const rModelSilent = speakUtterance("look", {
    mode: "modeling",
    onWordBoundary: (idx) => wordTrail.push(idx),
  });
  assert.equal(rModelSilent.spoken, false);
  assert.equal(synth.calls.length, 2);
  assert.deepEqual(wordTrail, [0]);

  // 3. preview mode: low volume, non-interrupting, zero log/counts/exploration
  const rPreview = speakUtterance("apple", { mode: "preview", interrupt: false, skipLog: true });
  assert.equal(rPreview.mode, "preview");
  assert.equal(rPreview.spoken, true);
  assert.equal(synth.calls.length, 3);
  assert.equal(synth.calls[2].volume, 0.45);
  assert.equal(JSON.parse(storage.getItem("luminaac:log")).length, 3);
  assert.equal(db.exploration.length, 0);

  // preview skips when synth is already speaking
  synth.speaking = true;
  const rPreviewBusy = speakUtterance("banana", { mode: "preview" });
  assert.equal(rPreviewBusy.spoken, false);
  assert.equal(synth.calls.length, 3);
  synth.speaking = false;

  // 4. explore mode (explicit and via isExploring() guard): ZERO audio, logs only to db.exploration
  exploreFlag = true;
  const rExplore = speakUtterance("I need a break", { mode: "child", kind: "quick" });
  assert.equal(rExplore.mode, "explore");
  assert.equal(rExplore.spoken, false);
  assert.equal(synth.calls.length, 3); // unchanged!
  assert.equal(db.exploration.length, 1);
  assert.equal(db.exploration[0].word, "I need a break");
  assert.equal(JSON.parse(storage.getItem("luminaac:log")).length, 3);
  assert.deepEqual(JSON.parse(storage.getItem("luminaac:counts")), counts1);

  // 5. SOS allowWhileExploring: true speaks even while exploring
  const rSos = speakUtterance("I need help", { mode: "child", kind: "sos", allowWhileExploring: true });
  assert.equal(rSos.mode, "child");
  assert.equal(rSos.spoken, true);
  assert.equal(synth.calls.length, 4);
  exploreFlag = false;

  // 6. Verify Explore Quietly DOM wiring in myvoice.js and app.js
  const myvoiceSrc = read("myvoice.js");
  assert.match(myvoiceSrc, /document\.body\.addEventListener\("click"/);
  assert.match(myvoiceSrc, /\.grid \.tile, \.next-row \.next-chip, \.quick \.phrase, \.step-says \.say-chip, \.mv-ctx-chip/);
  assert.match(myvoiceSrc, /document\.documentElement\.dataset\.exploring/);
  const appSrc = read("app.js");
  assert.match(appSrc, /b\.dataset\.w\s*=\s*item\.w/);
  assert.match(appSrc, /b\.dataset\.w\s*=\s*p\.w/);
  assert.match(appSrc, /c\.dataset\.w\s*=\s*p/);
});

// =====================================================================
// Feature 3 & 5: shared.js persist(), activeRules(), unified backup/wipe
// =====================================================================
test("Feature 3 & 5: shared.js persist() event, activeRules() daytime/overnight, unified backup & wipe", async () => {
  const dispatched = [];
  const storage = makeStorage();
  globalThis.localStorage = storage;
  globalThis.window = {
    dispatchEvent(ev) { dispatched.push(ev); },
  };
  const shared = await import("../../shared.js");

  const db = shared.seed();
  shared.persist(db);
  assert.ok(storage.getItem("luminaac:bridge"));
  const bridgeEv = dispatched.find((e) => e.type === "luminaac:bridge-updated");
  assert.ok(bridgeEv, "persist() must dispatch luminaac:bridge-updated");
  assert.equal(typeof bridgeEv.detail?.ts, "number");

  // activeRules daytime & boundary & overnight
  const rulesDb = {
    rules: [
      { id: "r1", page: "School", days: [1, 2, 3, 4, 5], from: 8, to: 15 },
      { id: "r2", page: "Bedtime", days: [0, 1, 2, 3, 4, 5, 6], from: 22, to: 6 },
    ],
  };
  // Wednesday 10:00 -> School
  assert.deepEqual(shared.activeRules(rulesDb, new Date("2026-11-18T10:00:00")).map((r) => r.page), ["School"]);
  // Wednesday 15:00 -> boundary exclusive
  assert.deepEqual(shared.activeRules(rulesDb, new Date("2026-11-18T15:00:00")).map((r) => r.page), []);
  // Saturday 10:00 -> no School
  assert.deepEqual(shared.activeRules(rulesDb, new Date("2026-11-21T10:00:00")).map((r) => r.page), []);
  // Overnight 23:00 and 04:00 -> Bedtime
  assert.deepEqual(shared.activeRules(rulesDb, new Date("2026-11-18T23:00:00")).map((r) => r.page), ["Bedtime"]);
  assert.deepEqual(shared.activeRules(rulesDb, new Date("2026-11-18T04:00:00")).map((r) => r.page), ["Bedtime"]);

  // Unified backup / import / wipe
  storage.setItem("luminaac:log", JSON.stringify([{ t: 1000, text: "hello" }]));
  storage.setItem("luminaac:counts", JSON.stringify({ hello: 1 }));
  storage.setItem("luminaac:custom", JSON.stringify([{ w: "swim", e: "🏊", c: "action", f: "core" }]));
  db.exploration.push({ t: 2000, word: "park" });
  db.signals.push({ id: "sx", name: "sig", cues: ["c"], meaning: "m", phrase: "p", confirmations: 2, rejections: 0, contexts: ["home"], created: 100 });
  shared.persist(db);

  const backup = shared.exportUnifiedBackup();
  assert.equal(backup.version, 2);
  assert.equal(backup.board.log.length, 1);
  assert.equal(backup.board.custom[0].w, "swim");
  assert.equal(backup.exploration[0].word, "park");

  // History wipe preserves signals and custom words
  await shared.wipeUnifiedData({ mode: "history" });
  assert.deepEqual(JSON.parse(storage.getItem("luminaac:log")), []);
  assert.deepEqual(JSON.parse(storage.getItem("luminaac:counts")), {});
  assert.equal(JSON.parse(storage.getItem("luminaac:custom")).length, 1);
  assert.equal(shared.load().exploration.length, 0);
  assert.ok(shared.load().signals.some((s) => s.id === "sx"));

  // Import restores both Bridge and board
  const res = shared.importUnifiedBackup(backup);
  assert.equal(res.bridgeUpdated, true);
  assert.equal(res.boardUpdated, true);
  assert.equal(JSON.parse(storage.getItem("luminaac:log")).length, 1);
  assert.equal(shared.load().exploration[0].word, "park");

  // Full wipe clears signals & moments too
  await shared.wipeUnifiedData({ mode: "all" });
  assert.equal(shared.load().signals.length, 0);
  assert.equal(shared.load().moments.length, 0);
  assert.deepEqual(JSON.parse(storage.getItem("luminaac:log")), []);
});

// =====================================================================
// Feature 3: backend/server.js POST /api/sync/telemetry integration
// =====================================================================
test("Feature 3: backend POST /api/sync/telemetry allows child telemetry, blocks protected keys, preserves version", async () => {
  const tmpDir = mkdtempSync(join(process.env.TEMP || "/tmp", "luminaac-m1-"));
  process.env.LUMINAAC_DATA = tmpDir;
  process.env.LUMINAAC_NO_LISTEN = "1";
  process.env.DEADMAN_CHECK_MS = "600000";

  const { server } = await import("../../backend/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const base = `http://127.0.0.1:${addr.port}`;

  const req = async (method, path, body, token) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  try {
    // 1. Register parent & seed doc
    const reg = await req("POST", "/api/auth/register", {
      email: "parent-m1@example.com",
      password: "secure-passphrase-123",
      name: "Parent",
      familyName: "M1 Family",
      childName: "Sam",
    });
    assert.equal(reg.status, 200);
    const TOK = reg.json.data.token;

    const initialDoc = {
      version: 2,
      profile: { child: "Sam", place: "home" },
      signals: [{ id: "s1", name: "Hum", phrase: "I want park", cues: ["hum"], contexts: ["home"], confirmations: 3, rejections: 0 }],
      rules: [{ id: "r1", page: "School", days: [1, 2, 3, 4, 5], from: 8, to: 15 }],
      personality: [{ id: "p1", label: "Balloon", e: "🎈" }],
      safety: { consent: false, zones: [], sendLocation: false },
      access: { mode: "standard", size: 100 },
    };
    const put0 = await req("PUT", "/api/sync", { doc: initialDoc, baseVersion: 0 }, TOK);
    assert.equal(put0.status, 200);
    const v1 = put0.json.data.version;

    // 2. Pair child myvoice device
    const pair = await req("POST", "/api/devices/pair", { kind: "myvoice" }, TOK);
    const claim = await req("POST", "/api/devices/claim", { code: pair.json.data.code, name: "Sam iPad" });
    const DK = claim.json.data.deviceKey;

    // 3. Invite & register teacher
    const inv = await req("POST", "/api/family/invites", { role: "teacher" }, TOK);
    const treg = await req("POST", "/api/auth/register", {
      email: "teacher-m1@example.com",
      password: "secure-passphrase-123",
      name: "Ms. Rivera",
      invite: inv.json.data.code,
    });
    const TT = treg.json.data.token;

    // 4. Auth checks on POST /api/sync/telemetry
    assert.equal((await req("POST", "/api/sync/telemetry", { log: [{ t: 100, text: "hi" }] })).status, 401);
    assert.equal((await req("POST", "/api/sync/telemetry", { log: [{ t: 100, text: "hi" }] }, TT)).status, 403);

    // 5. Child pushes sanitized telemetry -> 200, dedupes on retry, does NOT bump version
    const payload = {
      log: [{ t: 1000, text: "I want water", kind: "message", mode: "child", actor: "child", fn: "request", words: ["I", "want", "water"] }],
      exploration: [{ t: 2000, word: "school" }],
      feedback: [{ t: 3000, accepted: true, signalId: "s1", confidence: 0.8 }],
    };
    const push1 = await req("POST", "/api/sync/telemetry", payload, DK);
    assert.equal(push1.status, 200);
    assert.equal(push1.json.data.totals.log, 1);

    const push2 = await req("POST", "/api/sync/telemetry", payload, DK);
    assert.equal(push2.status, 200);
    assert.equal(push2.json.data.totals.log, 1); // deduped!

    // Parent GET /api/sync sees telemetry and unchanged version
    const parentSync = await req("GET", "/api/sync", undefined, TOK);
    assert.equal(parentSync.status, 200);
    assert.equal(parentSync.json.data.version, v1);
    assert.equal(parentSync.json.data.telemetry.log.length, 1);
    assert.equal(parentSync.json.data.telemetry.exploration[0].word, "school");
    assert.equal(parentSync.json.data.telemetry.feedback[0].accepted, true);

    // childView includes rules and personality
    const childSync = await req("GET", "/api/sync", undefined, DK);
    assert.equal(childSync.status, 200);
    assert.equal(childSync.json.data.doc.rules.length, 1);
    assert.equal(childSync.json.data.doc.personality.length, 1);

    // 6. Protected keys rejected with 403 for child
    for (const k of ["signals", "rules", "safety", "access"]) {
      const bad = await req("POST", "/api/sync/telemetry", { [k]: [] }, DK);
      assert.equal(bad.status, 403, `child pushing ${k} must be 403`);
    }

    // Caregiver doc remained untouched
    const parentSyncAfter = await req("GET", "/api/sync", undefined, TOK);
    assert.equal(parentSyncAfter.json.data.doc.signals[0].name, "Hum");
    assert.equal(parentSyncAfter.json.data.doc.rules[0].page, "School");

    // 7. Malformed payloads -> 400
    assert.equal((await req("POST", "/api/sync/telemetry", {}, DK)).status, 400);
    assert.equal((await req("POST", "/api/sync/telemetry", { log: [{ t: 1 }] }, DK)).status, 400);
    assert.equal((await req("POST", "/api/sync/telemetry", { feedback: [{ t: 1, accepted: "yes" }] }, DK)).status, 400);
    const overBatch = Array.from({ length: 201 }, (_, i) => ({ t: i + 1, word: "x" }));
    assert.equal((await req("POST", "/api/sync/telemetry", { exploration: overBatch }, DK)).status, 400);

    // 8. PUT /api/sync as child still 403
    assert.equal((await req("PUT", "/api/sync", { doc: initialDoc, baseVersion: v1 }, DK)).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// =====================================================================
// Feature 4 & 5: vocab.js CORE invariance, OpenMoji coverage, sw.js & HTML
// =====================================================================
test("Feature 4 & 5: CORE 30-word spatial invariance, School/Bedtime folders, OpenMoji SVGs & SW precache, emoji maxlength", async () => {
  const { CORE, FOLDERS, QUICK, CALM_NEEDS, PLANS, contextMatchForRules } = await import("../../vocab.js");

  const EXPECTED_CORE = [
    "I", "want", "go", "stop", "help", "more",
    "you", "like", "eat", "not", "drink", "all done",
    "we", "need", "play", "don't", "look", "that",
    "my", "feel", "open", "big", "little", "here",
    "what", "where", "yes", "no", "please", "thank you",
  ];
  assert.deepEqual(CORE.map((x) => x.w), EXPECTED_CORE);
  assert.equal(CORE.length, 30);

  const school = FOLDERS.find((f) => f.id === "school");
  const bedtime = FOLDERS.find((f) => f.id === "bedtime");
  assert.ok(school && school.words.length === 12);
  assert.ok(bedtime && bedtime.words.length === 12);

  const ctx = contextMatchForRules(
    [{ id: "r1", page: "School" }, { id: "r2", page: "Bedtime" }],
    FOLDERS,
    [{ w: "homework", c: "thing", e: "📝", f: "school" }],
    [{ phrase: "Can we go outside?", contexts: ["school"] }],
  );
  assert.ok(ctx.activeFolderIds.includes("school"));
  assert.ok(ctx.activeFolderIds.includes("bedtime"));
  assert.ok(ctx.chips.some((c) => c.w === "teacher"));
  assert.ok(ctx.chips.some((c) => c.w === "Can we go outside?"));

  // Check every emoji across vocab.js has an SVG on disk AND is precached in sw.js
  const diskSvgs = new Set(readdirSync(join(ROOT, "vendor/openmoji")).filter((f) => f.endsWith(".svg")));
  const swSrc = read("sw.js");
  assert.match(swSrc, /"speech\.js"/);
  assert.match(swSrc, /"brand\/logo-mark\.svg"/);
  assert.match(swSrc, /"icons\/apple-touch-icon\.png"/);
  for (const svg of diskSvgs) {
    assert.ok(swSrc.includes(`"vendor/openmoji/${svg}"`), `sw.js missing OpenMoji ${svg}`);
  }

  const toHex = (e) => [...e].map((c) => c.codePointAt(0).toString(16).toUpperCase()).filter((h) => h !== "FE0F").join("-");
  const allEmojiItems = [
    ...CORE,
    ...FOLDERS,
    ...FOLDERS.flatMap((f) => f.words),
    ...QUICK,
    ...CALM_NEEDS,
    ...PLANS,
    ...PLANS.flatMap((p) => p.steps),
  ];
  for (const item of allEmojiItems) {
    if (!item.e) continue;
    const hex = toHex(item.e);
    assert.ok(diskSvgs.has(`${hex}.svg`), `Missing vendor/openmoji/${hex}.svg for ${item.w || item.title || item.t}`);
  }

  // Check emoji inputs in index.html & bridge.html have maxlength >= 16 (never 4)
  for (const htmlFile of ["index.html", "bridge.html"]) {
    const html = read(htmlFile);
    const emojiInputs = [...html.matchAll(/<input\b[^>]*name="e"[^>]*>/g)].map((m) => m[0]);
    assert.ok(emojiInputs.length >= 1);
    for (const tag of emojiInputs) {
      const ml = /maxlength="(\d+)"/.exec(tag);
      if (ml) assert.ok(Number(ml[1]) >= 16, `${htmlFile} emoji input maxlength too small: ${tag}`);
    }
  }
});

// =====================================================================
// Feature 6 & 7: access.js pointer gate, items(), keydown guard, scanning
// =====================================================================
test("Feature 6 & 7: access.js pointer cancellation, acceptMs, debounceMs, items(), keydown guard & scanning", async () => {
  const { createAccessController } = await import("../../access.js");

  // 1. Pointer cancellation + acceptMs + debounceMs
  {
    const { doc, win, body } = createMockEnv();
    let cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: false, scanMs: 1500, scanMode: "linear", scanAudio: false, scanLoops: 0 };
    const tile = createMockElement("button", {
      className: "tile",
      rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
    });
    const grid = createMockElement("div", { id: "grid", className: "grid" });
    grid.append(tile);
    body.append(grid);

    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.attachPointerActivation(win);
    ctrl.apply(true);

    // Slide-off outside rect cancels tap
    win.dispatch("pointerdown", { button: 0, pointerId: 1, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointermove", { pointerId: 1, clientX: 150, clientY: 50 }, true);
    win.dispatch("pointerup", { pointerId: 1, clientX: 150, clientY: 50 }, true);
    assert.equal(tile._clicks, 0);

    // Trailing native click after cancelled pointerup is suppressed
    let stopped = false;
    win.dispatch("click", { target: tile, isTrusted: true, preventDefault() {}, stopImmediatePropagation() { stopped = true; }, stopPropagation() {} }, true);
    assert.equal(stopped, true);

    // Valid inside tap activates once
    win.dispatch("pointerdown", { button: 0, pointerId: 2, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointerup", { pointerId: 2, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 1);

    // acceptMs = 80 rejects immediate release, accepts after 95ms
    cfg = { ...cfg, acceptMs: 80 };
    ctrl.apply(true);
    win.dispatch("pointerdown", { button: 0, pointerId: 3, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointerup", { pointerId: 3, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 1);

    win.dispatch("pointerdown", { button: 0, pointerId: 4, target: tile, clientX: 50, clientY: 50 }, true);
    await new Promise((r) => setTimeout(r, 100));
    win.dispatch("pointerup", { pointerId: 4, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 2);

    // debounceMs = 120 blocks rapid second tap
    cfg = { ...cfg, acceptMs: 0, debounceMs: 120 };
    ctrl.apply(true);
    win.dispatch("pointerdown", { button: 0, pointerId: 5, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointerup", { pointerId: 5, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 3);
    win.dispatch("pointerdown", { button: 0, pointerId: 6, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointerup", { pointerId: 6, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 3);
    await new Promise((r) => setTimeout(r, 140));
    win.dispatch("pointerdown", { button: 0, pointerId: 7, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointerup", { pointerId: 7, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 4);

    ctrl.destroy();
  }

  // 2. items(), keydown guard, Row-Column, 2-Switch Step, scanAudio, scanLoops
  {
    const { doc, win, body, root } = createMockEnv();
    const spokenCues = [];
    let cfg = { mode: "standard", size: 120, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 2000, scanMode: "rowcol", scanAudio: true, scanLoops: 2 };

    const nav = createMockElement("nav");
    const navBtn = createMockElement("button", { className: "nav-btn", textContent: "Talk" });
    nav.append(navBtn);

    const main = createMockElement("main");
    const talkView = createMockElement("section", { id: "view-talk", className: "view" });
    const detailsClosed = createMockElement("details");
    const summaryEl = createMockElement("summary", { textContent: "My things" });
    const hiddenChildBtn = createMockElement("button", { textContent: "Hidden inside details" });
    detailsClosed.append(summaryEl, hiddenChildBtn);

    const exploreChk = createMockElement("input", { id: "mvExplore", type: "checkbox", attrs: { type: "checkbox" } });
    const grid = createMockElement("div", { id: "grid", className: "grid" });
    grid.style.setProperty("--cols", "2");
    const t1 = createMockElement("button", { className: "tile", textContent: "I", rect: { left: 0, top: 10, right: 50, bottom: 60, width: 50, height: 50 } });
    const t2 = createMockElement("button", { className: "tile", textContent: "want", rect: { left: 60, top: 10, right: 110, bottom: 60, width: 50, height: 50 } });
    const t3 = createMockElement("button", { className: "tile", textContent: "go", rect: { left: 0, top: 70, right: 50, bottom: 120, width: 50, height: 50 } });
    grid.append(t1, t2, t3);
    talkView.append(detailsClosed, exploreChk, grid);

    const careView = createMockElement("section", { id: "view-care", className: "view", hidden: true });
    const careForm = createMockElement("form");
    const careInput = createMockElement("input", { type: "text" });
    careForm.append(careInput);
    careView.append(careForm);

    const scanLive = createMockElement("div", { id: "scanLive" });
    main.append(talkView, careView);
    body.append(nav, main, scanLive);

    const ctrl = createAccessController({
      doc,
      win,
      loadFn: () => ({ access: cfg }),
      speakFn: (text, opts) => spokenCues.push({ text, opts }),
    });
    ctrl.apply(true);

    assert.equal(root.style.getPropertyValue("--board-scale"), "1.2");

    const list = ctrl.items();
    assert.ok(list.includes(summaryEl), "items() must include <summary>");
    assert.ok(list.includes(exploreChk), "items() must include checkbox");
    assert.ok(!list.includes(hiddenChildBtn), "items() must exclude closed <details> children");
    assert.ok(!list.includes(careInput), "items() must exclude hidden #view-care");

    // Keydown guard: Caregiver input is ignored
    careView.hidden = false;
    doc.activeElement = careInput;
    ctrl.handleKeydown({ key: " ", preventDefault() {} });
    assert.equal(t1._clicks, 0);
    careView.hidden = true;

    // Non-caregiver checkbox IS allowed in switch mode
    doc.activeElement = exploreChk;

    // Row-col: advance to first grid row (past summary & checkbox)
    while (!t1.classList.contains("scan-row-hi")) ctrl.step(1);
    assert.ok(t2.classList.contains("scan-row-hi"));
    assert.ok(!t3.classList.contains("scan-row-hi"));
    assert.ok(spokenCues.some((c) => c.text === "Row 1" && c.opts.mode === "preview" && c.opts.skipLog === true));

    // Enter enters row 1 -> highlights t1
    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    assert.equal(ctrl.getState().scanLevel, "row");
    assert.ok(t1.classList.contains("scan-hi"));

    // Enter activates t1 and returns to outer
    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    assert.equal(t1._clicks, 1);
    assert.equal(ctrl.getState().scanLevel, "outer");

    // 2-Switch Step mode + Loop limit
    cfg = { ...cfg, scanMode: "step2", scanLoops: 1 };
    ctrl.apply(true);
    const beforeStep = ctrl.getState().scanIdx;
    ctrl.handleKeydown({ key: "Tab", preventDefault() {} });
    assert.equal(ctrl.getState().scanIdx, beforeStep + 1);

    // Exhaust 1 full loop -> enters sleeping state
    const totalStops = ctrl.items().length;
    for (let i = 0; i < totalStops + 1; i++) ctrl.step(1);
    assert.equal(ctrl.getState().sleeping, true);
    assert.equal(root.dataset.scanSleeping, "true");

    // Switch key wakes from sleep without clicking
    const clicksBeforeWake = list.reduce((s, el) => s + el._clicks, 0);
    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    assert.equal(ctrl.getState().sleeping, false);
    assert.equal(list.reduce((s, el) => s + el._clicks, 0), clicksBeforeWake);

    ctrl.destroy();
  }

  // Verify zero CSS `zoom:` rules remain
  for (const cssFile of ["myvoice.css", "app.css", "tokens.css", "phase3.css", "phase4.css"]) {
    assert.equal(/\bzoom\s*:/i.test(read(cssFile)), false, `${cssFile} must not use non-standard CSS zoom`);
  }
});

// =====================================================================
// Feature 8: WCAG AA/AAA Contrast, Low-Arousal, ARIA Grid & Live Regions
// =====================================================================
function parseHex(hex) {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(hex) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function extractBlockTokens(css, headerRegex) {
  const m = headerRegex.exec(css);
  assert.ok(m, `Missing CSS block matching ${headerRegex}`);
  const vars = {};
  for (const vm of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    vars[vm[1]] = vm[2].trim();
  }
  return vars;
}

test("Feature 8: WCAG AA/AAA contrast ratios across all 4 themes & ARIA grid/live semantics", () => {
  const tokensCss = read("tokens.css");
  const day = extractBlockTokens(tokensCss, /:root\s*\{([^}]*)\}/);
  const night = { ...day, ...extractBlockTokens(tokensCss, /:root\[data-theme="night"\]\s*\{([^}]*)\}/) };
  const contrast = { ...day, ...extractBlockTokens(tokensCss, /:root\[data-theme="contrast"\]\s*\{([^}]*)\}/) };
  const lowArousal = { ...day, ...extractBlockTokens(tokensCss, /:root\[data-theme="low-arousal"\]\s*\{([^}]*)\}/) };

  const classes = ["people", "action", "describe", "thing", "social", "question", "negate", "little", "folder"];
  for (const [name, t] of [["day", day], ["night", night], ["contrast", contrast], ["low-arousal", lowArousal]]) {
    assert.ok(contrastRatio(t["--ink"], t["--paper"]) >= 7.0, `${name} --ink on --paper < 7.0`);
    assert.ok(contrastRatio(t["--ink"], t["--fog"]) >= 7.0, `${name} --ink on --fog < 7.0`);
    assert.ok(contrastRatio(t["--ink-soft"], t["--paper"]) >= 4.5, `${name} --ink-soft on --paper < 4.5`);
    assert.ok(contrastRatio(t["--ink-soft"], t["--fog"]) >= 4.5, `${name} --ink-soft on --fog < 4.5`);
    assert.ok(contrastRatio(t["--border"], t["--paper"]) >= 3.0, `${name} --border on --paper < 3.0`);
    assert.ok(contrastRatio(t["--border"], t["--fog"]) >= 3.0, `${name} --border on --fog < 3.0`);
    assert.ok(contrastRatio(t["--focus"], t["--paper"]) >= 4.5, `${name} --focus on --paper < 4.5`);
    assert.ok(contrastRatio(t["--ok"], t["--paper"]) >= 4.5, `${name} --ok on --paper < 4.5`);
    for (const c of classes) {
      assert.ok(contrastRatio(t["--ink"], t[`--wc-${c}-tint`]) >= 7.0, `${name} --ink on --wc-${c}-tint < 7.0`);
      assert.ok(contrastRatio(t[`--wc-${c}`], t[`--wc-${c}-tint`]) >= 3.0, `${name} --wc-${c} band on tint < 3.0`);
    }
  }

  // ARIA grid & live regions
  const appJs = read("app.js");
  assert.equal(/grid\.setAttribute\("role",\s*"group"\)/.test(appJs), false, "app.js must not overwrite role='grid' with 'group'");
  assert.match(appJs, /grid\.setAttribute\("role",\s*"grid"\)/);
  assert.match(appJs, /setAttribute\("role",\s*"row"\)/);
  assert.match(appJs, /setAttribute\("role",\s*"gridcell"\)/);

  const indexHtml = read("index.html");
  assert.match(indexHtml, /id="stripWords"[^>]*aria-live="polite"/);
  assert.match(indexHtml, /id="scanLive"[^>]*aria-live="polite"/);
  assert.match(indexHtml, /name="theme"\s+value="low-arousal"/);

  const myvoiceJs = read("myvoice.js");
  assert.match(myvoiceJs, /<div[^>]*aria-live="polite"[^>]*id="mvSuggest"|<div[^>]*id="mvSuggest"[^>]*aria-live="polite"/);
  assert.match(myvoiceJs, /id="mvContext"[^>]*aria-live="polite"/);
});

// =====================================================================
// Iteration 2 Remediations: XSS, Backup, Overnight Rules, Speech Cancel,
// Access Caregiver/step2/rowcol/pointercancel/rowLoopCount, Dark/Low-Arousal CSS
// =====================================================================
test("Remediation 1: myvoice.js renders item.e & p.e via textContent without XSS injection", async () => {
  const payload = "<img src=x onerror=alert(1)>";
  assert.ok(payload.length <= 32);

  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const { doc, win, body } = createMockEnv();
  const viewTalk = createMockElement("section", { id: "view-talk", ownerDoc: doc });
  body.append(viewTalk);

  const seedDb = {
    version: 2,
    profile: { child: "Sam", caregiver: "", role: "parent", onboarded: true, place: "home" },
    signals: [],
    personality: [{ id: "p_xss", label: "Unsafe emoji", e: payload, kind: "thing", momentId: null }],
    rules: [{ id: "r_all", page: "School", days: [0, 1, 2, 3, 4, 5, 6], from: 0, to: 24 }],
    stories: [{ id: "st_xss", title: "Routine", kind: "routine", steps: [{ e: payload, text: "Step 1" }] }],
    practice: { reward: "stars", targets: [{ id: "pr_xss", sound: "s", word: "sun", e: payload, tries: [] }] },
    access: { safety: true },
  };
  const storage = makeStorage({
    "luminaac:bridge": seedDb,
    "luminaac:custom": [{ w: "backpack", e: payload, c: "thing", f: "school" }],
  });

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;

  try {
    await import(`../../myvoice.js?xss=${Date.now()}`);
    assert.equal(body.querySelectorAll("img").length, 0, "myvoice.js must never parse item.e/p.e as HTML <img>");

    const ctxChipPic = body.querySelector("#mvContextBar .mv-ctx-chip .pic");
    assert.ok(ctxChipPic, "Context chip .pic must render");
    assert.equal(ctxChipPic.textContent, payload);

    const ptilePic = body.querySelector("#mvPersonality .mv-ptile .pic");
    assert.ok(ptilePic, "Personality tile .pic must render");
    assert.equal(ptilePic.textContent, payload);

    const storyPic = body.querySelector("#mvStories .mv-ptile .pic");
    assert.ok(storyPic, "Story tile .pic must render");
    assert.equal(storyPic.textContent, payload);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.localStorage = prevStorage;
  }
});

test("Remediation 2 & 3: importUnifiedBackup() validation & activeRules() overnight wraparound", async () => {
  const storage = makeStorage({
    "luminaac:log": [{ t: 100, text: "keep me" }],
  });
  globalThis.localStorage = storage;
  globalThis.window = { dispatchEvent() {} };
  const shared = await import("../../shared.js");
  const initialBridge = shared.seed();
  shared.persist(initialBridge);
  const beforeBridge = storage.getItem("luminaac:bridge");
  const beforeLog = storage.getItem("luminaac:log");

  const badPayloads = [
    null,
    [],
    { board: [] },
    { board: {} },
    { version: 2, board: { log: "bad-string" }, signals: "bad-string", profile: null, access: "abc" },
    { version: 2, board: { log: [] }, signals: "bad-string" },
    { version: 2, board: { counts: [] } },
    { version: 2, profile: [] },
    { version: 2, access: "abc" },
    { version: 2, rules: {} },
    { version: 2, exploration: "bad" },
    { version: 2, feedback: 123 },
    { version: 2, personality: "bad" },
    { version: 2, personality: {} },
    { version: 2, stories: 123 },
    { version: 2, stories: "bad" },
    { version: 2, questions: "bad" },
    { version: 2, team: {} },
    { version: 2, notes: "bad" },
    { version: 2, alerts: 42 },
    { version: 2, audit: "bad" },
    { version: 2, milestones: "bad" },
    { version: 2, practice: [] },
    { version: 2, practice: null },
    { version: 2, practice: { reward: "stars", targets: "bad" } },
    { version: 2, privacy: "bad" },
    { version: 2, capture: [] },
    { version: 2, sync: "bad" },
    { version: 2, safety: { zones: "bad" } },
    { version: 2, fl: { sent: "bad" } },
    { version: 2, emoBase: [] },
    { version: 2, emoPrefs: "bad" },
    { version: 2, account: "bad" },
    { version: 2, device: 42 },
    { version: 2, spoken: "bad" },
    { version: 2, spoken: Infinity },
  ];
  for (const bad of badPayloads) {
    assert.throws(() => shared.importUnifiedBackup(bad), /Invalid backup/, `Should reject ${JSON.stringify(bad)}`);
  }
  assert.equal(storage.getItem("luminaac:log"), beforeLog, "Rejected backups must not mutate luminaac:log");
  assert.equal(storage.getItem("luminaac:bridge"), beforeBridge, "Rejected backups must not mutate luminaac:bridge");

  // Valid local-only v2 backup (account: null, device: null) and partial nested object merge
  const exportedLocal = shared.exportUnifiedBackup();
  assert.equal(exportedLocal.account, null);
  assert.equal(exportedLocal.device, null);
  assert.equal(shared.importUnifiedBackup(exportedLocal).bridgeUpdated, true);
  assert.equal(shared.load().account, null);
  assert.equal(shared.load().device, null);

  assert.equal(shared.importUnifiedBackup({
    version: 2,
    practice: { reward: "quiet" },
    safety: { consent: true },
    account: null,
    device: null,
    spoken: 12,
  }).bridgeUpdated, true);
  const merged = shared.load();
  assert.equal(merged.practice.reward, "quiet");
  assert.ok(Array.isArray(merged.practice.targets) && merged.practice.targets.length > 0, "Partial practice merge must preserve default targets");
  assert.equal(merged.safety.consent, true);
  assert.ok(Array.isArray(merged.safety.zones), "Partial safety merge must preserve default zones");
  assert.equal(merged.spoken, 12);

  // Overnight partial-weekday rule: Friday 21:00 -> Saturday 06:00
  const friRuleDb = { rules: [{ id: "r_fri", page: "Bedtime", days: [5], from: 21, to: 6 }] };
  assert.deepEqual(shared.activeRules(friRuleDb, new Date("2026-11-20T02:00:00")).map((r) => r.page), [], "Friday 02:00 must be inactive");
  assert.deepEqual(shared.activeRules(friRuleDb, new Date("2026-11-20T20:59:00")).map((r) => r.page), [], "Friday 20:59 must be inactive");
  assert.deepEqual(shared.activeRules(friRuleDb, new Date("2026-11-20T22:00:00")).map((r) => r.page), ["Bedtime"], "Friday 22:00 must be active");
  assert.deepEqual(shared.activeRules(friRuleDb, new Date("2026-11-21T02:00:00")).map((r) => r.page), ["Bedtime"], "Saturday 02:00 must be active");
  assert.deepEqual(shared.activeRules(friRuleDb, new Date("2026-11-21T06:00:00")).map((r) => r.page), [], "Saturday 06:00 must be inactive");
});

test("Remediation 4: speech.js stopSpeech() cancels silent modeling interval, pending audioClipId getMedia(), and Kokoro fallback", async () => {
  const { speakUtterance, configureSpeech, stopSpeech } = await import("../../speech.js");
  const storage = makeStorage({ "luminaac:settings": { voice: "", rate: 0.9 } });
  const synth = makeSynth();
  const db = { exploration: [], access: { modelingAudio: false } };
  let audioPlayCalls = 0;
  class MockAudio {
    play() { audioPlayCalls += 1; return Promise.resolve(); }
    pause() {}
  }
  const win = {
    Audio: MockAudio,
    URL: { createObjectURL: () => "blob:mock", revokeObjectURL() {} },
    dispatchEvent() {},
  };

  configureSpeech({
    load: () => db,
    persist: () => {},
    getMedia: () => new Promise((resolve) => setTimeout(() => resolve({ size: 10 }), 35)),
    storage,
    synth,
    Utterance: MockUtterance,
    win,
    isExploring: () => false,
  });

  // 1. Silent modeling interval stops immediately on stopSpeech()
  const boundaries = [];
  let silentEnded = false;
  speakUtterance("one two three four", {
    mode: "modeling",
    onWordBoundary: (idx) => boundaries.push(idx),
    onEnd: () => { silentEnded = true; },
  });
  assert.deepEqual(boundaries, [0]);
  stopSpeech();
  await new Promise((r) => setTimeout(r, 420));
  assert.deepEqual(boundaries, [0], "stopSpeech() must clear silent modeling interval");
  assert.equal(silentEnded, false, "Cancelled silent modeling must not fire onEnd");

  // 2. Pending audioClipId getMedia() is aborted by stopSpeech()
  let clipEnded = false;
  speakUtterance("clip", { mode: "child", audioClipId: "m1", onEnd: () => { clipEnded = true; } });
  stopSpeech();
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(audioPlayCalls, 0, "stopSpeech() must abort pending getMedia() audio clip");
  assert.equal(synth.calls.length, 0, "stopSpeech() must abort TTS fallback for cancelled clip");
  assert.equal(clipEnded, false);

  // 3. Pending Kokoro rejection after stopSpeech() does not fall back to synth
  let notices = 0;
  configureSpeech({
    win: { ...win, dispatchEvent(ev) { if (ev.type === "luminaac:speech-notice") notices += 1; } },
    kokoroSpeak: () => new Promise((_, reject) => setTimeout(() => reject(new Error("offline")), 35)),
    kokoroStop: () => {},
  });
  speakUtterance("hello", { mode: "child", voiceOverride: "kokoro:af_sky" });
  stopSpeech();
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(notices, 0, "Cancelled Kokoro utterance must not emit fallback notice");
  assert.equal(synth.calls.length, 0, "Cancelled Kokoro utterance must not fall back to synth");
});

test("Remediation 5, 6, 7 & edge cases: access.js Caregiver focus protection, step2 MO resync, rowcol timer reset, pointercancel/leave & rowLoopCount", async () => {
  const { createAccessController } = await import("../../access.js");

  // 1. Caregiver view open protects focus from scanTimer & resumes on close
  {
    const { doc, win, body, notifyMutations } = createMockEnv();
    let cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 600, scanMode: "linear", scanAudio: false, scanLoops: 0 };
    const main = createMockElement("main", { ownerDoc: doc });
    const talkView = createMockElement("section", { id: "view-talk", className: "view", ownerDoc: doc });
    const talkBtn = createMockElement("button", { className: "tile", textContent: "Talk", ownerDoc: doc });
    talkView.append(talkBtn);

    const careView = createMockElement("section", { id: "view-care", className: "view", hidden: false, ownerDoc: doc });
    const careForm = createMockElement("form", { ownerDoc: doc });
    const careInput = createMockElement("input", { type: "text", ownerDoc: doc });
    const careSave = createMockElement("button", { textContent: "Save", ownerDoc: doc });
    careForm.append(careInput, careSave);
    careView.append(careForm);
    main.append(talkView, careView);
    body.append(main);

    doc.activeElement = careInput;
    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.setupDomListeners();
    ctrl.apply(true);

    assert.equal(ctrl.step(1), null, "step() must skip while #view-care is visible");
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(doc.activeElement, careInput, "scanTimer must NOT steal focus from Caregiver input");
    assert.equal(body.querySelectorAll(".scan-hi").length, 0);

    // Leaving Caregiver view resumes scanning cleanly
    careView.hidden = true;
    doc.activeElement = body;
    notifyMutations(careView);
    await Promise.resolve();
    assert.ok(talkBtn.classList.contains("scan-hi"), "Closing #view-care must resume scanning on Talk");
    ctrl.destroy();
  }

  // 2. step2 mode + MutationObserver preserves .scan-hi after folder/grid mutation
  {
    const { doc, win, body, notifyMutations } = createMockEnv();
    let cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 1500, scanMode: "step2", scanAudio: false, scanLoops: 0 };
    const main = createMockElement("main", { ownerDoc: doc });
    const talkView = createMockElement("section", { id: "view-talk", className: "view", ownerDoc: doc });
    const grid = createMockElement("div", { id: "grid", className: "grid", ownerDoc: doc });
    const tOld = createMockElement("button", { className: "tile", textContent: "I", ownerDoc: doc });
    grid.append(tOld);

    const folderBtn = createMockElement("button", {
      className: "folder",
      textContent: "School",
      ownerDoc: doc,
      onClick: () => {
        grid.textContent = "";
        const tNew = createMockElement("button", { className: "tile", textContent: "teacher", ownerDoc: doc });
        grid.append(tNew);
        notifyMutations(grid);
      },
    });
    talkView.append(folderBtn, grid);
    main.append(talkView);
    body.append(main);

    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.setupDomListeners();
    ctrl.apply(true);
    assert.ok(folderBtn.classList.contains("scan-hi"));

    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    await Promise.resolve();
    await Promise.resolve();
    assert.notEqual(ctrl.getState().scanIdx, -1, "step2 MutationObserver must not wipe scanIdx to -1");
    assert.equal(body.querySelectorAll(".scan-hi").length, 1, "step2 MutationObserver must keep stop 0 highlighted");
    ctrl.destroy();
  }

  // 3. rowcol row-entry resets scanTimer for a full dwell interval on column 0, plus rowLoopCount auto-exit
  {
    const { doc, win, body } = createMockEnv();
    let cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 600, scanMode: "rowcol", scanAudio: false, scanLoops: 2 };
    const main = createMockElement("main", { ownerDoc: doc });
    const grid = createMockElement("div", { id: "grid", className: "grid", ownerDoc: doc });
    grid.style.setProperty("--cols", "2");
    const t1 = createMockElement("button", { className: "tile", textContent: "I", rect: { left: 0, top: 10, right: 50, bottom: 60, width: 50, height: 50 }, ownerDoc: doc });
    const t2 = createMockElement("button", { className: "tile", textContent: "want", rect: { left: 60, top: 10, right: 110, bottom: 60, width: 50, height: 50 }, ownerDoc: doc });
    grid.append(t1, t2);
    main.append(grid);
    body.append(main);

    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.apply(true);
    assert.ok(t1.classList.contains("scan-row-hi"));

    await new Promise((r) => setTimeout(r, 450));
    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    assert.equal(ctrl.getState().scanLevel, "row");
    assert.ok(t1.classList.contains("scan-hi"));

    // 250ms after row entry (700ms total > original 600ms), t1 MUST still be highlighted
    await new Promise((r) => setTimeout(r, 250));
    assert.ok(t1.classList.contains("scan-hi"), "rowcol row entry must reset scanTimer so column 0 gets a full dwell window");

    // After full 600ms window elapses, scanTimer advances to t2
    await new Promise((r) => setTimeout(r, 430));
    assert.ok(t2.classList.contains("scan-hi"));

    // rowLoopCount auto-exits back to outer after maxRowLoops (2)
    ctrl.step(1); // wraps loop 1 -> t1
    ctrl.step(1); // t2
    ctrl.step(1); // wraps loop 2 -> exits back to outer
    assert.equal(ctrl.getState().scanLevel, "outer");
    ctrl.destroy();
  }

  // 4. pointercancel and pointerleave mid-hold with acceptMs
  {
    const { doc, win, body } = createMockEnv();
    const cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 60, debounceMs: 0, scan: false, scanMs: 1500, scanMode: "linear", scanAudio: false, scanLoops: 0 };
    const tile = createMockElement("button", {
      className: "tile",
      rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
    });
    const grid = createMockElement("div", { id: "grid", className: "grid" });
    grid.append(tile);
    body.append(grid);

    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.attachPointerActivation(win);
    ctrl.apply(true);

    // pointercancel mid-hold clears .accepting and prevents .accepted / click
    win.dispatch("pointerdown", { button: 0, pointerId: 10, target: tile, clientX: 50, clientY: 50 }, true);
    assert.equal(tile.classList.contains("accepting"), true);
    win.dispatch("pointercancel", { pointerId: 10 }, true);
    assert.equal(tile.classList.contains("accepting"), false);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(tile.classList.contains("accepted"), false);
    assert.equal(tile._clicks, 0);

    // pointerleave mid-hold cancels hold
    win.dispatch("pointerdown", { button: 0, pointerId: 11, target: tile, clientX: 50, clientY: 50 }, true);
    win.dispatch("pointerleave", { target: tile, relatedTarget: null }, true);
    await new Promise((r) => setTimeout(r, 80));
    win.dispatch("pointerup", { pointerId: 11, clientX: 50, clientY: 50 }, true);
    assert.equal(tile._clicks, 0);
    ctrl.destroy();
  }
});

test("Remediation 8 & 9: Dark mode (@media prefers-color-scheme: dark), bridge.css, myvoice.css & app.css body.low-arousal contrast", () => {
  const tokensCss = read("tokens.css");
  const brandCss = read("brand/brand-tokens.css");
  const appCss = read("app.css");
  const bridgeCss = read("bridge.css");
  const myvoiceCss = read("myvoice.css");

  const extractMediaDarkTokens = (css) => {
    const m = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/.exec(css);
    assert.ok(m, "Missing @media (prefers-color-scheme: dark) :root:not([data-theme]) block");
    const vars = {};
    for (const vm of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[vm[1]] = vm[2].trim();
    return vars;
  };

  const day = {
    ...extractBlockTokens(tokensCss, /:root\s*\{([^}]*)\}/),
    ...extractBlockTokens(brandCss, /:root\s*\{([^}]*)\}/),
  };
  const night = {
    ...day,
    ...extractBlockTokens(tokensCss, /:root\[data-theme="night"\]\s*\{([^}]*)\}/),
    ...extractBlockTokens(brandCss, /:root\[data-theme="night"\]\s*\{([^}]*)\}/),
  };
  const prefersDark = {
    ...day,
    ...extractMediaDarkTokens(tokensCss),
    ...extractMediaDarkTokens(brandCss),
  };
  const contrast = {
    ...day,
    ...extractBlockTokens(tokensCss, /:root\[data-theme="contrast"\]\s*\{([^}]*)\}/),
    ...extractBlockTokens(brandCss, /:root\[data-theme="contrast"\]\s*\{([^}]*)\}/),
  };
  const lowArousal = {
    ...day,
    ...extractBlockTokens(tokensCss, /:root\[data-theme="low-arousal"\]\s*\{([^}]*)\}/),
  };

  // Verify bridge.css dark-mode rules exist & pass >= 4.5:1
  assert.match(bridgeCss, /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*:root:not\(\[data-theme\]\)\s+\.chip\s*\{[^}]*color:\s*#dcecfb/);
  assert.match(bridgeCss, /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*:root:not\(\[data-theme\]\)\s+\.chip\[aria-pressed="true"\]\s*\{[^}]*color:\s*#0e141a/);
  assert.match(bridgeCss, /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*:root:not\(\[data-theme\]\)\s+\.btn\.danger\s*\{[^}]*color:\s*#0e141a/);

  // Light mode bridge checks
  assert.ok(contrastRatio("#12385f", day["--sky-tint"]) >= 4.5, "bridge light .chip");
  assert.ok(contrastRatio("#ffffff", day["--sky-deep"]) >= 4.5, "bridge light .chip[aria-pressed]");
  assert.ok(contrastRatio("#ffffff", day["--alert"]) >= 4.5, "bridge light .btn.danger");

  // Dark / Night mode bridge checks
  for (const [name, t] of [["prefersDark", prefersDark], ["night", night]]) {
    assert.ok(contrastRatio("#dcecfb", t["--sky-tint"]) >= 4.5, `bridge ${name} .chip`);
    assert.ok(contrastRatio("#0e141a", t["--sky-deep"]) >= 4.5, `bridge ${name} .chip[aria-pressed]`);
    assert.ok(contrastRatio("#0e141a", t["--alert"]) >= 4.5, `bridge ${name} .btn.danger`);
    assert.ok(contrastRatio("#ff8f87", t["--paper-raised"]) >= 4.5, `bridge ${name} .btn.danger.quiet`);
  }

  // myvoice.css dark/night/contrast checks
  for (const [name, t] of [["day", day], ["night", night], ["prefersDark", prefersDark]]) {
    if (name === "day") {
      assert.ok(contrastRatio("#12385f", t["--sky-tint"]) >= 4.5);
      assert.ok(contrastRatio("#4a2600", t["--ember-tint"]) >= 4.5);
      assert.ok(contrastRatio("#ffffff", t["--sky-deep"]) >= 4.5);
    } else {
      assert.ok(contrastRatio("#dcecfb", "#183049") >= 4.5, `myvoice ${name} .mv-chip`);
      assert.ok(contrastRatio("#ffe2b8", "#3a2508") >= 4.5, `myvoice ${name} .mv-chip.is-top`);
      assert.ok(contrastRatio("#0e141a", t["--sky-deep"]) >= 4.5, `myvoice ${name} .mv-pbtn`);
    }
  }
  assert.ok(contrastRatio("#ffffff", "#000000") >= 7.0);
  assert.ok(contrastRatio("#ffd60a", "#000000") >= 7.0);

  // app.css body.low-arousal background scoped per theme
  assert.match(appCss, /:root\[data-theme="night"\]\s+body\.low-arousal\s*\{\s*background:\s*#11161b/);
  assert.match(appCss, /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*:root:not\(\[data-theme\]\)\s+body\.low-arousal\s*\{\s*background:\s*#11161b/);
  assert.match(appCss, /:root\[data-theme="contrast"\]\s+body\.low-arousal\s*\{\s*background:\s*#000000/);

  for (const [name, t, bg] of [
    ["day+lowArousal", day, "#e2e6e4"],
    ["lowArousal+lowArousal", lowArousal, "#e2e6e4"],
    ["night+lowArousal", night, "#11161b"],
    ["prefersDark+lowArousal", prefersDark, "#11161b"],
    ["contrast+lowArousal", contrast, "#000000"],
  ]) {
    assert.ok(contrastRatio(t["--ink"], bg) >= 7.0, `${name} --ink on body.low-arousal < 7.0`);
    assert.ok(contrastRatio(t["--ink-soft"], bg) >= 4.5, `${name} --ink-soft on body.low-arousal < 4.5`);
  }

  // bridge-plus.js parseSteps() handles skin-toned ZWJ emojis cleanly (compiled directly from source)
  const bridgePlusJs = read("bridge-plus.js");
  const reMatch = /const m = \/((?:\\.|[^/\\])+)\/([a-z]*)\.exec\(l\);/.exec(bridgePlusJs);
  assert.ok(reMatch, "bridge-plus.js parseSteps regex must exist");
  const stepRe = new RegExp(reMatch[1], reMatch[2]);
  for (const [line, expEmoji, expText] of [
    ["🧑🏽‍🏫 Teacher helps", "🧑🏽‍🏫", "Teacher helps"],
    ["👩🏽‍❤️‍💋‍👨🏾 Family kiss", "👩🏽‍❤️‍💋‍👨🏾", "Family kiss"],
    ["🏳️‍🌈 Rainbow flag", "🏳️‍🌈", "Rainbow flag"],
  ]) {
    const parsed = stepRe.exec(line);
    assert.equal(parsed?.[1], expEmoji);
    assert.equal(parsed?.[2], expText);
  }
  assert.equal(stepRe.exec("Plain text step"), null);

  // bridge.js renderInsights() #pmap escapes n.e and guards n.l
  const bridgeJs = read("bridge.js");
  assert.match(bridgeJs, /\$\{esc\(n\.e\s*\|\|\s*""\)\}/);
  assert.match(bridgeJs, /\$\{esc\(\(n\.l\s*\|\|\s*""\)\.slice\(0,\s*22\)\)\}/);
  const escMatch = /const esc = (\([^\r\n]+);/.exec(bridgeJs);
  assert.ok(escMatch, "bridge.js esc helper must exist");
  const escFn = new Function(`return (${escMatch[1]});`)();
  assert.equal(escFn("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(escFn("🧑🏽‍🏫"), "🧑🏽‍🏫");
});

// =====================================================================
// Iteration 3 Remediations: #mvPlayer/<form> scanning, step2 single cue,
// Kokoro concurrency, speakWithSynth async onerror
// =====================================================================
test("Remediation 10: access.js scans #mvPlayer (<dialog><form method='dialog'>) in linear, rowcol & step2, protects #mvPair inputs & Caregiver #lockBtn", async () => {
  const { createAccessController } = await import("../../access.js");
  const { doc, win, body, notifyMutations } = createMockEnv();
  let cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 600, scanMode: "linear", scanAudio: false, scanLoops: 0 };

  const main = createMockElement("main", { id: "main", ownerDoc: doc });
  const talkView = createMockElement("section", { id: "view-talk", className: "view", ownerDoc: doc });
  const talkTile = createMockElement("button", { className: "tile", textContent: "Talk", ownerDoc: doc });
  const exploreChk = createMockElement("input", { id: "mvExplore", type: "checkbox", attrs: { type: "checkbox" }, ownerDoc: doc });
  talkView.append(talkTile, exploreChk);

  const careView = createMockElement("section", { id: "view-care", className: "view", hidden: true, ownerDoc: doc });
  const lockBtn = createMockElement("button", { id: "lockBtn", textContent: "Done", ownerDoc: doc });
  const careForm = createMockElement("form", { ownerDoc: doc });
  const careInput = createMockElement("input", { type: "text", ownerDoc: doc });
  careForm.append(careInput);
  careView.append(lockBtn, careForm);

  const mvPlayer = createMockElement("dialog", { id: "mvPlayer", className: "mv-player", open: false, ownerDoc: doc });
  const mvForm = createMockElement("form", { attrs: { method: "dialog" }, ownerDoc: doc });
  const btnAgain = createMockElement("button", { textContent: "Say it again", ownerDoc: doc });
  const btnNext = createMockElement("button", { textContent: "Next", ownerDoc: doc });
  const btnClose = createMockElement("button", {
    textContent: "Close",
    ownerDoc: doc,
    onClick: () => {
      mvPlayer.open = false;
      notifyMutations(mvPlayer);
    },
  });
  mvForm.append(btnAgain, btnNext, btnClose);
  mvPlayer.append(mvForm);
  let autoFocusOnShow = true;
  mvPlayer.showModal = () => {
    mvPlayer.open = true;
    if (autoFocusOnShow) btnAgain.focus();
    notifyMutations(mvPlayer);
  };
  mvPlayer.close = () => {
    mvPlayer.open = false;
    notifyMutations(mvPlayer);
  };

  const mvPair = createMockElement("dialog", { id: "mvPair", className: "mv-pair", open: false, ownerDoc: doc });
  const pairForm = createMockElement("form", { className: "mv-pair-form", attrs: { method: "dialog" }, ownerDoc: doc });
  const pairInput = createMockElement("input", { type: "text", attrs: { name: "name" }, ownerDoc: doc });
  const pairBtn = createMockElement("button", { textContent: "Pair", ownerDoc: doc });
  pairForm.append(pairInput, pairBtn);
  mvPair.append(pairForm);

  main.append(talkView, careView);
  body.append(main, mvPlayer, mvPair);

  const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
  ctrl.setupDomListeners();
  ctrl.apply(true);

  try {
    // 1. linear + rowcol with autoFocus=true and autoFocus=false
    for (const mode of ["linear", "rowcol"]) {
      for (const af of [true, false]) {
        autoFocusOnShow = af;
        cfg = { ...cfg, scanMode: mode };
        ctrl.apply(true);
        doc.activeElement = body;

        mvPlayer.showModal();
        await Promise.resolve();
        assert.deepEqual(ctrl.items(), [btnAgain, btnNext, btnClose], `${mode} af=${af} items()`);
        if (af) assert.equal(doc.activeElement, btnAgain);

        await new Promise((r) => setTimeout(r, 660));
        assert.equal(btnAgain.classList.contains("scan-hi"), true, `${mode} af=${af} tick 1 highlights btnAgain`);
        await new Promise((r) => setTimeout(r, 640));
        assert.equal(btnNext.classList.contains("scan-hi"), true, `${mode} af=${af} tick 2 highlights btnNext`);
        assert.equal(doc.activeElement, btnNext);
        await new Promise((r) => setTimeout(r, 640));
        assert.equal(btnClose.classList.contains("scan-hi"), true, `${mode} af=${af} tick 3 highlights btnClose`);
        mvPlayer.close();
        await Promise.resolve();
      }
    }

    // 2. step2 with autoFocus=true and autoFocus=false, plus Enter closing #mvPlayer
    for (const af of [true, false]) {
      autoFocusOnShow = af;
      cfg = { ...cfg, scanMode: "step2" };
      ctrl.apply(true);
      doc.activeElement = body;

      mvPlayer.showModal();
      await Promise.resolve();
      assert.equal(btnAgain.classList.contains("scan-hi"), true, `step2 af=${af} highlights btnAgain`);
      ctrl.handleKeydown({ key: "Tab", preventDefault() {} });
      assert.equal(btnNext.classList.contains("scan-hi"), true, `step2 af=${af} Tab -> btnNext`);
      assert.equal(doc.activeElement, btnNext);
      ctrl.handleKeydown({ key: "Tab", preventDefault() {} });
      assert.equal(btnClose.classList.contains("scan-hi"), true, `step2 af=${af} Tab -> btnClose`);
      ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
      await Promise.resolve();
      assert.equal(mvPlayer.open, false, `step2 af=${af} Enter closes #mvPlayer`);
      assert.equal(talkTile.classList.contains("scan-hi"), true, `step2 af=${af} resumes on #view-talk`);
    }

    // 3. Non-Caregiver #mvExplore checkbox remains scannable
    doc.activeElement = exploreChk;
    assert.notEqual(ctrl.step(1), null, "#mvExplore checkbox must remain scannable");

    // 4. #mvPair text input pauses scanning and closing resumes scanning
    mvPair.open = true;
    pairInput.focus();
    notifyMutations(mvPair);
    await Promise.resolve();
    assert.equal(ctrl.step(1), null, "#mvPair text input must pause step()");
    let pairPrevented = 0;
    ctrl.handleKeydown({ key: " ", preventDefault() { pairPrevented += 1; } });
    assert.equal(pairPrevented, 0, "#mvPair text input keydown must not call preventDefault");
    assert.equal(pairBtn._clicks, 0);

    mvPair.open = false;
    doc.activeElement = body;
    notifyMutations(mvPair);
    await Promise.resolve();
    assert.equal(talkTile.classList.contains("scan-hi"), true, "Closing #mvPair must resume scanning on #view-talk");

    // 5. Caregiver non-form #lockBtn keyboard protection
    careView.hidden = false;
    notifyMutations(careView);
    await Promise.resolve();
    lockBtn.focus();
    let carePrevented = 0;
    ctrl.handleKeydown({ key: "Enter", preventDefault() { carePrevented += 1; } });
    ctrl.handleKeydown({ key: "Tab", preventDefault() { carePrevented += 1; } });
    ctrl.handleKeydown({ key: " ", preventDefault() { carePrevented += 1; } });
    assert.equal(carePrevented, 0, "Caregiver non-form #lockBtn must not have keys intercepted");
    assert.equal(lockBtn._clicks, 0);
  } finally {
    ctrl.destroy();
  }
});

test("Remediation 11: access.js step2 scanAudio emits exactly 1 preview cue on mutating folder click and non-mutating tile click", async () => {
  const { createAccessController } = await import("../../access.js");
  const { doc, win, body, notifyMutations } = createMockEnv();
  const previewCalls = [];
  const cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 1500, scanMode: "step2", scanAudio: true, scanLoops: 0 };

  const main = createMockElement("main", { ownerDoc: doc });
  const talkView = createMockElement("section", { id: "view-talk", className: "view", ownerDoc: doc });
  const grid = createMockElement("div", { id: "grid", className: "grid", ownerDoc: doc });

  const tileBtn = createMockElement("button", { className: "tile", textContent: "more", ownerDoc: doc });
  const folderBtn = createMockElement("button", {
    className: "folder",
    textContent: "School",
    ownerDoc: doc,
    onClick: () => {
      grid.textContent = "";
      const tNew = createMockElement("button", { className: "tile", textContent: "teacher", ownerDoc: doc });
      grid.append(tNew);
      notifyMutations(grid);
    },
  });
  grid.append(tileBtn);
  talkView.append(folderBtn, grid);
  main.append(talkView);
  body.append(main);

  const ctrl = createAccessController({
    doc,
    win,
    loadFn: () => ({ access: cfg }),
    speakFn: (text, opts) => {
      if (opts?.mode === "preview") previewCalls.push({ text, opts });
    },
  });
  ctrl.setupDomListeners();
  ctrl.apply(true);

  try {
    assert.equal(folderBtn.classList.contains("scan-hi"), true);

    // 1. Mutating folder click
    previewCalls.length = 0;
    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    assert.equal(previewCalls.length, 1, "Mutating folder click must emit 1 preview cue synchronously");
    assert.equal(ctrl.getState().scanIdx, 0);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(previewCalls.length, 1, "Mutating folder click must not emit a duplicate preview cue after MO microtask");
    assert.equal(ctrl.getState().scanIdx, 0);
    assert.equal(body.querySelectorAll(".scan-hi").length, 1);

    // 2. Non-mutating tile click (advance to tile 'teacher' first)
    ctrl.handleKeydown({ key: "Tab", preventDefault() {} });
    const teacherTile = grid.querySelector(".tile");
    assert.equal(teacherTile.classList.contains("scan-hi"), true);

    previewCalls.length = 0;
    ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
    assert.equal(teacherTile._clicks, 1);
    assert.equal(previewCalls.length, 1, "Non-mutating tile click must emit 1 preview cue synchronously");
    assert.equal(ctrl.getState().scanIdx, 0);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(previewCalls.length, 1, "Non-mutating tile click must emit 1 preview cue after microtasks");
    assert.equal(ctrl.getState().scanIdx, 0);
  } finally {
    ctrl.destroy();
  }
});

test("Remediation 12: speech.js speakWithKokoro() concurrent replacement preserves activeKokoro across resolve & reject", async () => {
  const { speakUtterance, configureSpeech, stopSpeech } = await import("../../speech.js");
  const storage = makeStorage({ "luminaac:settings": { voice: "", rate: 0.9 } });
  const synth = makeSynth();
  const events = [];
  const calls = [];
  let stopCalls = 0;

  configureSpeech({
    load: () => ({ exploration: [], access: {} }),
    persist: () => {},
    getMedia: null,
    storage,
    synth,
    Utterance: MockUtterance,
    win: { dispatchEvent: (e) => events.push(e) },
    isExploring: () => false,
    kokoroSpeak: (text, voiceId) => {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      calls.push({ text, voiceId, promise, resolve, reject });
      return promise;
    },
    kokoroStop: () => { stopCalls += 1; },
  });

  try {
    // Subcase A: Superseded Kokoro A resolves while Kokoro B is active
    let aEnded = false;
    let bEnded = false;
    speakUtterance("first", { mode: "child", voiceOverride: "kokoro:af_sky", onEnd: () => { aEnded = true; } });
    assert.equal(calls.length, 1);

    speakUtterance("second", { mode: "child", voiceOverride: "kokoro:bf_isabella", onEnd: () => { bEnded = true; } });
    assert.equal(stopCalls, 1);
    assert.equal(calls.length, 2);

    calls[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(aEnded, false, "Superseded Kokoro A resolve must not invoke onEnd");
    assert.equal(speakUtterance("scan", { mode: "preview", skipLog: true }).spoken, false, "activeKokoro must stay true while B is active");
    assert.equal(synth.calls.length, 0);

    stopSpeech();
    assert.equal(stopCalls, 2, "stopSpeech() must invoke kokoroStop() for active Kokoro B");
    calls[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(bEnded, false);
    assert.equal(speakUtterance("scan", { mode: "preview", skipLog: true }).spoken, true, "activeKokoro must be false after B stops");

    // Subcase B: Superseded Kokoro A rejects while Kokoro B is active
    stopCalls = 0;
    synth.calls.length = 0;
    events.length = 0;
    let b2Ended = false;

    speakUtterance("third", { mode: "child", voiceOverride: "kokoro:af_sky" });
    speakUtterance("fourth", { mode: "child", voiceOverride: "kokoro:bf_isabella", onEnd: () => { b2Ended = true; } });
    assert.equal(stopCalls, 1);

    calls[2].reject(new Error("aborted"));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(events.some((e) => e.type === "luminaac:speech-notice"), false, "Superseded Kokoro reject must not emit fallback notice");
    assert.equal(synth.calls.length, 0, "Superseded Kokoro reject must not fall back to synth");
    assert.equal(speakUtterance("scan", { mode: "preview", skipLog: true }).spoken, false, "activeKokoro must stay true while B2 is active");

    calls[3].resolve();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(b2Ended, true, "Active Kokoro B2 must fire onEnd on normal completion");
    assert.equal(speakUtterance("scan", { mode: "preview", skipLog: true }).spoken, true);
  } finally {
    stopSpeech();
    configureSpeech({ kokoroSpeak: null, kokoroStop: null });
  }
});

test("Remediation 13: speech.js speakWithSynth() async onerror after synth.cancel() does not invoke stale onEnd or clear active highlights", async () => {
  const { speakUtterance, configureSpeech, stopSpeech } = await import("../../speech.js");
  const storage = makeStorage({ "luminaac:settings": { voice: "", rate: 0.9 } });
  let activeUtterance = null;
  const asyncSynth = {
    speaking: false,
    getVoices() { return [{ name: "TestVoice", lang: "en-US" }]; },
    cancel() {
      const prev = activeUtterance;
      activeUtterance = null;
      this.speaking = false;
      if (prev) setTimeout(() => prev.onerror?.({ error: "interrupted" }), 15);
    },
    speak(u) {
      activeUtterance = u;
      this.speaking = true;
      u.onstart?.();
    },
  };

  configureSpeech({
    load: () => ({ exploration: [], access: {} }),
    persist: () => {},
    getMedia: null,
    storage,
    synth: asyncSynth,
    Utterance: MockUtterance,
    win: { dispatchEvent() {} },
    isExploring: () => false,
    kokoroSpeak: null,
    kokoroStop: null,
  });

  try {
    // Simulate shared #stripWords span array as in app.js
    const stripSpans = [{ lit: false, done: false }, { lit: false, done: false }];
    const light = (idx) => stripSpans.forEach((s, i) => { s.lit = i === idx; s.done = i < idx; });
    const clear = () => stripSpans.forEach((s) => { s.lit = false; s.done = false; });

    let u1Ended = 0;
    let u2Ended = 0;
    speakUtterance("one two", { mode: "child", onWordBoundary: light, onEnd: () => { u1Ended += 1; clear(); } });
    assert.equal(stripSpans[0].lit, true);

    // Interrupt with Utterance 2 before Utterance 1 finishes
    speakUtterance("three four", { mode: "child", onWordBoundary: light, onEnd: () => { u2Ended += 1; clear(); } });
    const u2 = activeUtterance;
    assert.equal(stripSpans[0].lit, true);

    await new Promise((r) => setTimeout(r, 35));
    assert.equal(u1Ended, 0, "Stale u1.onerror must NOT fire u1 onEnd");
    assert.equal(stripSpans[0].lit, true, "Stale u1.onerror must NOT clear Utterance 2 highlights");

    // Legitimate completion of Utterance 2 clears highlights
    u2.onend();
    assert.equal(u2Ended, 1);
    assert.equal(stripSpans[0].lit, false);

    // Utterance 3 canceled via stopSpeech() without replacement
    let u3Ended = 0;
    speakUtterance("five six", { mode: "child", onEnd: () => { u3Ended += 1; } });
    stopSpeech();
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(u3Ended, 0, "Cancelled u3.onerror after stopSpeech() must NOT fire onEnd");

    // Kokoro fallback catch -> speakWithSynth interrupted before onend
    let fbEnded = 0;
    configureSpeech({ kokoroSpeak: () => Promise.reject(new Error("offline")), kokoroStop: () => {} });
    speakUtterance("fallback test", { mode: "child", voiceOverride: "kokoro:af_sky", onEnd: () => { fbEnded += 1; } });
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(activeUtterance, "Kokoro fallback must invoke speakWithSynth");
    stopSpeech();
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(fbEnded, 0, "Interrupted Kokoro->synth fallback onerror must NOT fire onEnd");
  } finally {
    stopSpeech();
    configureSpeech({ kokoroSpeak: null, kokoroStop: null });
  }
});

// =====================================================================
// Iteration 4 Remediations: preview seq guard, bridge XSS escaping,
// access.js #careBtn/gap/multi-pointer/dwell, bridge.css contrast & dlgReset
// =====================================================================
test("Remediation 14: speech.js mode: 'preview' interrupted by mode: 'child' async onerror does not invoke preview onEnd or clear child highlights", async () => {
  const { speakUtterance, configureSpeech, stopSpeech } = await import("../../speech.js");
  const storage = makeStorage({ "luminaac:settings": { voice: "", rate: 0.9 } });
  let activeUtterance = null;
  const asyncSynth = {
    speaking: false,
    getVoices() { return [{ name: "TestVoice", lang: "en-US" }]; },
    cancel() {
      const prev = activeUtterance;
      activeUtterance = null;
      this.speaking = false;
      if (prev) setTimeout(() => prev.onerror?.({ error: "interrupted" }), 15);
    },
    speak(u) {
      activeUtterance = u;
      this.speaking = true;
      u.onstart?.();
    },
  };

  configureSpeech({
    load: () => ({ exploration: [], access: {} }),
    persist: () => {},
    getMedia: null,
    storage,
    synth: asyncSynth,
    Utterance: MockUtterance,
    win: { dispatchEvent() {} },
    isExploring: () => false,
    kokoroSpeak: null,
    kokoroStop: null,
  });

  try {
    const stripSpans = [{ lit: false, done: false }, { lit: false, done: false }];
    const light = (idx) => stripSpans.forEach((s, i) => { s.lit = i === idx; s.done = i < idx; });
    const clear = () => stripSpans.forEach((s) => { s.lit = false; s.done = false; });

    let previewEnded = 0;
    let previewWords = 0;
    const prevRes = speakUtterance("scan item", {
      mode: "preview",
      skipLog: true,
      onWordBoundary: () => { previewWords += 1; },
      onEnd: () => { previewEnded += 1; clear(); },
    });
    assert.equal(prevRes.spoken, true);
    assert.equal(previewWords, 1);
    const uPreview = activeUtterance;

    let childEnded = 0;
    speakUtterance("real speech", {
      mode: "child",
      onWordBoundary: light,
      onEnd: () => { childEnded += 1; clear(); },
    });
    const uChild = activeUtterance;
    assert.equal(stripSpans[0].lit, true);

    // Trigger delayed boundary & async error on cancelled preview utterance
    uPreview.onboundary?.({ name: "word", charIndex: 5 });
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(previewEnded, 0, "Cancelled preview async onerror must NOT fire preview onEnd");
    assert.equal(previewWords, 1, "Cancelled preview onboundary must NOT fire after interruption");
    assert.equal(stripSpans[0].lit, true, "Child word highlights must stay intact");

    uChild.onend();
    assert.equal(childEnded, 1);
    assert.equal(stripSpans[0].lit, false);

    // Preview with interrupt: true stopped via stopSpeech() also suppresses stale onEnd
    let interruptPreviewEnded = 0;
    speakUtterance("interrupt preview", {
      mode: "preview",
      interrupt: true,
      skipLog: true,
      onEnd: () => { interruptPreviewEnded += 1; },
    });
    stopSpeech();
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(interruptPreviewEnded, 0, "stopSpeech() must invalidate interrupt:true preview onEnd");
  } finally {
    stopSpeech();
    configureSpeech({ kokoroSpeak: null, kokoroStop: null });
  }
});

test("Remediation 15: bridge.js & bridge-plus.js escape m.dur, m.id, a.loc & secondary innerHTML fields against XSS", async () => {
  const payload = "<img src=x onerror=alert(1)>";
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevStorage = globalThis.localStorage;
  const prevLocation = globalThis.location;
  const prevHistory = globalThis.history;
  const prevOption = globalThis.Option;
  const prevAddEventListener = globalThis.addEventListener;

  const { doc, win, body } = createMockEnv();
  const makeEl = (tag, id, className = "") => {
    const el = createMockElement(tag, { id, className, ownerDoc: doc });
    body.append(el);
    return el;
  };
  const tabTodayBtn = createMockElement("button", { className: "tab", dataset: { tab: "today" }, attrs: { "data-tab": "today" }, ownerDoc: doc });
  const tabVocabBtn = createMockElement("button", { className: "tab", dataset: { tab: "vocab" }, attrs: { "data-tab": "vocab" }, ownerDoc: doc });
  body.append(tabTodayBtn, tabVocabBtn);

  for (const [tag, id, cls] of [
    ["section", "tab-today", "panel"],
    ["section", "tab-signals", "panel"],
    ["section", "tab-vocab", "panel"],
    ["section", "tab-insights", "panel"],
    ["section", "tab-team", "panel"],
    ["section", "tab-privacy", "panel"],
    ["main", "main", ""],
    ["span", "who", ""],
    ["span", "bufSecs", ""],
    ["span", "todoCount", ""],
    ["input", "dayPick", ""],
    ["div", "timeline", ""],
    ["ul", "moments", ""],
    ["ul", "questions", ""],
    ["div", "days", "days"],
    ["select", "momentPick", ""],
    ["ul", "personalList", ""],
    ["ul", "ruleList", ""],
    ["div", "exploreList", ""],
    ["div", "alertBar", ""],
    ["div", "podChart", ""],
    ["div", "suggStats", ""],
    ["div", "intentStats", ""],
    ["ul", "milestoneList", ""],
    ["select", "annIntent", ""],
    ["select", "viewAs", ""],
    ["div", "sharePreview", ""],
    ["input", "annText", ""],
    ["form", "formAnnotate", ""],
    ["form", "formPersonal", ""],
    ["form", "formRule", ""],
    ["form", "formInvite", ""],
    ["form", "formNote", ""],
    ["form", "formPrivacy", ""],
    ["form", "formStory", ""],
    ["form", "formPractice", ""],
    ["select", "rewardPick", ""],
    ["form", "formSync", ""],
    ["button", "btnListen", ""],
    ["button", "btnCapture", ""],
    ["button", "btnDemo", ""],
    ["button", "btnPrint", ""],
    ["button", "btnShareFile", ""],
    ["button", "btnExport", ""],
    ["input", "importFile", ""],
    ["button", "btnWipe", ""],
    ["button", "btnRedo", ""],
    ["button", "btnNewKey", ""],
    ["button", "btnDisconnect", ""],
    ["button", "btnShareLink", ""],
    ["p", "syncStatus", ""],
    ["ul", "shareLinks", ""],
  ]) {
    makeEl(tag, id, cls);
  }
  const formAccess = makeEl("form", "formAccess");
  for (const field of ["mode", "size", "dwell", "acceptMs", "debounceMs", "scan", "scanMs", "scanMode", "scanAudio", "scanLoops", "safety"]) {
    formAccess[field] = createMockElement("input", { ownerDoc: doc });
  }
  makeEl("output", "sizeOut");
  makeEl("output", "acceptOut");
  makeEl("output", "debounceOut");
  const viewAs = doc.getElementById("viewAs");
  viewAs.value = "teacher";
  doc.getElementById("days").insertAdjacentHTML = () => {};
  const formSync = doc.getElementById("formSync");
  formSync.url = { value: "" };
  formSync.key = { value: "" };

  const now = Date.now();
  const craftedDb = {
    version: 2,
    profile: { child: "Sam", caregiver: "Pat", role: "parent", onboarded: true, place: "home" },
    signals: [],
    moments: [{
      id: `m1${payload}`,
      t: now,
      kind: "audio",
      dur: payload,
      context: "snack",
      aac: [],
      meaning: "",
      by: "parent",
      signalId: null,
      media: "m1",
    }],
    rules: [],
    exploration: [],
    feedback: [],
    personality: [],
    stories: [],
    questions: [],
    team: [],
    notes: [],
    alerts: [
      { id: `a1${payload}`, kind: "help", t: now, from: "Sam", loc: { lat: 37.77, lng: -122.41, acc: payload }, ack: null },
      { id: "a2", kind: "help", t: now, from: "Sam", loc: { lat: payload, lng: -122.41, acc: 10 }, ack: null },
    ],
    audit: [],
    practice: { reward: "stars", targets: [] },
    privacy: { retainDays: 0, autoDetect: false, blurFaces: false, shareMedia: false },
    capture: { seconds: 15 },
    sync: { url: "", key: "", version: 0, last: 0, links: [] },
    access: { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: false, scanMs: 1500, scanMode: "linear", scanAudio: false, scanLoops: 0, safety: true },
    fl: { optIn: false, version: 0, global: null, local: null, sent: [] },
    emoBase: { n: 0 },
    safety: { consent: false, zones: [], events: [] },
  };
  const storage = makeStorage({ "luminaac:bridge": craftedDb, "luminaac:log": [] });

  globalThis.document = doc;
  globalThis.window = win;
  globalThis.localStorage = storage;
  globalThis.location = { hash: "" };
  globalThis.history = { replaceState() {} };
  globalThis.Option = function Option(text, value) {
    return createMockElement("option", { textContent: text, attrs: { value }, ownerDoc: doc });
  };
  globalThis.addEventListener = (type, fn) => win.addEventListener(type, fn);

  try {
    const q = `?xss=${Date.now()}`;
    await import(`../../bridge.js${q}`);
    await import(`../../bridge-plus.js${q}`);

    // renderToday() ran at boot
    const escapedPayload = "&lt;img src=x onerror=alert(1)&gt;";
    const momentsEl = doc.getElementById("moments");
    assert.equal(momentsEl.querySelectorAll("img").length, 0, "bridge.js renderToday() must escape m.dur");
    assert.ok(momentsEl.textContent.includes(escapedPayload), "Escaped m.dur text should render as &lt;img...&gt;");

    // Trigger renderVocab() by switching to vocab tab
    tabVocabBtn.dispatchEvent({ type: "click" });
    const momentPickEl = doc.getElementById("momentPick");
    assert.equal(momentPickEl.querySelectorAll("img").length, 0, "bridge.js renderVocab() must escape m.id");
    assert.equal(momentPickEl.querySelectorAll("option").length, 2);
    assert.ok(momentPickEl.querySelectorAll("option")[1].getAttribute("value").includes(escapedPayload));

    // renderAlerts() ran on bridge:show
    const alertBarEl = doc.getElementById("alertBar");
    assert.equal(alertBarEl.querySelectorAll("img").length, 0, "bridge-plus.js renderAlerts() must escape a.loc");
    assert.ok(alertBarEl.textContent.includes(escapedPayload), "Escaped a.loc.acc should render as &lt;img...&gt;");
    assert.equal(alertBarEl.querySelectorAll("a").length, 1, "Invalid non-numeric lat/lng loc must not render an unsafe link");
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    globalThis.localStorage = prevStorage;
    globalThis.location = prevLocation;
    globalThis.history = prevHistory;
    globalThis.Option = prevOption;
    globalThis.addEventListener = prevAddEventListener;
  }
});

test("Remediation 16: access.js excludes #careBtn from items(), clears .scan-hi during 400ms gap, cleans up multi-pointerdown, and guards dwell", async () => {
  const { createAccessController } = await import("../../access.js");

  // 1. #careBtn excluded from items(), .nav-bridge preserved, 400ms gap prevents double-activation
  {
    const { doc, win, body } = createMockEnv();
    let cfg = { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: true, scanMs: 2000, scanMode: "linear", scanAudio: false, scanLoops: 0 };

    const nav = createMockElement("nav", { className: "nav", ownerDoc: doc });
    const talkNav = createMockElement("button", { className: "nav-btn", textContent: "Talk", ownerDoc: doc });
    const bridgeNav = createMockElement("a", { className: "nav-btn nav-bridge", textContent: "Bridge", ownerDoc: doc });
    const careBtn = createMockElement("button", { id: "careBtn", className: "nav-btn nav-care", textContent: "Caregiver", ownerDoc: doc });
    nav.append(talkNav, bridgeNav, careBtn);

    const main = createMockElement("main", { ownerDoc: doc });
    const talkView = createMockElement("section", { id: "view-talk", className: "view", ownerDoc: doc });
    const t1 = createMockElement("button", { className: "tile", textContent: "more", ownerDoc: doc });
    const t2 = createMockElement("button", { className: "tile", textContent: "help", ownerDoc: doc });
    talkView.append(t1, t2);
    main.append(talkView);
    body.append(nav, main);

    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.apply(true);

    try {
      const scanList = ctrl.items();
      assert.ok(scanList.includes(t1));
      assert.ok(scanList.includes(talkNav));
      assert.ok(scanList.includes(bridgeNav), ".nav-bridge link remains scannable");
      assert.equal(scanList.includes(careBtn), false, "#careBtn (2s hold) MUST be excluded from items()");

      // Advance to t1, then first Enter activates t1 and clears .scan-hi during 400ms resumeTimer gap
      while (!t1.classList.contains("scan-hi")) ctrl.step(1);
      assert.equal(t1.classList.contains("scan-hi"), true);
      ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
      assert.equal(t1._clicks, 1);
      assert.equal(t1.classList.contains("scan-hi"), false, ".scan-hi must be cleared during 400ms gap");

      // Second Enter within 400ms must NOT double-activate t1
      ctrl.handleKeydown({ key: "Enter", preventDefault() {} });
      assert.equal(t1._clicks, 1, "Second Enter during 400ms gap must NOT double-click t1");
    } finally {
      ctrl.destroy();
    }
  }

  // 2. Sequential multi-pointerdown clears .pressed/.accepting on previous target + hover dwell stale guard
  {
    const { doc, win, body } = createMockEnv();
    let cfg = { mode: "standard", size: 100, dwell: 40, acceptMs: 80, debounceMs: 0, scan: false, scanMs: 1500, scanMode: "linear", scanAudio: false, scanLoops: 0 };
    const main = createMockElement("main", { ownerDoc: doc });
    const grid = createMockElement("div", { id: "grid", className: "grid", ownerDoc: doc });
    const t1 = createMockElement("button", { className: "tile", rect: { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }, ownerDoc: doc });
    const t2 = createMockElement("button", { className: "tile", rect: { left: 110, top: 0, right: 210, bottom: 100, width: 100, height: 100 }, ownerDoc: doc });
    grid.append(t1, t2);
    main.append(grid);
    body.append(main);

    const ctrl = createAccessController({ doc, win, loadFn: () => ({ access: cfg }), speakFn: () => {} });
    ctrl.setupDomListeners();
    ctrl.apply(true);

    try {
      win.dispatch("pointerdown", { button: 0, pointerId: 1, target: t1, clientX: 50, clientY: 50 }, true);
      assert.equal(t1.classList.contains("pressed"), true);
      assert.equal(t1.classList.contains("accepting"), true);

      // Second pointerdown on t2 without pointerup on t1 cancels t1 cleanly
      win.dispatch("pointerdown", { button: 0, pointerId: 2, target: t2, clientX: 150, clientY: 50 }, true);
      assert.equal(t1.classList.contains("pressed"), false, "t1 .pressed must be cleared on sequential pointerdown");
      assert.equal(t1.classList.contains("accepting"), false, "t1 .accepting must be cleared on sequential pointerdown");
      assert.equal(t2.classList.contains("pressed"), true);

      await new Promise((r) => setTimeout(r, 95));
      assert.equal(t1.classList.contains("accepted"), false, "Cancelled t1 timer must not apply .accepted");
      win.dispatch("pointerup", { pointerId: 2, clientX: 150, clientY: 50 }, true);
      assert.equal(t1._clicks, 0);
      assert.equal(t2._clicks, 1);

      // Hover dwell does not click if target becomes hidden before timer fires
      doc.dispatch("pointerover", { pointerType: "mouse", target: t1 });
      assert.equal(t1.classList.contains("dwelling"), true);
      t1.hidden = true;
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(t1._clicks, 0, "Stale/hidden dwell target must not be clicked");
    } finally {
      ctrl.destroy();
    }
  }
});

test("Remediation 17: bridge.css :root[data-theme='contrast'] & phase4.css dialog#dlgReset satisfy WCAG 2.1 AA/AAA", () => {
  const tokensCss = read("tokens.css");
  const brandCss = read("brand/brand-tokens.css");
  const bridgeCss = read("bridge.css");
  const phase4Css = read("phase4.css");

  const extractMediaDarkTokens = (css) => {
    const m = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}/.exec(css);
    assert.ok(m);
    const vars = {};
    for (const vm of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[vm[1]] = vm[2].trim();
    return vars;
  };

  const day = { ...extractBlockTokens(tokensCss, /:root\s*\{([^}]*)\}/), ...extractBlockTokens(brandCss, /:root\s*\{([^}]*)\}/) };
  const night = { ...day, ...extractBlockTokens(tokensCss, /:root\[data-theme="night"\]\s*\{([^}]*)\}/), ...extractBlockTokens(brandCss, /:root\[data-theme="night"\]\s*\{([^}]*)\}/) };
  const prefersDark = { ...day, ...extractMediaDarkTokens(tokensCss), ...extractMediaDarkTokens(brandCss) };
  const contrast = { ...day, ...extractBlockTokens(tokensCss, /:root\[data-theme="contrast"\]\s*\{([^}]*)\}/), ...extractBlockTokens(brandCss, /:root\[data-theme="contrast"\]\s*\{([^}]*)\}/) };
  const lowArousal = { ...day, ...extractBlockTokens(tokensCss, /:root\[data-theme="low-arousal"\]\s*\{([^}]*)\}/) };

  const resolveColor = (val, theme) => (val.startsWith("var(") ? theme[/var\((--[a-z0-9-]+)/i.exec(val)[1]] : val);
  const contrastRule = (sel) => {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`:root\\[data-theme="contrast"\\]\\s+${escaped}\\s*\\{([^}]*)\\}`).exec(bridgeCss);
    assert.ok(m, `Missing :root[data-theme="contrast"] override for ${sel} in bridge.css`);
    const props = {};
    for (const pm of m[1].matchAll(/([a-z-]+)\s*:\s*([^;]+);/gi)) props[pm[1].toLowerCase()] = pm[2].trim();
    return props;
  };

  const chip = contrastRule(".chip");
  assert.ok(contrastRatio(resolveColor(chip.color, contrast), contrast["--sky-tint"]) >= 4.5);

  const chipPressed = contrastRule('.chip[aria-pressed="true"]');
  assert.ok(contrastRatio(resolveColor(chipPressed.color, contrast), contrast["--sky-deep"]) >= 4.5);

  const btnDanger = contrastRule(".btn.danger");
  assert.ok(contrastRatio(resolveColor(btnDanger.color, contrast), contrast["--alert"]) >= 4.5);

  const btnDangerQuiet = contrastRule(".btn.danger.quiet");
  assert.ok(contrastRatio(resolveColor(btnDangerQuiet.color, contrast), contrast["--paper-raised"]) >= 4.5);

  const moment = contrastRule(".moment");
  assert.ok(contrastRatio(resolveColor(moment.color, contrast), resolveColor(moment.background, contrast)) >= 4.5);

  const alertItem = contrastRule(".alert-item");
  const alertBg = resolveColor(alertItem.background, contrast);
  assert.ok(contrastRatio(resolveColor(alertItem.color, contrast), alertBg) >= 4.5);

  const alertSoft = contrastRule(".alert-item .soft");
  assert.ok(contrastRatio(resolveColor(alertSoft.color, contrast), alertBg) >= 4.5);

  // dialog#dlgReset explicit background & color across all 5 themes
  assert.match(phase4Css, /dialog#dlgReset\s*\{[^}]*background:\s*var\(--paper-raised\)[^}]*color:\s*var\(--ink\)/);
  for (const [name, t] of [["day", day], ["night", night], ["prefersDark", prefersDark], ["contrast", contrast], ["low-arousal", lowArousal]]) {
    assert.ok(contrastRatio(t["--ink"], t["--paper-raised"]) >= 7.0, `dlgReset ${name} contrast < 7.0`);
  }
});
