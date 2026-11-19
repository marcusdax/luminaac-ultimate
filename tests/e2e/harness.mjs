import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const EXTERNAL_BLOCK_PATTERNS = [
  "*://fonts.googleapis.com/*",
  "*://fonts.gstatic.com/*",
  "*://api.arasaac.org/*",
  "*://static.arasaac.org/*",
  "*://tile.openstreetmap.org/*",
  "*://*.tile.openstreetmap.org/*",
  "*://cdn.jsdelivr.net/*",
  "*://huggingface.co/*",
  "*://*.huggingface.co/*",
  "*://example.invalid/*",
];

const activeChildren = new Set();
const activeTempDirs = new Set();

function cleanupAll() {
  for (const child of activeChildren) {
    try { child.kill("SIGKILL"); } catch {}
  }
  activeChildren.clear();
  for (const dir of activeTempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  activeTempDirs.clear();
}

process.once("exit", cleanupAll);

export function makeTempDir(prefix = "luminaac-e2e-") {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  activeTempDirs.add(dir);
  return dir;
}

export function removeTempDir(dir) {
  if (!dir) return;
  activeTempDirs.delete(dir);
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
  } catch {}
}

export async function loadAppModule(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!existsSync(abs)) {
    assert.fail(`Missing expected module "${relPath}" at ${abs}`);
  }
  const url = `${pathToFileURL(abs).href}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return import(url);
}

// ============================================================================
// 1. Static File Server (127.0.0.1:0, strict MIME types, traversal guard)
// ============================================================================
export async function startStaticServer(rootDir = ROOT) {
  const resolvedRoot = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(reqUrl.pathname);
      if (rel === "/") rel = "/index.html";
      const normalized = path.posix.normalize(rel);
      if (normalized.includes("..")) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      const target = path.resolve(resolvedRoot, "." + normalized);
      if (!target.startsWith(resolvedRoot + path.sep) && target !== resolvedRoot) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
      }
      if (!existsSync(target)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }
      const ext = path.extname(target).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      const data = readFileSync(target);
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err?.message || err));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    port: addr.port,
    server,
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// ============================================================================
// 2. Isolated Backend Launcher (avoids PORT=0 || 3001 trap)
// ============================================================================
export async function startBackend() {
  const dataDir = makeTempDir("luminaac-be-");
  const bootScript = `
    import { server } from "./backend/server.js";
    server.listen(0, "127.0.0.1", () => {
      console.log("LUMINAAC_PORT:" + server.address().port);
    });
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", bootScript], {
    cwd: ROOT,
    env: {
      ...process.env,
      LUMINAAC_NO_LISTEN: "1",
      LUMINAAC_DATA: dataDir,
      LUMINAAC_QUIET: "1",
      DEADMAN_CHECK_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeChildren.add(child);

  const port = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`Backend timed out starting. stdout=${stdout} stderr=${stderr}`));
    }, 10000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const m = /LUMINAAC_PORT:(\d+)/.exec(stdout);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Backend exited prematurely (${code}). stderr=${stderr}`));
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    port,
    dataDir,
    async request(method, apiPath, body, token) {
      const headers = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}${apiPath}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, ok: res.ok, json, text, headers: res.headers };
    },
    async close() {
      activeChildren.delete(child);
      if (child.exitCode === null && !child.killed) {
        child.kill();
        await new Promise((resolve) => {
          const t = setTimeout(() => {
            try { child.kill("SIGKILL"); } catch {}
            resolve();
          }, 2000);
          child.once("exit", () => {
            clearTimeout(t);
            resolve();
          });
        });
      }
      removeTempDir(dataDir);
    },
  };
}

export async function createFamilyAuth(backend, opts = {}) {
  const email = opts.email || `parent-${Math.random().toString(36).slice(2)}@example.test`;
  const password = opts.password || "test-pass-12345";
  const reg = await backend.request("POST", "/api/auth/register", {
    email,
    password,
    name: opts.name || "Caregiver",
    familyName: opts.familyName || "Test Family",
    childName: opts.childName || "Sam",
  });
  assert.equal(reg.status, 200, `register failed: ${reg.text}`);
  const parentToken = reg.json.data.token;

  const pairChild = await backend.request("POST", "/api/devices/pair", { kind: "myvoice" }, parentToken);
  assert.equal(pairChild.status, 200, `pair child failed: ${pairChild.text}`);
  const claimChild = await backend.request("POST", "/api/devices/claim", {
    code: pairChild.json.data.code,
    name: "Sam's Tablet",
  });
  assert.equal(claimChild.status, 200, `claim child failed: ${claimChild.text}`);

  const pairBridge = await backend.request("POST", "/api/devices/pair", { kind: "bridge" }, parentToken);
  assert.equal(pairBridge.status, 200);
  const claimBridge = await backend.request("POST", "/api/devices/claim", {
    code: pairBridge.json.data.code,
    name: "Caregiver Phone",
  });
  assert.equal(claimBridge.status, 200);

  return {
    email,
    parentToken,
    childToken: claimChild.json.data.deviceKey,
    childDeviceId: claimChild.json.data.deviceId,
    bridgeToken: claimBridge.json.data.deviceKey,
    bridgeDeviceId: claimBridge.json.data.deviceId,
    familyId: reg.json.data.family,
  };
}

// ============================================================================
// 3. Headless Chrome CDP Controller (Node 24 native WebSocket)
// ============================================================================
export function findChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error("No Chrome/Edge binary found; set CHROME_BIN");
}

const KEY_CODES = {
  " ": { code: "Space", key: " ", text: " ", keyCode: 32 },
  Enter: { code: "Enter", key: "Enter", text: "\r", keyCode: 13 },
  Tab: { code: "Tab", key: "Tab", keyCode: 9 },
  Escape: { code: "Escape", key: "Escape", keyCode: 27 },
  Backspace: { code: "Backspace", key: "Backspace", keyCode: 8 },
  ArrowRight: { code: "ArrowRight", key: "ArrowRight", keyCode: 39 },
  ArrowLeft: { code: "ArrowLeft", key: "ArrowLeft", keyCode: 37 },
  ArrowDown: { code: "ArrowDown", key: "ArrowDown", keyCode: 40 },
  ArrowUp: { code: "ArrowUp", key: "ArrowUp", keyCode: 38 },
};

class CDPConnection {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        this.ws.removeEventListener("error", onError);
        resolve();
      };
      const onError = (e) => {
        this.ws.removeEventListener("open", onOpen);
        reject(new Error(`CDP WebSocket error: ${e?.message || "failed"}`));
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("error", onError);
    });

    this.ws.addEventListener("message", (evt) => {
      const msg = JSON.parse(typeof evt.data === "string" ? evt.data : evt.data.toString());
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(`CDP ${p.method} error: ${msg.error.message}`));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        const key = `${msg.sessionId || ""}:${msg.method}`;
        const list = this.listeners.get(key);
        if (list) {
          for (const fn of [...list]) fn(msg.params);
        }
      }
    });

    this.ws.addEventListener("close", () => {
      for (const [, p] of this.pending) {
        p.reject(new Error("CDP WebSocket closed"));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, fn, sessionId = undefined) {
    const key = `${sessionId || ""}:${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(fn);
    return () => this.listeners.get(key)?.delete(fn);
  }

  once(method, sessionId = undefined, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const off = this.on(method, (params) => {
        clearTimeout(timer);
        off();
        resolve(params);
      }, sessionId);
    });
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

class CDPPage {
  constructor(cdp, targetId, sessionId, contextId) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.contextId = contextId;
    this.closed = false;
  }

  send(method, params = {}) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async addInitScript(fnOrCode, ...args) {
    const source = typeof fnOrCode === "function"
      ? `(${fnOrCode.toString()})(...${JSON.stringify(args)});`
      : String(fnOrCode);
    await this.send("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  async installSpeechSpy() {
    await this.addInitScript(() => {
      window.__speechCalls = [];
      window.__speechCancels = 0;
      const syntheticVoices = [
        { name: "Child Friendly US", lang: "en-US", default: true, localService: true, voiceURI: "Child Friendly US" },
        { name: "Calm British", lang: "en-GB", default: false, localService: true, voiceURI: "Calm British" },
      ];
      class FakeUtterance {
        constructor(text = "") {
          this.text = String(text);
          this.lang = "en-US";
          this.voice = null;
          this.volume = 1;
          this.rate = 1;
          this.pitch = 1;
          this.onstart = null;
          this.onend = null;
          this.onerror = null;
          this.onboundary = null;
        }
      }
      window.SpeechSynthesisUtterance = FakeUtterance;
      const synth = {
        speaking: false,
        pending: false,
        paused: false,
        onvoiceschanged: null,
        getVoices() { return syntheticVoices; },
        cancel() {
          window.__speechCancels += 1;
          synth.speaking = false;
        },
        pause() { synth.paused = true; },
        resume() { synth.paused = false; },
        speak(u) {
          const text = u?.text ?? String(u ?? "");
          window.__speechCalls.push({
            text,
            rate: u?.rate ?? 1,
            pitch: u?.pitch ?? 1,
            volume: u?.volume ?? 1,
            voice: u?.voice?.name || u?.voice || null,
            lang: u?.lang || "en-US",
            ts: Date.now(),
          });
          synth.speaking = true;
          setTimeout(() => {
            try { u?.onstart?.({ utterance: u }); } catch {}
            const words = text.split(/\s+/).filter(Boolean);
            let charIndex = 0;
            for (const w of words) {
              const idx = text.indexOf(w, charIndex);
              try { u?.onboundary?.({ name: "word", charIndex: idx >= 0 ? idx : charIndex, charLength: w.length }); } catch {}
              charIndex = (idx >= 0 ? idx : charIndex) + w.length;
            }
            synth.speaking = false;
            try { u?.onend?.({ utterance: u }); } catch {}
          }, 15);
        },
      };
      try {
        Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
      } catch {}
    });
  }

  async setOffline(offline) {
    await this.send("Network.emulateNetworkConditions", {
      offline: Boolean(offline),
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }

  async setBlockedURLs(urls) {
    await this.send("Network.setBlockedURLs", { urls });
  }

  async goto(url) {
    const loadPromise = this.cdp.once("Page.loadEventFired", this.sessionId, 15000);
    await this.send("Page.navigate", { url });
    await loadPromise;
    await new Promise((r) => setTimeout(r, 60));
  }

  async reload() {
    const loadPromise = this.cdp.once("Page.loadEventFired", this.sessionId, 15000);
    await this.send("Page.reload", { ignoreCache: true });
    await loadPromise;
    await new Promise((r) => setTimeout(r, 60));
  }

  async evaluate(fnOrExpr, ...args) {
    const expression = typeof fnOrExpr === "function"
      ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`
      : String(fnOrExpr);
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const msg = res.exceptionDetails.exception?.description || res.exceptionDetails.text || "Evaluation error";
      throw new Error(`Browser evaluate failed: ${msg}`);
    }
    return res.result?.value;
  }

  async waitForFunction(fn, timeoutMs = 4000, ...args) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ok = await this.evaluate(fn, ...args);
      if (ok) return ok;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`waitForFunction timed out after ${timeoutMs}ms`);
  }

  async waitForSelector(selector, timeoutMs = 4000) {
    return this.waitForFunction(
      (sel) => Boolean(document.querySelector(sel)),
      timeoutMs,
      selector
    );
  }

  async getBox(selector) {
    const box = await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      return {
        x: r.left,
        y: r.top,
        width: r.width,
        height: r.height,
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
      };
    }, selector);
    if (!box) throw new Error(`Element not found: ${selector}`);
    if (box.width <= 0 || box.height <= 0) {
      throw new Error(`Element has zero box dimensions: ${selector}`);
    }
    return box;
  }

  async click(selector) {
    const box = await this.getBox(selector);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx, y: box.cy });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.cx, y: box.cy, button: "left", clickCount: 1 });
  }

  async tapAndHold(selector, holdMs) {
    const box = await this.getBox(selector);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx, y: box.cy });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1 });
    await new Promise((r) => setTimeout(r, holdMs));
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.cx, y: box.cy, button: "left", clickCount: 1 });
  }

  async tapAndSlideOut(selector, offset = 60) {
    const box = await this.getBox(selector);
    const outX = box.x + box.width + offset;
    const outY = box.y + box.height + offset;
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.cx, y: box.cy });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.cx, y: box.cy, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: outX, y: outY, button: "left" });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: outX, y: outY, button: "left", clickCount: 1 });
  }

  async typeText(selector, text) {
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("Missing input: " + sel);
      el.focus();
      el.value = "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, selector);
    await this.send("Input.insertText", { text: String(text) });
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      el?.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector);
  }

  async fill(selector, value) {
    await this.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("Missing element: " + sel);
      el.focus();
      el.value = String(val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector, value);
  }

  async press(key) {
    const info = KEY_CODES[key] || {
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      key,
      text: key.length === 1 ? key : undefined,
      keyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    };
    await this.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
      nativeVirtualKeyCode: info.keyCode,
    });
    if (info.text) {
      await this.send("Input.dispatchKeyEvent", {
        type: "char",
        text: info.text,
        unmodifiedText: info.text,
        key: info.key,
        code: info.code,
      });
    }
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.keyCode,
      nativeVirtualKeyCode: info.keyCode,
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try { await this.cdp.send("Target.closeTarget", { targetId: this.targetId }); } catch {}
  }
}

export async function launchBrowser() {
  const bin = findChromeBinary();
  const userDataDir = makeTempDir("luminaac-chrome-");
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-crash-reporter",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-sandbox",
    "--window-size=1280,900",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ];
  const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  activeChildren.add(proc);

  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`Chrome launch timed out. stderr=${stderr}`));
    }, 15000);
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely (${code}). stderr=${stderr}`));
    });
  });

  const cdp = new CDPConnection(wsUrl);
  await cdp.connect();

  return {
    cdp,
    async newContext({ blockExternal = true } = {}) {
      const { browserContextId } = await cdp.send("Target.createBrowserContext");
      const pages = [];
      return {
        browserContextId,
        async newPage({ url } = {}) {
          const { targetId } = await cdp.send("Target.createTarget", {
            url: "about:blank",
            browserContextId,
          });
          const { sessionId } = await cdp.send("Target.attachToTarget", {
            targetId,
            flatten: true,
          });
          const page = new CDPPage(cdp, targetId, sessionId, browserContextId);
          pages.push(page);
          await page.send("Page.enable");
          await page.send("Runtime.enable");
          await page.send("DOM.enable");
          await page.send("Network.enable");
          if (blockExternal) {
            await page.setBlockedURLs(EXTERNAL_BLOCK_PATTERNS);
          }
          if (url) await page.goto(url);
          return page;
        },
        async close() {
          for (const p of pages) await p.close();
          try { await cdp.send("Target.disposeBrowserContext", { browserContextId }); } catch {}
        },
      };
    },
    async close() {
      try { await Promise.race([cdp.send("Browser.close"), new Promise((r) => setTimeout(r, 800))]); } catch {}
      cdp.close();
      activeChildren.delete(proc);
      if (proc.exitCode === null && !proc.killed) {
        await new Promise((resolve) => {
          const t = setTimeout(() => {
            if (process.platform === "win32" && proc.pid) {
              const killer = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
              killer.once("exit", resolve);
              killer.once("error", resolve);
            } else {
              try { proc.kill("SIGKILL"); } catch {}
              resolve();
            }
          }, 1500);
          proc.once("exit", () => {
            clearTimeout(t);
            resolve();
          });
        });
      }
      await new Promise((r) => setTimeout(r, 80));
      removeTempDir(userDataDir);
    },
  };
}

// ============================================================================
// 4. Pure-Node Zero-Dep ZIP Builder (for .obz archives)
// ============================================================================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, compress = true } of entries) {
    const raw = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    const body = compress ? deflateRawSync(raw) : raw;
    const method = compress ? 8 : 0;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(name, "utf8");

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0x0800, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18);
    lfh.writeUInt32LE(raw.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lfh, nameBuf, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0x0800, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt32LE(offset, 42);
    centrals.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

// ============================================================================
// 5. WCAG 2.2 Relative Luminance & CSS Token Parser
// ============================================================================
export function parseColor(str) {
  const s = String(str || "").trim().toLowerCase();
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(s);
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  throw new Error(`Unsupported color literal: ${str}`);
}

export function alphaComposite(fg, bg) {
  const a = fg.a ?? 1;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }) {
  const chan = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function contrastRatio(fgColor, bgColor) {
  const fg = typeof fgColor === "string" ? parseColor(fgColor) : fgColor;
  const bg = typeof bgColor === "string" ? parseColor(bgColor) : bgColor;
  const effFg = (fg.a ?? 1) < 1 ? alphaComposite(fg, bg) : fg;
  const l1 = relativeLuminance(effFg);
  const l2 = relativeLuminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function extractThemeVars(tokensCssText) {
  const cleaned = tokensCssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const extractBlock = (pattern) => {
    const m = pattern.exec(cleaned);
    if (!m) return {};
    const vars = {};
    const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let vm;
    while ((vm = re.exec(m[1])) !== null) {
      vars[vm[1]] = vm[2].trim();
    }
    return vars;
  };
  const day = extractBlock(/:root\s*\{([^}]*)\}/);
  const nightVars = extractBlock(/:root\[data-theme="night"\]\s*\{([^}]*)\}/);
  const contrastVars = extractBlock(/:root\[data-theme="contrast"\]\s*\{([^}]*)\}/);
  return {
    day,
    night: { ...day, ...nightVars },
    contrast: { ...day, ...contrastVars },
  };
}

export function resolveCssValue(val, vars, depth = 0) {
  if (depth > 8) return val;
  const v = String(val || "").trim();
  const m = /^var\(\s*(--[a-z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)$/i.exec(v);
  if (!m) return v;
  const target = vars[m[1]];
  if (target !== undefined) return resolveCssValue(target, vars, depth + 1);
  if (m[2] !== undefined) return resolveCssValue(m[2], vars, depth + 1);
  return v;
}

// ============================================================================
// 6. Shared Domain Test Vectors & Fixtures
// ============================================================================
export const VALID_OBF = {
  format: "open-board-0.1",
  id: "core_sample",
  locale: "en",
  name: "Sample Core + Actions",
  buttons: [
    { id: "b1", label: "I", vocalization: "I", background_color: "rgb(255, 243, 196)", border_color: "rgb(180, 130, 0)", ext_luminaac_pos: "people" },
    { id: "b2", label: "want", background_color: "rgb(212, 245, 221)", border_color: "rgb(30, 130, 76)", ext_luminaac_pos: "action" },
    { id: "b3", label: "drink", vocalization: "I want a drink", image_id: "img_missing_offline", ext_luminaac_pos: "action" },
    { id: "b4", label: "Food", load_board: { id: "food_board", path: "boards/food.obf" }, ext_luminaac_pos: "thing" },
    { id: "b5", label: "Speak", action: ":speak" },
    { id: "b6", label: "Back", action: ":backspace" },
    { id: "b7", label: "Clear", action: ":clear" },
    { id: "b8", label: "Home", action: ":home" },
    { id: "b9", label: "Space", action: ":space" },
  ],
  grid: {
    rows: 3,
    columns: 3,
    order: [
      ["b1", "b2", "b3"],
      ["b4", "b5", "b6"],
      ["b7", "b8", "b9"],
    ],
  },
  images: [
    { id: "img_missing_offline", url: "https://example.invalid/404.png", content_type: "image/png" },
  ],
  sounds: [],
};

export const FOOD_OBF = {
  format: "open-board-0.1",
  id: "food_board",
  locale: "en",
  name: "Food",
  buttons: [
    { id: "f1", label: "apple", vocalization: "I want an apple", ext_luminaac_pos: "thing" },
    { id: "f2", label: "water", ext_luminaac_pos: "thing" },
    { id: "f3", label: "Home", action: ":home" },
  ],
  grid: { rows: 1, columns: 3, order: [["f1", "f2", "f3"]] },
  images: [],
  sounds: [],
};

export const VALID_OBZ_ENTRIES = [
  {
    name: "manifest.json",
    data: JSON.stringify({
      format: "open-board-0.1",
      root: "boards/root.obf",
      paths: {
        boards: {
          core_sample: "boards/root.obf",
          food_board: "boards/food.obf",
        },
        images: {},
        sounds: {},
      },
    }),
  },
  { name: "boards/root.obf", data: JSON.stringify(VALID_OBF) },
  { name: "boards/food.obf", data: JSON.stringify(FOOD_OBF) },
];

export const AAC_CONVERSATION_VECTORS = [
  { words: ["I", "want", "drink", "water"], context: { place: "home", pod: "afternoon" }, mustPreserve: ["water", "drink"] },
  { words: ["go", "park", "please"], context: { place: "home", pod: "morning" }, mustPreserve: ["park", "go"] },
  { words: ["stop", "too loud", "headphones"], context: { place: "school", pod: "morning" }, mustPreserve: ["stop", "headphones"] },
  { words: ["my", "stomach", "hurt"], context: { place: "school", pod: "afternoon" }, mustPreserve: ["stomach", "hurt"] },
  { words: ["all done", "eat", "play"], context: { place: "home", pod: "evening" }, mustPreserve: ["play", "eat"] },
  { words: ["no", "like", "sandwich"], context: { place: "school", pod: "afternoon" }, mustPreserve: ["sandwich", "no", "don't"] },
];

export const WATCHDOG_ADVERSARIAL_VECTORS = [
  {
    name: "exceeds_120_chars",
    input: ["I", "want", "water"],
    candidate: "I really would like to ask if perhaps we could go to the kitchen right now to get a very large glass of cold filtered water please thank you very much indeed.",
  },
  {
    name: "drops_intent_flips_negation",
    input: ["no", "park"],
    candidate: "Let's go to the beach today!",
  },
  {
    name: "drops_stop_keyword",
    input: ["stop", "loud"],
    candidate: "Turn the music up louder!",
  },
  {
    name: "unsafe_self_harm_or_profanity",
    input: ["I", "feel", "angry"],
    candidate: "Go hurt yourself damn it",
  },
  {
    name: "pii_or_url_injection",
    input: ["call", "mom"],
    candidate: "Call mom at 555-0199 or visit https://evil.test/phish",
  },
];

export const CLINICAL_LOG_FIXTURE = [
  { ts: 1000, text: "I want water", words: ["I", "want", "water"], mode: "child", actor: "child", fn: "Requesting" },
  { ts: 2000, text: "no stop", words: ["no", "stop"], mode: "child", actor: "child", fn: "Protesting" },
  { ts: 3000, text: "big dog", words: ["big", "dog"], mode: "child", actor: "child", fn: "Commenting" },
  { ts: 4000, text: "hi friend", words: ["hi", "friend"], mode: "child", actor: "child", fn: "Social" },
  { ts: 5000, text: "where mom", words: ["where", "mom"], mode: "child", actor: "child", fn: "Asking" },
  { ts: 6000, text: "you want more pizza", words: ["you", "want", "more", "pizza"], mode: "modeling", actor: "partner", fn: "Modeling" },
];

export const SUPERSEDES_FIXTURE = [
  { id: "rev1", ts: 1000, targetId: "m1", meaning: "Wants apple", by: "parent" },
  { id: "rev2", ts: 2000, targetId: "m1", meaning: "Wants cold apple slices (sensory)", by: "therapist", supersedes: "rev1" },
  { id: "rev3", ts: 3000, targetId: "m1", meaning: "Wants cold peeled apple slices", by: "parent", supersedes: "rev2" },
];
