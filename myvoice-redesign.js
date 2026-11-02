// Redesign R1 for My Voice. Only runs with the dev switch on (?redesign=1).
// - Nav: Talk · Calm · My day · Play · hold-to-open. "Bridge" moves inside the
//   Caregiver door, so a stray tap can't take him off his board.
// - Play: stories, videos, sound games and Sound Path move here from Talk.
//   The blocks are moved, not rebuilt, so their own code keeps working.
// - Now/Next ribbon on Talk while a plan is under way.
// The board, strip, colours and tile positions don't change.
import { PLANS } from "./vocab.js";
import { nowNext, redesignOn, backToCare, BACK } from "./nav-core.js";

const MV = window.__myvoice;
if (MV && redesignOn()) init();

function init() {
  const $ = (s, r = document) => r.querySelector(s);
  document.documentElement.classList.add("rd");

  // ---------- Nav ----------
  const plansBtn = $('.nav-btn[data-view="plans"]');
  plansBtn.querySelector("span").textContent = "My day";
  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "nav-btn";
  playBtn.dataset.view = "play";
  playBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Play</span>`;
  plansBtn.after(playBtn);
  playBtn.addEventListener("click", () => MV.show("play"));

  // After the long press, the Caregiver area leads straight to the Bridge, and
  // the Bridge's "Back to My Voice" lands here again rather than on Talk.
  const bridge = $(".nav-bridge");
  if (bridge) {
    bridge.className = "rd-bridge";
    bridge.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c3-6 6-8 9-8s6 2 9 8M3 17h18M7 17v-4M12 17V9M17 17v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Open the Bridge`;
    $("#lockBtn").before(bridge);
  }
  let stamp = null;
  try { stamp = sessionStorage.getItem(BACK); sessionStorage.removeItem(BACK); } catch {}
  if (backToCare(location.hash, stamp)) MV.openCare?.();
  if (location.hash === "#care") history.replaceState(null, "", location.pathname + location.search);

  // ---------- Play ----------
  const play = document.createElement("section");
  play.className = "view rd-play";
  play.id = "view-play";
  play.setAttribute("aria-label", "Play");
  play.hidden = true;
  play.innerHTML = `<h1 class="h1">Play</h1><div class="rd-cards" id="rdCards"></div>
    <p class="rd-empty" id="rdEmpty" hidden>Nothing here yet. A grown-up can add games, videos and stories in the Bridge.</p>`;
  $("#view-plans").after(play);
  const cards = $("#rdCards");
  const blocks = [".mv-stories", "#mvVideosBox", ".mv-games", ".mv-play2", "#spBox"].map((s) => $(s)).filter(Boolean);
  blocks.forEach((b) => { b.open = true; b.classList.add("rd-card"); cards.append(b); });

  // Potty Path's "My world" book: a card that opens it, shown when the button would be.
  const world = $("#ppWorldBtn");
  let worldCard = null;
  if (world) {
    worldCard = document.createElement("button");
    worldCard.type = "button";
    worldCard.className = "rd-card rd-world";
    worldCard.addEventListener("click", () => world.click());
    cards.append(worldCard);
  }
  const refreshPlay = () => {
    if (worldCard) {
      worldCard.hidden = world.hidden || !!$("#ppEntry")?.hidden;
      worldCard.innerHTML = `<span class="rd-wico" aria-hidden="true">${$("#ppWorldE")?.textContent || ""}</span><span>${$("#ppWorldL")?.textContent || "My world"}</span>`;
    }
    $("#rdEmpty").hidden = [...cards.children].some((c) => !c.hidden);
  };
  addEventListener("mv:show", (e) => { if (e.detail === "play") refreshPlay(); });

  // ---------- Now / Next ----------
  const rib = document.createElement("button");
  rib.type = "button";
  rib.className = "rd-nownext";
  rib.hidden = true;
  $("#view-talk").prepend(rib);
  rib.addEventListener("click", () => MV.show("plans"));
  const doneMap = () => { try { return JSON.parse(localStorage.getItem("luminaac:plans")) || {}; } catch { return {}; } };
  const step = (s) => `<span class="rd-step"><span aria-hidden="true">${s.e}</span> ${s.t}</span>`;
  const paintRibbon = () => {
    const nn = nowNext(PLANS, doneMap(), MV.plan);
    rib.hidden = !nn;
    if (!nn) return;
    rib.innerHTML = `<span class="rd-k">Now</span>${step(nn.now)}`
      + (nn.next ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="rd-k">Next</span>${step(nn.next)}` : "");
    rib.setAttribute("aria-label", `Now: ${nn.now.t}.${nn.next ? ` Next: ${nn.next.t}.` : ""} Open my day.`);
  };
  addEventListener("mv:plans", paintRibbon);
  addEventListener("storage", (e) => { if (e.key === "luminaac:plans") paintRibbon(); });
  paintRibbon();
}
