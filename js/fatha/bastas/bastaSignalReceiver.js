/**
 * Path: ./js/fatha/bastas/bastaSignalReceiver.js
 * ROLE: A dedicated Basta for managing and receiving wireless signals.
 */
import { spawnBasta } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { runWirelessHeartbeat } from "../core/masterSignalEngine.js";

export const getSignalReceiverId = () => `basta_signal_receiver_global_unique_id`;

function normalizeSignalType(type) {
    if (Array.isArray(type)) return "COMBO";
    return String(type || "unknown").toUpperCase();
}

function signalTypeMatches(sig, targetType) {
    if (targetType === "ANY") return true;
    const nodeType = String(sig?.nodeType || "").toLowerCase();
    const nodeName = String(sig?.nodeName || "").toLowerCase();
    if (targetType === "SAMPLER") return nodeType.includes("samplerloader") || nodeName.includes("[sampler]");
    if (targetType === "SCHEDULER") return nodeType.includes("schedulerloader") || nodeName.includes("[scheduler]");
    const type = sig?.type;
    if (Array.isArray(type)) return type.some(item => String(item || "").toUpperCase() === targetType);
    return normalizeSignalType(type) === targetType;
}

function isPlainWrapperSignalId(signalId) {
    return /^\d+$/.test(String(signalId || ""));
}

function hasIndexedSignalForBase(globalSignals, baseId) {
    return Object.values(globalSignals || {}).some(sig => {
        const sigId = String(sig?.nodeId || "");
        return sigId.startsWith(`${baseId}:`);
    });
}

export function showBastaSignalReceiver(host, targetRegion = null, params = {}) {
    const id = getSignalReceiverId();

    // THE REGISTRY KICK: Force all transmitters to broadcast presence so the list isn't empty on first run
    if (window.app?.graph?._nodes) {
        window.app.graph._nodes.forEach(n => {
            if (n.properties?.isWirelessTransmitter) runWirelessHeartbeat(n);
        });
    }

    const config = {
        host: host,
        titleLabel: "Signal Receiver",
        autoSize: true,
        // THE PINNING OVERRIDE FIX: Detach the dynamic panel from the anchor logic if a custom position was saved
        targetRegion: (host && host.properties && host.properties[`bastaOffset_${id}`]) ? null : targetRegion,
        properties: {
            clickToClose: false,
            bastaMovalbe: true,
            bastaSingleton: true,
            autoWidth: true,
            snapHeight: false,
            bastaBackgroundKey: "systemBackground"
        },
        initialSize: [250, 100],

        layoutMap: (basta, vars) => {
            const { mW, mH, sW, sH, oY, pW, pH } = vars;

            const globalSignals = window.xcpDerpSignals || {};
            const baseTypes = Array.isArray(params.types) && params.types.length > 0 ? params.types : ["ANY"];
            const additionalTypes = Array.isArray(params.additionalTypes) ? params.additionalTypes : [];
            const filterTypes = [...new Set([...baseTypes, ...additionalTypes])];
            const layoutOverrides = params.layoutOverrides || {};
            const labelOverrides = layoutOverrides.signalLabelText || {};
            const hiddenLabels = new Set(layoutOverrides.hiddenSignalLabels || []);

            const signalRows = filterTypes.reduce((acc, type, idx) => {
                const targetType = type.toUpperCase();
                let items = Object.values(globalSignals)
                    .filter(sig => {
                        const callerId = String(basta.hostNode?.id);
                        const sigIdStr = String(sig.nodeId);
                        const sigBaseId = sigIdStr.split(":")[0];
                        const isOwnSignal = sigBaseId === callerId;
                        const isWrapperSignal = isPlainWrapperSignalId(sigIdStr) && hasIndexedSignalForBase(globalSignals, sigBaseId);
                        const isDownstream = Array.isArray(sig.upstreamIds) && sig.upstreamIds.some(id => String(id) === callerId);
                        const typeMatches = signalTypeMatches(sig, targetType);
                        return typeMatches && !isWrapperSignal && !isOwnSignal && !isDownstream;
                    })
                    .sort((a, b) => parseInt(a.nodeId || 0) - parseInt(b.nodeId || 0))
                    .map(sig => `[${sig.nodeId}] ${sig.nodeName} [${normalizeSignalType(sig.type)}]`);

                // Hard fallback: if IMAGE list is empty, derive candidates from current graph
                // by checking nodes that expose IMAGE outputs and are wireless-enabled.
                if (targetType === "IMAGE" && items.length === 0 && window.app?.graph?._nodes) {
                    const callerId = String(basta.hostNode?.id);
                    const derived = [];

                    window.app.graph._nodes.forEach((node) => {
                        if (!node || String(node.id) === callerId) return;
                        if (!node.properties?.isWirelessTransmitter) return;

                        const outs = Array.isArray(node.outputs) ? node.outputs : [];
                        const hasImageOutput = outs.some((o) => String(o?.type || "").toUpperCase().includes("IMAGE"));
                        if (!hasImageOutput) return;

                        const signalId = `${node.id}:0`;
                        const nodeName = node.titleLabel || node.title || node.type || `Node ${node.id}`;

                        derived.push(`[${signalId}] ${nodeName} [IMAGE]`);
                    });

                    if (derived.length > 0) {
                        items = derived;
                    }
                }

                const prevKey = idx === 0 ? "headerSpacer" : `dropdownSignalSelect_${idx - 1}`;
                const rowAnchor = { target: prevKey, axis: "y", offset: idx === 0 ? 0 : sH };

                acc[`signalLabel_${idx}`] = {
                    anchor: rowAnchor,
                    type: UI_TYPES.TEXT,
                    hidden: hiddenLabels.has(targetType),
                    themeKey: "t_textSystem",
                    text: labelOverrides[targetType] || `Select ${targetType} Signal:`,
                    labelAlign: ["left", "middle"],
                    width: "full", margin: [0, 0, 0, 0]
                };

                const canOpenPicker = items.length > 0;

                acc[`dropdownSignalSelect_${idx}`] = {
                    anchor: { target: `signalLabel_${idx}`, axis: "y", offset: sH },
                    type: UI_TYPES.FILEBROWSER,
                    icon: "dropdown",
                    canvasShield: true,
                    themeKey: "dialog, t_textSmall",
                    mode: "file",
                    rootName: "signals",
                    mouseOver: canOpenPicker,
                    canOpenPicker,
                    bypassHashOptimization: true,
                    width: "full", height: "auto", padding: [pW, pH],
                    items: items,
                    value: basta.hostNode?.properties?.multiSignalLabels?.[idx] || (items.length > 0 ? "Select signal..." : `No ${targetType} signals found`),
                    state: (basta.hostNode?.mode === 4 || basta.hostNode?.mode === 2) ? "DIS" : "OFF",
                    onChange: (val) => {
                        if (!items || items.length === 0) return; // THE SAFETY GUARD: Prevent committing fallback text to properties
                        if (basta.hostNode) {
                            if (!basta.hostNode.properties.multiSignalLabels) basta.hostNode.properties.multiSignalLabels = {};
                            if (!basta.hostNode.properties.multiSignalIds) basta.hostNode.properties.multiSignalIds = {};

                            basta.hostNode.properties.multiSignalLabels[idx] = val;
                            const match = val.match(/\[([\d:]+)\]/);
                            if (match) basta.hostNode.properties.multiSignalIds[idx] = match[1];

                            const currentReg = basta.layout?.regions?.[`dropdownSignalSelect_${idx}`];
                            if (currentReg) {
                                currentReg.value = val;
                                currentReg.text = val;
                                currentReg.items = items;
                            }

                            if (basta.hostNode.setDerpSelectedSignal) {
                                basta.hostNode.setDerpSelectedSignal(val, idx);
                            }

                            if (basta.hostNode.refreshNodeLayoutMap) basta.hostNode.refreshNodeLayoutMap();
                            if (basta.hostNode.requestDerpSync) basta.hostNode.requestDerpSync();
                            basta.hostNode._derpAwakeFrames = 5;
                            basta._layoutDirty = true;
                            basta._forceSync = true;
                            basta.requestDerpSync();
                        }
                    }
                };
                return acc;
            }, {});

            return {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    dir: "col",
                    width: "full",
                    height: "auto",
                    margin: [mW, 0],
                    headerSpacer: { height: mH },
                    ...signalRows
                },

                footerRegion: {
                    anchor: { target: "contentRegion", axis: "y", offset: oY },
                    btnCloseFooter: {
                        type: UI_TYPES.BUTTON,
                        themeKey: "buttonNode, t_textSystem",
                        objectAlign: ["right", "middle"], labelAlign: ["center", "middle"],
                        text: "Close",
                        width: "auto",
                        height: "auto",
                        onPress: () => basta.close()
                    }
                }
            };
        }
    };

    return spawnBasta(id, config);
}