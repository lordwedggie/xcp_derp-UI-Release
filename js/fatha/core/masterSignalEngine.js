/**
 * Path: ./js/fatha/core/masterSignalEngine.js
 * ROLE: The "Wireless" broadcaster for the Derp ecosystem.
 */

if (!window.xcpDerpSignals) {
    window.xcpDerpSignals = {};
}

if (!window.xcpDerpTypeColors) {
    window.xcpDerpTypeColors = {
        "INT": "#22ddff", "FLOAT": "#66ff66", "STRING": "#ffaa66",
        "MODEL": "#B39DDB", "VAE": "#FF6E6E", "CLIP": "#FFD500",
        "LATENT": "#FF9CF9", "IMAGE": "#64B5F6", "MASK": "#81C784",
        "CONDITIONING": "#FFA931", "EMPTY_LATENT": "#FF9CF9", "AUDIO": "#ffff66",
        "LORA": "#FF8A80", "LORA_STACK": "#FF5252",
        "CLIP_VISION": "#A8DADC", "CLIP_VISION_OUTPUT": "#ad7452",
        "CONTROL_NET": "#6EE7B7", "STYLE_MODEL": "#C2FFAE",
        "NOISE": "#B0B0B0", "GUIDER": "#66FFFF", "SAMPLER": "#ECB4B4",
        "SIGMAS": "#CDFFCD", "TAESD": "#DCC274",
        "ANY": "#DDDDDD"
    };
}

if (!window.xcpDerpBrightenHex) {
    window.xcpDerpBrightenHex = function(hex, percent) {
        hex = hex.replace(/^\s*#|\s*$/g, '');
        if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
        let r = parseInt(hex.substr(0, 2), 16),
            g = parseInt(hex.substr(2, 2), 16),
            b = parseInt(hex.substr(4, 2), 16);

        r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
        g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
        b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));

        return '#' +
            r.toString(16).padStart(2, '0') +
            g.toString(16).padStart(2, '0') +
            b.toString(16).padStart(2, '0');
    };
}

export function refreshWirelessSignalConsumers() {
    if (!window.app || !window.app.graph) return;
    window.app.graph._nodes.forEach((n) => {
        if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) {
            n.updateReceivedSignals();
            if (n.manageDerpOutputs) n.manageDerpOutputs();
            if (n.refreshNodeLayoutMap) n.refreshNodeLayoutMap();
            if (n.refreshDerpSignalOutSysMap) n.refreshDerpSignalOutSysMap();
            if (n.requestDerpSync) n.requestDerpSync();
            return;
        }

        if (n.properties?.derpRemoteBypass?.signalId && typeof n.applyRemoteBypassSignal === "function") {
            n.applyRemoteBypassSignal();
            return;
        }

        if (!n?.properties?.multiSignalIds) return;
        if (n.refreshNodeLayoutMap) n.refreshNodeLayoutMap();
        if (n.requestDerpSync) n.requestDerpSync();
    });
}

export function transmitDerpSignal(node, value, options = {}) {
    if (!node || node.id === undefined) return;
    if (node.mode === 4 || node.mode === 2) return; // THE ENGINE-LEVEL BYPASS FIX

    const baseId = String(node.id);
    const nodeName = node.titleLabel || node.title || "Unknown";

    // THE VIRTUAL NODE FIX: Correctly detect empty output arrays for virtual nodes
    const outputs = (node.outputs && node.outputs.length > 0) ? node.outputs : [{ type: "*", name: node.properties?.outputName || "Output_01" }];

    const normalizeOutputType = (rawType) => {
        if (rawType === "*") return "*";
        if (typeof rawType === "string") return rawType.toLowerCase();
        if (rawType && typeof rawType.name === "string") return rawType.name.toLowerCase();
        if (Array.isArray(rawType)) return String(rawType[0] || "unknown").toLowerCase();
        return String(rawType || "unknown").toLowerCase();
    };

    let hasChanged = false;

    outputs.forEach((output, index) => {
        // THE FULL-IDENTITY FIX: Always include the port label, even for single-output nodes
        const signalId = (outputs.length > 1 || options.forceIndexedSingleOutput) ? `${baseId}:${index}` : baseId;
        const portLabel = output.label || output.name || index;
        const displayName = `${nodeName} [${portLabel}]`;

        let valType = "unknown";
        if (Array.isArray(options.forceSignalType)) {
            valType = [...options.forceSignalType];
        } else if (options.forceSignalType && typeof options.forceSignalType === "string") {
            valType = options.forceSignalType.toLowerCase();
        } else if (output.type !== "*") {
            const raw = normalizeOutputType(output.type);
            // THE NORMALIZATION FIX: Standardize types for the receiver registry
            if (raw.includes("latent")) valType = "latent";
            else if (raw.includes("image")) valType = "image";
            else if (raw.includes("mask")) valType = "mask";
            else if (raw.includes("audio")) valType = "audio";
            else if (raw.includes("conditioning")) valType = "conditioning";
            else if (raw.includes("model")) valType = "model";
            else if (raw.includes("clip")) valType = "clip";
            else if (raw.includes("vae")) valType = "vae";
            else valType = raw;
        } else {
            valType = (value === null) ? "null" : (Array.isArray(value) ? "array" : typeof value);
            if (valType === "number") valType = Number.isInteger(value) ? "int" : "float";
        }

        const currentValStr = JSON.stringify(window.xcpDerpSignals[signalId]?.value);
        const newValStr = JSON.stringify(value);

        let extractedUpstream = [];
        if (value && typeof value === 'object') {
            // 1. Inherit existing chain
            if (Array.isArray(value.upstream_ids)) {
                extractedUpstream.push(...value.upstream_ids.map(id => String(id).split(":")[0]));
            }
            // 2. Add immediate parents
            if (value.model_id) extractedUpstream.push(String(value.model_id).split(":")[0]);
            if (value.clip_id) extractedUpstream.push(String(value.clip_id).split(":")[0]);
        }

        // Update if data, name, or resolved type changed
        const currentTypeStr = JSON.stringify(window.xcpDerpSignals[signalId]?.type);
        const newTypeStr = JSON.stringify(valType);
        if (newValStr !== currentValStr || window.xcpDerpSignals[signalId]?.nodeName !== displayName || currentTypeStr !== newTypeStr) {
            hasChanged = true;
            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
                nodeName: displayName,
                nodeType: node.type || "Node",
                type: valType,
                value: value,
                upstreamIds: [...new Set(extractedUpstream)],
                timestamp: Date.now(),
                isPureVirtual: !!(node.isPureVirtual || node.properties?.isPureVirtual)
            };

            fetch("/xcp/update_signal", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ node_id: signalId, value: value })
            });
        }
    });

    // Force any open SignalOut nodes to refresh their received signals
    if (hasChanged) refreshWirelessSignalConsumers();
}

function normalizeOutputType(rawType) {
    if (rawType === "*") return "*";
    if (typeof rawType === "string") return rawType.toLowerCase();
    if (rawType && typeof rawType.name === "string") return rawType.name.toLowerCase();
    if (Array.isArray(rawType)) return String(rawType[0] || "unknown").toLowerCase();
    return String(rawType || "unknown").toLowerCase();
}

function getSignalRegistryType(rawType, value) {
    if (rawType !== "*") {
        const normalized = normalizeOutputType(rawType);
        if (normalized.includes("latent")) return "latent";
        if (normalized.includes("image")) return "image";
        if (normalized.includes("mask")) return "mask";
        if (normalized.includes("audio")) return "audio";
        if (normalized.includes("conditioning")) return "conditioning";
        if (normalized.includes("model")) return "model";
        if (normalized.includes("clip")) return "clip";
        if (normalized.includes("vae")) return "vae";
        return normalized;
    }

    const valueType = value === null ? "null" : (Array.isArray(value) ? "array" : typeof value);
    if (valueType === "number") return Number.isInteger(value) ? "int" : "float";
    return valueType;
}

function getBypassSignalValue(rawType) {
    const normalized = normalizeOutputType(rawType);
    if (normalized.includes("string") || normalized.includes("text") || normalized.includes("prompt")) return "";
    if (normalized === "*" || normalized === "any") return null;
    return null;
}

export function clearBypassSignalDebouncers(node) {
    if (!node) return;
    ["_signalSyncDebouncer", "_twSyncDebouncer"].forEach((key) => {
        if (node[key]) {
            clearTimeout(node[key]);
            node[key] = null;
        }
    });
}

export function transmitBypassedDerpSignals(node, options = {}) {
    if (!node || node.id === undefined) return;

    const baseId = String(node.id);
    const nodeName = node.titleLabel || node.title || "Unknown";
    const outputs = (node.outputs && node.outputs.length > 0)
        ? node.outputs
        : [{ type: "*", name: node.properties?.outputName || "Output_01" }];

    let hasChanged = false;

    outputs.forEach((output, index) => {
        const signalId = (outputs.length > 1 || options.forceIndexedSingleOutput) ? `${baseId}:${index}` : baseId;
        const portLabel = output.label || output.name || index;
        const displayName = `${nodeName} [${portLabel}]`;
        const value = getBypassSignalValue(output.type);
        const valType = getSignalRegistryType(output.type, value);
        const currentValStr = JSON.stringify(window.xcpDerpSignals[signalId]?.value);
        const newValStr = JSON.stringify(value);

        if (newValStr !== currentValStr || window.xcpDerpSignals[signalId]?.nodeName !== displayName || window.xcpDerpSignals[signalId]?.type !== valType) {
            hasChanged = true;
            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
                nodeName: displayName,
                nodeType: node.type || "Node",
                type: valType,
                value,
                upstreamIds: [],
                timestamp: Date.now(),
                isPureVirtual: !!(node.isPureVirtual || node.properties?.isPureVirtual)
            };

            fetch("/xcp/update_signal", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ node_id: signalId, value })
            });
        }
    });

    if (hasChanged) refreshWirelessSignalConsumers();
}

/**
 * HEARTBEAT: Broadcasters all widget values for the node.
 * Updated to support widget-less nodes (like VAE Decode).
 */
export function runWirelessHeartbeat(node, options = {}) {
    if (!node.properties?.isWirelessTransmitter || node.mode === 4 || node.mode === 2) return; // THE ENGINE-LEVEL BYPASS FIX
    if (node.properties?.skipGenericWirelessHeartbeat) return;

    const values = {};
    if (node.widgets) {
        node.widgets.forEach(w => {
            if (w.name && w.value !== undefined) {
                values[w.name] = w.value;
            }
        });
    }

    const outputHasImage = Array.isArray(node.outputs) && node.outputs.some((o) => {
        const t = (typeof o?.type === "string" ? o.type : "").toLowerCase();
        return t.includes("image");
    });

    // IMAGE bridge for default ComfyUI preview-style nodes (e.g. VAE Decode).
    // Prefer execution result metadata first, then canvas preview metadata.
    if (outputHasImage && node && node.imgs && node.imgs[0] && node.imgs[0].src) {
        try {
            const src = String(node.imgs[0].src || "");
            const qIndex = src.indexOf("?");
            if (qIndex >= 0 && src.indexOf("/view") >= 0) {
                const query = src.slice(qIndex + 1);
                const params = new URLSearchParams(query);
                const filename = params.get("filename");
                const type = params.get("type") || "output";
                const subfolder = params.get("subfolder") || "";
                if (filename) {
                    transmitDerpSignal(node, {
                        images: [{ filename, type, subfolder }]
                    }, { ...options, forceSignalType: "image" });
                    return;
                }
            }
        } catch (e) {
            // Ignore and continue with generic heartbeat fallback.
        }
    }

    if (outputHasImage && window.app && window.app.nodeOutputs) {
        try {
            const result = window.app.nodeOutputs[String(node.id)] || window.app.nodeOutputs[node.id];
            if (result) {
                const images = Array.isArray(result.images) ? result.images : [];
                const uiImages = result.ui && Array.isArray(result.ui.images) ? result.ui.images : [];
                const outputImages = result.output && Array.isArray(result.output.images) ? result.output.images : [];
                const finalImages = images.length > 0 ? images : (uiImages.length > 0 ? uiImages : outputImages);
                if (finalImages.length > 0) {
                    transmitDerpSignal(node, {
                        images: finalImages
                    }, { ...options, forceSignalType: "image" });
                    return;
                }
            }
        } catch (e) {
            // Ignore and continue with generic heartbeat fallback.
        }
    }

    // Do not overwrite IMAGE signals with empty/generic heartbeat payloads.
    // IMAGE-producing default Comfy nodes should only broadcast real preview/result metadata.
    if (outputHasImage) {
        return;
    }

    const keys = Object.keys(values);
    // THE WIDGET-LESS FIX: Transmit even if no widgets exist so the signal is registered.
    const finalValue = keys.length === 0 ? {} : (keys.length === 1 ? values[keys[0]] : values);
    transmitDerpSignal(node, finalValue, options);
}

/**
 * PURGE: Removes a specific node's signal from the registry.
 */
export function purgeDerpSignal(nodeId) {
    const sId = String(nodeId);
    let hasPurged = false;

    // THE MULTI-PURGE FIX: Clean up all signals associated with this node (e.g., "10", "10:0", "10:1")
    Object.keys(window.xcpDerpSignals).forEach(key => {
        if (key === sId || key.startsWith(`${sId}:`)) {
            delete window.xcpDerpSignals[key];
            hasPurged = true;
        }
    });

    if (hasPurged) {
        // Notify Python to release VRAM/RAM for this node
        fetch("/xcp/purge_signal", {
            method: "POST",
            body: JSON.stringify({ node_id: nodeId })
        });

        if (window.app && window.app.graph) {
            window.app.graph._nodes.forEach(n => {
                if (n.type === "xcpDerpMasterSwitch" && n.updateMasterSwitchSignals) {
                    n.updateMasterSwitchSignals();
                } else if (n.syncDerpOutputs && n.properties?.multiSignalIds) {
                    n.syncDerpOutputs();
                }
            });
            refreshWirelessSignalConsumers();
            window.app.canvas.setDirty(true, true);
        }
    }
}
