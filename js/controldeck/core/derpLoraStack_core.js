/**
 * Path: ./js/fatha/nodes/derpLoraStack_core.js
 * ROLE: Core logic, lifecycle, and signal engine for derpLoraStack.
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { activeBastas } from "../../fatha/basta.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { fetchLoraTriggers, fetchLoraRating, syncRatingColorsCache, fetchLoraData, regionBelongsToRow } from "../helpers/loraComponents.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { COMPONENT_BLUEPRINTS } from "../../fatha/core/masterLayoutTypes.js";

const BTN_LR_RATIO = 0.75;
const BTN_LR_MARGIN = 1;
const handleDerpSliderBtnLR = function() { var r = window.handleDerpSliderBtnLR; return r ? r.apply(null, arguments) : { handled: false }; };
import { settleDerpSizeBeforeDraw, shouldPreserveHorizontalDeckHeight, syncHorizontalDeckHeight } from "../../fatha/core/fathaHandler.js";
import { getDeckMembers } from "../../fatha/core/masterDockEngine.js";

const LORA_DETAIL_BASTA_ID = "basta_lora_detail_global_unique_id";

const LORA_STACK_NUMERIC_SETTING_KEYS = [
    "sliderMin", "sliderMax", "sliderStep", "sliderDefault",
    "clipMin", "clipMax", "clipStep", "clipDefault"
];

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

function syncDerpLoraStackLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_lora_stack.title", "Derp Lora Stack");
    const previousLocalizedTitle = node._lastLocalizedDerpLoraStackTitle;

    if (!node.titleLabel || node.titleLabel === "Derp Lora Stack" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Lora Stack" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }

    node._lastLocalizedDerpLoraStackTitle = localizedTitle;
}

function queueMissingLoraMessages(node, items) {
    items.forEach((item) => {
        showBastaSystemMessage(node, tLocale("$derp_lora_stack.messages.removed_missing_prefix", "Removed non-existing LoRA: "), 5000, { fade: true, grow: true }, null, "error", false, item);
    });
}

function closeLoraDetailForHost(host) {
    if (!host) return false;
    const b = activeBastas?.get(LORA_DETAIL_BASTA_ID);
    if (!b || b.hostNode !== host) return false;
    host._activeDetailSlot = null;
    if (!b.isClosing) b.close();
    return true;
}

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
                    const isGhostDrawing = !!this._isGhostDrawing;
                    const oldIn = this.inputs, oldOut = this.outputs;
                    if (isDraggingStack || isGhostDrawing) { this.inputs = null; this.outputs = null; }
                    originalDrawNode.apply(this, arguments);
                    if (isDraggingStack || isGhostDrawing) { this.inputs = oldIn; this.outputs = oldOut; }
                };

                nodeType.prototype.syncDerpSignalManual = function() {
                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                };

                nodeType.prototype.syncLoraStackStructureHeight = function() {
                    const remeasureNode = (target) => {
                        if (!target || typeof settleDerpSizeBeforeDraw !== "function") return 0;
                        settleDerpSizeBeforeDraw(target, {
                            forceAutoHeight: true,
                            suppressRequestSync: true,
                        });
                        return Number(target.properties?.nodeSize?.[1] ?? target.size?.[1]) || 0;
                    };

                    let targetHeight = remeasureNode(this);

                    if (typeof shouldPreserveHorizontalDeckHeight === "function" &&
                        typeof syncHorizontalDeckHeight === "function" &&
                        shouldPreserveHorizontalDeckHeight(this)) {
                        const graph = app.graph || this.graph || null;
                        const members = graph ? getDeckMembers(this, graph) : [];
                        if (Array.isArray(members) && members.length > 1) {
                            targetHeight = members.reduce((maxHeight, member) => {
                                return Math.max(maxHeight, remeasureNode(member));
                            }, 0);
                        }
                        if (targetHeight > 0) syncHorizontalDeckHeight(this, targetHeight);
                    }

                    if (this.requestDerpSync) this.requestDerpSync();
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                };

                nodeType.prototype.applyPalette = function() {
                    if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
                    syncDerpLoraStackLocaleLabels(this);
                    this._layoutMapHash = null; // THE STRUCTURAL RESET: Synchronized cache nuke
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    this.requestDerpSync();
                };

                // --- THEME UPDATE ---
                nodeType.prototype.onThemeUpdate = function(config) {
                    this.handleThemeUpdate(config);
                    syncDerpLoraStackLocaleLabels(this);
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
                        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;

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
                        let allTriggers = activeStack.map(l => l[4] || "").filter(t => t.length > 0).join(", ");

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

                        const packageValue = isBypassed ? null : {
                            stack: combinedStack,
                            model_name_prefix: this.activeModelPrefix,
                            model_id: baseModelId,
                            clip_id: baseClipId,
                            model_fallback: baseModelFallback,
                            clip_fallback: baseClipFallback,
                            triggers: allTriggers,
                            upstream_ids: [...new Set(upstreamIds)]
                        };

                        const signalHash = `${isBypassed ? "bypass" : "live"}__${JSON.stringify(packageValue)}`;
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
                        virtualOutputs.push({ name: "LoRA_triggers", type: "STRING", value: isBypassed ? "" : allTriggers });

                        virtualOutputs.forEach((output, idx) => {
                            const signalId = `${baseId}:${idx}`;
                            window.xcpDerpSignals[signalId] = {
                                nodeId: signalId,
                                nodeName: `${nodeName} [${output.name}]`,
                                nodeType: this.type || "Node",
                                type: output.value === null ? "null" : output.type,
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

                nodeType.prototype.fetchDerpLoraTriggers = function(loraName, index, forceEditorSync = false) {
                    if (!loraName) return;
                    fetchLoraRating(this, loraName);
                    fetchLoraTriggers(this, loraName, index, forceEditorSync);
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

                    const applyProfileData = (profileData) => {
                        const p = profileData || {};
                        if (p.stackData) this.properties.stackData = JSON.parse(JSON.stringify(p.stackData));
                        if (p.attentionMode) this.properties.attentionMode = p.attentionMode;
                        this.properties.showCLIP = p.showCLIP ?? false;
                        this.properties.nameDisplay = p.nameDisplay || "Top";
                        this.properties.toggleLR = p.toggleLR ?? false;

                        this._currentProfileName = profileName;
                        if (p.settings) {
                            Object.assign(this.properties, p.settings);
                            LORA_STACK_NUMERIC_SETTING_KEYS.forEach((key) => {
                                if (this.properties[key] === undefined || this.properties[key] === null) return;
                                const parsed = parseFloat(this.properties[key]);
                                if (Number.isFinite(parsed)) this.properties[key] = parsed;
                            });
                        }
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                        if (this.syncLoraStackStructureHeight) this.syncLoraStackStructureHeight();
                        if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                        if (this._derpPanel) this._derpPanel._layoutDirty = true;
                        this.setDirtyCanvas(true, true);
                    };

                    if (this._sysProfileData?.[profileName]) {
                        applyProfileData(this._sysProfileData[profileName]);
                        return;
                    }

                    fetch("/xcp/load/settings?name=derpLoraStack.json")
                        .then(res => res.json())
                        .then(res => {
                            const profiles = res.data || {};
                            this._sysProfileData = profiles;
                            applyProfileData(profiles[profileName]);
                        });
                };

                nodeType.prototype.applyDefaultDerpProfileOnCreate = function() {
                    if (this._didAttemptInitialDefaultProfile) return;
                    this._didAttemptInitialDefaultProfile = true;
                    if ((this.properties.stackData || []).length > 0) return;
                    if (this.applyDerpProfile) this.applyDerpProfile("_Default");
                };

                nodeType.prototype.exportDerpProfile = function() {
                    return {
                        // THE PROFILE CLEANUP: Includes only settings seen in the screenshot ("Saved Normally").
                        // Explicitly excludes framework keys: minWidth, nodeSize, drawHeader, drawSignalBtn, contentCollapsed, isWirelessTransmitter.
                        attentionMode: this.properties.attentionMode,
                        showCLIP: this.properties.showCLIP,
                        nameDisplay: this.properties.nameDisplay,
                        toggleLR: this.properties.toggleLR ?? false,
                        settings: {
                            sliderMin: this.properties.sliderMin, sliderMax: this.properties.sliderMax,
                            sliderStep: this.properties.sliderStep, sliderDefault: this.properties.sliderDefault,
                            clipMin: this.properties.clipMin, clipMax: this.properties.clipMax,
                            clipStep: this.properties.clipStep, clipDefault: this.properties.clipDefault
                        }
                    };
                };

                nodeType.prototype.onDerpSysPanelOpen = function(panel) {
                    this._derpPanel = panel;
                    if (panel.showProfiles) {
                        panel.showProfiles("derpLoraStack.json", "nodeSettings");
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
                    this.properties.skipGenericWirelessHeartbeat = true;
                    this.isPureVirtual = true;
                    this.properties.isPureVirtual = true;
                    this.properties.drawSignalBtn = true;
                    // Critical: pure virtual nodes must have empty outputs
                    this.outputs = [];

                    this.titleLabel = tLocale("$derp_lora_stack.title", "Derp Lora Stack");
                    this.properties.titleLabel = tLocale("$derp_lora_stack.title", "Derp Lora Stack");
                    this.properties.stackData = [];
                    this.activeModelPrefix = "Unknown_Model";
                    this.properties.activeModelPrefix = "Unknown_Model";


                    this.properties.autoWidth = false;
                    this.properties.autoHeight = true;
                    this.properties.nodeSize = [300, 60];
                    this.size = [300, 60];

                    this.fetchDerpLoraData(); // THE DATA FETCH FIX: Run on creation
                    this.fetchDerpRatingsPalette();
                    syncDerpLoraStackLocaleLabels(this);

                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();

                    this.applyDefaultDerpProfileOnCreate();

                    setTimeout(() => {
                        if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                            this.syncDerpOutputs();
                        }
                    }, 1);
                };

                const onConfigure = nodeType.prototype.onConfigure;
                nodeType.prototype.onConfigure = function(info) {
                    if (onConfigure) onConfigure.apply(this, arguments);
                    this.properties.attentionMode = this.properties.attentionMode || "Cross-Attention";
                    this.signalFilters = { types: this.properties.attentionMode === "Joint-Attention" ? ["MODEL"] : ["MODEL", "CLIP"] };
                    this.isPureVirtual = true;
                    this.properties.isPureVirtual = true;
                    // Re-enforce virtual state on workflow load
                    if (this.outputs && this.outputs.length > 0) {
                        this.outputs.forEach(o => { if (o.links) o.links = null; });
                        this.outputs = [];
                    }

                    this.fetchDerpLoraData(); // THE DATA FETCH FIX: Run on workflow load
                    this.fetchDerpRatingsPalette();
                    syncDerpLoraStackLocaleLabels(this);
                    this.activeModelPrefix = this.activeModelPrefix || "Unknown_Model";
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    if (this.refreshDerpLoraStackSysMap) this.refreshDerpLoraStackSysMap();
                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                };

                const onDrawForeground = nodeType.prototype.onDrawForeground;
                nodeType.prototype.onDrawForeground = function(ctx) {
                    if (onDrawForeground) onDrawForeground.apply(this, arguments);

                    // THE GHOST DRAW FIX: Render the picked-up object freely following the mouse cursor
                    if (this._dragTrig && this._dragThresholdMet) {
                        const dragIdx = this._dragTrig.index;
                        const rowKey = `loraRow_${dragIdx}`;
                        const snapshot = this._loraFloatingSnapshot;
                        const baseReg = snapshot?.regions?.[rowKey] || this.layout?.regions?.[rowKey];

                        if (baseReg && this._dragMouse && this._dragOffset) {
                            const dx = this._dragMouse[0] - this._dragOffset[0] - baseReg.x;
                            const dy = this._dragMouse[1] - this._dragOffset[1] - baseReg.y;

                            ctx.save();
                            ctx.translate(dx, dy);
                            this._isGhostDrawing = true;

                            // Suppress LiteGraph slot circles for the entire ghost pass.
                            const oldInputs = this.inputs;
                            const oldOutputs = this.outputs;
                            this.inputs = null;
                            this.outputs = null;

                            try {

                                // Draw an opaque canvas-backed plate under the dragged row.
                                // REGION themes are often transparent, so we borrow REGION corners
                                // but force the canvas OFF paint to stabilize ghost readability.
                                const rowCfg = this.layoutMap?.mainContentRegion?.[rowKey] || snapshot?.regions?.[rowKey] || {};
                                const regionBp = this.UI_TYPES ? COMPONENT_BLUEPRINTS[this.UI_TYPES.REGION] : null;
                                if (regionBp) {
                                    const ghostPlate = {
                                        ...rowCfg,
                                        key: `${rowKey}_ghostPlate`,
                                        geometry: { x: baseReg.x, y: baseReg.y, w: baseReg.w, h: baseReg.h },
                                        themeKey: "canvas",
                                        state: "OFF",
                                        alpha: 1.0,
                                        hidden: false,
                                        mouseOver: false,
                                        hoverEffect: false,
                                        corners: rowCfg?.corners || baseReg?.corners
                                    };
                                    regionBp.sync(ctx, this, ghostPlate);
                                }

                                const suffix = `_${dragIdx}`;
                                const componentsToDraw = [];
                                const ghostAllowedTypes = new Set([
                                    this.UI_TYPES.TEXT,
                                    this.UI_TYPES.ICONBUTTON,
                                    this.UI_TYPES.SLIDER,
                                    this.UI_TYPES.EDITOR,
                                    this.UI_TYPES.TOGGLE_V2,
                                    this.UI_TYPES.IMAGE_HTML,
                                    this.UI_TYPES.FILEBROWSER,
                                ]);

                                for (const [k, r] of Object.entries(snapshot?.regions || this.layout.regions || {})) {
                                    if (r.type === "linebreak") continue;
                                    if (k === rowKey || k.endsWith(suffix)) {
                                        if (!(k === rowKey || regionBelongsToRow(rowKey, r, snapshot?.regions || this.layout?.regions))) continue;
                                        // Render only stable visual widgets in ghost pass.
                                        // This avoids slot/circle artifacts from non-row helper regions.
                                        const isTriggerDropdown = r.type === this.UI_TYPES.DROPDOWN_DERP || k.startsWith("dropTrigger_");
                                        if (!ghostAllowedTypes.has(r.type) && !isTriggerDropdown) {
                                            continue;
                                        }
                                        // THE ORIGINAL CONFIG RETRIEVAL: Drill into layoutMap to find source config (imageUrl, etc.) for ghost rendering
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
                                        const sourceState = fCfg?.state ?? r?.state ?? "OFF";
                                        const isTriggerDropdown = r.type === this.UI_TYPES.DROPDOWN_DERP || k.startsWith("dropTrigger_");

                                        // Draw trigger dropdown as a stable canvas button-like surrogate
                                        // during ghost pass to avoid hybrid DOM flicker.
                                        if (isTriggerDropdown) {
                                            const ghostDropBp = COMPONENT_BLUEPRINTS[this.UI_TYPES.DROPDOWN_DERP];
                                            if (ghostDropBp) {
                                                const ghostDropData = {
                                                    ...fCfg,
                                                    key: `${k}_ghost_drop`,
                                                    geometry: { x: r.x, y: r.y, w: r.w, h: r.h },
                                                    width: "full",
                                                    height: "auto",
                                                    themeKey: "dialog, t_textSmall",
                                                    indicator: true,
                                                    canvasShield: true,
                                                    mouseOver: false,
                                                    padding: fCfg?.padding || [4, 2],
                                                    spacing: fCfg?.spacing || [2, 0],
                                                    text: (fCfg?.text && String(fCfg.text).trim() !== "")
                                                        ? fCfg.text
                                                        : (fCfg?.value || "None"),
                                                    displayMode: "cutoff",
                                                    alpha: 1.0,
                                                    hidden: false,
                                                    state: sourceState,
                                                    onPress: null,
                                                    onChange: null
                                                };
                                                ghostDropBp.sync(ctx, this, app, ghostDropData);
                                            }
                                            continue;
                                        }

                                        const ghostData = {
                                            ...fCfg,
                                            key: k,
                                            geometry: { x: r.x, y: r.y, w: r.w, h: r.h },
                                            alpha: 1.0,
                                            hidden: false,
                                            state: sourceState,
                                            mouseOver: !!(r?.mouseOver ?? fCfg?.mouseOver)
                                        };

                                        if (bp.isHybrid || bp.isHtml || r.type?.toLowerCase().includes("image")) {
                                            bp.sync(ctx, this, app, ghostData);
                                        } else {
                                            bp.sync(ctx, this, ghostData);
                                        }
                                    }
                                }

                                for (const item of componentsToDraw) {
                                    const { key: k, reg: r, config: fCfg } = item;
                                    const bp = this.UI_TYPES ? COMPONENT_BLUEPRINTS[r.type] : null;
                                    if (bp && r.strokeZIndex) {
                                        const sourceState = fCfg?.state ?? r?.state ?? "OFF";
                                        const ghostData = {
                                            ...fCfg,
                                            key: k,
                                            geometry: { x: r.x, y: r.y, w: r.w, h: r.h },
                                            alpha: 1.0,
                                            hidden: false,
                                            state: sourceState
                                        };
                                        if (bp.isHybrid) bp.sync(ctx, this, app, ghostData, true);
                                    }
                                }
                            } finally {
                                this.inputs = oldInputs;
                                this.outputs = oldOutputs;
                                this._isGhostDrawing = false;
                            }
                            ctx.restore();
                        }
                    }

                    // ZERO-INFERENCE GUARD: Prevent execution on collapsed or uninitialized nodes
                    if (this.flags?.collapsed || this.properties?.contentCollapsed === true) {
                        closeLoraDetailForHost(this);
                        return;
                    }
                    if (this.id === -1) return;

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
                    const isRowControlKey = (key) => key.startsWith("btnEnable_") || key.startsWith("btnEnableLeft_");
                    const isSliderKey = (key) => key && (key.startsWith("sldModel_") || key.startsWith("sldClip_"));
                    const isInteractiveRowKey = (key) =>
                        key.startsWith("dropTrigger_") ||
                        key.startsWith("lblLoraNameTop_") ||
                        key.startsWith("sldModel_") ||
                        key.startsWith("sldClip_") ||
                        key.startsWith("loraPreview_") ||
                        key.startsWith("loraRow_");
                    if (type === "click" && this._suppressClickAfterDrag) {
                        this._suppressClickAfterDrag = false;
                        return true;
                    }

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
                        if (type === "dragEnd" && this._pendingSliderDraft && isSliderKey(this._pendingSliderDraft.targetKey)) {
                            const { targetKey, idx, sType, value } = this._pendingSliderDraft;
                            const stackData = this.properties.stackData || [];
                            if (stackData[idx]) {
                                if (sType === "sldModel") stackData[idx][1] = value;
                                else if (sType === "sldClip") stackData[idx][2] = value;

                                const finalValStr = value.toFixed(2);
                                this.properties.stackData = stackData;
                                if (this.layout?.regions?.[targetKey]) this.layout.regions[targetKey].value = value;
                                if (this._compDataCache?.[targetKey]) this._compDataCache[targetKey].value = value;

                                const valKey = targetKey.replace("sld", "val");
                                if (this.layout?.regions?.[valKey]) {
                                    this.layout.regions[valKey].value = finalValStr;
                                    this.layout.regions[valKey].text = finalValStr;
                                }
                                if (this._compDataCache?.[valKey]) {
                                    this._compDataCache[valKey].value = finalValStr;
                                    this._compDataCache[valKey].text = finalValStr;
                                }

                                this._derpAwakeFrames = 5;
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.setDirtyCanvas(true);
                            }
                        }
                        endStackDrag(this, "stackData"); // Kills the hold-timer to prevent sound/pickup on single clicks
                        this._pendingSliderDraft = null;
                        this._activeSliderKey = null;
                        this._isDerpResizing = false;
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    }

                    if (type === "hover" || type === "drag" || type === "dragStart" || type === "click" || type === "dblclick") {
                        const { localX, localY } = data || {};
                        let foundKey = null;
                        const regions = this.layout?.regions;
                        let keys = [];
                        let isHit = null;

                        if (regions && typeof localX === 'number' && typeof localY === 'number') {
                            keys = Object.keys(regions).reverse();
                            isHit = (key) => this.layout.hitTest([localX, localY], regions[key]);

                            // Check row controls first so row drag logic does not steal button clicks.
                            for (const key of keys) {
                                if (isRowControlKey(key) && isHit(key)) {
                                    foundKey = key;
                                    break;
                                }
                            }

                            if (!foundKey) {
                                for (const key of keys) {
                                    if (isInteractiveRowKey(key) && isHit(key)) {
                                        foundKey = key;
                                        break;
                                    }
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
                        }

                        if (type === "drag" && this._dragTrig) {
                            updateStackDrag(this, data, "loraRow_", this.properties.stackData.length);
                            // Consume drag only after the hold threshold arms row DnD.
                            // Before that, slider drags must still be able to update their draft value.
                            if (this._dragThresholdMet) return true;
                        }

                        const targetKey = this._activeSliderKey !== null ? this._activeSliderKey : foundKey;

                        // Node-scoped preview click handling: clicking loraPreview opens detail panel.
                        if (type === "click" && targetKey && targetKey.startsWith("loraPreview_")) {
                            const reg = regions?.[targetKey];
                            if (reg && reg.state !== "DIS" && typeof reg.onPress === "function") {
                                try {
                                    reg.onPress(data, reg, {
                                        localX,
                                        localY,
                                        targetKey
                                    });
                                } catch (e) {}
                                return true;
                            }
                        }

                        if (targetKey && (type === "drag" || type === "dragStart" || type === "click" || type === "dblclick")) {
                            const reg = regions[targetKey];
                            if (reg && reg.state !== "DIS") {
                                try {
                                    const parts = targetKey.split("_");
                                    const sType = parts[0];
                                    const idx = parseInt(parts[1]);
                                    const stackData = this.properties.stackData || [];

                                    // Keep slider hit zones out of row drag arming and mark the
                                    // slider as actively pressed here, because this custom path
                                    // can return before the base Fatha handler records it.
                                    if (stackData[idx] && (sType === "sldModel" || sType === "sldClip") && (type === "dragStart" || type === "click" || type === "dblclick" || type === "drag")) {
                                        if (type === "dragStart" || type === "click" || type === "dblclick") {
                                            this._pressedRegionKey = targetKey;
                                            this._passiveWholeWallCacheSuspendUntil = Math.max(
                                                Number(this._passiveWholeWallCacheSuspendUntil || 0),
                                                performance.now() + 220
                                            );
                                        }
                                        if (type === "click" && this._btnLRHandledKey === targetKey) { this._btnLRHandledKey = null; return true; }
                                        if (type === "dragStart") this._btnLRHandledKey = null;
                                        const sliderConfig = regions[targetKey];
                                        if ((type === "dragStart" || type === "click" || type === "dblclick") && sliderConfig) {
                                            const btnResult = handleDerpSliderBtnLR(this, reg, targetKey, type, localX, sliderConfig);
                                            if (btnResult.handled) {
                                                if (type === "dragStart") this._btnLRHandledKey = targetKey;
                                                if (btnResult.newVal !== undefined) {
                                                    const fv = btnResult.newVal.toFixed(2);
                                                    if (regions[targetKey]) regions[targetKey].value = btnResult.newVal;
                                                    if (this._compDataCache?.[targetKey]) this._compDataCache[targetKey].value = btnResult.newVal;
                                                    const valKey = targetKey.replace("sld", "val");
                                                    if (regions[valKey]) { regions[valKey].value = fv; regions[valKey].text = fv; }
                                                    if (this._compDataCache?.[valKey]) { this._compDataCache[valKey].value = fv; this._compDataCache[valKey].text = fv; }
                                                    sType === "sldModel" ? stackData[idx][1] = btnResult.newVal : stackData[idx][2] = btnResult.newVal;
                                                    this.properties.stackData = stackData;
                                                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                                                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                                    this.setDirtyCanvas(true);
                                                }
                                                if (type === "dragStart") endStackDrag(this, "stackData");
                                                return true;
                                            }
                                        }
                                        if (type === "dragStart") {
                                            endStackDrag(this, "stackData");
                                            return true;
                                        }
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
                                            const cfgBtnLR = sliderConfig?.btnLR ?? false;
                                            const mrg = cfgBtnLR ? BTN_LR_MARGIN : 0;
                                            const btnW = cfgBtnLR ? Math.round((reg.h || 14) * BTN_LR_RATIO) : 0;
                                            const trackX = reg.x + mrg + btnW;
                                            const trackW = Math.max(1, reg.w - (btnW + mrg) * 2);
                                            const percent = Math.max(0, Math.min(1, (localX - trackX) / trackW));
                                            const rawVal = cMin + (percent * (cMax - cMin));
                                            newVal = Math.round(rawVal / cStep) * cStep;
                                        }
                                        newVal = Math.max(cMin, Math.min(cMax, newVal));

                                        const finalValStr = newVal.toFixed(2);
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

                                        if (type === "drag") {
                                            this._pendingSliderDraft = { targetKey, idx, sType, value: newVal };
                                            this.setDirtyCanvas(true);
                                            return true;
                                        }

                                        if (sType === "sldModel") stackData[idx][1] = newVal;
                                        else if (sType === "sldClip") stackData[idx][2] = newVal;

                                        // THE CHAIN AWAKE FIX: Interaction on this node must dirty the global canvas
                                        // so downstream watchers in onDrawForeground can detect the change.
                                        this._pendingSliderDraft = null;
                                        this._derpAwakeFrames = 5;
                                        this.properties.stackData = stackData;
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
                nodeType.prototype.validateLoraStack = async function() {
                    const stack = this.properties.stackData || [];
                    const namesToCheck = [...new Set(
                        stack
                            .map((entry) => entry?.[0])
                            .filter((name) => name && name !== "None")
                    )];
                    if (namesToCheck.length === 0) return;

                    let existsMap = null;
                    try {
                        const res = await fetch("/xcp/check_lora_files", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ names: namesToCheck }),
                        });
                        if (!res.ok) return;
                        const data = await res.json();
                        existsMap = data?.exists && typeof data.exists === "object" ? data.exists : null;
                    } catch (err) {
                        console.warn("[xcpDerp] validateLoraStack file check failed:", err);
                        return;
                    }
                    if (!existsMap) return;

                    const removed = [];
                    const newStack = stack.filter((entry) => {
                        const loraName = entry[0];
                        if (!loraName || loraName === "None") return true;

                        const exists = existsMap[loraName] === true;
                        if (!exists) removed.push(loraName);
                        return exists;
                    });

                    if (removed.length > 0) {
                        this.properties.stackData = newStack;

                        const missingDisplayNames = removed.map((name) => {
                            return String(name || "").split(/[\\/]/).pop() || "Unknown LoRA";
                        });
                        queueMissingLoraMessages(this, missingDisplayNames);

                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                        if (this.syncLoraStackStructureHeight) this.syncLoraStackStructureHeight();
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
