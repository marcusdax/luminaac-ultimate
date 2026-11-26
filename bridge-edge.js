// The Bridge: Offline MASTERNEX.os PWA Edge Bundle & C2SP transparency verifier UI.
// Lives in the Privacy tab (#tab-privacy) alongside shared learning (PRINCE v2).
import { verifyEdgeBundle, loadStoredBundle, saveStoredBundle, clearStoredBundle } from "./edge-bundle.js";

const $ = (s) => document.querySelector(s);

function setStatus(msg, ok = null) {
  const el = $("#edgeBundleStatus");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("edge-ok", ok === true);
  el.classList.toggle("edge-err", ok === false);
}

function renderMeta(res) {
  const box = $("#edgeBundleMeta");
  if (!box) return;
  if (!res || !res.ok) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  const rows = [
    ["Model preset", res.modelPreset || "—"],
    ["Quantization", res.quantization || "—"],
    ["C2SP tree size", String(res.treeSize)],
    ["Witness quorum", `${res.witnessCount} verified`],
    ["Zero cloud PII", res.zeroCloudPii ? "Attested" : "No"],
    ["SHA-256", (res.computedSha256 || "").slice(0, 16) + "…"],
  ];
  box.textContent = "";
  for (const [k, v] of rows) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    div.append(dt, dd);
    box.append(div);
  }
  box.hidden = false;
}

async function inspectAndRender(bundle, { persist = false } = {}) {
  if (!bundle) {
    renderMeta(null);
    setStatus("No offline edge bundle loaded yet. Import one exported from MASTERNEX.os or check your family server.");
    return null;
  }
  const res = await verifyEdgeBundle(bundle);
  renderMeta(res);
  if (res.ok) {
    if (persist) saveStoredBundle(bundle);
    setStatus(
      `Verified offline (${res.modelPreset}, ${res.quantization}, C2SP tree size ${res.treeSize}, ${res.witnessCount} witness${res.witnessCount === 1 ? "" : "es"}).`,
      true
    );
  } else {
    setStatus(`Verification failed: ${res.reasons.join("; ")}.`, false);
  }
  return res;
}

function initEdgeUi() {
  const fileInput = $("#edgeBundleFile");
  const btnPull = $("#btnEdgePull");
  const btnClear = $("#btnEdgeClear");
  if (!fileInput) return;

  // Load any previously verified bundle stored locally
  inspectAndRender(loadStoredBundle());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const res = await inspectAndRender(parsed, { persist: true });
      // If connected to a family server as parent, offer silent best-effort sync via POST /api/edge-bundle
      const sync = window.__bridge?.db?.sync;
      if (res?.ok && sync?.url && sync?.key) {
        fetch(sync.url.replace(/\/+$/, "") + "/api/edge-bundle", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${sync.key}` },
          body: JSON.stringify(parsed),
        }).catch(() => {});
      }
    } catch (err) {
      renderMeta(null);
      setStatus(`Could not read bundle JSON: ${err.message}`, false);
    } finally {
      fileInput.value = "";
    }
  });

  btnPull?.addEventListener("click", async () => {
    const sync = window.__bridge?.db?.sync;
    if (!sync?.url || !sync?.key) {
      setStatus("Connect a family server in Account and devices first, or import a local JSON bundle.", false);
      return;
    }
    try {
      setStatus("Checking family server for an edge bundle…");
      const resp = await fetch(sync.url.replace(/\/+$/, "") + "/api/edge-bundle", {
        headers: { authorization: `Bearer ${sync.key}` },
      });
      const json = await resp.json();
      if (!resp.ok || !json?.data) {
        setStatus("No verified edge bundle is stored on the family server yet.");
        return;
      }
      await inspectAndRender(json.data, { persist: true });
    } catch (err) {
      setStatus(`Could not reach family server: ${err.message}`, false);
    }
  });

  btnClear?.addEventListener("click", () => {
    clearStoredBundle();
    inspectAndRender(null);
  });

  window.addEventListener("bridge:show", (e) => {
    if (e.detail === "privacy") inspectAndRender(loadStoredBundle());
  });
  window.addEventListener("bridge:reload", () => inspectAndRender(loadStoredBundle()));
}

initEdgeUi();
