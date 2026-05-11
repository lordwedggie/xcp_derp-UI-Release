/**
 * Path: ./js/fatha/nodes/derpSamplerLoader.js
 * STATUS: VIRTUAL FATHA COMPLIANT | REFACTORED
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpSamplerLoaderCore } from "./core/derpSamplerLoader_core.js";
import { showBastaFileHandler } from "../fatha/bastas/bastaFileHandler.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../fatha/helpers/fathaDragDrop.js";

app.registerExtension({
    name: "xcp.derpSamplerLoader_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("samplerloader")) return;
        fatha(nodeType, nodeData, 200);
        initDerpSamplerLoaderCore(nodeType);

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = false;

            // ZERO-INFERENCE OPTIMIZATION: Lock layout variables to 2 decimal places to block zoom jitter
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH, sW] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sH, vars.sW
            ].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;

            const deck = this.properties.samplerDeck || [];
            const deckHash = deck.map(m => `${m.name}:${m.active}`).join("|");

            // GOLD-MASTER HASH: Includes physical width and consistent naming for caching
            const structureHash = `${deckHash}_${(this._samplerList || []).length}_${window._xcpDerpSession}_${this.properties.showFolderNames}_${mW}_${mH}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;

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
                const rowKey = `samplerRow_${idx}`;
                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === idx && !item.isPreviewGhost);
                deckRegions[rowKey] = {
                    type: this.UI_TYPES.REGION,
                    dir: "row", width: "full", height: "auto",
                    spacing: [0, sH],
                    // THE GHOST STYLING: Make the placeholder semi-transparent and non-interactive
                    state: item.isPreviewGhost ? "DIS" : ((isPickedUp || m.active) ? "ON" : "OFF"),
                    alpha: item.isPreviewGhost ? 0 : 1.0,
                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                    onDrag: (e, data) => { updateStackDrag(this, data, "samplerRow_", deck.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "samplerDeck"),
                    onPress: () => {
                        // CLEANUP FIX: Purge ghost state if the user clicks the 1px gap without dragging
                        endStackDrag(this, "samplerDeck");
                        if (!m.active) {
                            this.properties.samplerDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    regionOffset: [0, 0],
                    [`samplerToggle_${idx}`]: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, mouseOver: true, cutoff: true,
                        key: `samplerToggle_${idx}`,
                        text: m.name,
                        value: m.active,
                        playSound: m.active ? null : "powerUp",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "full", height: "auto", padding: [pW, pH],
                        themeKey: "button, t_textNormal",
                        // FORWARD DRAG: Allow the inner widget to drive the parent stack movement
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "samplerRow_", deck.length); this.refreshNodeLayoutMap(); },
                        onPress: () => {
                            endStackDrag(this, "samplerDeck");
                            if (!m.active) {
                                this.properties.samplerDeck.forEach((item, i) => { item.active = (i === idx); });
                                sendSignal();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        }
                    }
                };
            });

            // --- THE FINAL MAP ASSEMBLY ---
            this.layoutMap = {
                headerRegion: {
                    dir: "col", width: "full", height: "auto",
                    hidden: true // Hide default header since we manage our own title
                },
                mainContent: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    dir: "col", width: "full", height: "auto",
                    margin: [mW, mH, mW, 0],
                    ...deckRegions
                }
            };

            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const { mW, mH, sW, oX, oY, pW, pH } = this.getDerpVars(this);

            this.sysLayoutMap = {
                sysCustomRegion: {
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    dir: "row", width: "full", height: "auto", margin: [mW, mH],
                    toggleShowNames: {
                        type: this.UI_TYPES.TOGGLE,
                        textThemeKey: "t_textSystem",
                        icon: "radio",
                        value: this.properties.showFolderNames !== false,
                        objectAlign: ["left", "top"],
                        labelAlign: ["left", "middle"],
                        label: "Show Full Names",
                        width: "auto", height: "fill",
                        padding: [pW, pH],
                        onPress: () => {
                            this.properties.showFolderNames = !(this.properties.showFolderNames !== false);
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    spacer: { width: "full" },
                    btnRefresh: {
                        type: this.UI_TYPES.BUTTON,
                        themeKey: "button, t_textSystem",
                        text: "Refresh",
                        width: "auto", height: "auto",
                        padding: [pW, pH],
                        onPress: () => {
                            this.fetchSamplerData(true);
                        }
                    }
                }
            };
        };

        const originalOnDerpSysPanelOpen = nodeType.prototype.onDerpSysPanelOpen;
        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            if (originalOnDerpSysPanelOpen) originalOnDerpSysPanelOpen.apply(this, arguments);
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };
    }
});