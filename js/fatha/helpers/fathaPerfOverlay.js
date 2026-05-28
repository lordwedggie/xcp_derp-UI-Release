import { app } from "../../../../scripts/app.js";
import { MASTER_Z, getMasterZDebugSnapshot } from "../core/masterZ.js";

const WINDOW_MS = 4000;
const OVERLAY_ID = "xcp-derp-perf-overlay";
const TOP_LIMIT = 6;
const OVERLAY_SECTION_COLOR = "rgba(255,255,255,0.7)";
const OVERLAY_BG_COLOR = "rgba(0,0,0,0.5)";

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

function getPerfRowColor(score) {
    if (!Number.isFinite(score) || score <= 0) return "#d7e3ff";
    if (score > 500) return "#ff6b57";
    if (score > 300) return "#ffb347";
    if (score < 200) return "#7CFF6B";
    return "#d7e3ff";
}

function getFpsColor(fps) {
    if (!Number.isFinite(fps) || fps <= 0) return "#ff6b57";
    if (fps < 30) return "#ff6b57";
    if (fps < 40) return "#ffb347";
    if (fps > 50) return "#7CFF6B";
    return "#d7e3ff";
}

function getMsColor(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "#d7e3ff";
    if (ms > 100) return "#ff6b57";
    if (ms > 50) return "#ffb347";
    if (ms <= 25) return "#7CFF6B";
    return "#d7e3ff";
}

function getFramesColor(count) {
    if (!Number.isFinite(count) || count <= 0) return "#d7e3ff";
    if (count < 120) return "#7CFF6B";
    if (count < 240) return "#d7e3ff";
    if (count < 360) return "#ffb347";
    return "#ff6b57";
}

function getOverlayFontSize() {
    const n = Number(window.DERP_GLOBAL_SETTINGS?.perfOverlayFontSize);
    if (!Number.isFinite(n)) return 12;
    return Math.max(9, Math.min(24, Math.floor(n)));
}

function formatMetricLine(label, value) {
    return `${String(label).padEnd(11, " ")} ${value}`;
}

function isZOrderDebugEnabled() {
    return window.DERP_GLOBAL_SETTINGS?.perfOverlayShowZOrder === true;
}

function collectStats(samples) {
    if (!samples.length) {
        return {
            fps: 0,
            avgMs: 0,
            medianFps: 0,
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
    const medianMs = frameTimes[Math.floor(frameTimes.length / 2)] || 0;
    const medianFps = medianMs > 0 ? (1000 / medianMs) : 0;
    const p95Ms = percentile(frameTimes, 0.95);
    const p99Ms = percentile(frameTimes, 0.99);
    const low1Fps = p99Ms > 0 ? (1000 / p99Ms) : 0;
    const maxMs = frameTimes[frameTimes.length - 1] || 0;

    return {
        fps,
        avgMs,
        medianFps,
        p95Ms,
        low1Fps,
        maxMs,
        sampleCount: frameTimes.length,
    };
}

function getCanvasFrame() {
    return app?.canvas?.frame ?? 0;
}

function getNodeLabel(node) {
    return node?.titleLabel || node?.title || node?.type || node?.id || "unknown";
}

function getNodeKind(node) {
    if (!node) return "node";
    if (window.xcpActiveBastas?.has?.(node.id)) return "basta";
    if (node.isFathaNode) return "fatha";
    if (node.isUncleNode) return "uncle";
    if (node._twPerf) return "triggerwall";
    if (node._overlayPerf || node._bldPerf) return "basta";
    return String(node.type || node.title || "node").toLowerCase();
}

function getPerfScore(node) {
    if (!node) return 0;
    const bld = node._bldPerf;
    const tw = node._twPerf;
    let score = 0;

    if (bld) {
        score += Number(bld.drawMs || 0);
        score += Number(bld.updateMs || 0);
        score += Number(bld.layoutMs || 0);
        score += Number(bld.bgMs || 0);
        score += Number(bld.overlayBgMs || 0);
        score += Number(bld.componentLoopMs || 0);
        score += Number(bld.componentMs || 0);
        score += Number(bld.shieldMs || 0);
    }

    if (tw) {
        // Trigger widget time is a subset of TriggerWall draw time, so summing both
        // exaggerates the node's score and makes the overlay misleading.
        score += Number(tw.drawMs || 0);
        score += Number(tw.measureCount || 0) * 0.1;
    }

    return score;
}

function getPerfSummary(node) {
    if (!node) return null;
    const kind = getNodeKind(node);
    const title = getNodeLabel(node);
    const overlayPerf = node._overlayPerf || null;
    const bld = node._bldPerf || null;
    const tw = node._twPerf || null;

    const drawMs = Number(overlayPerf?.drawMs || bld?.drawMs || tw?.drawMs || 0);
    const updateMs = Number(overlayPerf?.updateMs || bld?.updateMs || 0);
    const layoutMs = Number(bld?.layoutMs || 0);
    const loopMs = Number(bld?.componentLoopMs || 0);
    const componentMs = Number(bld?.componentMs || 0);
    const shieldMs = Number(bld?.shieldMs || 0);
    const triggerMs = Number(tw?.triggerWidgetMs || 0);
    const fpsLoad = drawMs + updateMs + layoutMs + loopMs + componentMs + shieldMs;

    return {
        kind,
        title,
        score: fpsLoad,
        drawMs,
        updateMs,
        layoutMs,
        loopMs,
        componentMs,
        shieldMs,
        triggerMs,
        dirty: Number(bld?.dirty || tw?.dirtyCount || 0),
        sync: Number(bld?.syncReq || tw?.syncReqCount || 0),
        samples: Number(overlayPerf?.samples?.length || 0),
    };
}

function collectTopPerfNodes() {
    const rows = [];
    const seen = new Set();

    for (const basta of (window.xcpActiveBastas?.values?.() || [])) {
        const row = getPerfSummary(basta);
        if (row) {
            rows.push(row);
            seen.add(`${row.kind}:${row.title}`);
        }
    }

    const graphNodes = app?.graph?._nodes || app?.graph?.nodes || [];
    for (const node of graphNodes) {
        const row = getPerfSummary(node);
        if (row) {
            rows.push(row);
            seen.add(`${row.kind}:${row.title}`);
            continue;
        }

        const kind = getNodeKind(node);
        const title = getNodeLabel(node);
        const key = `${kind}:${title}`;
        if (!seen.has(key) && (node?.isFathaNode || node?.isUncleNode || node?._twPerf || node?._bldPerf)) {
            rows.push({
                kind,
                title,
                score: 0,
                drawMs: 0,
                updateMs: 0,
                layoutMs: 0,
                loopMs: 0,
                componentMs: 0,
                shieldMs: 0,
                triggerMs: 0,
                dirty: 0,
                sync: 0,
            });
            seen.add(key);
        }
    }

    return rows
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_LIMIT);
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
    el.style.zIndex = String(MASTER_Z.perfOverlay);
    el.style.pointerEvents = "none";
    el.style.padding = "8px 10px";
    el.style.borderRadius = "8px";
    el.style.background = OVERLAY_BG_COLOR;
    el.style.border = "1px solid rgba(255,255,255,0.14)";
    el.style.color = "#d7e3ff";
    el.style.font = `${getOverlayFontSize()}px/1.45 monospace`;
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
    overlay.style.font = `${getOverlayFontSize()}px/1.45 monospace`;
    const s = state.stats || collectStats([]);
    const canvas = app?.canvas;
    const scale = canvas?.ds?.scale ?? 0;
    const frame = getCanvasFrame();
    const selected = app?.canvas?.selected_nodes ? Object.keys(app.canvas.selected_nodes).length : 0;
    const topNodes = collectTopPerfNodes();
    const showRanking = window.DERP_GLOBAL_SETTINGS?.perfOverlayShowRanking !== false;
    const zSnapshot = isZOrderDebugEnabled() ? getMasterZDebugSnapshot(app?.graph || null, 5) : null;
    const rankingBlock = showRanking ? [
        "",
        "",
        "",
        "",
        { text: "Top performance impact:", color: OVERLAY_SECTION_COLOR },
        ...(topNodes.length ? topNodes.map((row, idx) => ({
            text: `${idx + 1}. ${row.kind} ${row.title} ${formatMs(row.score)} n:${row.samples || 0}`.slice(0, 80),
            color: getPerfRowColor(row.score),
        })) : [{ text: "(none)", color: "#d7e3ff" }]),
    ] : [];
    const zBlock = zSnapshot ? [
        "",
        "",
        { text: "Z-order diagnostics:", color: OVERLAY_SECTION_COLOR },
        formatMetricLine("Derp", `${zSnapshot.derpNodes}/${zSnapshot.totalGraphNodes}`),
        formatMetricLine("Selected", zSnapshot.selectedDerpNodes),
        {
            text: formatMetricLine("Mismatch", zSnapshot.mismatches.length),
            color: zSnapshot.mismatches.length ? "#ff6b57" : "#7CFF6B",
        },
        ...(zSnapshot.top.length ? zSnapshot.top.map((row, idx) => ({
            text: `${idx + 1}. #${row.graphIndex} z:${row.shieldZ ?? "?"}/${row.domZ ?? "?"}${row.selected ? " *" : ""} ${row.title}`.slice(0, 80),
            color: row.domZ !== null && String(row.domZ) !== String(row.shieldZ) ? "#ff6b57" : "#d7e3ff",
        })) : [{ text: "(no derp nodes)", color: "#d7e3ff" }]),
    ] : [];
    const lines = [
        { text: "Derp perfrmance tracker:", color: OVERLAY_SECTION_COLOR },
        { text: formatMetricLine("FPS", formatFps(s.fps)), color: getFpsColor(s.fps) },
        { text: formatMetricLine("Median FPS", formatFps(s.medianFps)), color: getFpsColor(s.medianFps) },
        formatMetricLine("1% Low", formatFps(s.low1Fps)),
        { text: formatMetricLine("P95", formatMs(s.p95Ms)), color: getMsColor(s.p95Ms) },
        { text: formatMetricLine("Max", formatMs(s.maxMs)), color: getMsColor(s.maxMs) },
        formatMetricLine("Zoom", scale.toFixed(2)),
        ...rankingBlock,
        ...zBlock,
    ];

    const text = lines.map(line => typeof line === "string" ? line : line.text).join("\n");
    if (overlay.textContent !== text) overlay.textContent = text;

    const spans = overlay.querySelectorAll("span[data-perf-row]");
    if (spans.length === 0) {
        overlay.innerHTML = lines.map(line => {
            if (typeof line === "string") return `<div>${line}</div>`;
            const safe = String(line.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<div><span data-perf-row="1" style="color:${line.color};">${safe}</span></div>`;
        }).join("");
    } else {
        const rowEls = overlay.querySelectorAll("span[data-perf-row]");
        let rowIndex = 0;
        for (const line of lines) {
            if (typeof line === "string") continue;
            const el = rowEls[rowIndex++];
            if (!el) continue;
            if (el.textContent !== line.text) el.textContent = line.text;
            if (el.style.color !== line.color) el.style.color = line.color;
        }
    }
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

    updateOverlayText(state);
    state.dirty = false;

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
