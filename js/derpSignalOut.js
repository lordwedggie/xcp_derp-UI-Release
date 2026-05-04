/**
 * Path: ./js/derpSignalOut.js
 * ROLE: UI Layout Maps for derpSignalOut.
 */
import { app } from "../../../scripts/app.js";
import { UI_TYPES } from "./fatha/core/masterLayoutTypes.js";

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
                    const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
                    const callerId = String(this.id);

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
                    const signalItems = (this.receivedSignals || [])
                        .filter(sig => {
                            const sigIdStr = String(sig.nodeId);
                            const sigBaseId = sigIdStr.split(":")[0];
                            const isAlreadyActive = activeIds.has(sigIdStr);
                            const isOwnSignal = sigBaseId === callerId;

                            // THE LOOP GUARD: Block signals that are physically downstream or contain this node in their upstream chain
                            const isDownstream = downstreamIds.has(sigBaseId) || (Array.isArray(sig.upstreamIds) && sig.upstreamIds.some(id => String(id) === callerId));

                            return !isAlreadyActive && !isOwnSignal && !isDownstream;
                        })
                .map(sig => {
                    const type = (sig.type || "unknown").toUpperCase();
                    const showName = !!this.properties.showSlotNames;
                    const showType = !!this.properties.showSlotTypes;
                    const displayName = showName ? sig.nodeName : (sig.nodeName || "").replace(/\s\[[^\]]+\]$/, "");
                    const tag = showType ? ` [${type}]` : "";
                    return `[${sig.nodeId}] ${displayName}${tag}`;
                });

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
                    ...activeOuts.reduce((acc, sig, i) => {
                        const prev = i === 0 ? "outputsRegion" : `outputsRegion_${i - 1}`;

                        // THE GHOST FIX: Check the 'True' slot cache from the Heist instead of the native array
                        const outputs = this._xcpTrueOutputs || this.outputs;
                        const isConnected = !!(outputs && outputs[i] && outputs[i].links && outputs[i].links.length > 0);

                        acc[`outputsRegion_${i}`] = {
                            anchor: { target: prev, axis: "y", offset: i === 0 ? 0 : sH },
                            dir: "row", width: "full", height: "auto",
                            outSlotIdx: i, // GENERIC SLOT TAG: Allows uncleSlotHelper to find this region
                            [`lblOutputInfo_${i}`]: {
                                type: UI_TYPES.DROPDOWN_DERP, themeKey: "panel, t_textNormal",
                                wrap: false, // THE TYPO FIX: Changed 'warp' to 'wrap'
                                minWidth: 100,
                                canvasShield: true, labelAlign: ["left", "middle"],
                                indicator: "on",
                                items: (this.receivedSignals || [])
                                    .filter(s => {
                                        const sType = (s.type || "unknown").toUpperCase();
                                        if (sType !== (sig.type || "unknown").toUpperCase()) return false;
                                        const sigIdStr = String(s.nodeId);
                                        const sigBaseId = sigIdStr.split(":")[0];
                                        const isAlreadyActive = activeIds.has(sigIdStr);
                                        const isOwnSignal = sigBaseId === callerId;

                                        // THE LOOP GUARD: Block signals that are physically downstream or contain this node in their upstream chain
                                        const isDownstream = downstreamIds.has(sigBaseId) || (Array.isArray(s.upstreamIds) && s.upstreamIds.some(id => String(id) === callerId));

                                        return (sigIdStr === String(sig.nodeId)) || (!isAlreadyActive && !isOwnSignal && !isDownstream);
                                    })
                                    .map(s => {
                                        const displayName = this.properties.showSlotNames ? s.nodeName : (s.nodeName || "").replace(/\s\[[^\]]+\]$/, "");
                                        const tag = this.properties.showSlotTypes ? ` [${(s.type || "unknown").toUpperCase()}]` : "";
                                        return `[${s.nodeId}] ${displayName}${tag}`;
                                    }),
                                value: (() => {
                                    const displayName = this.properties.showSlotNames ? sig.nodeName : (sig.nodeName || "").replace(/\s\[[^\]]+\]$/, "");
                                    const tag = this.properties.showSlotTypes ? ` [${(sig.type || "unknown").toUpperCase()}]` : "";
                                    return `[${sig.nodeId}] ${displayName}${tag}`;
                                })(),
                                width: "full", padding: [pW, pH], spacing: [sW, 0],
                                state: isConnected ? "OFF" : "DIS",
                                onChange: (val) => {
                                    const match = val.match(/\[([\d:]+)\]/);
                                    if (match) {
                                        const newSigId = match[1];
                                        const newSig = (this.receivedSignals || []).find(s => String(s.nodeId) === newSigId);
                                        if (newSig) {
                                            this.activeOutputs[i] = newSig;
                                            this.updateReceivedSignals();
                                            this.manageDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                            this.requestDerpSync();
                                        }
                                    }
                                }
                            },
                            [`btnOutputUp_${i}`]: {
                                type: UI_TYPES.ICONBUTTON, themeKey: "buttonNode, t_textSystem",
                                icon: "uparrow", width: "match", height: "fill", spacing: [sW, 0],
                                hidden: !this.properties.settingActive,
                                state: i === 0 ? "DIS" : "OFF",
                                onPress: () => this.moveDerpOutput(i, -1)
                            },
                            [`btnOutputDown_${i}`]: {
                                type: UI_TYPES.ICONBUTTON, themeKey: "buttonNode, t_textSystem",
                                icon: "downarrow", width: "match", height: "fill", spacing: [sW, 0],
                                hidden: !this.properties.settingActive,
                                state: i === activeOuts.length - 1 ? "DIS" : "OFF",
                                onPress: () => this.moveDerpOutput(i, 1)
                            },
                            [`btnOutputDelete_${i}`]: {
                                type: UI_TYPES.ICONBUTTON, themeKey: "buttonNode, t_textSystem",
                                icon: "trash", width: "match", height: "fill", spacing: [sW, 0],
                                onPress: () => this.removeDerpOutput(i)
                            },

                        };
                        return acc;
                    }, {}),
                    regionSettings: {
                        anchor: { target: activeOuts.length > 0 ? `outputsRegion_${activeOuts.length - 1}` : "lblContent", axis: "y", offset: sH },
                        dir: "col", width: "full", height: "auto",
                        hidden: !this.properties.settingActive,
                        linebreakTop: { type: UI_TYPES.LINEBREAK, margin: [-mW, mH] },
                        regionOptions: {
                            dir: "row", width: "full", height: "auto",
                            toggleVirtualWires: {
                                type: UI_TYPES.TOGGLE_V2, themeKey: "dialog, t_textNormal", isTextOnly: true,
                                text: "Show input wires", width: "full", height: "auto", margin: [0, mH],
                                value: !!this.properties.showVirtualLinks,
                                onPress: () => {
                                    this.properties.showVirtualLinks = !this.properties.showVirtualLinks;
                                    this.refreshNodeLayoutMap();
                                    this.requestDerpSync();
                                }
                            }
                        },
                        linebreakBottom: { type: UI_TYPES.LINEBREAK, margin: [-mW, mH] }
                    },
                    signalRegion: {
                        anchor: { target: this.properties.settingActive ? "regionSettings" : (activeOuts.length > 0 ? `outputsRegion_${activeOuts.length - 1}` : "lblContent"), axis: "y", offset: sH },
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
                            onChange: (val) => this.setDerpSelectedSignal(val)
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
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    width: "full", height: "auto", margin: [mW, mH],
                    lblInfo: {
                        // THE CONSTANT FIX: Access UI_TYPES directly instead of via the node instance
                        type: UI_TYPES.TEXT_HTML, themeKey: "t_textsystem", mouseOver: false,
                        text: "SignalOut node settings:", width: "auto", height: "auto",
                        padding: [pW, pH]
                    },
                    regionCustom_1: {
                        dir: "row", width: "full", height: "auto",
                        toggleSlotName: {
                            type: UI_TYPES.TOGGLE_V2,
                            themeKey: "buttonNode, t_textsystem",
                            text: "Slot Name",
                            width: "auto", height: "full",
                            padding: [pW, pH],
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
                            type: UI_TYPES.TOGGLE_V2,
                            themeKey: "buttonNode, t_textsystem",
                            text: "Slot Type",
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