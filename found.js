// The public "if found" page behind a QR sticker. Reads only what the caregiver
// chose (safety-core.js foundView on the server): first name, how they talk, how to
// approach, a call button. No address, no location, nothing stored here.
const q = new URLSearchParams(location.search), tok = q.get("t") || "";
const main = document.getElementById("main");
const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
// The family server is this site, or an https address in the link (self-hosted families).
function server() {
  const s = q.get("s");
  if (!s) return location.origin;
  try { const u = new URL(s); return u.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.origin + u.pathname.replace(/\/+$/, "") : null; } catch { return null; }
}
function fail(msg) { main.textContent = ""; main.append(el("p", "err", msg)); }
async function run() {
  const base = server();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(tok) || !base) return fail("This link isn't complete. If a child needs help, call the local emergency number.");
  let d;
  try {
    const r = await fetch(`${base}/api/found/${tok}`, { cache: "no-store", referrerPolicy: "no-referrer" });
    if (!r.ok) return fail("This page has been switched off by the family. If a child needs help, call the local emergency number.");
    d = (await r.json()).data;
  } catch { return fail("Couldn't load this page. If a child needs help, call the local emergency number."); }
  document.getElementById("who").textContent = `This is ${d.name}`;
  document.title = `${d.name} · If found`;
  main.textContent = "";
  if (d.photo && /^data:image\/(jpeg|png|webp);base64,/.test(d.photo)) { const img = el("img", "photo"); img.src = d.photo; img.alt = `Photo of ${d.name}`; main.append(img); }
  main.append(el("p", "speaks", d.speaks));
  for (const [k, phone] of [["phone", d.phone], ["phone2", d.phone2]]) if (phone) {
    const a = el("a", `call${k === "phone2" ? " two" : ""}`, `📞 Call my family: ${phone}`); a.href = "tel:" + phone.replace(/[^\d+]/g, ""); main.append(a);
  }
  for (const [h, v] of [["How to approach me", d.approach], ["What calms me", d.calms], ["Medical", d.medical]]) if (v) { const s = el("section"); s.append(el("h2", null, h), el("p", null, v)); main.append(s); }
  main.append(el("p", "soft", "Please stay with them, keep them away from roads and water, and call. This page shares nothing about where you are."));
}
run();
