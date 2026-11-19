// K-Dense-inspired local-first BYOK adapter & deterministic Watchdog guardrail for LuminAAC (Feature 16).
// Routing order:
//   1. "on-device" (default, 0 external egress, calibrated against willwade/AACConversations)
//   2. "ollama"    (http://localhost:11434 local server only; deterministic fallback if offline)
//   3. "api"       (user-supplied API key, ONLY when egressAck === true; every response filtered by Watchdog)

export const MAX_EXPAND_CHARS = 120;

const UNSAFE_PATTERNS = [
  /https?:\/\//i,
  /\bwww\.[a-z0-9.-]+\.[a-z]{2,}/i,
  /\b\d{3}[-.\s]\d{4}\b/,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  /\S+@\S+\.\S+/,
  /\b(hurt yourself|kill yourself|suicide|self[- ]harm|die|damn|shit|fuck|bitch|asshole|crap|bastard)\b/i,
];

const PRONOUN_STOPWORDS = new Set(["i", "my", "me", "we", "you", "a", "an", "the", "to", "please"]);

function normalizeInputWords(inputWords) {
  if (Array.isArray(inputWords)) {
    return inputWords.flatMap((w) => String(w ?? "").trim().split(/\s+/)).filter(Boolean);
  }
  return String(inputWords ?? "").trim().split(/\s+/).filter(Boolean);
}

export function watchdogCheck(candidate, inputWords = []) {
  const text = String(candidate ?? "").trim();
  if (!text || text.length > MAX_EXPAND_CHARS) return false;

  for (const re of UNSAFE_PATTERNS) {
    if (re.test(text)) return false;
  }

  const tokens = normalizeInputWords(inputWords).map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, "")).filter(Boolean);
  const lowText = text.toLowerCase();

  // 1. Protest / stop preservation: never drop "stop"
  if (tokens.includes("stop") && !/\b(stop|pause|wait)\b/i.test(lowText)) {
    return false;
  }

  // 2. Negation preservation: never flip "no" / "not" / "don't" into an affirmative sentence
  const hasNegation = tokens.some((t) => ["no", "not", "don't", "dont", "never"].includes(t));
  if (hasNegation && !/\b(no|not|don't|dont|do not|never|none)\b/i.test(lowText)) {
    return false;
  }

  // 3. Core intent preservation: at least 1 meaningful content word from input must survive
  const contentTokens = tokens.filter((t) => !PRONOUN_STOPWORDS.has(t));
  const checkList = contentTokens.length ? contentTokens : tokens;
  if (checkList.length > 0) {
    const preserved = checkList.some((w) => {
      if (lowText.includes(w)) return true;
      const stem = w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
      return stem.length >= 3 && lowText.includes(stem);
    });
    if (!preserved) return false;
  }

  return true;
}
export const validateExpansion = watchdogCheck;

// Deterministic expansion calibrated on AACConversations telegraphic patterns.
export function deterministicExpand(inputWords = [], context = {}) {
  void context;
  const rawList = Array.isArray(inputWords)
    ? inputWords.map((w) => String(w ?? "").trim()).filter(Boolean)
    : String(inputWords ?? "").trim().split(/\s+/).filter(Boolean);
  if (!rawList.length) return [];

  const joined = rawList.join(" ");
  const low = joined.toLowerCase();
  const candidates = [];

  if (/\b(want|need)\b/.test(low) && /\b(drink|water|juice|milk)\b/.test(low)) {
    candidates.push(`I ${rawList.join(" ")}, please.`);
    candidates.push("I want to drink some water, please.");
  }
  if (/\bgo\b/.test(low) && /\bpark\b/.test(low)) {
    candidates.push("Can we go to the park, please?");
    candidates.push("I want to go to the park, please.");
  }
  if (/\bstop\b/.test(low) && /\bloud\b/.test(low)) {
    candidates.push("Please stop, it is too loud. I need my headphones.");
    candidates.push("Stop please, it's too loud for me.");
  }
  if (/\b(stomach|tummy|head|ear|ears|throat)\b/.test(low) && /\bhurt/.test(low)) {
    candidates.push("My stomach hurts. Can you help me?");
    candidates.push(`${joined.charAt(0).toUpperCase() + joined.slice(1)}s, please help.`);
  }
  if (/\ball done\b/.test(low) && /\bplay\b/.test(low)) {
    candidates.push("I am all done eating. Can I go play now?");
  }
  if (/\bno\b/.test(low) && /\blike\b/.test(low)) {
    const obj = rawList.filter((w) => !/^(no|not|don't|like|i)$/i.test(w)).join(" ") || "that";
    candidates.push(`No thank you, I don't like ${obj}.`);
  }

  // Generic natural templates preserving every input word
  const cap = joined.charAt(0).toUpperCase() + joined.slice(1);
  if (!/^(i|my|we|can|please|no|stop)\b/i.test(joined)) {
    candidates.push(`I would like ${joined}, please.`);
  }
  candidates.push(/[.!?]$/.test(cap) ? cap : `${cap}, please.`);
  candidates.push(/[.!?]$/.test(cap) ? cap : `${cap}.`);

  const valid = [];
  const seen = new Set();
  for (const c of candidates) {
    const trimmed = c.slice(0, MAX_EXPAND_CHARS).trim();
    if (!seen.has(trimmed.toLowerCase()) && watchdogCheck(trimmed, rawList)) {
      seen.add(trimmed.toLowerCase());
      valid.push(trimmed);
    }
  }
  if (!valid.length) {
    const fallback = joined.slice(0, MAX_EXPAND_CHARS);
    valid.push(fallback);
  }
  return valid.slice(0, 3);
}

export async function expandUtterance(words, opts = {}) {
  const {
    mode = "on-device",
    context = {},
    apiKey = "",
    endpoint = "https://openrouter.ai/api/v1/chat/completions",
    model = "qwen2.5:0.5b",
    egressAck = false,
  } = opts;

  const fallbackList = deterministicExpand(words, context);
  const toResult = (list, extra = {}) => ({
    mode,
    text: list[0] || "",
    candidates: list.map((t) => ({ text: t, source: extra.source || mode })),
    ...extra,
  });

  // 1. Default On-Device mode: zero external fetch calls
  if (mode === "on-device") {
    return toResult(fallbackList, { fallback: false, source: "on-device" });
  }

  // 2. Local Ollama mode: strictly localhost:11434 only
  if (mode === "ollama") {
    try {
      const res = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: `Expand these AAC words into one short first-person sentence (<= 100 chars): ${(Array.isArray(words) ? words : [words]).join(" ")}`,
          stream: false,
        }),
      });
      if (res?.ok) {
        const j = await res.json();
        const cand = String(j?.response || "").trim();
        if (watchdogCheck(cand, words)) {
          return toResult([cand, ...fallbackList].slice(0, 3), { fallback: false, source: "ollama" });
        }
      }
    } catch {
      // Unreachable local Ollama falls back deterministically
    }
    return toResult(fallbackList, { fallback: true, source: "fallback" });
  }

  // 3. User-supplied API Key mode: requires explicit egressAck === true and non-empty apiKey
  if (mode === "api") {
    if (egressAck !== true) {
      return toResult(fallbackList, {
        egressBlocked: true,
        fallback: true,
        error: "Explicit egress acknowledgement (egressAck: true) is required before sending AAC words off-device.",
        source: "fallback",
      });
    }
    if (!apiKey || !String(apiKey).trim()) {
      return toResult(fallbackList, {
        fallback: true,
        error: "API key is required for external BYOK mode.",
        source: "fallback",
      });
    }
    try {
      const safeEndpoint = String(endpoint || "https://openrouter.ai/api/v1/chat/completions");
      const res = await fetch(safeEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${String(apiKey).trim()}`,
        },
        body: JSON.stringify({
          model: opts.apiModel || "meta-llama/llama-3.2-1b-instruct",
          messages: [
            { role: "system", content: "Expand the user's telegraphic AAC words into one short, safe first-person sentence under 100 characters." },
            { role: "user", content: (Array.isArray(words) ? words : [words]).join(" ") },
          ],
          max_tokens: 40,
          temperature: 0.2,
        }),
      });
      if (res?.ok) {
        const j = await res.json();
        const cand = String(j?.choices?.[0]?.message?.content || "").trim();
        if (watchdogCheck(cand, words)) {
          return toResult([cand, ...fallbackList].slice(0, 3), { fallback: false, source: "api" });
        }
        return toResult(fallbackList, { fallback: true, watchdogRejected: true, source: "fallback" });
      }
    } catch {
      // Network failure falls back deterministically
    }
    return toResult(fallbackList, { fallback: true, source: "fallback" });
  }

  return toResult(fallbackList, { fallback: true, source: "fallback" });
}
