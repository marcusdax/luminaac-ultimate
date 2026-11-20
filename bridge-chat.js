// Team chat: parents, teachers, therapists and family talk in one thread on the
// family server (/api/chat). Never on the child's device. New messages arrive
// through bridge-plus.js (live stream locally, a 30-second check when hosted).
// A copy of the last 200 messages stays on this device so the thread shows offline.
import { api } from "./shared.js";
import * as X from "./e2ee-store.js";

const B = window.__bridge;
const $ = (s, el = document) => el.querySelector(s);
const esc = B.esc;
const db = () => B.db;
const KEY = "luminaac:chat";
const ROLE = { parent: "Parent", teacher: "Teacher", therapist: "Therapist", family: "Family" };
const cache = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const keep = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-200))); } catch {} };
const online = () => !!(db().sync?.url && db().sync?.key);

const card = document.createElement("section");
card.className = "card chat-card"; card.setAttribute("aria-labelledby", "h-chat");
card.innerHTML = `<div class="card-head"><h2 id="h-chat">Team chat</h2><span class="pill" id="chatState"></span></div>
  <div id="chatOff" hidden><p class="soft">Chat with everyone in <span class="child-name">your child</span>'s circle: teachers, therapists and family. It needs a free family account so messages reach them.</p>
    <button class="btn" type="button" id="btnChatSetup">Set up a family account</button></div>
  <div id="chatOn" hidden>
    <ol class="chat-list" id="chatList" aria-live="polite" aria-label="Messages"></ol>
    <form class="chat-form" id="formChat">
      <label class="sr-only" for="chatText">Message</label>
      <textarea id="chatText" name="text" rows="2" maxlength="1000" required placeholder="Write to the team…"></textarea>
      <button class="btn" type="submit">Send</button>
    </form>
    <p class="soft small">Everyone you invited can read this. It is never shown on <span class="child-name">your child</span>'s device. Invite people with a code in Account and devices.</p>
  </div>`;
$("#tab-team .lede").after(card);

let list = cache(), lastLoad = 0;
const fmt = (t) => (Date.now() - t < 864e5 ? B.fmtTime(t) : `${B.fmtDay(t)}, ${B.fmtTime(t)}`);
const mine = (c) => { const a = db().account; return a ? c.role === a.role && (!a.name || c.from === a.name) : c.role === "parent"; };

function render() {
  const on = online();
  $("#chatOff").hidden = on; $("#chatOn").hidden = !on;
  $("#chatState").textContent = on ? `${list.length} message${list.length === 1 ? "" : "s"}` : "Off";
  if (!on) return;
  const ol = $("#chatList"), atEnd = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
  ol.innerHTML = list.length ? list.map((c) => `<li class="chat-msg${mine(c) ? " is-mine" : ""}"><p class="chat-who"><b>${esc(c.from)}</b> <span class="soft">${c.from === ROLE[c.role] ? "" : `${esc(ROLE[c.role] || c.role)} · `}${fmt(c.t)}</span>${db().account?.role === "parent" || !db().account ? ` <button class="link-btn small" type="button" data-cdel="${esc(c.id)}" aria-label="Delete message from ${esc(c.from)}">Delete</button>` : ""}</p><p class="chat-text">${esc(shown(c))}</p></li>`).join("")
    : `<li class="soft">No messages yet. Say hello to the team.</li>`;
  if (atEnd || !lastLoad) ol.scrollTop = ol.scrollHeight;
}
// End-to-end encrypted messages are opened here, on the device; the server only has ciphertext.
const plain = new Map();
const shown = (c) => (X.isSealed(c.text) ? plain.get(c.id) ?? "Encrypted message. This device doesn't have the family key yet." : c.text);
async function openAll() { let n = 0; for (const c of list) if (X.isSealed(c.text) && !plain.has(c.id)) { const t = await X.openText(c.text); if (t != null) { plain.set(c.id, t); n++; } } if (n) render(); }
function merge(items) {
  setTimeout(openAll);
  const ids = new Set(list.map((c) => c.id)); let added = 0;
  for (const c of items) if (!ids.has(c.id)) { list.push(c); added++; }
  list.sort((a, b) => a.t - b.t); keep(list); return added;
}
function unread(on) {
  for (const el of document.querySelectorAll('[data-hub="circle"], button.tab[data-tab="team"], .rd-chip[data-tab="team"]')) el.toggleAttribute("data-unread", on);
}
async function load() {
  if (!online()) return render();
  try { merge(await api(db(), "GET", `/api/chat?since=${list.at(-1)?.t || 0}`)); lastLoad = Date.now(); } catch {}
  render();
}

$("#btnChatSetup").addEventListener("click", () => B.show("account"));
$("#formChat").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ta = $("#chatText"), text = ta.value.trim(); if (!text) return;
  const btn = e.currentTarget.querySelector("button"); btn.disabled = true;
  try { const c = await api(db(), "POST", "/api/chat", { text: await X.sealText(text), from: db().profile.caregiver || undefined }); merge([c]); ta.value = ""; render(); $("#chatList").scrollTop = 1e9; }
  catch (err) { B.toast(err.status === 403 ? "Your role can't use team chat." : "Couldn't send. Check the connection and try again."); }
  finally { btn.disabled = false; ta.focus(); }
});
$("#chatText").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#formChat").requestSubmit(); });
$("#chatList").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-cdel]")?.dataset.cdel; if (!id) return;
  if (!confirm("Delete this message for everyone?")) return;
  try { await api(db(), "DELETE", `/api/chat/${encodeURIComponent(id)}`); list = list.filter((c) => c.id !== id); keep(list); render(); } catch { B.toast("Couldn't delete that message."); }
});

addEventListener("chat:new", (e) => { if (merge(e.detail)) { if (B.current === "team" && !document.hidden) render(); else unread(true); } });
addEventListener("bridge:show", (e) => { if (e.detail === "team") { unread(false); load(); } else if (e.detail === "circle") unread(false); });
addEventListener("bridge:account", () => { list = []; keep(list); load(); B.pollNow?.(); });
render();
if (online()) load();
