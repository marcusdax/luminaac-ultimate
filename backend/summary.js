// Weekly care-team summary: counts and a few words, nothing else. No names of
// other people, no notes, no locations, no media, no toilet or sound-practice logs.
const WEEK = 7 * 864e5;
export function build(d, now = Date.now()) {
  const doc = d.doc || {}, since = now - WEEK, inWeek = (t) => t > since && t <= now;
  const moments = (doc.moments || []).filter((m) => inWeek(m.t));
  const explained = moments.filter((m) => m.meaning);
  const tally = {}; for (const m of explained) tally[m.meaning] = (tally[m.meaning] || 0) + 1;
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => String(w).slice(0, 40));
  const newSignals = (doc.signals || []).filter((s) => inWeek(s.created || 0)).length;
  const alerts = (d.alerts || []).filter((a) => inWeek(a.t));
  const urgent = alerts.filter((a) => a.urgent || ["help", "home", "danger-enter", "silent"].includes(a.kind));
  const chat = (d.chat || []).filter((c) => inWeek(c.t)).length;
  const s = { from: since, to: now, moments: moments.length, explained: explained.length, top, newSignals, alerts: alerts.length, urgent: urgent.length, unanswered: urgent.filter((a) => !a.ack).length, chat };
  const p = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const lines = [
    `${p(s.moments, "moment")} captured, ${s.explained} explained.`,
    s.top.length ? `Said most often: ${s.top.join(", ")}.` : null,
    s.newSignals ? `${p(s.newSignals, "new signal")} learned.` : null,
    `${p(s.alerts, "alert")}${s.urgent ? `, ${s.urgent} urgent` : ""}${s.unanswered ? `, ${s.unanswered} not marked as handled` : ""}.`,
    `${p(s.chat, "team message")}.`,
  ].filter(Boolean);
  return { ...s, title: "This week in LuminAAC", lines, short: `${p(s.moments, "moment")}, ${p(s.alerts, "alert")}, ${p(s.chat, "message")}` };
}
export const due = (cfg, now = Date.now()) => !!cfg?.on && now - (cfg.last || 0) > 6.5 * 864e5;
