// Access options for My Voice, set from the Bridge (Vocabulary → "How My Voice responds").
// Supports: age/focus modes, CSS custom-property scaling (--board-scale), dwell-click,
// WCAG 2.5.2 pointer cancellation + acceptMs + debounceMs, and upgraded switch scanning
// (Linear, Row-Column, 2-Switch Step, Auditory Scan Preview, and Scan Loop Limit).
import { load } from "./shared.js";
import { speakUtterance } from "./speech.js";

export const AAC_SELECTOR =
  ".grid .tile, .next-row .next-chip, .quick .phrase, .step-says .say-chip, .mv-chip, .mv-ptile, .mv-sos, .mv-ctx-chip, .sx-tile, .sx-btn";

const SCAN_KEYS_FIELDS = ["scan", "scanMs", "scanMode", "scanLoops", "scanAudio"];

export function createAccessController({ doc = typeof document !== "undefined" ? document : null, win = typeof window !== "undefined" ? window : null, loadFn = load, speakFn = speakUtterance } = {}) {
  const root = doc?.documentElement || { dataset: {}, style: { setProperty() {} } };
  let dwellTimer = 0;
  let scanTimer = 0;
  let resumeTimer = 0;
  let scanIdx = -1;
  let scanLevel = "outer"; // "outer" | "row"
  let activeRowTiles = [];
  let loopCount = 0;
  let rowLoopCount = 0;
  let sleeping = false;
  let cfg = safeLoadAccess();
  let lastAccessSig = "";
  let lastScanSig = "";
  let initialized = false;
  let observer = null;
  let activatedStep2Pending = false;

  // Pointer cancellation / acceptMs / debounceMs state
  let active = null;
  let debounceUntil = 0;
  let suppressNextTrustedClick = null;
  let dispatchingFromPointerUp = false;

  const cleanups = [];

  function safeLoadAccess() {
    try {
      return loadFn()?.access || { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: false, scanMs: 1500, scanMode: "linear", scanAudio: false, scanLoops: 0, safety: true };
    } catch {
      return { mode: "standard", size: 100, dwell: 0, acceptMs: 0, debounceMs: 0, scan: false, scanMs: 1500, scanMode: "linear", scanAudio: false, scanLoops: 0, safety: true };
    }
  }

  function scanSigOf(a) {
    return JSON.stringify(SCAN_KEYS_FIELDS.map((k) => a?.[k]));
  }

  function announce(msg) {
    const live = doc?.getElementById?.("scanLive");
    if (live) live.textContent = msg;
  }

  function clearScanHighlights() {
    doc?.querySelectorAll?.(".scan-hi")?.forEach((x) => x.classList.remove("scan-hi"));
    doc?.querySelectorAll?.(".scan-row-hi")?.forEach((x) => x.classList.remove("scan-row-hi"));
  }

  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.closest?.('[hidden], [aria-hidden="true"], .view[hidden]')) return false;
    if (el.closest?.("details:not([open]) > :not(summary)")) return false;

    const getStyle = win?.getComputedStyle || (typeof getComputedStyle === "function" ? getComputedStyle : null);
    let fixedAncestor = false;
    if (getStyle) {
      let cur = el;
      let depth = 0;
      while (cur && cur !== doc?.body && depth < 10) {
        const st = getStyle(cur);
        if (st) {
          if (st.display === "none" || st.visibility === "hidden") return false;
          if (st.position === "fixed") fixedAncestor = true;
        }
        cur = cur.parentElement;
        depth++;
      }
    }

    const hasLayout = (doc?.body?.getClientRects?.()?.length ?? 0) > 0;
    if (hasLayout && !fixedAncestor && "offsetParent" in el && el.offsetParent === null) {
      return false;
    }
    return true;
  }

  function items(scopeOverride) {
    if (!doc) return [];
    const dlg = !scopeOverride ? doc.querySelector?.("dialog[open]") : null;
    const scope = scopeOverride || dlg || doc;
    const sel = dlg
      ? "button:not([disabled]), summary, input[type='checkbox']:not([disabled])"
      : "main button:not([disabled]), main .tile:not([disabled]), main summary, main input[type='checkbox']:not([disabled]), nav .nav-btn:not(#careBtn)";
    return [...(scope.querySelectorAll?.(sel) || [])].filter(isVisible);
  }

  function groupGridRows(gridTiles, gridEl) {
    if (!gridTiles.length) return [];
    const rects = gridTiles.map((el) => ({ el, r: el.getBoundingClientRect?.() || { top: 0, height: 0 } }));
    const hasRects = rects.some((x) => x.r.height > 0 || x.r.top > 0);
    if (!hasRects) {
      const cols = Math.max(1, Number(gridEl?.style?.getPropertyValue?.("--cols")) || 6);
      const rows = [];
      for (let i = 0; i < gridTiles.length; i += cols) {
        rows.push(gridTiles.slice(i, i + cols));
      }
      return rows;
    }
    const rows = [];
    for (const { el, r } of rects) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(r.top - last.top) <= 4) {
        last.tiles.push(el);
      } else {
        rows.push({ top: r.top, tiles: [el] });
      }
    }
    return rows.map((row) => row.tiles);
  }

  function buildOuterStops() {
    const list = items();
    if ((cfg.scanMode || "linear") !== "rowcol") return list;
    const dlg = doc?.querySelector?.("dialog[open]");
    if (dlg) return list;
    const gridEl = doc?.getElementById?.("grid");
    const gridTiles = list.filter((el) => el.classList?.contains?.("tile") && el.closest?.("#grid"));
    if (!gridTiles.length) return list;

    const rows = groupGridRows(gridTiles, gridEl);
    const tileToRowIdx = new Map();
    rows.forEach((tiles, rowIndex) => tiles.forEach((t) => tileToRowIdx.set(t, rowIndex)));

    const stops = [];
    const emittedRows = new Set();
    for (const el of list) {
      if (tileToRowIdx.has(el)) {
        const rowIndex = tileToRowIdx.get(el);
        if (!emittedRows.has(rowIndex)) {
          emittedRows.add(rowIndex);
          stops.push({ type: "row", rowIndex, tiles: rows[rowIndex] });
        }
      } else {
        stops.push(el);
      }
    }
    return stops;
  }

  function cueLabelFor(stop) {
    if (stop && stop.type === "row") return `Row ${stop.rowIndex + 1}`;
    if (!stop) return "";
    return (
      stop.querySelector?.(".label")?.textContent ||
      stop.getAttribute?.("aria-label") ||
      stop.textContent ||
      ""
    ).trim();
  }

  function previewCue(stop) {
    if (!cfg.scanAudio) return;
    const label = cueLabelFor(stop);
    if (label) speakFn(label, { mode: "preview", interrupt: false, skipLog: true });
  }

  function resetRowCol() {
    scanLevel = "outer";
    activeRowTiles = [];
    scanIdx = -1;
    loopCount = 0;
    rowLoopCount = 0;
    clearScanHighlights();
  }

  function pauseForSleep() {
    clearInterval(scanTimer);
    scanTimer = 0;
    clearScanHighlights();
    sleeping = true;
    if (root?.dataset) root.dataset.scanSleeping = "true";
    announce("Scanning paused. Press switch to resume.");
  }

  function isCareScanPaused() {
    const careView = doc?.getElementById?.("view-care");
    if (careView && !careView.hidden) return true;
    const ae = doc?.activeElement;
    const isFormControl = ae?.matches?.("input, textarea, select, [contenteditable]") ?? false;
    if (isFormControl) {
      const isNonCareCheckbox = ae.matches?.("input[type='checkbox']") && !ae.closest?.("#view-care");
      if (!isNonCareCheckbox) return true;
    }
    return false;
  }

  function step(dir = 1) {
    if (sleeping || isCareScanPaused()) return null;
    const stops = scanLevel === "row" && activeRowTiles.length
      ? activeRowTiles.filter(isVisible)
      : buildOuterStops();
    if (!stops.length) {
      if (scanLevel === "row") {
        scanLevel = "outer";
        activeRowTiles = [];
        scanIdx = -1;
      }
      return null;
    }

    clearScanHighlights();

    const prevIdx = scanIdx;
    const nextIdx = scanIdx < 0
      ? (dir < 0 ? stops.length - 1 : 0)
      : (scanIdx + dir + stops.length) % stops.length;

    const wrappedForward = dir > 0 && prevIdx >= 0 && nextIdx === 0;
    if (wrappedForward) {
      if (scanLevel === "row") {
        rowLoopCount += 1;
        const maxRowLoops = Math.min(Number(cfg.scanLoops) || 2, 2);
        if (rowLoopCount >= maxRowLoops) {
          scanLevel = "outer";
          activeRowTiles = [];
          scanIdx = -1;
          rowLoopCount = 0;
          return step(1);
        }
      } else {
        loopCount += 1;
        const limit = Number(cfg.scanLoops) || 0;
        if (limit > 0 && loopCount >= limit) {
          pauseForSleep();
          return null;
        }
      }
    }

    scanIdx = nextIdx;
    const current = stops[scanIdx];
    if (current && current.type === "row") {
      current.tiles.forEach((t) => t.classList?.add?.("scan-row-hi"));
      current.tiles[0]?.focus?.({ preventScroll: false });
      announce(`Row ${current.rowIndex + 1}`);
    } else if (current) {
      current.classList?.add?.("scan-hi");
      current.focus?.({ preventScroll: false });
    }
    previewCue(current);
    return current;
  }

  function startScan() {
    clearInterval(scanTimer);
    clearTimeout(resumeTimer);
    scanTimer = 0;
    activatedStep2Pending = false;
    sleeping = false;
    if (root?.dataset) delete root.dataset.scanSleeping;
    scanLevel = "outer";
    activeRowTiles = [];
    scanIdx = -1;
    loopCount = 0;
    rowLoopCount = 0;
    step(1);
    if ((cfg.scanMode || "linear") !== "step2") {
      scanTimer = setInterval(() => step(1), Math.max(600, Number(cfg.scanMs) || 1500));
    }
  }

  function stopScan() {
    clearInterval(scanTimer);
    clearTimeout(resumeTimer);
    scanTimer = 0;
    activatedStep2Pending = false;
    sleeping = false;
    if (root?.dataset) delete root.dataset.scanSleeping;
    scanLevel = "outer";
    activeRowTiles = [];
    scanIdx = -1;
    loopCount = 0;
    rowLoopCount = 0;
    clearScanHighlights();
  }

  function activateCurrent() {
    if (scanLevel === "outer" && (cfg.scanMode || "linear") === "rowcol") {
      const stops = buildOuterStops();
      const current = stops[scanIdx];
      if (current && current.type === "row") {
        scanLevel = "row";
        activeRowTiles = current.tiles;
        scanIdx = -1;
        rowLoopCount = 0;
        clearInterval(scanTimer);
        scanTimer = 0;
        step(1);
        if (cfg.scan && !sleeping && !isCareScanPaused()) {
          scanTimer = setInterval(() => step(1), Math.max(600, Number(cfg.scanMs) || 1500));
        }
        return true;
      }
    }
    const el = doc?.querySelector?.(".scan-hi");
    if (!el) return false;
    el.click();
    if (scanLevel === "row") {
      scanLevel = "outer";
      activeRowTiles = [];
    }
    clearInterval(scanTimer);
    scanTimer = 0;
    scanIdx = -1;
    loopCount = 0;
    rowLoopCount = 0;
    if ((cfg.scanMode || "linear") === "step2") {
      if (cfg.scan && !isCareScanPaused()) {
        step(1);
        activatedStep2Pending = true;
        queueMicrotask(() => { activatedStep2Pending = false; });
      }
    } else {
      clearScanHighlights();
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { if (cfg.scan && !isCareScanPaused()) startScan(); }, 400);
    }
    return true;
  }

  function shouldIgnoreKeydown(e) {
    if (!cfg.scan || e.repeat) return true;
    return isCareScanPaused();
  }

  function handleKeydown(e) {
    if (shouldIgnoreKeydown(e)) return;
    const mode = cfg.scanMode || "linear";
    const isWakeKey = mode === "step2"
      ? ["Tab", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", " ", "Enter"].includes(e.key)
      : (e.key === " " || e.key === "Enter");

    if (sleeping && isWakeKey) {
      e.preventDefault?.();
      startScan();
      return;
    }

    if (mode === "step2") {
      if (e.key === "Tab" || e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault?.();
        step(e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault?.();
        step(-1);
      } else if (e.key === "Enter") {
        e.preventDefault?.();
        activateCurrent();
      }
      return;
    }

    if (e.key === " " || e.key === "Enter") {
      e.preventDefault?.();
      activateCurrent();
    }
  }

  function inBounds(el, clientX, clientY) {
    const r = el.getBoundingClientRect?.();
    if (!r) return true;
    if (r.width === 0 && r.height === 0 && r.left === 0 && r.top === 0) return true;
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  function cancelActivePointer() {
    if (!active) return;
    clearTimeout(active.timer);
    active.cancelled = true;
    active.target.classList?.remove?.("pressed", "accepting", "accepted");
  }

  function attachPointerActivation(listenTarget = win || doc) {
    if (!listenTarget?.addEventListener) return () => {};

    const onPointerDown = (e) => {
      if (typeof e.button === "number" && e.button > 0) return;
      if (e.isPrimary === false) return;
      const t = e.target?.closest?.(AAC_SELECTOR);
      if (!t || t.disabled) return;
      if (active) {
        cancelActivePointer();
        active = null;
      }
      const now = performance.now();
      if (now < debounceUntil) {
        active = { pointerId: e.pointerId, target: t, cancelled: true, debounced: true, timer: 0 };
        return;
      }
      const acceptMs = Math.max(0, Math.min(1000, Number(cfg.acceptMs) || 0));
      active = {
        pointerId: e.pointerId,
        target: t,
        downAt: now,
        acceptMs,
        accepted: acceptMs <= 0,
        cancelled: false,
        debounced: false,
        timer: 0,
      };
      t.classList?.add?.("pressed");
      if (acceptMs > 0) {
        t.style?.setProperty?.("--accept-ms", `${acceptMs}ms`);
        t.classList?.add?.("accepting");
        active.timer = setTimeout(() => {
          if (!active || active.cancelled || active.target !== t) return;
          active.accepted = true;
          t.classList?.remove?.("accepting");
          t.classList?.add?.("accepted");
        }, acceptMs);
      }
    };

    const onPointerMove = (e) => {
      if (!active || active.cancelled) return;
      if (e.pointerId !== undefined && active.pointerId !== e.pointerId) return;
      if (typeof e.clientX === "number" && typeof e.clientY === "number" && !inBounds(active.target, e.clientX, e.clientY)) {
        cancelActivePointer();
      }
    };

    const onPointerLeave = (e) => {
      if (!active || active.cancelled) return;
      if (e.target === active.target && (!e.relatedTarget || !active.target.contains?.(e.relatedTarget))) {
        cancelActivePointer();
      }
    };

    const onPointerCancel = (e) => {
      if (!active) return;
      if (e.pointerId !== undefined && active.pointerId !== e.pointerId) return;
      cancelActivePointer();
      clearTimeout(active.timer);
      active.target.classList?.remove?.("pressed", "accepting", "accepted");
      active = null;
    };

    const onPointerUp = (e) => {
      if (!active) return;
      if (e.pointerId !== undefined && active.pointerId !== e.pointerId) return;
      const cur = active;
      active = null;
      clearTimeout(cur.timer);
      cur.target.classList?.remove?.("pressed", "accepting", "accepted");

      const now = performance.now();
      const inside = typeof e.clientX === "number" && typeof e.clientY === "number"
        ? inBounds(cur.target, e.clientX, e.clientY)
        : true;
      const heldOk = cur.accepted || (now - cur.downAt >= cur.acceptMs);

      if (cur.cancelled || cur.debounced || !inside || !heldOk) {
        suppressNextTrustedClick = { target: cur.target, until: now + 400 };
        return;
      }

      const debounceMs = Math.max(0, Math.min(1000, Number(cfg.debounceMs) || 0));
      if (debounceMs > 0) debounceUntil = now + debounceMs;
      suppressNextTrustedClick = { target: cur.target, until: now + 200 };
      dispatchingFromPointerUp = true;
      try {
        cur.target.click();
      } finally {
        dispatchingFromPointerUp = false;
      }
    };

    const onClickCapture = (e) => {
      if (dispatchingFromPointerUp) return;
      const t = e.target?.closest?.(AAC_SELECTOR);
      if (!t) return;
      const now = performance.now();
      if (
        suppressNextTrustedClick &&
        suppressNextTrustedClick.target === t &&
        now <= suppressNextTrustedClick.until &&
        e.isTrusted !== false
      ) {
        suppressNextTrustedClick = null;
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
        e.stopPropagation?.();
        return;
      }
      if (now < debounceUntil) {
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
        e.stopPropagation?.();
        return;
      }
      const debounceMs = Math.max(0, Math.min(1000, Number(cfg.debounceMs) || 0));
      if (debounceMs > 0) debounceUntil = now + debounceMs;
    };

    listenTarget.addEventListener("pointerdown", onPointerDown, true);
    listenTarget.addEventListener("pointermove", onPointerMove, true);
    listenTarget.addEventListener("pointerleave", onPointerLeave, true);
    listenTarget.addEventListener("pointercancel", onPointerCancel, true);
    listenTarget.addEventListener("pointerup", onPointerUp, true);
    listenTarget.addEventListener("click", onClickCapture, true);

    const off = () => {
      listenTarget.removeEventListener("pointerdown", onPointerDown, true);
      listenTarget.removeEventListener("pointermove", onPointerMove, true);
      listenTarget.removeEventListener("pointerleave", onPointerLeave, true);
      listenTarget.removeEventListener("pointercancel", onPointerCancel, true);
      listenTarget.removeEventListener("pointerup", onPointerUp, true);
      listenTarget.removeEventListener("click", onClickCapture, true);
    };
    cleanups.push(off);
    return off;
  }

  function apply(force = false) {
    const next = safeLoadAccess();
    const sig = JSON.stringify(next);
    if (initialized && !force && sig === lastAccessSig) return false;

    const prevScanSig = lastScanSig;
    const nextScanSig = scanSigOf(next);
    cfg = next;
    lastAccessSig = sig;
    lastScanSig = nextScanSig;

    if (root.dataset) root.dataset.mode = cfg.mode || "standard";
    root.style?.setProperty?.("--board-scale", String((cfg.size || 100) / 100));
    root.style?.setProperty?.("--dwell-ms", `${cfg.dwell || 0}ms`);

    if (!initialized || force || nextScanSig !== prevScanSig) {
      stopScan();
      if (cfg.scan) startScan();
    }
    if (!cfg.dwell) {
      clearTimeout(dwellTimer);
      doc?.querySelectorAll?.(".dwelling")?.forEach((x) => x.classList.remove("dwelling"));
    }
    initialized = true;
    return true;
  }

  function setupDomListeners() {
    if (!doc?.addEventListener) return;
    const target = (el) => el?.closest?.("main button, main .tile, nav .nav-btn, .mv-player button");

    const onPointerOver = (e) => {
      if (!cfg.dwell || e.pointerType === "touch") return;
      const t = target(e.target);
      if (!t || t.disabled || !isVisible(t) || t.classList?.contains?.("dwelling")) return;
      clearTimeout(dwellTimer);
      doc.querySelectorAll?.(".dwelling")?.forEach((x) => x.classList.remove("dwelling"));
      t.classList?.add?.("dwelling");
      dwellTimer = setTimeout(() => {
        t.classList?.remove?.("dwelling");
        if (!cfg.dwell || t.disabled || ("isConnected" in t && !t.isConnected) || !isVisible(t)) return;
        t.click();
      }, cfg.dwell);
    };
    const onPointerOut = (e) => {
      const t = target(e.target);
      if (!t || t.contains?.(e.relatedTarget)) return;
      clearTimeout(dwellTimer);
      t.classList?.remove?.("dwelling");
    };

    doc.addEventListener("pointerover", onPointerOver);
    doc.addEventListener("pointerout", onPointerOut);
    doc.addEventListener("keydown", handleKeydown);
    cleanups.push(() => {
      doc.removeEventListener("pointerover", onPointerOver);
      doc.removeEventListener("pointerout", onPointerOut);
      doc.removeEventListener("keydown", handleKeydown);
    });

    attachPointerActivation(win || doc);

    if (win?.addEventListener) {
      const onStorage = (e) => { if (e.key === "luminaac:bridge") apply(); };
      const onBridgeUpdated = () => apply();
      win.addEventListener("storage", onStorage);
      win.addEventListener("luminaac:bridge-updated", onBridgeUpdated);
      cleanups.push(() => {
        win.removeEventListener("storage", onStorage);
        win.removeEventListener("luminaac:bridge-updated", onBridgeUpdated);
      });
    }

    const MO = win?.MutationObserver || (typeof MutationObserver !== "undefined" ? MutationObserver : null);
    if (MO) {
      let careWasPaused = isCareScanPaused();
      observer = new MO(() => {
        const carePaused = isCareScanPaused();
        const leavingCare = careWasPaused && !carePaused;
        careWasPaused = carePaused;
        if (!cfg.scan || sleeping) return;
        if (activatedStep2Pending && !carePaused && !leavingCare && (cfg.scanMode || "linear") === "step2") {
          return;
        }
        resetRowCol();
        if (carePaused) return;
        if ((cfg.scanMode || "linear") === "step2") {
          step(1);
        } else if (leavingCare) {
          startScan();
        }
      });
      const gridEl = doc.getElementById?.("grid");
      if (gridEl) observer.observe(gridEl, { childList: true });
      doc.querySelectorAll?.(".view")?.forEach((v) => observer.observe(v, { attributes: true, attributeFilter: ["hidden"] }));
      if (doc.body) observer.observe(doc.body, { attributes: true, attributeFilter: ["open"], subtree: true });
    }
  }

  function destroy() {
    clearTimeout(dwellTimer);
    clearInterval(scanTimer);
    clearTimeout(resumeTimer);
    if (active) clearTimeout(active.timer);
    observer?.disconnect?.();
    while (cleanups.length) cleanups.pop()();
  }

  return {
    apply,
    items,
    step,
    startScan,
    stopScan,
    resetRowCol,
    handleKeydown,
    attachPointerActivation,
    setupDomListeners,
    destroy,
    getState: () => ({
      cfg,
      scanIdx,
      scanLevel,
      loopCount,
      rowLoopCount,
      sleeping,
      debounceUntil,
    }),
  };
}

let defaultCtrl = null;
if (!globalThis.__LUMINAAC_NO_AUTO_INIT__ && typeof document !== "undefined" && typeof window !== "undefined") {
  defaultCtrl = createAccessController();
  defaultCtrl.setupDomListeners();
  defaultCtrl.apply(true);
}

export const apply = (...a) => defaultCtrl?.apply(...a);
export const items = (...a) => defaultCtrl?.items(...a) || [];
export const step = (...a) => defaultCtrl?.step(...a);
export const startScan = (...a) => defaultCtrl?.startScan(...a);
export const stopScan = (...a) => defaultCtrl?.stopScan(...a);
export const handleKeydown = (...a) => defaultCtrl?.handleKeydown(...a);
export const attachPointerActivation = (...a) => defaultCtrl?.attachPointerActivation(...a);
