// Bridge: end-to-end encryption for the family server (Account tab).
import * as X from "./e2ee-store.js";
const B = window.__bridge, $ = (s, el = document) => el.querySelector(s), db = () => B.db;
const card = document.createElement("section");
card.className = "card"; card.id = "e2eeCard"; card.setAttribute("aria-labelledby", "h-e2ee");
card.innerHTML = `<h2 id="h-e2ee">End-to-end encryption</h2>
  <p class="soft">When this is on, your family's data and team chat are locked on your devices before they reach the server. The server keeps only scrambled text it can't read.</p>
  <p id="e2eeState" role="status"></p>
  <div class="row gap" id="e2eeBtns" style="flex-wrap:wrap"></div>
  <div id="e2eeReqs"></div>
  <details class="soft"><summary>What changes, and what happens if you lose the key</summary>
    <ul>
      <li>Every device that reads family data needs the family key. A new device asks for it, and a parent approves it here after checking the code on both screens matches.</li>
      <li>The server can't make the weekly summary, the role views for share links, or anything else that needs to read your data, so those stop while encryption is on. Safety alerts still work, because alerts are not part of the encrypted data.</li>
      <li>There is no recovery. If every device with the key is lost or reset, the encrypted copy on the server can't be opened by anyone, including us. Keep the app on at least two devices, and save a backup from Account now and then.</li>
      <li>The key is kept in this browser's storage. Anyone who can unlock this device can read the data, just as they could without encryption.</li>
    </ul>
  </details>`;
$("#formSync").closest(".card").after(card);

const btn = (label, fn, quiet) => { const b = Object.assign(document.createElement("button"), { type: "button", className: `btn${quiet ? " quiet" : ""}`, textContent: label }); b.addEventListener("click", fn); return b; };
const connected = () => !!(db().sync?.url && db().sync?.key);
const isParent = () => !db().account || db().account.role === "parent";
const resync = () => $("#formSync")?.requestSubmit();
let poll = 0;

async function render() {
  const st = $("#e2eeState"), bx = $("#e2eeBtns"); bx.textContent = ""; $("#e2eeReqs").textContent = "";
  const s = X.get();
  if (!connected()) { st.textContent = "Connect a family server above first. Without a server, everything already stays on this device."; return; }
  if (X.on()) {
    st.textContent = `On. This device has the family key${s.since ? ` since ${B.fmtDay(s.since)}` : ""}.${s.lastCode ? ` Safety code when it arrived: ${s.lastCode}.` : ""}`;
    bx.append(btn("Remove the key from this device", () => { if (confirm("This device won't be able to read family data until another device shares the key again. Remove it?")) { X.forget(); render(); } }, true));
    if (isParent()) await renderRequests();
    return;
  }
  if (s.pending) {
    st.textContent = `Waiting for approval. On a device that has the key, open this card and approve the request that shows ${await X.deviceCode()}.`;
    bx.append(btn("Check now", check), btn("Cancel", () => { const x = X.get(); delete x.pending; localStorage.setItem("luminaac:e2ee", JSON.stringify(x)); render(); }, true));
    clearInterval(poll); poll = setInterval(check, 10000); return;
  }
  st.textContent = "Off. The server can read your synced data, protected by the family key and HTTPS.";
  if (isParent()) bx.append(btn("Turn on for my family", () => { if (!confirm("Turn on end-to-end encryption? Read 'what happens if you lose the key' first. Other devices will need to be approved.")) return; X.turnOn(); B.save("Turned on end-to-end encryption"); resync(); render(); B.toast("Encryption is on. The next sync sends only locked data."); }));
  bx.append(btn("Get the key from another device", async () => { try { await X.request(db(), db().profile.caregiver ? `${db().profile.caregiver}'s device` : "Bridge"); render(); } catch (e) { B.toast(`Couldn't ask: ${e.message}`); } }, true));
}
async function check() {
  const r = await X.check(db()).catch(() => ({ done: false }));
  if (r.done) { clearInterval(poll); B.toast(`Key received. Safety code ${r.code}.`); render(); }
  else if (r.gone) { clearInterval(poll); B.toast("That request was declined or expired."); render(); }
}
async function renderRequests() {
  let reqs = []; try { reqs = await X.pending(db()); } catch { return; }
  const box = $("#e2eeReqs"); if (!reqs.length) return;
  box.innerHTML = `<h3 class="h3">Devices asking for the key</h3><ul class="mini-list"></ul>`;
  for (const r of reqs) {
    const li = document.createElement("li"), code = await X.deviceCode(r.pub);
    li.innerHTML = `<span class="grow"><b>${B.esc(r.name)}</b> <span class="soft">asked ${B.fmtTime(r.t)}. Its screen should show <b>${code}</b>.</span></span>`;
    li.append(btn("Codes match, share the key", async () => { await X.approve(db(), r); B.save(`Shared the encryption key with ${r.name}`); B.toast("Shared."); render(); }),
      btn("Decline", async () => { await X.decline(db(), r); render(); }, true));
    box.querySelector("ul").append(li);
  }
}
render();
const panel = card.closest(".panel"); if (panel) new MutationObserver(() => !panel.hidden && render()).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
// Re-check after the server connection changes (the sync status line updates).
const ss = $("#syncStatus"); if (ss) new MutationObserver(() => render()).observe(ss, { childList: true, characterData: true, subtree: true });
