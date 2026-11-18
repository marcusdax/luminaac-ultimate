// Sentence helper (milestone M3): turn a short message like "want juice" into a few
// fuller sentences the child can choose from ("I want juice, please"). Pure functions.
//
// Off until a grown-up turns it on. Whatever writes the sentences (the built-in rules,
// a small on-device model, Ollama on this computer, or a service with the family's
// own key), every sentence goes through watchdog() first. It keeps only sentences
// that use every word the child chose, in the same order, add nothing but small
// helper words, keep yes/no meaning the same, and stay short. The child's own words
// always stay on the list, first.

// Words a sentence may add. Nothing here is a thing, a person or an action of its own
// apart from the asking verbs (want, have, like, need) that make a request.
export const HELPERS = new Set(("i me my we you can could may have want would like need please to the a an some it is am are " +
  "let's let us go this that").split(" "));
const NEG = /\b(no|not|don't|dont|never|nothing|stop)\b/i;
const toks = (t) => String(t || "").toLowerCase().replace(/[.,!?]/g, " ").replace(/\bi'm\b/g, "i am").match(/[a-z']+/g) || [];
// "eats" and "eating" still count as the child's "eat"; "children" as "child".
// A few words a sentence may say another way without changing the meaning:
// "want juice" -> "Can I have juice?", "no bath" -> "I don't want a bath".
const ALSO = { want: ["have", "like"], no: ["not", "don't", "dont", "never"], not: ["no", "don't", "dont"], "don't": ["not", "no"] };
const same = (a, b) => a === b || a.replace(/(ing|ed|es|s)$/, "") === b.replace(/(ing|ed|es|s)$/, "") || (ALSO[b] || []).includes(a);

export function watchdog(input, candidate) {
  const want = toks(input), got = toks(candidate);
  if (!got.length) return { ok: false, reason: "empty" };
  if (got.length > Math.min(14, want.length + 6)) return { ok: false, reason: "too long" };
  // Every chosen word, in order.
  let j = 0;
  for (const w of want) {
    while (j < got.length && !same(got[j], w)) j++;
    if (j === got.length) return { ok: false, reason: `drops "${w}"` };
    j++;
  }
  // Nothing new but helpers.
  const extra = got.filter((g) => !want.some((w) => same(g, w)) && !HELPERS.has(g));
  const negOk = NEG.test(input);
  const newNeg = extra.filter((g) => NEG.test(g));
  const others = extra.filter((g) => !NEG.test(g));
  if (others.length) return { ok: false, reason: `adds "${others[0]}"` };
  if (newNeg.length && !negOk) return { ok: false, reason: "adds a no" };
  if (negOk && !NEG.test(candidate)) return { ok: false, reason: "drops the no" };
  return { ok: true, reason: "" };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const tidy = (s) => cap(String(s).replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim());

// Built-in rules. items: [{ w, c }] as on the board (c = word kind), so "juice" is a thing.
export function expandRules(items) {
  const ws = items.map((x) => String(x.w).toLowerCase());
  const text = ws.join(" "), rest = (n) => ws.slice(n).join(" ");
  const first = ws[0], kinds = items.map((x) => x.c);
  const out = [];
  if (!ws.length) return out;
  if (first === "want" || first === "need") out.push(`I ${text}`, `I ${text}, please`, ...(first === "want" && ws.length > 1 ? [`Can I have ${rest(1)}?`] : []));
  else if (first === "more") out.push(`I want ${text}`, `${text}, please`, `Can I have ${text}?`);
  else if (first === "go") out.push(`I want to ${text}`, `Can we ${text}?`, `Let's ${text}`);
  else if (first === "help") out.push(`${text}, please`, `Can you ${text}?`, `I need ${text}`);
  else if (first === "no" || first === "not" || first === "don't") out.push(`${text}, please`, ...(ws.length > 1 ? [`I don't want ${ws.slice(1).join(" ")}`] : []));
  else if (first === "stop") out.push(`${text}, please`, `Please ${text}`);
  else if (first === "i") out.push(text, `${text}, please`);
  else if (kinds[0] === "people" && ws.length > 1) out.push(`${items[0].w}, ${rest(1)}`, `${items[0].w}, can you ${rest(1)}?`, `${items[0].w}, ${rest(1)}, please`);
  else if (kinds.every((k) => k === "thing" || k === "describe")) out.push(`I want ${text}`, `${text}, please`, `Can I have ${text}?`);
  else if (kinds[0] === "describe") out.push(`I am ${text}`, `I feel ${text}`);
  else if (kinds[0] === "action") out.push(`I want to ${text}`, `Can I ${text}?`, `Let's ${text}`);
  else out.push(`${text}, please`);
  return out.map(tidy);
}

// Clean a model's reply into candidate sentences: one per line, numbers and quotes off.
export function parseModelText(reply) {
  return String(reply || "").split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'“”]+|["'“”]+$/g, "").trim()).filter((l) => l && l.length < 120);
}
// The child's words first, then up to `max` checked sentences, no repeats.
export function choose(items, candidates, max = 3) {
  const input = items.map((x) => x.w).join(" ");
  const seen = new Set([input.toLowerCase().replace(/[.,!?]/g, "").trim()]), out = [];
  for (const c of candidates) {
    const key = c.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (seen.has(key) || !watchdog(input, c).ok) continue;
    seen.add(key); out.push(tidy(c));
    if (out.length >= max) break;
  }
  return out;
}

// The instruction any model gets. Only the message words are sent, nothing else.
export function prompt(input) {
  return `An AAC user (who may be a child) built this short message by pressing buttons: "${input}".
Write 3 short, simple sentences they might mean. Keep every word they chose, in the same order, and its meaning.
Only add small words like I, want, please, can, the, to. Do not add new things, people, places or feelings.
Write one sentence per line and nothing else.`;
}
