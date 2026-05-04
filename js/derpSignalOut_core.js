/**
 * Path: ./js/derpSignalOut_core.js
 * ROLE: Core extension logic and signal engine for derpSignalOut.
 */
import { app } from "../../../scripts/app.js";
import { uncle } from "./fatha/uncle.js";
import { handleInitDerpGlobalListener } from "./fatha/core/fathaHandler.js";

if (!window._xcp_derpSignalOut_Core_Loaded) {
    window._xcp_derpSignalOut_Core_Loaded = true;
    try {
        app.registerExtension({
            name: "xcp.derpSignalOut_Core",
    async setup() {
        handleInitDerpGlobalListener(app);

        // Force SignalOut nodes to refresh when the graph changes (new nodes added, removed)
        const originalOnNodeAdded = app.graph.onNodeAdded;
        app.graph.onNodeAdded = function(node) {
            if (originalOnNodeAdded) originalOnNodeAdded.apply(this, arguments);
            if (node.type === "xcpDerpSignalOut") {
                node.updateReceivedSignals();
                node.refreshNodeLayoutMap();
            } else if (node.properties?.isWirelessTransmitter) {
                app.graph._nodes.forEach(n => {
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) {
                        n.updateReceivedSignals();
                        if (n.refreshNodeLayoutMap) n.refreshNodeLayoutMap();
                        n.requestDerpSync();
                    }
                });
            }
        };

        const originalOnNodeRemoved = app.graph.onNodeRemoved;
        app.graph.onNodeRemoved = function(node) {
            if (originalOnNodeRemoved) originalOnNodeRemoved.apply(this, arguments);
            if (node.type === "xcpDerpSignalOut") {
                if (node.activeOutputs) {
                    node.activeOutputs = [];
                    node.properties.activeOutputs = 0;
                    if (node.manageDerpOutputs) node.manageDerpOutputs();
                }
            }
            app.graph._nodes.forEach(n => {
                if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) {
                    n.updateReceivedSignals();
                    if (n.refreshNodeLayoutMap) n.refreshNodeLayoutMap();
                    n.requestDerpSync();
                }
            });
        };

        // THE GRAPH ENGINE FIX: Hijack prompt compilation to inject invisible wires.
        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = function() {
            // ANTI-PRUNING PROTOCOL: Flag both transmitters AND receivers as output nodes.
            // This prevents ComfyUI from stripping the wireless bridge chain from the execution.
            const criticalNodes = app.graph._nodes.filter(n =>
                n.properties?.isWirelessTransmitter || n.type === "xcpDerpSignalOut"
            );
            const originalStates = new Map();

            criticalNodes.forEach(n => {
                originalStates.set(n, n.isOutput);
                n.isOutput = () => true; // Strictly a function
            });

            let res;
            try {
                res = originalGraphToPrompt.apply(this, arguments);
            } catch (e) {
                criticalNodes.forEach(n => n.isOutput = originalStates.get(n));
                throw e;
            }

            const modifyPrompt = (promptData) => {
                // THE DATA HARDENING: Ensure we find the node dictionary regardless of wrapper objects
                const nodes = promptData.output || promptData;
                if (nodes && typeof nodes === "object") {
                    for (const nodeId in nodes) {
                        const node = nodes[nodeId];
                        if (node.class_type === "xcpDerpSignalOut" && node.inputs?.signal_data) {
                            try {
                                const sigData = JSON.parse(node.inputs.signal_data);
                                const activeIds = sigData.activeOutputIds || [];
                                activeIds.forEach((sourceId, idx) => {
                                    const parts = String(sourceId).split(":");
                                    const baseId = parts[0];
                                    const portIdx = parts.length > 1 ? parseInt(parts[1]) : 0;

                                    const sourceNode = app.graph.getNodeById(baseId);
                                    const hasSlots = sourceNode && sourceNode.outputs && sourceNode.outputs.length > 0;

                                    // THE PURE VIRTUAL GUARD: Prevent physical wires to virtual nodes (like Lora Stacks)
                                    // since they don't have Python RETURN_TYPES and will cause a validation crash.
                                    const isVirtual = sourceNode && (sourceNode.isPureVirtual || sourceNode.properties?.isPureVirtual);

                                    if (nodes[baseId] && hasSlots && !isVirtual) {
                                        node.inputs[`_hidden_wire_${idx}`] = [baseId, portIdx];
                                    }
                                });
                            } catch(e) {}
                        }
                    }
                }

                // RESTORE STATES
                criticalNodes.forEach(n => n.isOutput = originalStates.get(n));
                return promptData;
            };

            return (res instanceof Promise) ? res.then(modifyPrompt) : modifyPrompt(res);
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "xcpDerpSignalOut") return;

        // --- 1. PROTOTYPE INJECTION ---
        uncle(nodeType, nodeData, 160);

        /**
         * Dynamic Slot Management
         */
        nodeType.prototype.manageDerpOutputs = function() {
            const INVISIBLE_CHAR = '\u200b';
            const targetTotal = Math.min(this.properties.activeOutputs || 0, 16);

            if (!this.outputs) this.outputs = [];

            // First, trim if too many
            while (this.outputs.length > targetTotal) {
                this.removeOutput(this.outputs.length - 1);
            }

            // THE DYNAMIC TYPE & COLOR ENGINE: Pulled from global registry
            const TYPE_COLORS = window.xcpDerpTypeColors || {};

            for (let i = 0; i < targetTotal; i++) {
                const sig = (this.activeOutputs || [])[i];
                let rawType = (sig && sig.type && sig.type !== "unknown") ? sig.type.toUpperCase() : "ANY";

                // THE VISIBILITY FIX: Respect visibility toggles for both Name and Type
                const showName = !!this.properties.showSlotNames;
                const showType = !!this.properties.showSlotTypes;
                const displayName = sig ? (showName ? sig.nodeName : sig.nodeName.replace(/\s\[[^\]]+\]$/, "")) : INVISIBLE_CHAR;
                const tag = (sig && showType) ? ` [${rawType}]` : "";
                const targetLabel = `${displayName}${tag}`;

                // THE NORMALIZATION FIX: Map variants to standard Comfy types
                if (rawType.includes("EMPTY") && rawType.includes("LATENT")) rawType = "EMPTY_LATENT";
                else if (rawType.includes("LATENT")) rawType = "LATENT";
                else if (rawType.includes("IMAGE")) rawType = "IMAGE";
                else if (rawType.includes("MASK")) rawType = "MASK";
                else if (rawType.includes("AUDIO")) rawType = "AUDIO";
                else if (rawType.includes("CONDITIONING")) rawType = "CONDITIONING";

                const targetType = rawType === "ANY" ? "*" : rawType;
                const targetColor = TYPE_COLORS[rawType] || null;

                if (!this.outputs[i]) {
                    this.addOutput(targetLabel, targetType);
                } else {
                    this.outputs[i].name = targetLabel;
                    this.outputs[i].type = targetType;
                }

                this.outputs[i].color = targetColor;
                this.outputs[i].color_off = targetColor;
                this.outputs[i].color_on = targetColor;
            }

            // CRITICAL: Ensure exactly 16 outputs to match Python's RETURN_TYPES
            const REQUIRED_OUTPUTS = 16;
            while (this.outputs.length < REQUIRED_OUTPUTS) {
                const padIdx = this.outputs.length;
                this.addOutput(INVISIBLE_CHAR, "*");
                if (this.outputs[padIdx]) {
                    this.outputs[padIdx].color = "rgba(0,0,0,0)";
                    this.outputs[padIdx].color_off = "rgba(0,0,0,0)";
                    this.outputs[padIdx].color_on = "rgba(0,0,0,0)";
                }
            }
            while (this.outputs.length > REQUIRED_OUTPUTS) {
                this.removeOutput(this.outputs.length - 1);
            }
        };

        /**
         * UI Interaction Protocol: Refactored logic to keep layout maps pure
         */
        nodeType.prototype.setDerpSelectedSignal = function(val) {
            const match = val.match(/\[([\d:]+)\]/);
            if (match) {
                this.properties.selectedSignalId = match[1];
                this.addDerpOutput();
            }
        };

        nodeType.prototype.addDerpOutput = function() {
            const sig = (this.receivedSignals || []).find(s => String(s.nodeId) === String(this.properties.selectedSignalId));
            if (sig) {
                // THE HEIGHT FIX: Reset saved heights to allow auto-expansion when a new signal is added
                this._preCollapseHeight = null;

                if (!this.activeOutputs) this.activeOutputs = [];
                this.activeOutputs.push(sig);
                this.properties.activeOutputs = this.activeOutputs.length;

                // THE RESET FIX: Clear selection properties so the dropdown returns to its default state
                this.properties.selectedSignalLabel = "Select signal...";
                this.properties.selectedSignalId = null;

                this.updateReceivedSignals();
                this.manageDerpOutputs();
                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                this.requestDerpSync();
            }
        };

        nodeType.prototype.removeDerpOutput = function(idx) {
            let cachedLinks = [];
            if (this.outputs && app.graph) {
                const currentSlot = this.outputs[idx];
                if (currentSlot && currentSlot.links) {
                    [...currentSlot.links].forEach(lId => app.graph.removeLink(lId));
                }
                for (let j = idx + 1; j < this.outputs.length; j++) {
                    const slot = this.outputs[j];
                    if (slot.links) {
                        const slotLinks = [...slot.links].map(lId => {
                            const l = app.graph.links[lId];
                            return l ? { node: app.graph.getNodeById(l.target_id), slot: l.target_slot, linkId: lId, newIdx: j - 1 } : null;
                        }).filter(Boolean);
                        cachedLinks.push(...slotLinks);
                        slotLinks.forEach(l => app.graph.removeLink(l.linkId));
                    }
                }
            }

            if (this.activeOutputs) {
                this.activeOutputs.splice(idx, 1);
                this.properties.activeOutputs = this.activeOutputs.length;
            }

            // THE TYPE SYNC FIX: Rebuild slot definitions so types match before reconnecting links.
            // LiteGraph silently rejects connections if the source/target types mismatch during the shift.
            this.manageDerpOutputs();

            if (this.outputs && app.graph) {
                cachedLinks.forEach(l => this.connect(l.newIdx, l.node, l.slot));
            }

            this.updateReceivedSignals();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.requestDerpSync();
        };

        nodeType.prototype.moveDerpOutput = function(idx, direction) {
            const targetIdx = idx + direction;
            if (targetIdx < 0 || targetIdx >= (this.activeOutputs || []).length) return;

            let linksA = [];
            let linksB = [];
            if (this.outputs && app.graph) {
                const getLinks = (slotIdx) => {
                    const links = this.outputs[slotIdx]?.links ? [...this.outputs[slotIdx].links] : [];
                    return links.map(lId => {
                        const l = app.graph.links[lId];
                        return l ? { node: app.graph.getNodeById(l.target_id), slot: l.target_slot, linkId: lId } : null;
                    }).filter(Boolean);
                };

                linksA = getLinks(idx);
                linksB = getLinks(targetIdx);

                [...linksA, ...linksB].forEach(l => app.graph.removeLink(l.linkId));
            }

            const temp = this.activeOutputs[idx];
            this.activeOutputs[idx] = this.activeOutputs[targetIdx];
            this.activeOutputs[targetIdx] = temp;

            // THE TYPE SYNC FIX: Force output ports to adopt their new swapped types BEFORE reconnecting.
            // LiteGraph silently rejects connections if the source/target types mismatch during the swap.
            this.manageDerpOutputs();

            if (this.outputs && app.graph) {
                linksA.forEach(l => this.connect(targetIdx, l.node, l.slot));
                linksB.forEach(l => this.connect(idx, l.node, l.slot));
            }

            this.updateReceivedSignals();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.requestDerpSync();
        };

        const onThemeUpdate = nodeType.prototype.onThemeUpdate;
        nodeType.prototype.onThemeUpdate = function(config) {
            if (onThemeUpdate) onThemeUpdate.apply(this, arguments);
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (this.refreshDerpSignalOutSysMap) this.refreshDerpSignalOutSysMap();
            this.requestDerpSync();
        };

        /**
         * Signal Data Synchronization
         */
        nodeType.prototype.updateReceivedSignals = function() {
            if (this._xcpSyncing) return;
            this._xcpSyncing = true;
            try {
                const globalSignals = window.xcpDerpSignals || {};
                const oldReceivedLength = (this.receivedSignals || []).length;

                if (this.activeOutputs) {
                    let orphanStateChanged = false;
                    this.activeOutputs.forEach((sig, i) => {
                        const freshSig = globalSignals[String(sig.nodeId)];
                        if (freshSig) {
                            this.activeOutputs[i] = { ...freshSig };
                            // THE NULL VALUE MONITOR: Detect and log signals transmitting None/null to help debug chained errors.
                            if (freshSig.value === null || freshSig.value === undefined) {
                                console.warn(`⚠️ [xcpDerp] Signal Out: Detected empty (null) value from source: "${freshSig.nodeName}" [${freshSig.nodeId}]`);
                            }
                            if (sig.isOrphaned) {
                                this.activeOutputs[i].isOrphaned = false;
                                orphanStateChanged = true;
                            }
                        } else if (!sig.isOrphaned) {
                            const sourceBaseId = String(sig.nodeId).split(":")[0];
                            const nodeExists = !!window.app?.graph?.getNodeById(parseInt(sourceBaseId));

                            if (!nodeExists) {
                                if (this.outputs && this.outputs[i] && this.outputs[i].links && window.app?.graph) {
                                    [...this.outputs[i].links].forEach(lId => {
                                        if (window.app.graph.links[lId]) window.app.graph.removeLink(lId);
                                    });
                                }
                                const preservedId = sig.nodeId;
                                this.activeOutputs[i] = { ...sig, nodeId: preservedId, nodeName: "⚠️ Signal source deleted", isOrphaned: true };
                                orphanStateChanged = true;
                            }
                        }
                    });

                    if (orphanStateChanged) {
                        this.manageDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    }
                }

                const newReceived = Object.values(globalSignals)
                    .filter(sig => {
                        if (!sig) return false;
                        if (sig.isPureVirtual && (sig.value === null || sig.value === undefined)) return false;
                        return true;
                    })
                    .sort((a, b) => parseInt(a.nodeId || 0) - parseInt(b.nodeId || 0));
                const newReceivedLength = newReceived.length;
                this.receivedSignals = newReceived;

                if (oldReceivedLength !== newReceivedLength && this.refreshNodeLayoutMap) {
                    this.refreshNodeLayoutMap();
                }

                const baseId = String(this.id);
                Object.keys(globalSignals).forEach(key => {
                    if (key.startsWith(`${baseId}:`)) {
                        const idx = parseInt(key.split(":")[1]);
                        if (!this.activeOutputs || !this.activeOutputs[idx]) {
                            delete globalSignals[key];
                        }
                    }
                });

                const widget = this.widgets?.find(w => w.name === "signal_data");
                if (widget) {
                    const activeSignals = {};
                    const activeIds = (this.activeOutputs || []).map(s => s.nodeId);
                    const trueOutputs = this._xcpTrueOutputs || this.outputs || [];
                    const baseId = String(this.id);
                    const nodeName = this.titleLabel || this.title || "Signal Out";

                    activeIds.forEach((sigId, idx) => {
                        const sourceSig = globalSignals[sigId];
                        if (trueOutputs[idx] && trueOutputs[idx].links && trueOutputs[idx].links.length > 0) {
                            if (sourceSig) {
                                activeSignals[sigId] = sourceSig;
                            }
                        }

                        if (sourceSig) {
                            const outputSignalId = `${baseId}:${idx}`;
                            // THE EXTENDER BRIDGE: Include the consumed signal's base ID in the chain to track standard nodes
                            const sourceBaseId = String(sigId).split(":")[0];
                            const upstreamChain = [...(sourceSig.upstreamIds || []), sourceBaseId, baseId];

                            window.xcpDerpSignals[outputSignalId] = {
                                nodeId: outputSignalId,
                                nodeName: `${nodeName} [Slot ${idx + 1}: ${sourceSig.nodeName}]`,
                                nodeType: this.type,
                                type: sourceSig.type,
                                value: sourceSig.value,
                                upstreamIds: [...new Set(upstreamChain)],
                                timestamp: Date.now()
                            };

                            fetch("/xcp/update_signal", {
                                method: "POST",
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ node_id: outputSignalId, value: sourceSig.value })
                            });
                        }
                    });

                    const signalPackage = {
                        selectedId: this.properties.selectedSignalId || null,
                        activeOutputIds: activeIds,
                        signals: activeSignals
                    };

                    const signalJson = JSON.stringify(signalPackage, (k, v) => k === "timestamp" ? undefined : v);
                    if (widget.value !== signalJson) { widget.value = signalJson; }
                }
            } finally {
                this._xcpSyncing = false;
            }
        };

        nodeType.prototype.onConnectionsChange = function() {
            this.updateReceivedSignals();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this._derpAwakeFrames = 10;
            if (window.app && window.app.graph) {
                window.app.graph._nodes.forEach(n => {
                    if (n !== this && n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) {
                        n.updateReceivedSignals();
                    }
                });
            }
            this.requestDerpSync();
        };

        nodeType.prototype.onSerialize = function(info) {
            // THE SERIALIZATION BRIDGE: Sync the live array to properties before saving
            this.properties.activeOutputsData = this.activeOutputs || [];
            info.properties = { ...this.properties };
        };

        const onConf = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConf) onConf.apply(this, arguments);
            this.suppressDefaultWidgets();

            if (info.properties) {
                if (info.properties.activeOutputsData) {
                    this.activeOutputs = [...info.properties.activeOutputsData];
                    this.properties.activeOutputs = this.activeOutputs.length;
                    this._preCollapseHeight = null;
                }
                this.manageDerpOutputs();

                // THE CONFIG SYNC FIX: Ensure signals are refreshed from global state when the node is configured.
                if (this.updateReceivedSignals) this.updateReceivedSignals();
                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                if (this.refreshDerpSignalOutSysMap) this.refreshDerpSignalOutSysMap();
                this.requestDerpSync();
            }
        };
        nodeType.prototype.forceSignalRefresh = function() {
            this._lastSignalStructureHash = null;
            this._lastSignalValueHash = null;
            if (this.updateReceivedSignals) this.updateReceivedSignals();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (this.refreshDerpSignalOutSysMap) this.refreshDerpSignalOutSysMap();
            if (this.manageDerpOutputs) this.manageDerpOutputs();
            this.requestDerpSync();
            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
        };

        // --- 2. RENDER & MONITOR HOOKS ---

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.vLinkDash = [8, 4];
            this.vLinkColor = "#666";
            this.vLinkThickness = [3, 1.5]; // [Selected, Normal]
            this.vLinkAlpha = [0.8, 0.2];   // [Selected, Normal]

            this.inputs = [];
            this.titleLabel = "Signal Out";
            this.properties.titleLabel = "Signal Out";
            this.receivedSignals = [];
            this.activeOutputs = [];
            this.properties.activeOutputs = 0;
            this.properties.showSlotNames = true;
            this.properties.showSlotTypes = true;
            this.properties.showVirtualLinks = false;
            this.properties.drawSettingBtn = true;
            this.properties.autoHeight = true;
            this.properties.autoWidth = false;
            this.properties.nodeSize = [300, 50];
            this.size = [300, 50];

            // Ensure exactly 16 outputs to match Python's RETURN_TYPES
            const INVISIBLE_CHAR = '\u200b';
            while (this.outputs.length < 16) {
                this.addOutput(INVISIBLE_CHAR, "*");
                const idx = this.outputs.length - 1;
                if (this.outputs[idx]) {
                    this.outputs[idx].color = "rgba(0,0,0,0)";
                    this.outputs[idx].color_off = "rgba(0,0,0,0)";
                    this.outputs[idx].color_on = "rgba(0,0,0,0)";
                }
            }

            this.suppressDefaultWidgets();
            if (this.updateReceivedSignals) this.updateReceivedSignals();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (this.refreshDerpSignalOutSysMap) this.refreshDerpSignalOutSysMap();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this._xcpSigCull === undefined) this._xcpSigCull = 0;
            if (this._xcpSigCull++ % 15 === 0) {
                const globalSignals = window.xcpDerpSignals || {};
                let structureHash = 0;
                let valueHash = 0;
                for (const key in globalSignals) {
                    const sig = globalSignals[key];
                    if (sig) {
                        structureHash += key.length + (sig.nodeName ? sig.nodeName.length : 0);
                        valueHash += sig.timestamp || 0;
                    }
                }

                if (this._lastSignalStructureHash !== structureHash) {
                    this._lastSignalStructureHash = structureHash;
                    this._lastSignalValueHash = valueHash;
                    this.manageDerpOutputs();
                    this.updateReceivedSignals();
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    if (this.refreshDerpSignalOutSysMap) this.refreshDerpSignalOutSysMap();
                    this.requestDerpSync();
                } else if (this._lastSignalValueHash !== valueHash) {
                    this._lastSignalValueHash = valueHash;
                    this.updateReceivedSignals();
                }
            }

            // VIRTUAL LINK RENDERING: Visualizes the wireless signal flow from source nodes
            if (this.properties.showVirtualLinks && !this.flags.collapsed && app.canvas.ds.scale > 0.15) {
                const typeColors = window.xcpDerpTypeColors || {};
                ctx.save();
                (this.activeOutputs || []).forEach((sig, idx) => {
                    if (!sig || !sig.nodeId) return;
                    const sourceNode = app.graph.getNodeById(String(sig.nodeId).split(":")[0]);
                    if (!sourceNode || sourceNode === this) return;

                    const portIdx = parseInt(String(sig.nodeId).split(":")[1]) || 0;
                    const sPos = sourceNode.getConnectionPos(false, portIdx);
                    const startX = sPos[0] - this.pos[0], startY = sPos[1] - this.pos[1];

                    const endX = 0;
                    const reg = this.layout?.regions?.[`outputsRegion_${idx}`];
                    const endY = reg ? (reg.y + reg.h / 2) : (this.getConnectionPos ? (this.getConnectionPos(false, idx)[1] - this.pos[1]) : (50 + idx * 25));

                    ctx.beginPath();
                    ctx.setLineDash(this.vLinkDash || [8, 4]);
                    ctx.strokeStyle = typeColors[sig.type?.toUpperCase()] || this.vLinkColor || "#666";
                    ctx.globalAlpha = this.selected ? (this.vLinkAlpha?.[0] ?? 0.8) : (this.vLinkAlpha?.[1] ?? 0.2);
                    ctx.lineWidth = this.selected ? (this.vLinkThickness?.[0] ?? 3) : (this.vLinkThickness?.[1] ?? 1.5);

                    const cp1x = startX + 40, cp2x = endX - 40;
                    ctx.moveTo(startX, startY);
                    ctx.bezierCurveTo(cp1x, startY, cp2x, endY, endX, endY);
                    ctx.stroke();
                });
                ctx.restore();
            }

            if (onDrawForeground) onDrawForeground.apply(this, arguments);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.onAdded = function() { this.suppressDefaultWidgets(); };
    }
        });
    } catch (e) {
        console.warn("xcp.derpSignalOut_Core extension already registered.");
    }
}