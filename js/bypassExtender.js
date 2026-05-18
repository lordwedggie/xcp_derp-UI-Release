/**
 * Path: ./js/bypassExtender.js
 * ROLE: Adds remote BOOL-driven bypass control to default ComfyUI nodes.
 */
import { app } from "../../../scripts/app.js";

const REMOTE_BYPASS_MENU = "🔀 Apply Derp Remote Bypass";
const REMOTE_BYPASS_CLEAR = "🔀 Clear Derp Remote Bypass";
const REMOTE_BYPASS_META = "derpRemoteBypass";

function getSignalRegistry() {
    return window.xcpDerpSignals || {};
}

function normalizeSignalType(rawType) {
    if (Array.isArray(rawType)) return String(rawType[0] || "unknown").toLowerCase();
    if (typeof rawType === "string") return rawType.toLowerCase();
    if (rawType && typeof rawType.name === "string") return rawType.name.toLowerCase();
    return String(rawType || "unknown").toLowerCase();
}

function isBoolSignal(sig) {
    if (!sig) return false;
    const type = normalizeSignalType(sig.type);
    if (type === "bool" || type === "boolean") return true;
    return typeof sig.value === "boolean";
}

function getBoolSignals() {
    return Object.values(getSignalRegistry())
        .filter((sig) => sig && isBoolSignal(sig))
        .sort((a, b) => String(a.nodeName || "").localeCompare(String(b.nodeName || ""), undefined, { numeric: true, sensitivity: "base" }));
}

function formatBypassSignalLabel(sig) {
    const rawName = String(sig?.nodeName || sig?.nodeId || "");
    const match = rawName.match(/^(.*)\s\[([^\]]+)\]$/);
    if (!match) return rawName;

    const nodeName = match[1].trim();
    const signalName = match[2].trim();
    if (!signalName || signalName === "BOOL_OUT") return nodeName;
    return `${nodeName}: ${signalName}`;
}

function getRemoteBypassState(node) {
    return node?.properties?.[REMOTE_BYPASS_META] || null;
}

function setRemoteBypassState(node, nextState) {
    node.properties = node.properties || {};
    if (nextState) node.properties[REMOTE_BYPASS_META] = nextState;
    else delete node.properties[REMOTE_BYPASS_META];
}

function getSignalById(signalId) {
    if (!signalId) return null;
    return getSignalRegistry()[String(signalId)] || null;
}

function markNodeDirty(node) {
    if (node?.setDirtyCanvas) node.setDirtyCanvas(true, true);
    if (app?.graph?.change) app.graph.change();
}

function applyRemoteBypass(node) {
    const state = getRemoteBypassState(node);
    if (!state?.signalId) return;
    const sig = getSignalById(state.signalId);

    if (!sig || !isBoolSignal(sig)) {
        const didModeChange = node.mode !== 0;
        if (didModeChange) node.mode = 0;
        setRemoteBypassState(node, null);
        markNodeDirty(node);
        return;
    }

    const desiredMode = sig.value === true ? 0 : 4;
    const missing = false;
    const nextLabel = formatBypassSignalLabel(sig) || state.signalLabel || state.signalId;
    const nextState = {
        signalId: String(sig.nodeId),
        signalLabel: nextLabel,
        missing,
    };

    const didMetaChange = state.signalLabel !== nextState.signalLabel || state.missing !== nextState.missing;
    if (didMetaChange) setRemoteBypassState(node, nextState);

    if (node.mode !== desiredMode) {
        node.mode = desiredMode;
        markNodeDirty(node);
        return;
    }

    if (didMetaChange) markNodeDirty(node);
}

function buildSignalOptions(node) {
    const current = getRemoteBypassState(node);
    const boolSignals = getBoolSignals();
    const options = [];

    boolSignals.forEach((sig) => {
        const label = formatBypassSignalLabel(sig) || `${sig.nodeName || sig.nodeId}`;
        options.push({ content: label, callback: () => {
            setRemoteBypassState(node, {
                signalId: String(sig.nodeId),
                signalLabel: label,
                missing: false,
            });
            applyRemoteBypass(node);
            markNodeDirty(node);
        } });
    });

    if (options.length === 0) {
        options.push({ content: "(No BOOL wireless signals found)", disabled: true });
    }

    if (current?.signalId && current?.missing) {
        options.unshift({ content: `Current: ${current.signalLabel || current.signalId} (missing)`, disabled: true });
    } else if (current?.signalId) {
        options.unshift({ content: `Current: ${current.signalLabel || current.signalId}`, disabled: true });
    }

    return options;
}

app.registerExtension({
    name: "xcp.RemoteBypassExtender",
    async setup() {
        if (!app?.graph) return;

        const originalOnNodeAdded = app.graph.onNodeAdded;
        app.graph.onNodeAdded = function(node) {
            if (originalOnNodeAdded) originalOnNodeAdded.apply(this, arguments);
            if (node?.properties?.[REMOTE_BYPASS_META]?.signalId && typeof node.applyRemoteBypassSignal === "function") {
                node.applyRemoteBypassSignal();
            }
        };
    },
    async beforeRegisterNodeDef(nodeType) {
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
            if (this.isFathaNode || this.isUncleNode) return;

            const node = this;
            const current = getRemoteBypassState(node);

            options.push({
                content: REMOTE_BYPASS_MENU,
                has_submenu: true,
                submenu: {
                    options: buildSignalOptions(node)
                }
            });

            if (current?.signalId) {
                options.push({
                    content: `${REMOTE_BYPASS_CLEAR}${current.missing ? " (missing)" : ""}`,
                    callback: () => {
                        setRemoteBypassState(node, null);
                        markNodeDirty(node);
                    }
                });
            }
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            const state = getRemoteBypassState(this);
            if (!state?.signalId) return;

            const tag = state.missing ? "RB?" : "RB";
            ctx.save();
            ctx.font = "10px Arial";
            ctx.textAlign = "right";
            ctx.textBaseline = "top";
            ctx.fillStyle = state.missing ? "#ff9e80" : "#b3e5fc";
            ctx.fillText(tag, (this.size?.[0] || 0) - 8, 24);
            ctx.restore();
        };

        nodeType.prototype.applyRemoteBypassSignal = function() {
            applyRemoteBypass(this);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (getRemoteBypassState(this)?.signalId) {
                applyRemoteBypass(this);
            }
        };

        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function() {
            if (onAdded) onAdded.apply(this, arguments);
            if (getRemoteBypassState(this)?.signalId) {
                applyRemoteBypass(this);
            }
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            if (onRemoved) onRemoved.apply(this, arguments);
            setRemoteBypassState(this, null);
        };
    }
});
