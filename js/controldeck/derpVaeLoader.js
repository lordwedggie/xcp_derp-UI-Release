/**
 * Path: ./js/fatha/nodes/derpVaeLoader.js
 * STATUS: VIRTUAL FATHA COMPLIANT | REFACTORED
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpVaeLoaderCore } from "./core/derpVaeLoader_core.js";
import { showBastaFileHandler } from "../fatha/bastas/bastaFileHandler.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../fatha/helpers/fathaDragDrop.js";

app.registerExtension({
    name: "xcp.derpVaeLoader_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("vaeloader")) return;

        // Initialize Fatha and the Logic Core
        fatha(nodeType, nodeData, 300);
        initDerpVaeLoaderCore(nodeType);

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;

            // ZERO-INFERENCE OPTIMIZATION: Lock layout variables to 2 decimal places to block zoom jitter
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH, sW] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sH, vars.sW
            ].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;

            const deck = this.properties.vaeDeck || [];
            const deckHash = deck.map(m => `${m.name}:${m.active}:${m.source || ""}`).join("|");
            const structureHash = `${deckHash}_${(this._vaeList || []).length}_${window._xcpDerpSession}_${this.properties.showFolderNames}_${this.properties.settingActive}_${this.properties.extractFromModel}_${mW}_${mH}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragMouse?.join(",")}`;

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = structureHash;

            const sendSignal = () => {
                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
            };

            const deckRegions = {};
            const deckItems = deck.map((m, idx) => ({ m, idx }));
            let floatingItem = null;

            if (this._dragTrig && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;

                // 1. EXTRACT DRAGGED ITEM
                [floatingItem] = deckItems.splice(d.index, 1);

                // 2. INSERT GHOST
                const ghost = { ...floatingItem, isPreviewGhost: true };
                deckItems.splice(pIdx, 0, ghost);
            }

            deckItems.forEach((item) => {
                const { m, idx } = item;
                const rowKey = `vaeRow_${idx}`;
                deckRegions[rowKey] = {
                    type: this.UI_TYPES.REGION,
                    dir: "row", width: "full", height: item.isPreviewGhost ? 30 : "auto",
                    spacing: [0, sH],
                    state: item.isPreviewGhost ? "DIS" : (m.active ? "ON" : "OFF"),
                    alpha: item.isPreviewGhost ? 0 : 1.0,
                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                    onDrag: (e, data) => { updateStackDrag(this, data, "vaeRow_", deck.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "vaeDeck"),
                    onPress: () => {
                        endStackDrag(this, "vaeDeck");
                        if (!m.active) {
                            this.properties.vaeDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    regionOffset: [0, 0],
                    [`vaeToggle_${idx}`]: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, mouseOver: true, cutoff: true,
                        text: (this.properties.showFolderNames ? m.name : m.name.split(/[\\/]/).pop()).replace(/\.(safetensors|pt|ckpt)$/i, ""),
                        value: m.active,
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "full", height: "auto", padding: [pW, pH],
                        themeKey: "button, t_textNormal",
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "vaeRow_", deck.length); this.refreshNodeLayoutMap(); },
                        onDragEnd: () => endStackDrag(this, "vaeDeck"),
                        onChange: (v) => {
                            endStackDrag(this, "vaeDeck");
                            if (!v) {
                                this.refreshNodeLayoutMap();
                                return;
                            }
                            this.properties.vaeDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    [`btnRemoveVae_${idx}`]: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "close",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "match", height: "full", padding: [pW, pH], margin: [0, sH],
                        themeKey: "button, t_textNormal",
                        onPress: () => {
                            showBastaFileHandler(this, "none", `btnRemoveVae_${idx}`, {
                                title: "Remove VAE",
                                message: `Remove ${m.name.split(/[\\/]/).pop().replace(/\.(safetensors|pt|ckpt)$/i, "")} from deck?`,
                                confirm: "Remove",
                                mode: "delete",
                                playSound: "delete",
                                onConfirm: () => {
                                    const currentIdx = this.properties.vaeDeck.indexOf(m);
                                    if (currentIdx === -1) return;

                                    const wasActive = m.active;
                                    this.properties.vaeDeck.splice(currentIdx, 1);

                                    if (wasActive && this.properties.vaeDeck.length > 0) {
                                        const nextIdx = (currentIdx > 0) ? currentIdx - 1 : 0;
                                        this.properties.vaeDeck[nextIdx].active = true;
                                    }
                                    sendSignal();
                                    this.refreshNodeLayoutMap();
                                }
                            });
                        }
                    }
                };
            });

            // 3. THE FLOATING LAYER
            if (floatingItem && this._dragMouse && this._dragOffset) {
                const { m, idx } = floatingItem;
                const dragX = this._dragMouse[0] - this._dragOffset[0];
                const dragY = this._dragMouse[1] - this._dragOffset[1];

                deckRegions[`floatingVaeRow`] = {
                    type: this.UI_TYPES.REGION, themeKey: "region",
                    dir: "row", width: this.size[0] - (mW * 4), height: "auto",
                    ignoreLayout: true, x: dragX, y: dragY, zIndex: 100,
                    state: "ON", regionOffset: [0, 0],
                    [`floatingToggle`]: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, cutoff: true,
                        text: (this.properties.showFolderNames ? m.name : m.name.split(/[\\/]/).pop()).replace(/\.(safetensors|pt|ckpt)$/i, ""),
                        value: m.active, width: "full", height: "auto", padding: [pW, pH],
                        themeKey: "button, t_textNormal",
                    },
                    [`floatingRemoveBtn`]: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "close",
                        width: "match", height: "full", padding: [pW, pH], margin: [0, sH],
                        themeKey: "button, t_textNormal",
                    }
                };
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto", dir: "col",
                    margin: this.properties?.drawHeader === true ? [mW, mH, mW, mH] : [0, 0],
                    regionVaeDeck: {
                        width: "full", height: "auto", dir: "col", spacing: [0, sH],
                        hidden: deck.length === 0,
                        margin: [0, 0, 0, mH],
                        ...deckRegions
                    },
                    settingRegion: {
                        width: "full", height: "auto", margin: [-mW, 0, -mW, mH], dir: "col",
                        hidden: !this.properties.settingActive,
                        settingBreak1: { type: this.UI_TYPES.LINEBREAK },
                        settingRow1: {
                            dir: "row", width: "full", height: "auto", margin: [mW, sH, mW, sH],
                            toggleModelVAE: {
                                type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true,
                                text: "Extract VAE from model",
                                value: this.properties.extractFromModel || false,
                                themeKey: "button, t_textNormal",
                                width: "full", padding: [pW, pH],
                                onChange: (v) => {
                                    this.properties.extractFromModel = v;
                                    this.fetchVaeData();
                                    this.refreshNodeLayoutMap();
                                }
                            }
                        },
                        settingBreak2: { type: this.UI_TYPES.LINEBREAK }
                    },
                    regionVaeLoader: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        margin: [0, mH, 0, 0],
                        browserVaes: {
                            type: this.UI_TYPES.FILEBROWSER,
                            items: (this._vaeList || []).filter(name => !deck.some(m => m.name === name)),
                            mode: "file", rootName: this.properties.extractFromModel ? "models" : "vaes", fileType: "vae", mouseOver: false,
                            value: "Select Vae...",
                            width: "full", height: "auto",
                            fontSize: t_textNormal_size,
                            themeKey: "dialog, t_textNormal", canvasShield: true,
                            spacing: [sW, 0], padding: [pW, pH],
                            onChange: (v) => {
                                if (!this.properties.vaeDeck) this.properties.vaeDeck = [];
                                this.properties.vaeDeck.forEach(m => m.active = false);
                                const existing = this.properties.vaeDeck.find(m => m.name === v);
                                const source = this.properties.extractFromModel ? "model" : "vae";
                                if (!existing) {
                                    this.properties.vaeDeck.push({ name: v, active: true, source: source });
                                } else {
                                    existing.active = true;
                                    existing.source = source;
                                }
                                sendSignal();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                            }
                        },
                        btnRefreshVaes: {
                            type: this.UI_TYPES.BUTTON, text: "Refresh",
                            width: "auto", height: "fill", padding: [pW, pH],
                            fontSize: t_textNormal_size,
                            labelAlign: ["center", "middle"], themeKey: "button, t_textSmall",
                            onPress: () => {
                                window._xcpDerpSession = Date.now();
                                this.fetchVaeData(true);
                            }
                        }
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            // ZERO-INFERENCE OPTIMIZATION: Precision Jitter Lock (toFixed 2)
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sW] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sW
            ].map(v => Number(v.toFixed(2)));
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    width: "full", height: "auto", margin: [mW, 0, mW, mH],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textSystem",
                        labelAlign: ["left", "middle"],
                        text: "Custom node properties:",
                        width: "full", padding: [pW, pH],
                    },
                    "regionSetting-1": {
                        anchor: { target: "lblTitle", axis: "y", offset: oY },
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        toggleShowFolder: {
                            type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, themeKey: "button, t_textSystem",
                            text: "Show Folder Names",
                            width: "full", height: "auto", padding: [pW, pH],
                            value: this.properties.showFolderNames !== false,
                            onChange: (v) => {
                                this.properties.showFolderNames = v;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpTemplateSysMap();
                            }
                        }
                    },
                    layoutSpacer: { anchor: { target: "regionSetting-1", axis: "y", offset: oY } }
                }
            };
        };

        // --- LIFECYCLE WRAPPERS ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.handleVaeCreated();
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.handleVaeConfigure();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            this.handleVaeDraw?.();
        };

        nodeType.prototype.onResize = function(size) {
            if (this.handleVaeResize) this.handleVaeResize(size);
        };
    }
});