// Rule-based prediction engine (the doc's "Phase 2: rule-based predictions").
// Same maths as the web app: Beta(1,1) confidence + context boosts, so the
// server and the device agree. Output shape follows LuminAAC-Repository
// routes/predictions.js: { suggestions[{suggestion,confidence,category}],
// confidence, primary_intent{intent,confidence}, emotional_state{emotion,confidence} }.
export const conf = (s) => (s.confirmations + 1) / (s.confirmations + s.rejections + 2);

export function partOfDay(d) {
  const h = d.getHours();
  return h < 5 ? "night" : h < 11 ? "morning" : h < 17 ? "afternoon" : h < 20 ? "evening" : "night";
}

const CATEGORY = [
  [/help|hurt|pain|sick|stop/i, "help"],
  [/eat|drink|hungry|thirst|cookie|water|snack|food/i, "physical_need"],
  [/feel|happy|sad|angry|scared|tired/i, "emotion"],
  [/play|park|outside|go|home/i, "request"],
  [/hi|hello|bye|love|hug/i, "social"],
];
export const categorize = (t) => (CATEGORY.find(([re]) => re.test(t)) || [0, "preference"])[1];

export function generate(doc, context = {}) {
  const when = context.time ? new Date(context.time) : new Date();
  const pod = partOfDay(when);
  const place = context.location || doc?.profile?.place || "home";
  const signals = doc?.signals || [];
  const ranked = signals
    .map((s) => {
      let score = conf(s);
      if (s.contexts?.includes(pod)) score += 0.25;
      if (s.contexts?.includes(place)) score += 0.15;
      return { s, score };
    })
    .filter(({ s }) => conf(s) >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const suggestions = ranked.map(({ s }) => ({ suggestion: s.phrase, confidence: +conf(s).toFixed(2), category: categorize(s.phrase), signal_id: s.id }));
  const top = suggestions[0];
  const mood = context.mood || "neutral";
  return {
    suggestions,
    confidence: top ? top.confidence : 0,
    primary_intent: top ? { intent: top.category, confidence: top.confidence } : { intent: "unknown", confidence: 0 },
    emotional_state: { emotion: mood, confidence: context.mood ? 1 : 0.3 },
    context: { part_of_day: pod, location: place },
    timestamp: new Date().toISOString(),
  };
}

export function patterns(doc) {
  return (doc?.signals || []).map((s) => ({
    id: s.id, name: s.name, description: s.meaning, cues: s.cues, phrase: s.phrase,
    confidence: +conf(s).toFixed(2), confirmations: s.confirmations, rejections: s.rejections, contexts: s.contexts,
  }));
}
