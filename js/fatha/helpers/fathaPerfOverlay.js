import { app } from "../../../../scripts/app.js";

const WINDOW_MS = 4000;
const OVERLAY_ID = "xcp-derp-perf-overlay";

function isEnabled() {
    return localStorage.getItem("xcp_perf_overlay") === "1" || window.DERP_PERF_OVERLAY === true;
}

function normalizeHotkey(value) {
    const raw = String(value || "").trim();
    return raw || "Alt+Shift+P";
}

function getHotkeySetting() {
    return normalizeHotkey(window.DERP_GLOBAL_SETTINGS?.perfOverlayHotkey);
}

function matchesHotkey(event, hotkey) {
    const parts = hotkey.toLowerCase().split("+").map(v => v.trim()).filter(Boolean);
    const key = parts[parts.length - 1] || "";
    const needsCtrl = parts.includes("ctrl") || parts.includes("control");
    const needsMeta = parts.includes("meta") || parts.includes("cmd") || parts.includes("command");
    const needsAlt = parts.includes("alt") || parts.includes("option");
    const needsShift = parts.includes("shift");

    if (!!event.ctrlKey !== needsCtrl) return false;
    if (!!event.metaKey !== needsMeta) return false;
    if (!!event.altKey !== needsAlt) return false;
    if (!!event.shiftKey !== needsShift) return false;
    return event.key.toLowerCase() === key;
}

function ensureState() {
    if (window.__xcpPerfOverlayState) return window.__xcpPerfOverlayState;

    window.__xcpPerfOverlayState = {
        samples: [],
        rafId: 0,
        lastTs: 0,
        stats: null,
        overlay: null,
        dirty: true,
    };

    return window.__xcpPerfOverlayState;
}

function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
}

function formatMs(v) {
    return `${v.toFixed(1)} ms`;
}

function formatFps(v) {
    if (!Number.isFinite(v) || v <= 0) return "0.0";
    return v.toFixed(1);
}

function collectStats(samples) {
    if (!samples.length) {
        return {
            fps: 0,
            avgMs: 0,
            p95Ms: 0,
            low1Fps: 0,
            maxMs: 0,
            sampleCount: 0,
        };
    }

    const frameTimes = samples.map(s => s.dt).sort((a, b) => a - b);
    const totalMs = frameTimes.reduce((sum, dt) => sum + dt, 0);
    const avgMs = totalMs / frameTimes.length;
    const fps = avgMs > 0 ? (1000 / avgMs) : 0;
    const p95Ms = percentile(frameTimes, 0.95);
    const p99Ms = percentile(frameTimes, 0.99);
    const low1Fps = p99Ms > 0 ? (1000 / p99Ms) : 0;
    const maxMs = frameTimes[frameTimes.length - 1] || 0;

    return {
        fps,
        avgMs,
        p95Ms,
        low1Fps,
        maxMs,
        sampleCount: frameTimes.length,
    };
}

function trimSamples(state, now) {
    const cutoff = now - WINDOW_MS;
    while (state.samples.length && state.samples[0].ts < cutoff) {
        state.samples.shift();
    }
}

function ensureOverlay(state) {
    if (state.overlay && document.body.contains(state.overlay)) return state.overlay;

    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.style.position = "fixed";
    el.style.left = "12px";
    el.style.bottom = "12px";
    el.style.zIndex = "99999";
    el.style.pointerEvents = "none";
    el.style.padding = "8px 10px";
    el.style.borderRadius = "8px";
    el.style.background = "rgba(10, 12, 18, 0.82)";
    el.style.border = "1px solid rgba(255,255,255,0.14)";
    el.style.color = "#d7e3ff";
    el.style.font = "12px/1.45 monospace";
    el.style.whiteSpace = "pre";
    el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
    document.body.appendChild(el);
    state.overlay = el;
    state.dirty = true;
    return el;
}

function destroyOverlay(state) {
    if (state.overlay && state.overlay.parentNode) {
        state.overlay.parentNode.removeChild(state.overlay);
    }
    state.overlay = null;
}

function updateOverlayText(state) {
    if (!isEnabled()) {
        destroyOverlay(state);
        return;
    }

    const overlay = ensureOverlay(state);
    const s = state.stats || collectStats([]);
    const canvas = app?.canvas;
    const scale = canvas?.ds?.scale ?? 0;
    const frame = canvas?.frame ?? 0;
    const selected = app?.canvas?.selected_nodes ? Object.keys(app.canvas.selected_nodes).length : 0;
    const text = [
        "Derp Perf",
        `FPS     ${formatFps(s.fps)}`,
        `1% Low  ${formatFps(s.low1Fps)}`,
        `Avg     ${formatMs(s.avgMs)}`,
        `P95     ${formatMs(s.p95Ms)}`,
        `Max     ${formatMs(s.maxMs)}`,
        `Frames  ${s.sampleCount}`,
        `Zoom    ${scale.toFixed(2)}`,
        `Canvas  ${frame}`,
        `Sel     ${selected}`,
    ].join("\n");

    if (overlay.textContent !== text) overlay.textContent = text;
}

function sampleLoop(ts) {
    const state = ensureState();

    if (!isEnabled()) {
        state.lastTs = 0;
        state.samples.length = 0;
        state.stats = null;
        destroyOverlay(state);
        state.rafId = requestAnimationFrame(sampleLoop);
        return;
    }

    if (state.lastTs > 0) {
        const dt = ts - state.lastTs;
        if (dt > 0 && dt < 1000) {
            state.samples.push({ ts, dt });
            trimSamples(state, ts);
            state.stats = collectStats(state.samples);
            state.dirty = true;
        }
    }

    state.lastTs = ts;

    if (state.dirty) {
        updateOverlayText(state);
        state.dirty = false;
    }

    state.rafId = requestAnimationFrame(sampleLoop);
}

export function initPerfOverlay() {
    const state = ensureState();
    if (state.rafId) return;

    if (!window.__xcpPerfOverlayKeybind) {
        window.__xcpPerfOverlayKeybind = true;
        window.addEventListener("keydown", (event) => {
            if (event.repeat) return;
            if (matchesHotkey(event, getHotkeySetting())) {
                event.preventDefault();
                togglePerfOverlay();
            }
        });
    }

    state.rafId = requestAnimationFrame(sampleLoop);
}

export function togglePerfOverlay(force) {
    const next = typeof force === "boolean"
        ? force
        : !isEnabled();

    if (next) localStorage.setItem("xcp_perf_overlay", "1");
    else localStorage.removeItem("xcp_perf_overlay");

    const state = ensureState();
    state.dirty = true;
    updateOverlayText(state);
    return next;
}
