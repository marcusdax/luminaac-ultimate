// Sentence helper providers (milestone M3). Local first; nothing leaves the device
// unless a grown-up picks "your own key" and ticks that they understand.
//
//   off      the helper button doesn't show (default)
//   rules    built-in rules, on this device, no download
//   device   SmolLM2-135M on this device (downloads about 118 MB once)
//   ollama   Ollama running on this computer (http://localhost:11434), nothing leaves it
//   key      an OpenAI-compatible service with the family's own API key. Only the
//            message words are sent. Nothing else about the child.
//
// Whatever answers, expand-core.js checks every sentence (watchdog) and falls back
// to the built-in rules if the provider fails, is slow, or says nothing usable.
import { expandRules, parseModelText, choose, prompt } from "./expand-core.js";

const KEY = "luminaac:byok"; // kept apart from settings, so "Download my data" never includes the key
export const PROVIDERS = { off: "Off", rules: "Built-in rules (on this device)", device: "Small model on this device (downloads about 118 MB once)", ollama: "Ollama on this computer", key: "A service with your own API key (sends the message words)" };
export function loadCfg() {
  try { return { provider: "off", url: "https://api.openai.com/v1", model: "gpt-4o-mini", ollamaModel: "llama3.2:1b", key: "", consent: false, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return { provider: "off", url: "", model: "", ollamaModel: "", key: "", consent: false }; }
}
export function saveCfg(cfg) { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {} }

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), ms))]);

async function ask(cfg, input) {
  if (cfg.provider === "device") {
    const ai = await import("./ai.js");
    return (await withTimeout(ai.expandText(prompt(input)), 20000)).text;
  }
  if (cfg.provider === "ollama") {
    const r = await withTimeout(fetch("http://localhost:11434/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: cfg.ollamaModel || "llama3.2:1b", prompt: prompt(input), stream: false, options: { temperature: 0.2 } }) }), 8000);
    if (!r.ok) throw new Error(`Ollama said ${r.status}`);
    return (await r.json()).response;
  }
  if (cfg.provider === "key") {
    if (!cfg.consent) throw new Error("Sending words to a service needs a grown-up's OK first");
    if (!cfg.key || !/^https:\/\//.test(cfg.url || "")) throw new Error("Add the service address (https) and key in Caregiver");
    const r = await withTimeout(fetch(cfg.url.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, temperature: 0.2, max_tokens: 80, messages: [{ role: "user", content: prompt(input) }] }),
    }), 8000);
    if (!r.ok) throw new Error(`The service said ${r.status}`);
    return (await r.json()).choices?.[0]?.message?.content || "";
  }
  return "";
}

// items: the strip's words [{ w, c }]. Returns { sentences, source, note }.
export async function expand(items, cfg = loadCfg()) {
  const input = items.map((x) => x.say || x.w).join(" ");
  const rules = expandRules(items);
  if (cfg.provider === "off" || cfg.provider === "rules") return { sentences: choose(items, rules), source: "rules", note: "" };
  try {
    const got = choose(items, [...parseModelText(await ask(cfg, input)), ...rules]);
    return { sentences: got, source: cfg.provider, note: "" };
  } catch (e) {
    return { sentences: choose(items, rules), source: "rules", note: `${PROVIDERS[cfg.provider].split(" (")[0]} didn't answer (${e.message}), so these come from the built-in rules.` };
  }
}
