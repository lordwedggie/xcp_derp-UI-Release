/**
 * Path: ./js/fatha/nodes/derpLoraStack_core.js
 * ROLE: Core logic, lifecycle, and signal engine for derpLoraStack.
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { activeBastas } from "../../fatha/basta.js";
import { showBastaFileHandler, getHandlerId } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { fetchLoraTriggers, fetchLoraRating, syncRatingColorsCache, fetchLoraData } from "../helpers/loraComponents.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { COMPONENT_BLUEPRINTS } from "../../fatha/core/masterLayoutTypes.js";

if (!window._xcp_derpLoraStack_Core_Loaded) {
    window._xcp_derpLoraStack_Core_Loaded = true;
    // THE CACHE BUSTER: Persistent timestamp for the current session to force refresh on reload
    window._xcpDerpSession = Date.now();
    try {
        app.registerExtension({
            name: "xcp.derpLoraStack_Core",
            async setup() {
                initDerpGlobalListener();
            },

            async beforeRegisterNodeDef(nodeType, nodeData) {
                if (!nodeData.name.toLowerCase().includes("derplorastack")) return;
                fatha(nodeType, nodeData, 200);

                // THE GHOST SLOT HEIST: Force-suppress native slots during any custom drag interaction to prevent "circle things"
                const originalDrawNode = nodeType.prototype.drawNode || LGraphCanvas.prototype.drawNode;
                nodeType.prototype.drawNode = function(ctx, canvas) {
                    // THE HEIST: Temporarily blind LiteGraph by nullifying inputs/outputs during render to kill ghosted "circle things"
                    const isDraggingStack = !!(this._dragTrig && this._dragThresholdMet);
                    const oldIn = this.inputs, oldOut = this.outputs;
                    if (isDraggingStack) { this.inputs = null; this.outputs = null; }
                    originalDrawNode.apply(this, arguments);
                    if (isDraggingStack) { this.inputs = oldIn; this.outputs = oldOut; }
                };

                nodeType.prototype.onDerpSettingsPress = function() {
                    this.refreshNodeLayoutMap();
                };
                nodeType.prototype.syncDerpSignalManual = function() {
                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                };

                nodeType.prototype.applyPalette = function() {
                    if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
                    this._layoutMapHash = null; // THE STRUCTURAL RESET: Synchronized cache nuke
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    this.requestDerpSync();
                };

                // --- THEME UPDATE ---
                nodeType.prototype.onThemeUpdate = function(config) {
                    this.handleThemeUpdate(config);
                    this._layoutMapHash = null; // THE STRUCTURAL RESET: Synchronized cache nuke
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                    this.requestDerpSync();
                };

                /**
                 * The callback triggered by bastaSignalReceiver.
                 * Refreshes the UI and virtual outputs when a signal is selected.
                 */
                nodeType.prototype.setDerpSelectedSignal = function(val, idx) {
                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                };

                /**
                 * THE PURE VIRTUAL ENFORCER: Standardizes wireless broadcast and
                 * populates virtual ports based on signals received from the receiver basta.
                 */
                nodeType.prototype.syncDerpOutputs = function() {
                    if (this._xcpSyncing) return;
                    this._xcpSyncing = true;
                    try {
                        if (this._signalSyncDebouncer) clearTimeout(this._signalSyncDebouncer);

                        const ids = this.properties.multiSignalIds || {};
                        const globalSignals = window.xcpDerpSignals || {};
                        const mId = ids[0] || ids["0"];
                        const cId = ids[1] || ids["1"];

                        let activeModelPrefix = this.activeModelPrefix || "Unknown_Model";
                        if (mId && globalSignals[mId]?.value) {
                            const val = globalSignals[mId].value;
                            if (val && typeof val === 'object') {
                                activeModelPrefix = val.model_name_prefix || val.ckpt_name || val.model_name || activeModelPrefix;
                            } else if (typeof val === 'string') {
                                activeModelPrefix = val;
                            }
                        }
                        this.activeModelPrefix = activeModelPrefix;
                        this.properties.activeModelPrefix = activeModelPrefix;

                        const isJoint = this.properties.attentionMode === "Joint-Attention";
                        const activeStack = (this.properties.stackData || []).filter(lora => !lora[5]);
                        const processedStack = activeStack.map(lora => {
                            const entry = [lora[0], Number(lora[1])];
                            if (isJoint) {
                                entry.push(!!lora[6]);
                            } else {
                                entry.push(Number(lora[2]));
                            }
                            entry.push(lora[4] || "");
                            return entry;
                        });
                        const allTriggers = activeStack.map(l => l[4] || "").filter(t => t.length > 0).join(", ");

                        const mSignalId = ids[0] || ids["0"];
                        const cSignalId = ids[1] || ids["1"];

                        let combinedStack = [...processedStack];
                        let baseModelId = mSignalId || null;
                        let baseClipId = cSignalId || null;
                        let baseModelFallback = null;
                        let baseClipFallback = null;
                        let upstreamIds = [];

                        const getFallback = (id) => {
                            if (!id) return null;
                            const node = app.graph.getNodeById(parseInt(String(id).split(":")[0]));
                            if (node && node.widgets) {
                                const w = node.widgets.find(w => w.name === "ckpt_name" || w.name === "vae_name" || w.name === "model_name");
                                if (w) return w.value;
                                if (typeof node.widgets[0]?.value === "string") return node.widgets[0].value;
                            }
                            return globalSignals[id]?.value;
                        };

                        if (mSignalId && globalSignals[mSignalId]?.value && typeof globalSignals[mSignalId].value === 'object') {
                            const upVal = globalSignals[mSignalId].value;
                            if (Array.isArray(upVal.stack)) combinedStack = [...upVal.stack, ...processedStack];
                            baseModelId = upVal.model_id || null;
                            baseClipId = upVal.clip_id || null;
                            baseModelFallback = upVal.model_fallback || null;
                            baseClipFallback = upVal.clip_fallback || null;
                            if (upVal.triggers && typeof upVal.triggers === 'string') {
                                allTriggers = upVal.triggers + (allTriggers ? ", " + allTriggers : "");
                            }
                            if (upVal.upstream_ids) upstreamIds.push(...upVal.upstream_ids);
                        }
                        if (cSignalId && !isJoint && globalSignals[cSignalId]?.value && typeof globalSignals[cSignalId].value === 'object') {
                            const upVal = globalSignals[cSignalId].value;
                            if (Array.isArray(upVal.stack) && mSignalId !== cSignalId) {
                                combinedStack = [...upVal.stack, ...combinedStack];
                                if (upVal.triggers) allTriggers = upVal.triggers + (allTriggers ? ", " + allTriggers : "");
                            }
                            baseClipId = upVal.clip_id || baseClipId;
                            baseClipFallback = upVal.clip_fallback || baseClipFallback;
                            if (upVal.upstream_ids) upstreamIds.push(...upVal.upstream_ids);
                        }

                        if (!baseModelFallback && mSignalId) baseModelFallback = getFallback(mSignalId);
                        if (!baseClipFallback && cSignalId && !isJoint) baseClipFallback = getFallback(cSignalId);

                        const packageValue = {
                            stack: combinedStack,
                            model_name_prefix: this.activeModelPrefix,
                            model_id: baseModelId,
                            clip_id: baseClipId,
                            model_fallback: baseModelFallback,
                            clip_fallback: baseClipFallback,
                            triggers: allTriggers,
                            upstream_ids: [...new Set(upstreamIds)]
                        };

                        const signalHash = JSON.stringify(packageValue);
                        if (this._lastBroadcastHash === signalHash) {
                            this._xcpSyncing = false;
                            return;
                        }
                        this._lastBroadcastHash = signalHash;

                        const baseId = String(this.id);
                        const nodeName = this.titleLabel || this.title || "Derp Lora Stack";

                        const virtualOutputs = [
                            { name: "Model", type: "MODEL", value: packageValue }
                        ];
                        if (!isJoint) {
                            virtualOutputs.push({ name: "Clip", type: "CLIP", value: packageValue });
                        }
                        virtualOutputs.push({ name: "LoRA_triggers", type: "STRING", value: allTriggers });

                        virtualOutputs.forEach((output, idx) => {
                            const signalId = `${baseId}:${idx}`;
                            window.xcpDerpSignals[signalId] = {
                                nodeId: signalId,
                                nodeName: `${nodeName} [${output.name}]`,
                                nodeType: this.type || "Node",
                                type: output.type,
                                value: output.value,
                                upstreamIds: output.type === "STRING" ? [] : [...new Set(upstreamIds)],
                                timestamp: Date.now()
                            };

                            fetch("/xcp/update_signal", {
                                method: "POST",
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ node_id: signalId, value: output.value })
                            });
                        });

                        if (window.app?.graph?._nodes) {
                            window.app.graph._nodes.forEach(n => {
                                if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
                            });
                            app.canvas.setDirty(true, true);
                        }

                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    } finally {
                        this._xcpSyncing = false;
                    }
                };

                nodeType.prototype.fetchDerpLoraTriggers = function(loraName, index) {
                    if (!loraName) return;
                    fetchLoraRating(this, loraName);
                    fetchLoraTriggers(this, loraName, index);
                };

                nodeType.prototype.fetchDerpLoraData = function(showNotification = false) {
                    fetchLoraData(this, showNotification);
                };

                nodeType.prototype.fetchDerpRatingsPalette = function() {
                    if (window._xcpDerpRatingsPalette) {
                        this._ratingsPalette = window._xcpDerpRatingsPalette;
                        syncRatingColorsCache(this);
                        return;
                    }
                    fetch("/xcp/load/palettes?name=_system/PAL_ratings.json")
                        .then(r => r.json())
                        .then(data => {
                            window._xcpDerpRatingsPalette = data.data || data;
                            this._ratingsPalette = window._xcpDerpRatingsPalette;
                            syncRatingColorsCache(this);
                            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                        }).catch(err => console.warn(`[xcpDerp] Ratings palette load failed:`, err));
                };

                nodeType.prototype.applyDerpProfile = function(profileName) {
                    if (profileName === "(No Profiles Found)") return;

                    // INDIVIDUAL FILE LOADING: Fetch the specific JSON file from the derpLoraStack folder
                    fetch(`/xcp/load/derpLoraStack?name=${profileName}`)
                        .then(res => res.json())
                        .then(res => {
                            const p = res.data || {};
                            if (p.stackData) this.properties.stackData = JSON.parse(JSON.stringify(p.stackData));
                            if (p.attentionMode) this.properties.attentionMode = p.attentionMode;
                            this.properties.showCLIP = p.showCLIP ?? false;
                            this.properties.nameDisplay = p.nameDisplay || "Top";

                            this._currentProfileName = profileName;
                            if (p.settings) Object.assign(this.properties, p.settings);
                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

                            if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                            if (this._derpPanel) this._derpPanel._layoutDirty = true;
                            this.setDirtyCanvas(true, true);
                        });
                };

                nodeType.prototype.exportDerpProfile = function() {
                    return {
                        // THE PROFILE CLEANUP: Includes only settings seen in the screenshot ("Saved Normally").
                        // Explicitly excludes framework keys: minWidth, nodeSize, drawHeader, drawSignalBtn, contentCollapsed, isWirelessTransmitter.
                        attentionMode: this.properties.attentionMode,
                        showCLIP: this.properties.showCLIP,
                        nameDisplay: this.properties.nameDisplay,
                        settings: {
                            sliderMin: this.properties.sliderMin, sliderMax: this.properties.sliderMax,
                            sliderStep: this.properties.sliderStep, sliderDefault: this.properties.sliderDefault,
                            clipMin: this.properties.clipMin, clipMax: this.properties.clipMax,
                            clipStep: this.properties.clipStep, clipDefault: this.properties.clipDefault
                        }
                    };
                };

                nodeType.prototype.onDerpSavePress = function() {
                    showBastaFileHandler(this, "derpLoraStack", "btnSave", {
                        title: "Save profile as",
                        message: "Enter filename for profile:",
                        confirm: "Save",
                        mode: "save",
                        initialSize: [250, 150],
                        // THE DATA FIX: Remove local fileList override so Basta fetches the full folder structure from the backend.
                        properties: {
                            showOptions: true,
                            // THE OVERRIDE: Force visibility for LoRA profile saving
                            showFolderBrowser: true,
                            toggleLabel_1: "Include LoRA Stack data",
                            toggleOption_1: true,
                            dropdownFolderMode: "folder",
                            selectedFolder: "/"
                        },
                        onConfirm: async (filename) => {
                            const basta = activeBastas.get(getHandlerId());
                            // THE STATE FIX: Explicitly check the toggle state from the singleton handler instance.
                            const includeStack = basta ? basta.properties.toggleOption_1 : true;

                            // THE CONDITIONAL SAVE FIX: Build profile with normal settings, then add stackData only if toggled.
                            const profileData = this.exportDerpProfile();
                            if (includeStack) {
                                profileData.stackData = JSON.parse(JSON.stringify(this.properties.stackData || []));
                            }

                            try {
                                const res = await fetch("/xcp/save/derpLoraStack", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ filename: filename, data: profileData })
                                });

                                if (res.ok) {
                                    playKaChing();
                                    showBastaMessage(this, "Profile Saved!");
                                    this._sysProfileCache = null;
                                    this._currentProfileName = filename;
                                    // THE REFLOW FIX: Force update the system map and panel visibility to show the new profile.
                                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                                    if (this._derpPanel?.showProfiles) this._derpPanel.showProfiles("derpLoraStack", "nodeSettings");
                                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                    this.setDirtyCanvas(true, true);
                                }
                            } catch (e) { console.error("[Save Error]:", e); }
                        }
                    });
                };

                nodeType.prototype.onDerpCopyPress = function() {
                    const profileName = this._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    showBastaFileHandler(this, "derpLoraStack", "sys_btnCopy", {
                        title: `Duplicate Profile: ${profileName}`,
                        message: "Enter name for new profile copy:",
                        confirm: "Duplicate",
                        mode: "duplicate",
                        originalName: profileName,
                        // THE DATA FIX: Remove local fileList override so Basta fetches the full folder structure from the backend.
                        properties: {
                            // THE OVERRIDE: Force visibility for LoRA profile duplication
                            showFolderBrowser: true,
                            dropdownFolderMode: "folder",
                            selectedFolder: "/"
                        },
                        onConfirm: async (newName) => {
                            const basta = activeBastas.get(getHandlerId());
                            try {
                                const loadRes = await fetch(`/xcp/load/derpLoraStack?name=${profileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) { try { loadData = await loadRes.json(); } catch (e) {} }
                                const p = loadData.data || {};

                                const res = await fetch("/xcp/save/derpLoraStack", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ filename: newName, data: p })
                                });

                                if (res.ok) {
                                    playKaChing();
                                    showBastaMessage(this, "Profile Duplicated!");
                                    this._sysProfileCache = null;
                                    this._currentProfileName = newName;
                                    // THE REFLOW FIX: Rebuild system definitions after duplication.
                                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                                    if (this._derpPanel?.showProfiles) this._derpPanel.showProfiles("derpLoraStack", "nodeSettings");
                                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                    this.setDirtyCanvas(true, true);
                                }
                            } catch (e) { console.error("[Copy Error]:", e); }
                        }
                    });
                };

                nodeType.prototype.onDerpRenamePress = function() {
                    const profileName = this._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;
                    showBastaFileHandler(this, "derpLoraStack", "sys_btnRename", {
                        title: "Rename Profile", mode: "rename", originalName: profileName,
                        onConfirm: async (newName) => {
                            try {
                                const res = await fetch("/xcp/rename/derpLoraStack", {
                                    method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ oldName: profileName, newName: newName })
                                });
                                if (res.ok) {
                                    playKaChing();
                                    showBastaMessage(this, "Profile Renamed!");
                                    this._currentProfileName = newName;
                                    this._sysProfileCache = null;
                                    // THE REFLOW FIX: Refresh the system map and force a canvas update.
                                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                                    if (this._derpPanel?.showProfiles) this._derpPanel.showProfiles("derpLoraStack", "nodeSettings");
                                    this.setDirtyCanvas(true, true);
                                }
                            } catch (e) { console.error(e); }
                        }
                    });
                };

                nodeType.prototype.onDerpDeletePress = function() {
                    const profileName = this._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;
                    showBastaFileHandler(this, "derpLoraStack", "sys_btnDelete", {
                        title: "Delete Profile", mode: "delete", originalName: profileName,
                        confirm: "Delete Forever",
                        onConfirm: async () => {
                            try {
                                const res = await fetch(`/xcp/delete/derpLoraStack?name=${profileName}`, { method: "DELETE" });
                                if (res.ok) {
                                    playKaboom();
                                    showBastaMessage(this, "Profile Deleted!");
                                    this._sysProfileCache = null;
                                    this._currentProfileName = null;
                                    // THE REFLOW FIX: Ensure the panel and map are purged of the deleted profile key.
                                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                                    if (this._derpPanel?.showProfiles) this._derpPanel.showProfiles("derpLoraStack", "nodeSettings");
                                    this.setDirtyCanvas(true, true);
                                }
                            } catch (e) { console.error(e); }
                        }
                    });
                };

                nodeType.prototype.onDerpSysPanelOpen = function(panel) {
                    this._derpPanel = panel;
                    if (panel.showProfiles) {
                        panel.showProfiles("derpLoraStack", "nodeSettings");
                    }
                    if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
                };

                // --- LIFECYCLE ---
                const onCreated = nodeType.prototype.onNodeCreated;
                nodeType.prototype.onNodeCreated = function() {
                    if (onCreated) onCreated.apply(this, arguments);

                    this.properties.attentionMode = this.properties.attentionMode || "Cross-Attention";
                    this.properties.showCLIP = this.properties.showCLIP ?? false;
                    this.properties.nameDisplay = this.properties.nameDisplay || "Top";
                    this.signalFilters = { types: this.properties.attentionMode === "Joint-Attention" ? ["MODEL"] : ["MODEL", "CLIP"] };
                    this.properties.isWirelessTransmitter = true;
                    this.isPureVirtual = true;
                    this.properties.isPureVirtual = true;
                    this.properties.drawSignalBtn = true;
                    this.properties.drawSettingBtn = true;
                    // Critical: pure virtual nodes must have empty outputs
                    this.outputs = [];

                    this.titleLabel = "Derp Lora Stack";
                    this.properties.titleLabel = "Derp Lora Stack";
                    this.properties.stackData = [];
                    this.activeModelPrefix = "Unknown_Model";
                    this.properties.activeModelPrefix = "Unknown_Model";


                    this.properties.autoWidth = false;
                    this.properties.autoHeight = true;
                    this.properties.nodeSize = [300, 60];
                    this.size = [300, 60];

                    this.fetchDerpLoraData(); // THE DATA FETCH FIX: Run on creation
                    this.fetchDerpRatingsPalette();

                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();

                    setTimeout(() => {
                        if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                            this.syncDerpOutputs();
                        }
                    }, 1);
                };

                const onConfigure = nodeType.prototype.onConfigure;
                nodeType.prototype.onConfigure = function(info) {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    this.isPureVirtual = true;
                    this.properties.isPureVirtual = true;
                    // Re-enforce virtual state on workflow load
                    if (this.outputs && this.outputs.length > 0) {
                        this.outputs.forEach(o => { if (o.links) o.links = null; });
                        this.outputs = [];
                    }

                    this.fetchDerpLoraData(); // THE DATA FETCH FIX: Run on workflow load
                    this.fetchDerpRatingsPalette();
                    this.activeModelPrefix = this.activeModelPrefix || "Unknown_Model";
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                };

                const onDrawForeground = nodeType.prototype.onDrawForeground;
                nodeType.prototype.onDrawForeground = function(ctx) {
                    if (onDrawForeground) onDrawForeground.apply(this, arguments);

                    // THE GHOST DRAW FIX: Render the picked-up object freely following the mouse cursor
                    if (this._dragTrig && this._dragThresholdMet && this.layout?.regions) {
                        const dragIdx = this._dragTrig.index;
                        const rowKey = `loraRow_${dragIdx}`;
                        const baseReg = this.layout.regions[rowKey];

                        if (baseReg && this._dragMouse && this._dragOffset) {
                            const dx = this._dragMouse[0] - this._dragOffset[0] - baseReg.x;
                            const dy = this._dragMouse[1] - this._dragOffset[1] - baseReg.y;

                            ctx.save();
                            ctx.translate(dx, dy);

                            // THE GHOST SLOT SUPPRESSION: Force slots to null during ghosting to block "circle things"
                            const oldInputs = this.inputs;
                            const oldOutputs = this.outputs;
                            this.inputs = null;
                            this.outputs = null;

                            const centerX = baseReg.x + baseReg.w / 2;
                            const centerY = baseReg.y + baseReg.h / 2;
                            ctx.translate(centerX, centerY);
                            ctx.scale(1.02, 1.02);
                            ctx.translate(-centerX, -centerY);

                            const suffix = `_${dragIdx}`;
                            const componentsToDraw = [];

                            for (const [k, r] of Object.entries(this.layout.regions)) {
                                if (r.type === "linebreak") continue;
                                if (k === rowKey || k.endsWith(suffix)) {
                                    // THE ORIGINAL CONFIG RETRIEVAL: Drill into layoutMap to find source config (imageUrl, etc.) for ghost rendering
                                    const rowCfg = this.layoutMap?.mainContentRegion?.[rowKey];
                                    let fullCfg = (k === rowKey) ? rowCfg : null;
                                    if (!fullCfg && rowCfg) {
                                        const search = (obj) => {
                                            if (obj[k]) return obj[k];
                                            for (const val of Object.values(obj)) {
                                                if (val && typeof val === 'object' && !Array.isArray(val)) {
                                                    const found = search(val);
                                                    if (found) return found;
                                                }
                                            }
                                            return null;
                                        };
                                        fullCfg = search(rowCfg);
                                    }
                                    if (fullCfg) componentsToDraw.push({ key: k, reg: r, config: fullCfg });
                                }
                            }

                            componentsToDraw.sort((a, b) => (a.reg.zIndex || 0) - (b.reg.zIndex || 0));

                            for (const item of componentsToDraw) {
                                const { key: k, reg: r, config: fCfg } = item;
                                const bp = this.UI_TYPES ? COMPONENT_BLUEPRINTS[r.type] : null;
                                if (bp) {
                                    const ghostData = { ...fCfg, key: k + "_ghost", geometry: { x: r.x, y: r.y, w: r.w, h: r.h }, alpha: 1.0, hidden: false, state: "ON", mouseOver: false };

                                    if (k === rowKey) {
                                        ctx.shadowColor = "rgba(0,0,0,0.6)";
                                        ctx.shadowBlur = 12;
                                        ctx.shadowOffsetX = 0;
                                        ctx.shadowOffsetY = 8;
                                    }

                                    if (bp.isHtml) {
                                        ctx.save();
                                        ctx.fillStyle = "rgba(30,30,30,0.9)";
                                        if (ctx.roundRect) {
                                            ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 4); ctx.fill();
                                        } else {
                                            ctx.fillRect(r.x, r.y, r.w, r.h);
                                        }
                                        ctx.fillStyle = "#fff";
                                        ctx.font = "10px Arial";
                                        ctx.textAlign = "center";
                                        ctx.textBaseline = "middle";
                                        let textStr = r.text || r.value || r.label || "";
                                        if (typeof textStr === "string") {
                                            ctx.fillText(textStr, r.x + r.w/2, r.y + r.h/2);
                                        }
                                        ctx.restore();
                                    } else if (bp.isHybrid || r.type?.toLowerCase().includes("image")) {
                                        bp.sync(ctx, this, app, ghostData);
                                    } else {
                                        bp.sync(ctx, this, ghostData);
                                    }

                                    if (k === rowKey) {
                                        ctx.shadowColor = "transparent";
                                    }
                                }
                            }

                            for (const item of componentsToDraw) {
                                const { key: k, reg: r, config: fCfg } = item;
                                const bp = this.UI_TYPES ? COMPONENT_BLUEPRINTS[r.type] : null;
                                if (bp && r.strokeZIndex) {
                                    const ghostData = { ...fCfg, key: k + "_ghost", geometry: { x: r.x, y: r.y, w: r.w, h: r.h }, alpha: 1.0, hidden: false, state: "ON" };
                                    if (bp.isHybrid) bp.sync(ctx, this, app, ghostData, true);
                                }
                            }

                            this.inputs = oldInputs;
                            this.outputs = oldOutputs;
                            ctx.restore();
                        }
                    }

                    // ZERO-INFERENCE GUARD: Prevent execution on collapsed or uninitialized nodes
                    if (this.flags?.collapsed || this.id === -1) return;

                    const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
                    if (this._lastBypassState !== isBypassed) {
                        this._lastBypassState = isBypassed;
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                        this.requestDerpSync();
                    }

                    const currentW = Math.round(this.size[0]);
                    if (this._lastDerpW !== currentW) {
                        this._lastDerpW = currentW;
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    }

                    // Update wireless registry if the title changed
                    if (this._lastTitleLabel !== this.titleLabel) {
                        this._lastTitleLabel = this.titleLabel;
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                    }

                    // ZERO-INFERENCE GATING: Increased cull loop to 15 frames for smoother idle performance
                    if (this._xcpSigCull === undefined) this._xcpSigCull = 0;
                    if (this._xcpSigCull++ % 15 !== 0) return;

                    const mIds = this.properties?.multiSignalIds || {};
                    const id1 = mIds[0] || mIds["0"];
                    const id2 = mIds[1] || mIds["1"];

                    const ts1 = id1 && window.xcpDerpSignals?.[id1] ? window.xcpDerpSignals[id1].timestamp : 0;
                    const ts2 = id2 && window.xcpDerpSignals?.[id2] ? window.xcpDerpSignals[id2].timestamp : 0;

                    // ZERO-INFERENCE GATING: Direct integer comparison instead of string concatenation churn
                    const currentSignalHash = ts1 + ts2;

                    let selfHash = 0;
                    const stack = this.properties?.stackData;
                    if (stack) {
                        for (let i = 0; i < stack.length; i++) {
                            const l = stack[i];
                            // Fast weak hash of the slider states and bypass flags
                            selfHash += (parseFloat(l[1]) || 0) + (parseFloat(l[2]) || 0) + (l[5] ? 1 : 0) + (l[6] ? 1 : 0);
                        }
                    }

                    const combinedHash = currentSignalHash + selfHash;

                    if (this._lastUpstreamHash !== combinedHash) {
                        this._lastUpstreamHash = combinedHash;
                        // ZERO-INFERENCE BROADCAST: Only trigger signal sync if the mathematical signature actually mutates
                        if (this.syncDerpOutputs) {
                            this.syncDerpOutputs();
                        }
                    }
                };

                // --- INTERACTION (CANVAS SLIDERS) ---
                const baseOnDrawBackground = nodeType.prototype.onDrawBackground;
                nodeType.prototype.onDrawBackground = function(ctx) {
                    if (baseOnDrawBackground) baseOnDrawBackground.apply(this, arguments);
                };

                const baseHandleInteraction = nodeType.prototype.handleShieldInteraction;
                nodeType.prototype.handleShieldInteraction = function(type, data) {
                    // THE SPAWN HOVER FIX: Shield mouseenter fails if panel spawns directly under the cursor.
                    if (type === "hover") this._uiHovered = true;

                    // THE INTERACTION GATE: Prevent high-frequency mouse events (move/hover) from flooding the CPU
                    if (type === "move" || type === "hover") {
                        if (this._syncLock) {
                            this._pendingHoverData = data;
                            return false;
                        }
                        this._syncLock = true;
                        setTimeout(() => {
                            this._syncLock = false;
                            if (this._pendingHoverData) {
                                if (this._uiHovered !== false) {
                                    this.handleShieldInteraction(type, this._pendingHoverData);
                                }
                                this._pendingHoverData = null;
                            }
                        }, 32);
                    }

                    if (type === "resize") this._isDerpResizing = true;
                    if (type === "click" || type === "dragEnd") {
                        endStackDrag(this, "stackData"); // Kills the hold-timer to prevent sound/pickup on single clicks
                        this._activeSliderKey = null;
                        this._isDerpResizing = false;
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    }

                    if (type === "hover" || type === "drag" || type === "dragStart" || type === "click" || type === "dblclick") {
                        const { localX, localY } = data || {};
                        let foundKey = null;
                        const regions = this.layout?.regions;

                        if (regions && typeof localX === 'number' && typeof localY === 'number') {
                            for (const key of Object.keys(regions).reverse()) {
                                if ((key.startsWith("sldModel_") || key.startsWith("sldClip_") || key.startsWith("loraPreview_") || key.startsWith("loraRow_")) && this.layout.hitTest([localX, localY], regions[key])) {
                                    foundKey = key;
                                    break;
                                }
                            }
                        }

                        const wasHoveringPreview = this._hoveredRegionKey && this._hoveredRegionKey.startsWith("loraPreview_");
                        const isHoveringPreview = foundKey && foundKey.startsWith("loraPreview_");
                        this._hoveredRegionKey = foundKey;

                        if (wasHoveringPreview !== isHoveringPreview) {
                            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                        }

                        if (type === "dragStart" || type === "click" || type === "dblclick") {
                            this._activeSliderKey = foundKey;
                            if (type === "dragStart" && foundKey && foundKey.startsWith("loraRow_")) {
                                const idx = parseInt(foundKey.split("_")[1]);
                                startStackDrag(this, data, idx, foundKey);
                            }
                        }

                        if (type === "drag" && this._dragTrig) {
                            updateStackDrag(this, data, "loraRow_", this.properties.stackData.length);
                        }

                        const targetKey = this._activeSliderKey !== null ? this._activeSliderKey : foundKey;

                        if (targetKey && (type === "drag" || type === "dragStart" || type === "click" || type === "dblclick")) {
                            const reg = regions[targetKey];
                            if (reg && reg.state !== "DIS") {
                                try {
                                    const parts = targetKey.split("_");
                                    const sType = parts[0];
                                    const idx = parseInt(parts[1]);
                                    const stackData = this.properties.stackData || [];

                                    // THE CLICK INTERCEPT FIX: Only consume drag/click events for actual sliders
                                    // so loraPreview can pass through to baseHandleInteraction and fire its onPress.
                                    if (stackData[idx] && (sType === "sldModel" || sType === "sldClip")) {
                                        const isModel = sType === "sldModel";
                                        const loraName = stackData[idx][0];
                                        const lSetup = loraName ? this._loraSetup?.[loraName]?.sliderStrength : null;

                                        const cMin = lSetup ? lSetup[0] : (isModel ? (this.properties.sliderMin ?? -2.0) : (this.properties.clipMin ?? -2.0));
                                        const cMax = lSetup ? lSetup[1] : (isModel ? (this.properties.sliderMax ?? 2.0) : (this.properties.clipMax ?? 2.0));
                                        const cStep = lSetup ? lSetup[2] : (isModel ? (this.properties.sliderStep ?? 0.05) : (this.properties.clipStep ?? 0.05));
                                        const cDef = lSetup ? lSetup[3] : (isModel ? (this.properties.sliderDefault ?? 1.0) : (this.properties.clipDefault ?? 1.0));

                                        let newVal;
                                        if (type === "dblclick") newVal = cDef;
                                        else {
                                            const percent = Math.max(0, Math.min(1, (localX - reg.x) / reg.w));
                                            const rawVal = cMin + (percent * (cMax - cMin));
                                            newVal = Math.round(rawVal / cStep) * cStep;
                                            newVal = Math.max(cMin, Math.min(cMax, newVal));
                                        }

                                        if (sType === "sldModel") stackData[idx][1] = newVal;
                                        else if (sType === "sldClip") stackData[idx][2] = newVal;

                                        const finalValStr = newVal.toFixed(2);

                                        // THE PERSISTENCE FIX: Update the actual node property so the value survives refreshes.
                                        this.properties.stackData = stackData;
                                        if (regions[targetKey]) regions[targetKey].value = newVal;
                                        if (this._compDataCache && this._compDataCache[targetKey]) this._compDataCache[targetKey].value = newVal;

                                        const valKey = targetKey.replace("sld", "val");
                                        if (regions[valKey]) {
                                            regions[valKey].value = finalValStr;
                                            regions[valKey].text = finalValStr;
                                        }
                                        if (this._compDataCache && this._compDataCache[valKey]) {
                                            this._compDataCache[valKey].value = finalValStr;
                                            this._compDataCache[valKey].text = finalValStr;
                                        }

                                        // THE CHAIN AWAKE FIX: Interaction on this node must dirty the global canvas
                                        // so downstream watchers in onDrawForeground can detect the change.
                                        this._derpAwakeFrames = 5;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                        this.setDirtyCanvas(true);
                                        return true;
                                    }
                                } catch(e) {}
                            }
                        }
                    }
                    if (baseHandleInteraction) return baseHandleInteraction.apply(this, arguments);
                    return false;
                };

                // THE INTEGRITY FIX: Validate that loaded LoRAs still exist on disk
                nodeType.prototype.validateLoraStack = function() {
                    // Safety: Do not validate if we haven't fetched the list yet
                    if (!this._loraList || this._loraList.length === 0) return;

                    const stack = this.properties.stackData || [];
                    const removed = [];

                    const newStack = stack.filter(entry => {
                        const loraName = entry[0];
                        // Always keep empty slots or the "None" placeholder
                        if (!loraName || loraName === "None") return true;

                        const exists = this._loraList.includes(loraName);
                        if (!exists) removed.push(loraName);
                        return exists;
                    });

                    if (removed.length > 0) {
                        this.properties.stackData = newStack;

                        const names = removed.map(n => n.split(/[\\/]/).pop()).join(", ");
                        const msg = `Removed non-existing LoRAs: ${names}`;

                        showBastaMessage(this, msg, 5000, { width: 400 }, null, false, "error", "error");

                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                        this.requestDerpSync();
                    }
                };

                nodeType.prototype.onRemoved = function() {
                    if (window.xcpActiveBastas) {
                        const detailId = `basta_lora_detail_global_unique_id`;
                        const b = window.xcpActiveBastas.get(detailId);
                        if (b && b.hostNode === this) b.close();
                    }
                };

            }
        });
    } catch (e) {
        console.warn("xcp.derpLoraStack_Core extension already registered.");
    }
}