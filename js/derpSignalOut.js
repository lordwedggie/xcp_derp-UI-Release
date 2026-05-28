/**
 * Path: ./js/derpSignalOut.js
 * ROLE: UI Layout Maps for derpSignalOut.
 */
import { app } from "../../../scripts/app.js";
import { UI_TYPES } from "./fatha/core/masterLayoutTypes.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "./fatha/helpers/fathaDragDrop.js";
import { showBastaFileHandler } from "./fatha/bastas/bastaFileHandler.js";

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

function getLocalizedSortModeLabel(mode) {
    const normalized = String(mode || "Type");
    if (normalized === "ID") return tLocale("$derp_router.sort.id", "ID");
    if (normalized === "Type") return tLocale("$derp_router.sort.type", "Type");
    return tLocale("$derp_router.sort.name", "Name");
}

function normalizeSortModeLabel(value) {
    const raw = String(value || "").trim();
    const lower = raw.toLowerCase();
    const nameLabel = String(tLocale("$derp_router.sort.name", "Name")).trim().toLowerCase();
    const typeLabel = String(tLocale("$derp_router.sort.type", "Type")).trim().toLowerCase();
    const idLabel = String(tLocale("$derp_router.sort.id", "ID")).trim().toLowerCase();
    if (lower === "id" || lower === idLabel) return "ID";
    if (lower === "type" || lower === typeLabel) return "Type";
    if (lower === "name" || lower === nameLabel) return "Name";
    return "Type";
}

function cancelSignalOutRowDrag(node) {
    endStackDrag(node, "_derpSignalOutDragProxy");
    if (node) node._signalOutFloatingSnapshot = null;
}

if (!window._xcp_derpSignalOut_Layout_Loaded) {
    window._xcp_derpSignalOut_Layout_Loaded = true;
    try {
        app.registerExtension({
            name: "xcp.derpSignalOut_Layout",
            async beforeRegisterNodeDef(nodeType, nodeData) {
                if (nodeData.name !== "xcpDerpSignalOut") return;
                nodeType.prototype.onDerpSettingsPress = function() {
                    this.refreshNodeLayoutMap();
                };
                // --- LAYOUT MAPS ---
                nodeType.prototype.refreshNodeLayoutMap = function() {
                    if (this.flags?.collapsed || this.size?.[0] <= 0) return;
                    const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
                    const callerId = String(this.id);
                    const isPlainWrapperSignalId = (signalId) => /^\d+$/.test(String(signalId || ""));
                    const showSignalIds = this.properties.showSignalIds !== false;
                    const sortMode = normalizeSortModeLabel(this.properties.signalSortMode || "Type");
                    const normalizeSignalType = (rawType) => {
                        if (Array.isArray(rawType)) return "COMBO";
                        if (typeof rawType === "string") return rawType.toUpperCase();
                        if (rawType && typeof rawType.name === "string") return rawType.name.toUpperCase();
                        return String(rawType || "unknown").toUpperCase();
                    };
                    const formatSignalLabel = (signal) => {
                        if (!signal) return "";
                        const type = normalizeSignalType(signal.type);
                        const showName = !!this.properties.showSlotNames;
                        const showType = !!this.properties.showSlotTypes;
                        const idPrefix = showSignalIds ? `[${signal.nodeId}] ` : "";
                        const displayName = showName ? signal.nodeName : (signal.nodeName || "").replace(/\s\[[^\]]+\]$/, "");
                        const tag = showType ? ` [${type}]` : "";
                        return `${idPrefix}${displayName}${tag}`;
                    };
                    const resolveSignalIdFromLabel = (label) => {
                        const match = String(label || "").match(/\[([\d:]+)\]/);
                        if (match) return match[1];
                        return this._signalLabelToId?.get(String(label || "")) || null;
                    };
                    const getSignalSortValue = (signal) => {
                        if (sortMode === "Type") return normalizeSignalType(signal?.type);
                        if (sortMode === "ID") {
                            const signalId = String(signal?.nodeId || "");
                            const [baseId, slotId = ""] = signalId.split(":");
                            const baseNum = parseInt(baseId, 10);
                            const slotNum = parseInt(slotId, 10);
                            return `${Number.isNaN(baseNum) ? baseId : String(baseNum).padStart(10, "0")}:${Number.isNaN(slotNum) ? slotId : String(slotNum).padStart(10, "0")}`;
                        }
                        return String(signal?.nodeName || "").toLowerCase();
                    };
                    const sortSignals = (signals) => [...signals].sort((a, b) => {
                        const primary = getSignalSortValue(a).localeCompare(getSignalSortValue(b), undefined, { numeric: true, sensitivity: "base" });
                        if (primary !== 0) return primary;
                        return String(a?.nodeId || "").localeCompare(String(b?.nodeId || ""), undefined, { numeric: true, sensitivity: "base" });
                    });

                    // THE PHYSICAL LOOP GUARD: Traverse outputs to find all downstream nodes
                    const downstreamIds = new Set();
                    const visited = new Set();
                    const queue = [this];
                    while (queue.length > 0) {
                        const n = queue.shift();
                        if (!n || visited.has(n.id)) continue;
                        visited.add(n.id);
                        if (String(n.id) !== callerId) downstreamIds.add(String(n.id));
                        if (n.outputs) {
                            for (const out of n.outputs) {
                                if (out.links) {
                                    for (const lId of out.links) {
                                        const l = app.graph.links[lId];
                                        if (l && l.target_id) {
                                            const target = app.graph.getNodeById(l.target_id);
                                            if (target) queue.push(target);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    const activeOuts = this.activeOutputs || [];
                    const activeIds = new Set(activeOuts.map(s => String(s.nodeId)));
                    this._signalLabelToId = new Map();
                    const signalItems = sortSignals((this.receivedSignals || [])
                        .filter(sig => {
                            const sigIdStr = String(sig.nodeId);
                            const sigBaseId = sigIdStr.split(":")[0];
                            const isAlreadyActive = activeIds.has(sigIdStr);
                            const isOwnSignal = sigBaseId === callerId;
                            const isWrapperSignal = isPlainWrapperSignalId(sigIdStr);
                            const isSignalOutSignal = sig.nodeType === "xcpDerpSignalOut";

                            // THE LOOP GUARD: Block signals that are physically downstream or contain this node in their upstream chain
                            const isDownstream = downstreamIds.has(sigBaseId) || (Array.isArray(sig.upstreamIds) && sig.upstreamIds.some(id => String(id) === callerId));

                            return !isWrapperSignal && !isSignalOutSignal && !isAlreadyActive && !isOwnSignal && !isDownstream;
                        }))
                        .map(sig => {
                            const label = formatSignalLabel(sig);
                            this._signalLabelToId.set(label, String(sig.nodeId));
                            return label;
                        });
                    const signalPromptLabel = tLocale("$derp_router.signals.select", "Select signal...");
                    const signalEmptyLabel = tLocale("$derp_router.signals.none_detected", "No signals detected...");

                    const activeHash = activeOuts.map((sig, idx) => `${idx}:${sig?.nodeId || ""}:${sig?.type || ""}:${sig?.nodeName || ""}:${!!sig?.isOrphaned}`).join("|");
                    const signalHash = (this.receivedSignals || []).map((sig) => `${sig?.nodeId || ""}:${sig?.type || ""}:${sig?.nodeName || ""}`).join("|");
                    const structureHash = `${activeHash}_${signalHash}_${this.properties.settingActive}_${this.properties.showSignalIds}_${this.properties.showSlotNames}_${this.properties.showSlotTypes}_${this.properties.showVirtualLinks}_${this.properties.hideLinkSlots}_${this.properties.signalSortMode}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${mW}_${mH}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}_${this.mode}`;

                    if (this._layoutMapHash === structureHash && this.layoutMap) {
                        this.requestDerpSync();
                        return;
                    }
                    this._layoutMapHash = structureHash;

                    const outputItems = activeOuts.map((sig, idx) => ({ sig, idx }));
                    let floatingItem = null;
                    const dragSnapshot = this._signalOutFloatingSnapshot || null;
                    const dragPlaceholderHeight = Math.max(1, Number(dragSnapshot?.baseReg?.h) || 30);
                    const dragIndex = this._dragTrig?.index;
                    const hasDragPickup = this._dragTrig && this._dragThresholdMet && dragIndex !== undefined;
                    const hasDropPreview = hasDragPickup && this._dropPreviewIdx !== undefined;

                    if (hasDropPreview) {
                        const drag = this._dragTrig;
                        const previewIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : drag.index;
                        [floatingItem] = outputItems.splice(drag.index, 1);
                        const ghost = { ...floatingItem, isPreviewGhost: true };
                        outputItems.splice(previewIdx, 0, ghost);
                    }

                    this.layoutMap = {
                        contentRegion: {
                            anchor: { target: "headerRegion", axis: "y", offset: oY },
                            dir: "col", width: "full", height: "auto",
                            margin: [mW, mW, mW, 0], padding: [pW, pH], 
                            lblContent: {
                                type: UI_TYPES.TEXT, themeKey: "t_textsystem",
                                text: `${(this.receivedSignals || []).length} signals detected. ${activeOuts.length} added.`,
                                labelAlign: ["left", "middle"], width: "full", height: "auto", 
                            },
                            // THE DYNAMIC REPETITION: Generate indexed regions to repeat the outputsRegion
                            outputsRegion: {
                                anchor: { target: "lblContent", axis: "y"}, 
                                dir: "row", width: "full", height: 0, margin: [0, sH],
                                hidden: activeOuts.length === 0,
                                outSlotIdx: -1 // THE TAG FIX: Recognize base anchor as a slot container
                            },
                            ...outputItems.reduce((acc, item, displayIdx) => {
                                const { sig, idx } = item;
                                const prev = displayIdx === 0 ? "outputsRegion" : `outputsRegion_display_${displayIdx - 1}`;
                                const rowKey = `outputsRegion_display_${displayIdx}`;

                                // THE GHOST FIX: Check the 'True' slot cache from the Heist instead of the native array
                                const outputs = this._xcpTrueOutputs || this.outputs;
                                const slotLinks = outputs?.[idx]?.links || [];
                                const hasSlotLinks = slotLinks.some((linkId) => !!app.graph?.links?.[linkId]);
                                const hasGraphLinks = Object.values(app.graph?.links || {}).some((link) => String(link?.origin_id ?? link?.source_id) === callerId && Number(link?.origin_slot ?? link?.source_slot) === idx);
                                const isConnected = hasSlotLinks || hasGraphLinks;
                                const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
                                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === idx && !item.isPreviewGhost);
                                const isHiddenGhost = item.isPreviewGhost === true;
                                const isPickupOriginRow = !!(hasDragPickup && !hasDropPreview && dragIndex === idx && !item.isPreviewGhost);
                                const shouldGhostHideChildren = isHiddenGhost;
                                const rowAlpha = (isHiddenGhost || isPickupOriginRow) ? 0 : 1.0;

                                acc[rowKey] = {
                                    anchor: { target: prev, axis: "y", offset: displayIdx === 0 ? 0 : sH },
                                    dir: "row", width: "full", height: item.isPreviewGhost ? dragPlaceholderHeight : "auto",
                                    outSlotIdx: idx, // GENERIC SLOT TAG: Allows uncleSlotHelper to find this region
                                    state: item.isPreviewGhost ? "DIS" : (isPickedUp ? "ON" : "OFF"),
                                    pulseStates: isPickedUp,
                                    pulseFromState: "_ON",
                                    pulseToState: "_DIS",
                                    alpha: rowAlpha,
                                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey, { holdOnly: true }),
                                    onDrag: (e, data) => { updateStackDrag(this, data, "outputsRegion_display_", activeOuts.length); this.refreshNodeLayoutMap(); },
                                    onDragEnd: () => {
                                        const fromIdx = this._dragTrig?.index;
                                        const toIdx = this._dropPreviewIdx;
                                        endStackDrag(this, "_derpSignalOutDragProxy");
                                        this._signalOutFloatingSnapshot = null;
                                        if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx && this.reorderDerpOutputs) {
                                            this.reorderDerpOutputs(fromIdx, toIdx);
                                        }
                                    },
                                    onPress: () => {
                                        cancelSignalOutRowDrag(this);
                                    },
                                    [`lblOutputInfo_${idx}`]: {
                                        type: UI_TYPES.FILEBROWSER,
                                        icon: "dropdown",
                                        themeKey: "panel, t_textNormal",
                                        minWidth: 100,
                                        canvasShield: true,
                                        bypassHashOptimization: true,
                                        mode: "file",
                                        rootName: "signals",
                                        mouseOver: true,
                                        items: sortSignals((this.receivedSignals || [])
                                            .filter(s => {
                                                const sType = normalizeSignalType(s.type);
                                                if (sType !== normalizeSignalType(sig.type)) return false;
                                                const sigIdStr = String(s.nodeId);
                                                const sigBaseId = sigIdStr.split(":")[0];
                                                const isAlreadyActive = activeIds.has(sigIdStr);
                                                const isOwnSignal = sigBaseId === callerId;
                                                const isWrapperSignal = isPlainWrapperSignalId(sigIdStr);
                                                const isSignalOutSignal = s.nodeType === "xcpDerpSignalOut";

                                                // THE LOOP GUARD: Block signals that are physically downstream or contain this node in their upstream chain
                                                const isDownstream = downstreamIds.has(sigBaseId) || (Array.isArray(s.upstreamIds) && s.upstreamIds.some(id => String(id) === callerId));

                                                return (sigIdStr === String(sig.nodeId)) || (!isWrapperSignal && !isSignalOutSignal && !isAlreadyActive && !isOwnSignal && !isDownstream);
                                            }))
                                            .map(s => {
                                                const label = formatSignalLabel(s);
                                                this._signalLabelToId.set(label, String(s.nodeId));
                                                return label;
                                            }),
                                        hidden: shouldGhostHideChildren,
                                        value: formatSignalLabel(sig),
                                        width: "full", padding: [pW, pH], spacing: [sW, 0],
                                        state: isPickedUp ? "ON" : ((isBypassed || !isConnected) ? "DIS" : "OFF"),
                                        allowOpenWhenDisabled: true,
                                        canOpenPicker: true,
                                        onPress: () => cancelSignalOutRowDrag(this),
                                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey, { holdOnly: true }),
                                        onDrag: (e, data) => { updateStackDrag(this, data, "outputsRegion_display_", activeOuts.length); this.refreshNodeLayoutMap(); },
                                        onDragEnd: () => {
                                            const fromIdx = this._dragTrig?.index;
                                            const toIdx = this._dropPreviewIdx;
                                            cancelSignalOutRowDrag(this);
                                            if (fromIdx !== undefined && toIdx !== undefined && fromIdx !== toIdx && this.reorderDerpOutputs) {
                                                this.reorderDerpOutputs(fromIdx, toIdx);
                                            }
                                        },
                                        alpha: rowAlpha,
                                        onChange: (val) => {
                                            cancelSignalOutRowDrag(this);
                                            const newSigId = resolveSignalIdFromLabel(val);
                                            if (newSigId) {
                                                const newSig = (this.receivedSignals || []).find(s => String(s.nodeId) === newSigId);
                                                if (newSig) {
                                                    this.activeOutputs[idx] = newSig;
                                                    this.updateReceivedSignals();
                                                    this.manageDerpOutputs();
                                                    this.refreshNodeLayoutMap();
                                                    this.requestDerpSync();
                                                }
                                            }
                                        }
                                    },
                                    [`btnOutputDelete_${idx}`]: {
                                        type: UI_TYPES.ICONBUTTON, themeKey: "buttonNode, t_textSystem",
                                        hidden: shouldGhostHideChildren,
                                        icon: "trash", width: "match", height: "fill", spacing: [sW, 0],
                                        alpha: rowAlpha,
                                    onPress: () => {
                                            cancelSignalOutRowDrag(this);
                                            showBastaFileHandler(this, "none", `btnOutputDelete_${idx}`, {
                                                title: "Remove Signal",
                                                message: `Remove signal ${formatSignalLabel(sig)}?`,
                                                confirm: "Remove",
                                                mode: "delete",
                                                playSound: "delete",
                                                onConfirm: () => {
                                                    this.removeDerpOutput(idx);
                                                }
                                            });
                                        }
                                    },

                                };
                                return acc;
                            }, {}),
                            signalRegion: {
                                anchor: { target: activeOuts.length > 0 ? `outputsRegion_display_${activeOuts.length - 1}` : "lblContent", axis: "y", offset: sH },
                                dir: "row", width: "full", height: "auto",
                                spacing: [0, sH],
                                dropdownSignalSelect: {
                                    type: UI_TYPES.FILEBROWSER, searchTab: true,
                                    icon: "dropdown",
                                    themeKey: "dialog, t_textNormal",
                                    canvasShield: true,
                                    bypassHashOptimization: true,
                                    mouseOver: true,
                                    canOpenPicker: signalItems.length > 0,
                                    width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    mode: "file",
                                    rootName: "signals",
                                    items: signalItems,
                                    value: signalItems.length === 0 ? signalEmptyLabel : (this.properties.selectedSignalLabel || signalPromptLabel),
                                    state: (this.mode === 4 || this.mode === 2 || !signalItems?.length) ? "DIS" : "OFF",
                                    onChange: (val) => {
                                        const signalId = resolveSignalIdFromLabel(val);
                                        if (signalId) {
                                            this.properties.selectedSignalId = signalId;
                                            this.addDerpOutput();
                                        }
                                    }
                                },
                                btnRefreshSignals: {
                                    type: UI_TYPES.ICONBUTTON,
                                    themeKey: "buttonNode, t_textsystem",
                                    icon: "refresh",
                                    width: "auto", height: "full",
                                    padding: [pW, pH],
                                    onPress: () => {
                                        if (this.forceSignalRefresh) this.forceSignalRefresh();
                                        else {
                                            this._lastSignalStructureHash = null;
                                            if (this.updateReceivedSignals) this.updateReceivedSignals();
                                            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                            this.requestDerpSync();
                                        }
                                    }
                                }
                            },
                            layoutSpacer: {
                                anchor: { target: "signalRegion", axis: "y", offset: oY },
                            }
                        },
                    };

                    if (this.layout) this.layout._lastCacheKey = "";
                    this.requestDerpSync();
                };

                nodeType.prototype.refreshDerpSignalOutSysMap = function() {
                    const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
                    this.sysLayoutMap = {
                        sysCustomRegion: {
                            anchor: { target: "sysDefaultControlsRegion", axis: "y" },
                            width: "full", height: "auto", margin: [mW, mH],
                            lblTitle: {
                                type: this.UI_TYPES.TEXT, mouseOver: false,
                                themeKey: "t_textSystem",
                                labelAlign: ["left", "middle"],
                                text: "$derp_router.system.properties",
                                width: "full", padding: [pW, pH],
                            },
                            regionCustom_1: {
                                dir: "row", width: "full", height: "auto",
                                spacing: [sW, 0],
                                toggleID: {
                                    type: UI_TYPES.TOGGLE, icon: "radio",
                                    themeKey: "buttonNode, t_textsystem", 
                                    text: "$derp_router.system.signal_id",
                                    width: "auto", height: "full",
                                    padding: [pW, pH], spacing: [sW, 0],
                                    value: this.properties.showSignalIds !== false,
                                    onPress: () => {
                                        this.properties.showSignalIds = this.properties.showSignalIds === false;
                                        this.manageDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpSignalOutSysMap();
                                        this.requestDerpSync();
                                    }
                                },
                                toggleSlotName: {
                                    type: UI_TYPES.TOGGLE, icon: "radio",
                                    themeKey: "buttonNode, t_textsystem",
                                    text: "$derp_router.system.signal_name",
                                    width: "auto", height: "full",
                                    padding: [pW, pH], spacing: [sW, 0],
                                    value: !!this.properties.showSlotNames,
                                    onPress: () => {
                                        this.properties.showSlotNames = !this.properties.showSlotNames;
                                        this.manageDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpSignalOutSysMap();
                                        this.requestDerpSync();
                                    }
                                },
                                toggleSlotType: {
                                    type: UI_TYPES.TOGGLE, icon: "radio",
                                    themeKey: "buttonNode, t_textsystem",
                                    text: "$derp_router.system.signal_type",
                                    width: "auto", height: "full",
                                    padding: [pW, pH],
                                    value: !!this.properties.showSlotTypes,
                                    onPress: () => {
                                        this.properties.showSlotTypes = !this.properties.showSlotTypes;
                                        this.manageDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpSignalOutSysMap();
                                        this.requestDerpSync();
                                    }
                                },
                            },
                            regionCustom_2: {
                                anchor: { target: "regionCustom_1", axis: "y", offset: sH },
                                dir: "row", width: "full", height: "auto",
                                spacing: [sW, 0,], margin: [0, 0, 0, mH],
                                toggleVirtualWires: {
                                    type: UI_TYPES.TOGGLE, icon: "radio",
                                    themeKey: "buttonNode, t_textsystem",
                                    text: "$derp_router.system.show_input_wires",
                                    width: "full", height: "auto",
                                    padding: [pW, pH],
                                    value: !!this.properties.showVirtualLinks,
                                    onPress: () => {
                                        this.properties.showVirtualLinks = !this.properties.showVirtualLinks;
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpSignalOutSysMap();
                                        this.requestDerpSync();
                                    }
                                },
                                toggleHideSlot: {
                                    type: UI_TYPES.TOGGLE, icon: "radio",
                                    themeKey: "buttonNode, t_textsystem",
                                    text: "Hide Link Slots",
                                    toolTip: "When enabled, Link Slots are only shown when the node is selected.",
                                    width: "full", height: "auto",
                                    padding: [pW, pH],
                                    value: !!this.properties.hideLinkSlots,
                                    onPress: () => {
                                        this.properties.hideLinkSlots = !this.properties.hideLinkSlots;
                                        if (typeof this.syncUncleSlots === "function") this.syncUncleSlots();
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpSignalOutSysMap();
                                        this.requestDerpSync();
                                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                                    }
                                },
                                spring: { width: "full", height: 0 },
                                lblSort: {
                                    type: UI_TYPES.TEXT,
                                    themeKey: "t_textsystem",
                                    text: "$derp_router.system.sort_signals_by",
                                    width: "auto",
                                    height: "auto",
                                    padding: [pW, pH]
                                },
                                dropdownSort: {
                                    type: UI_TYPES.FILEBROWSER,
                                    icon: "dropdown",
                                    themeKey: "panel, t_textsystem",
                                    canvasShield: true,
                                    width: "auto",
                                    height: "auto",
                                    padding: [pW, pH],
                                    mode: "file",
                                    rootName: "sort",
                                    items: ["$derp_router.sort.name", "$derp_router.sort.type", "$derp_router.sort.id"],
                                    value: getLocalizedSortModeLabel(this.properties.signalSortMode || "Type"),
                                    onChange: (val) => {
                                        this.properties.signalSortMode = normalizeSortModeLabel(val || "Type");
                                        if (typeof window._xcpCloseActiveDropdown === "function") {
                                            window._xcpCloseActiveDropdown();
                                        }
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpSignalOutSysMap();
                                        this.requestDerpSync();
                                    }
                                }
                            }
                        },
                    };

                    if (this._derpPanel && typeof this._derpPanel.setLayoutMap === "function") {
                        this._derpPanel.setLayoutMap(this.sysLayoutMap);
                    }
                };
            }
        });
    } catch (e) {
        console.warn("xcp.derpSignalOut_Layout extension already registered.");
    }
}
