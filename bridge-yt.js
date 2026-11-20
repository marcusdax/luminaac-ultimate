// Videos: link whole YouTube channels next to single videos.
// The family server looks the channel up (/api/youtube, official YouTube
// interfaces only). My Voice then shows a tile that plays the channel's uploads
// in the same privacy-enhanced player, plus tiles for its newest videos when
// YouTube gives their titles. Single videos added above work exactly as before.
import { defaultServer } from "./shared.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const V = () => (db().videos ||= { on: true, thumbs: false, list: [], sessions: [], talk: [] });
const C = () => (V().channels ||= []);
const server = () => (db().sync?.url || defaultServer()).replace(/\/+$/, "");
const REFRESH = 6 * 3600e3;
// Channels the family asked for, linked once on every device and offered as a
// one-tap suggestion after that (unlinking one doesn't bring it back).
const SUGGESTED = [{ id: "UCG2CL6EUjG8TVT1Tpl9nJdg", playlist: "UUG2CL6EUjG8TVT1Tpl9nJdg", name: "Ms Rachel", e: "🎵" }];
for (const s of SUGGESTED) {
  const seeded = (V().seeded ||= []);
  if (seeded.includes(s.id)) continue;
  seeded.push(s.id);
  if (!C().some((c) => c.id === s.id)) C().push({ ...s, on: true, videos: [], fetched: 0, added: Date.now() });
  B.save(`Linked YouTube channel "${s.name}"`);
}

const card = document.createElement("section");
card.className = "card yt-card"; card.setAttribute("aria-labelledby", "h-ytc");
card.innerHTML = `<div class="card-head"><h2 id="h-ytc">YouTube channels</h2><span class="pill" id="ytcCount"></span></div>
  <p class="soft">Link a channel <span class="child-name">your child</span> loves and its new videos show up in My Voice by themselves. Only channels you link here can play, in YouTube's privacy-enhanced player.</p>
  <form class="form" id="formChannel" novalidate>
    <label>Channel link <input name="channel" inputmode="url" autocomplete="off" required placeholder="https://www.youtube.com/channel/UC…" aria-describedby="ytcHint ytcErr" /></label>
    <p class="soft small" id="ytcHint">On YouTube, open the channel, tap its name or About, then Share channel, Copy channel ID or link. An @name works too once a YouTube key is set on the server.</p>
    <p class="form-error" id="ytcErr" role="alert" hidden></p>
    <label>Name for the button <input name="title" maxlength="40" placeholder="Leave empty to use the channel's name" /></label>
    <label>Picture for the button <input name="e" maxlength="4" placeholder="📺" /></label>
    <button class="btn" type="submit">Link channel</button>
  </form>
  <ul class="mini-list" id="channelList"></ul>
  <p class="row gap" id="ytcSuggest"></p>`;
$("#tab-play .split").after(card);

async function lookup(q) {
  const r = await fetch(`${server()}/api/youtube?channel=${encodeURIComponent(q)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Couldn't reach the family server. Check the connection and try again.");
  return j.data;
}
function render() {
  const list = C();
  $("#ytcCount").textContent = `${list.length} channel${list.length === 1 ? "" : "s"}`;
  $("#channelList").innerHTML = list.length ? list.map((c) => `<li><span><span aria-hidden="true">${esc(c.e || "📺")}</span> <b>${esc(c.name)}</b> <span class="soft">${c.videos?.length ? `${c.videos.length} newest videos as buttons` : "plays the channel's videos in order"}${c.on ? "" : " · hidden"}</span></span>
    <span class="row gap"><button class="link-btn small" type="button" data-ytoggle="${esc(c.id)}">${c.on ? "Hide" : "Show"}</button><button class="link-btn small" type="button" data-ydel="${esc(c.id)}" aria-label="Unlink ${esc(c.name)}">Unlink</button></span></li>`).join("")
    : `<li class="soft">No channels linked.</li>`;
  const missing = SUGGESTED.filter((s) => !list.some((c) => c.id === s.id));
  $("#ytcSuggest").innerHTML = missing.length ? `<span class="soft small">Suggested:</span> ${missing.map((s) => `<button class="btn quiet small" type="button" data-ysug="${s.id}">${s.e} Add ${esc(s.name)}</button>`).join(" ")}` : "";
}
// Newer videos for linked channels, at most every 6 hours.
async function refresh() {
  let changed = false;
  for (const c of C()) {
    if (Date.now() - (c.fetched || 0) < REFRESH) continue;
    try { const d = await lookup(c.id); if (d.videos.length) c.videos = d.videos.slice(0, 8).map(({ yt, title }) => ({ yt, title })); c.fetched = Date.now(); changed = true; } catch {}
  }
  if (changed) { B.save(); render(); }
}

$("#formChannel").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget, err = $("#ytcErr"), inp = f.channel, btn = f.querySelector("button");
  err.hidden = true; inp.removeAttribute("aria-invalid");
  const fail = (m) => { err.textContent = m; err.hidden = false; inp.setAttribute("aria-invalid", "true"); inp.focus(); };
  if (!inp.value.trim()) return fail("Paste the channel's link.");
  btn.disabled = true; btn.textContent = "Looking it up…";
  try {
    const d = await lookup(inp.value.trim());
    if (C().some((c) => c.id === d.id)) return fail("That channel is already linked.");
    const name = f.title.value.trim() || d.title || "My channel";
    C().push({ id: d.id, playlist: d.playlist, name, e: f.e.value.trim() || "📺", on: true, videos: d.videos.slice(0, 8).map(({ yt, title }) => ({ yt, title })), fetched: Date.now(), added: Date.now() });
    f.reset(); B.save(`Linked YouTube channel "${name}"`); B.toast(`Linked "${name}". It shows in My videos.`); render();
  } catch (x) { fail(x.message); }
  finally { btn.disabled = false; btn.textContent = "Link channel"; }
});
$("#channelList").addEventListener("click", (e) => {
  const t = e.target.closest("[data-ytoggle]")?.dataset.ytoggle, d = e.target.closest("[data-ydel]")?.dataset.ydel;
  const c = C().find((x) => x.id === (t || d)); if (!c) return;
  if (t) { c.on = !c.on; B.save(`${c.on ? "Showing" : "Hiding"} channel "${c.name}"`); }
  else { V().channels = C().filter((x) => x !== c); B.save(`Unlinked channel "${c.name}"`); }
  render();
});
$("#ytcSuggest").addEventListener("click", (e) => {
  const s = SUGGESTED.find((x) => x.id === e.target.closest("[data-ysug]")?.dataset.ysug); if (!s) return;
  C().push({ ...s, on: true, videos: [], fetched: 0, added: Date.now() }); B.save(`Linked YouTube channel "${s.name}"`); render(); refresh();
});
addEventListener("bridge:show", (e) => { if (e.detail === "play") { render(); refresh(); } });
render();
