/**
 * Path: ./js/fatha/nodes/derpModelLoader.js
 * STATUS: VIRTUAL FATHA COMPLIANT | REFACTORED
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpModelLoaderCore } from "./core/derpModelLoader_core.js";
import { showBastaFileHandler } from "../fatha/bastas/bastaFileHandler.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../fatha/helpers/fathaDragDrop.js";

app.registerExtension({
    name: "xcp.derpModelLoader_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("modelloader")) return;
        fatha(nodeType, nodeData, 200);
        initDerpModelLoaderCore(nodeType);

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;

            // ZERO-INFERENCE OPTIMIZATION: Lock layout variables to 2 decimal places to block zoom jitter
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH, sW] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sH, vars.sW
            ].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;

            const deck = this.properties.modelDeck || [];
            const deckHash = deck.map(m => `${m.name}:${m.active}`).join("|");

            // GOLD-MASTER HASH: Includes physical width and consistent naming for caching
            const structureHash = `${deckHash}_${(this._modelList || []).length}_${window._xcpDerpSession}_${this.properties.showFolderNames}_${this.properties.settingActive}_${mW}_${mH}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                return;
            }
            this._layoutMapHash = structureHash;

            const sendSignal = () => {
                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
            };

            const deckRegions = {};
            const deckItems = deck.map((m, idx) => ({ m, idx }));
            let floatingItem = null;

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;

                // 1. EXTRACT DRAGGED ITEM: Remove it from its original spot to create the 'floating' data
                [floatingItem] = deckItems.splice(d.index, 1);

                // 2. INSERT GHOST: Place a placeholder at the target preview index
                const ghost = { ...floatingItem, isPreviewGhost: true };
                deckItems.splice(pIdx, 0, ghost);
            }

            deckItems.forEach((item, displayIdx) => {
                const { m, idx } = item;
                const rowKey = `modelRow_${idx}`;
                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === idx && !item.isPreviewGhost);
                deckRegions[rowKey] = {
                    type: this.UI_TYPES.REGION,
                    dir: "row", width: "full", height: "auto",
                    spacing: [0, sH],
                    // THE GHOST STYLING: Make the placeholder semi-transparent and non-interactive
                    state: item.isPreviewGhost ? "DIS" : ((isPickedUp || m.active) ? "ON" : "OFF"),
                    alpha: item.isPreviewGhost ? 0 : 1.0,
                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                    onDrag: (e, data) => { updateStackDrag(this, data, "modelRow_", deck.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "modelDeck"),
                    onPress: () => {
                        // CLEANUP FIX: Purge ghost state if the user clicks the 1px gap without dragging
                        endStackDrag(this, "modelDeck");
                        if (!m.active) {
                            this.properties.modelDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    regionOffset: [0, 0],
                    [`modelToggle_${idx}`]: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, mouseOver: true, cutoff: true,
                        key: `modelToggle_${idx}`,
                        text: this.properties.showFolderNames ? m.name.replace(/\.safetensors$/i, "") : m.name.split(/[\\/]/).pop().replace(/\.safetensors$/i, ""),
                        value: m.active,
                        playSound: m.active ? null : "powerUp",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "full", height: "auto", padding: [pW, pH],
                        themeKey: "button, t_textNormal",
                        // FORWARD DRAG: Allow the inner widget to drive the parent stack movement
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "modelRow_", deck.length); this.refreshNodeLayoutMap(); },
                        onDragEnd: () => endStackDrag(this, "modelDeck"),
                        onChange: (v) => {
                            endStackDrag(this, "modelDeck");
                            if (!v) {
                                this.refreshNodeLayoutMap();
                                return;
                            }
                            this.properties.modelDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    [`btnRemoveModel_${idx}`]: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "close",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "match", height: "full", padding: [pW, pH], margin: [0, sH, sW, sH],
                        themeKey: "button, t_textNormal",
                        onPress: () => {
                            showBastaFileHandler(this, "none", `btnRemoveModel_${idx}`, {
                                title: "Remove Model",
                                message: `Remove ${m.name.split(/[\\/]/).pop().replace(/\.safetensors$/i, "")} from deck?`,
                                confirm: "Remove",
                                mode: "delete",
                                playSound: "delete",
                                onConfirm: () => {
                                    const currentIdx = this.properties.modelDeck.indexOf(m);
                                    if (currentIdx === -1) return;

                                    const wasActive = m.active;
                                    this.properties.modelDeck.splice(currentIdx, 1);

                                    if (wasActive && this.properties.modelDeck.length > 0) {
                                        const nextIdx = (currentIdx > 0) ? currentIdx - 1 : 0;
                                        this.properties.modelDeck[nextIdx].active = true;
                                    }
                                    sendSignal();
                                    this.refreshNodeLayoutMap();
                                }
                            });
                        }
                    }
                };
            });

            // 3. THE FLOATING LAYER: Append a region that follows the mouse cursor
            if (floatingItem && this._dragThresholdMet && this._dragMouse && this._dragOffset) {
                const { m, idx } = floatingItem;
                const dragX = this._dragMouse[0] - this._dragOffset[0];
                const dragY = this._dragMouse[1] - this._dragOffset[1];
                const sourceRow = this.layout?.regions?.[`modelRow_${idx}`];
                const floatingRowWidth = sourceRow?.w || (this.size[0] - (mW * 2));

                deckRegions[`floatingModelRow`] = {
                    type: this.UI_TYPES.REGION, themeKey: "region",
                    dir: "row", width: floatingRowWidth, height: "auto",
                    ignoreLayout: true, // Prevent the floating row from shifting the main stack
                    x: dragX, y: dragY,
                    zIndex: 100, // Ensure it draws above all other rows
                    state: m.active ? "ON" : "OFF",
                    spacing: [0, sH],
                    regionOffset: [0, 0],
                    [`floatingToggle`]: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, cutoff: true,
                        text: this.properties.showFolderNames ? m.name.replace(/\.safetensors$/i, "") : m.name.split(/[\\/]/).pop().replace(/\.safetensors$/i, ""),
                        value: m.active, width: "full", height: "auto", padding: [pW, pH],
                        themeKey: "button, t_textNormal",
                    },
                    [`floatingRemoveBtn`]: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "close",
                        width: "match", height: "full", padding: [pW, pH], margin: [0, sH, sW, sH],
                        themeKey: "button, t_textNormal",
                    }
                };
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto", dir: "col",
                    margin: [mW, mH, mW, mH],
                    regionModelDeck: {
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
                            dropdownRating: {
                                type: this.UI_TYPES.DROPDOWN, canvasShield: true,
                                items: ["Red", "Green", "Blue"],
                                value: "Red",
                                themeKey: "button, t_textNormal",
                                width: "full"
                            }
                        },
                        settingBreak2: { type: this.UI_TYPES.LINEBREAK }
                    },
                    regionModelLoader: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        margin: [0, mH, 0, 0],
                        browserModels: {
                            type: this.UI_TYPES.FILEBROWSER,
                            items: (this._modelList || []).filter(name => !deck.some(m => m.name === name)),
                            mode: "file", rootName: "models", fileType: "model", mouseOver: false,
                            value: "Select Model...",
                            width: "full", height: "auto",
                            fontSize: t_textNormal_size,
                            themeKey: "dialog, t_textNormal", canvasShield: true,
                            spacing: [sW, 0], padding: [pW, pH],
                            onChange: (v) => {
                                if (!this.properties.modelDeck) this.properties.modelDeck = [];
                                this.properties.modelDeck.forEach(m => m.active = false);
                                const existing = this.properties.modelDeck.find(m => m.name === v);
                                if (!existing) {
                                    this.properties.modelDeck.push({ name: v, active: true });
                                } else {
                                    existing.active = true;
                                }
                                sendSignal();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                            }
                        },
                        btnRefreshModels: {
                            type: this.UI_TYPES.BUTTON, text: "Refresh",
                            width: "auto", height: "fill", padding: [pW, pH],
                            fontSize: t_textNormal_size,
                            labelAlign: ["center", "middle"], themeKey: "button, t_textSmall",
                            onPress: () => {
                                window._xcpDerpSession = Date.now();
                                this.fetchModelData(true);
                            }
                        }
                    },
                },
            };
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
            this.handleLoaderCreated();
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(info) {
            if (onSerialize) onSerialize.apply(this, arguments);
            info.properties = info.properties || {};
            info.properties.modelDeck = this.properties.modelDeck;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (info.properties && info.properties.modelDeck) {
                this.properties.modelDeck = info.properties.modelDeck;
            }
            this.handleLoaderConfigure();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            this.handleLoaderDraw?.();
        };
    }
});
