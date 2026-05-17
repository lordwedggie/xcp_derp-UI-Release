/**
 * Path: ./js/derpSignalOut.js
 * ROLE: UI Layout Maps for derpSignalOut.
 */
import { app } from "../../../scripts/app.js";
import { UI_TYPES } from "./fatha/core/masterLayoutTypes.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "./fatha/helpers/fathaDragDrop.js";

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
                    const sortMode = this.properties.signalSortMode || "Type";
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

                    const activeHash = activeOuts.map((sig, idx) => `${idx}:${sig?.nodeId || ""}:${sig?.type || ""}:${sig?.nodeName || ""}:${!!sig?.isOrphaned}`).join("|");
                    const signalHash = (this.receivedSignals || []).map((sig) => `${sig?.nodeId || ""}:${sig?.type || ""}:${sig?.nodeName || ""}`).join("|");
                    const structureHash = `${activeHash}_${signalHash}_${this.properties.settingActive}_${this.properties.showSignalIds}_${this.properties.showSlotNames}_${this.properties.showSlotTypes}_${this.properties.showVirtualLinks}_${this.properties.signalSortMode}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${mW}_${mH}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}_${this.mode}`;

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
                            margin: [mW, 0, mW, 0], padding: [pW, pH],
                            lblContent: {
                                type: UI_TYPES.TEXT, themeKey: "t_textsystem",
                                text: "Select a detected signal:",
                                labelAlign: ["left", "middle"], width: "full", height: "auto"
                            },
                            // THE DYNAMIC REPETITION: Generate indexed regions to repeat the outputsRegion
                            outputsRegion: {
                                anchor: { target: "lblContent", axis: "y", offset: oY },
                                dir: "row", width: "full", height: 0,
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
                                    alpha: rowAlpha,
                                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
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
                                        endStackDrag(this, "_derpSignalOutDragProxy");
                                        this._signalOutFloatingSnapshot = null;
                                    },
                                    [`lblOutputInfo_${idx}`]: {
                                        type: UI_TYPES.DROPDOWN_DERP, themeKey: "panel, t_textNormal",
                                        wrap: false, // THE TYPO FIX: Changed 'warp' to 'wrap'
                                        minWidth: 100,
                                        canvasShield: true, labelAlign: ["left", "middle"],
                                        indicator: "on",
                                        openOnPress: false,
                                        domPointerEvents: false,
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
                                        alpha: rowAlpha,
                                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
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
                                            if (this._dragThresholdMet) return;
                                            const dropdownReg = this.layout?.regions?.[`lblOutputInfo_${idx}`];
                                            if (dropdownReg) dropdownReg.isPressed = true;
                                            this._derpAwakeFrames = Math.max(this._derpAwakeFrames || 0, 10);
                                            this.setDirtyCanvas?.(true, true);
                                        },
                                        onChange: (val) => {
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
                                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
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
                                        onPress: () => this.removeDerpOutput(idx)
                                    },

                                };
                                return acc;
                            }, {}),
                            signalRegion: {
                                anchor: { target: activeOuts.length > 0 ? `outputsRegion_display_${activeOuts.length - 1}` : "lblContent", axis: "y", offset: sH },
                                dir: "row", width: "full", height: "auto",
                                margin: [0, mH, 0, 0], spacing: [0, sH],
                                dropdownSignalSelect: {
                                    type: UI_TYPES.DROPDOWN_DERP, themeKey: "dialog, t_textNormal",
                                    wrap: false, // THE CUTOFF FIX: Explicitly disable wrapping to prevent row overlaps
                                    canvasShield: true, labelAlign: ["left", "middle"],
                                    width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    indicator: "on",
                                    items: signalItems,
                                    value: this.properties.selectedSignalLabel || "Select signal...",
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
                                text: "Derp SignalOut properties:",
                                width: "full", padding: [pW, pH],
                            },
                            regionCustom_1: {
                                dir: "row", width: "full", height: "auto",
                                spacing: [sW, 0],
                                toggleID: {
                                    type: UI_TYPES.TOGGLE, icon: "radio",
                                    themeKey: "buttonNode, t_textsystem", 
                                    text: "Signal ID",
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
                                    text: "Signal Name",
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
                                    text: "Signal Type",
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
                                    text: "Show input wires",
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
                                spring: { width: "full", height: 0 },
                                lblSort: {
                                    type: UI_TYPES.TEXT,
                                    themeKey: "t_textsystem",
                                    text: "Sort signals by:",
                                    width: "auto",
                                    height: "auto",
                                    padding: [pW, pH]
                                },
                                dropdownSort: {
                                    type: UI_TYPES.DROPDOWN,
                                    themeKey: "panel, t_textsystem",
                                    canvasShield: true,
                                    width: "auto",
                                    height: "auto",
                                    padding: [pW, pH],
                                    labelAlign: ["center", "middle"],
                                    measureText: "Name",
                                    items: ["Name", "Type", "ID"],
                                    value: this.properties.signalSortMode || "Type",
                                    onChange: (val) => {
                                        this.properties.signalSortMode = val || "Type";
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
