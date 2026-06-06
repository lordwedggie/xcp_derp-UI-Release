/**
 * Path: ./js/fatha/nodes/derpSamplerLoader.js
 * STATUS: VIRTUAL FATHA COMPLIANT | RECONSTRUCTED
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpSamplerLoaderCore } from "./core/derpSamplerLoader_core.js";
import { showBastaFileHandler } from "../fatha/bastas/bastaFileHandler.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../fatha/helpers/fathaDragDrop.js";

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

            // ZERO-INFERENCE OPTIMIZATION: Lock layout variables to 2 decimals to block zoom jitter.
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH, sW] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sH, vars.sW
            ].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;

            const deck = this.properties.samplerDeck || [];
            const samplerList = this._samplerList || [];
            const deckHash = deck.map(m => `${m.name}:${m.active}`).join("|");
            const structureHash = `${deckHash}_${samplerList.join("|")}_${window._xcpDerpSession}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${mW}_${mH}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = structureHash;

            const sendSignal = () => {
                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
            };

            const activateSamplerEntry = (sampler, idx) => {
                endStackDrag(this, "samplerDeck");
                if (!sampler.active) {
                    this.properties.samplerDeck.forEach((item, i) => { item.active = (i === idx); });
                    sendSignal();
                    this.refreshNodeLayoutMap();
                    this.requestDerpSync();
                }
                return true;
            };

            const deckRegions = {};
            const deckItems = deck.map((m, idx) => ({ m, idx }));
            let floatingItem = null;

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingItem] = deckItems.splice(d.index, 1);
                const ghost = { ...floatingItem, isPreviewGhost: true };
                deckItems.splice(pIdx, 0, ghost);
            }

            deckItems.forEach((item, displayIdx) => {
                const { m, idx } = item;
                const rowKey = `samplerRow_${idx}`;
                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === idx && !item.isPreviewGhost);
                const rowMarginBottom = displayIdx < (deckItems.length - 1) ? sH : 0;

                deckRegions[rowKey] = {
                    type: this.UI_TYPES.REGION,
                    dir: "row", width: "full", height: "auto",
                    spacing: [0, sH],
                    margin: [0, 0, 0, rowMarginBottom],
                    state: item.isPreviewGhost ? "DIS" : ((isPickedUp || m.active) ? "ON" : "OFF"),
                    alpha: item.isPreviewGhost ? 0 : 1.0,
                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                    onDrag: (e, data) => { updateStackDrag(this, data, "samplerRow_", deck.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "samplerDeck"),
                    onPress: () => activateSamplerEntry(m, idx),
                    regionOffset: [0, 0],
                    [`samplerToggle_${idx}`]: {
                        type: this.UI_TYPES.TOGGLE_V2,
                        iconAlign: "left",
                        isTextOnly: true,
                        mouseOver: true,
                        cutoff: true,
                        key: `samplerToggle_${idx}`,
                        text: m.name,
                        value: m.active,
                        playSound: m.active ? null : "powerUp",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        themeKey: "dialog, button, t_textNormal",
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "samplerRow_", deck.length); this.refreshNodeLayoutMap(); },
                        onDragEnd: () => endStackDrag(this, "samplerDeck"),
                        onPress: () => activateSamplerEntry(m, idx),
                        onChange: (v) => {
                            endStackDrag(this, "samplerDeck");
                            if (!v) {
                                this.refreshNodeLayoutMap();
                                return;
                            }
                            this.properties.samplerDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    [`btnRemoveSampler_${idx}`]: {
                        type: this.UI_TYPES.ICONBUTTON,
                        icon: "close",
                        hidden: !m.active,
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0], margin: [1, 1, 1, 1],
                        themeKey: "button, t_textNormal",
                        onPress: () => {
                            showBastaFileHandler(this, "none", `btnRemoveSampler_${idx}`, {
                                title: tLocale("$derp_sampler_loader.dialogs.remove_sampler.title", "Remove Sampler"),
                                message: `${tLocale("$derp_sampler_loader.dialogs.remove_sampler.message_prefix", "Remove")} ${m.name} ${tLocale("$derp_sampler_loader.dialogs.remove_sampler.message_suffix", "from deck?")}`,
                                confirm: tLocale("$derp_sampler_loader.dialogs.remove_sampler.confirm", "Remove"),
                                mode: "delete",
                                playSound: "delete",
                                onConfirm: () => {
                                    const currentIdx = this.properties.samplerDeck.indexOf(m);
                                    if (currentIdx === -1) return;

                                    const wasActive = m.active;
                                    this.properties.samplerDeck.splice(currentIdx, 1);

                                    if (wasActive && this.properties.samplerDeck.length > 0) {
                                        const nextIdx = (currentIdx > 0) ? currentIdx - 1 : 0;
                                        this.properties.samplerDeck[nextIdx].active = true;
                                    }
                                    sendSignal();
                                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                                    this.refreshNodeLayoutMap();
                                    this.requestDerpSync();
                                }
                            });
                        }
                    }
                };
            });

            if (floatingItem && this._dragThresholdMet && this._dragMouse && this._dragOffset) {
                const { m, idx } = floatingItem;
                const dragX = this._dragMouse[0] - this._dragOffset[0];
                const dragY = this._dragMouse[1] - this._dragOffset[1];
                const sourceRow = this.layout?.regions?.[`samplerRow_${idx}`];
                const floatingRowWidth = sourceRow?.w || (this.size[0] - (mW * 2));
                const floatingRowHeight = sourceRow?.h || "auto";

                deckRegions.floatingSamplerRow = {
                    type: this.UI_TYPES.REGION,
                    themeKey: "region",
                    dir: "row",
                    width: floatingRowWidth,
                    height: floatingRowHeight,
                    ignoreLayout: true,
                    x: dragX,
                    y: dragY,
                    zIndex: 100,
                    state: "ON",
                    pulseStates: true,
                    pulseFromState: "_ON",
                    pulseToState: "_DIS",
                    spacing: [0, sH],
                    ignoreNodeBoundsClamp: true,
                    corners: sourceRow?.corners,
                    regionOffset: [0, 0],
                    floatingToggle: {
                        type: this.UI_TYPES.TOGGLE_V2,
                        iconAlign: "left",
                        isTextOnly: true,
                        mouseOver: true,
                        cutoff: true,
                        text: m.name,
                        value: m.active,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        themeKey: "dialog, button, t_textNormal",
                    },
                    floatingRemoveBtn: {
                        type: this.UI_TYPES.ICONBUTTON,
                        icon: "close",
                        hidden: !m.active,
                        width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0], margin: [1, 1, 1, 1],
                        themeKey: "button, t_textNormal",
                    }
                };
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y" },
                    width: "full", height: "auto", dir: "col",
                    margin: [mW, mH, mW, mH],
                    regionSamplerDeck: {
                        width: "full", height: "auto", dir: "col", spacing: [0, sH],
                        hidden: deck.length === 0,
                        margin: [0, 0, 0, mH],
                        ...deckRegions
                    },
                    regionSamplerLoader: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        margin: [0, mH, 0, 0],
                        btnClear: {
                            type: this.UI_TYPES.BUTTON,
                            text: "Clear",
                            width: "auto", height: "fill", padding: [pW, pH], spacing: [sW, 0],
                            labelAlign: ["center", "middle"],
                            state: deck.length > 0 ? "ON" : "DIS",
                            pulseStates: true,
                            themeKey: "button, t_textSmall",
                            onPress: () => {
                                showBastaFileHandler(this, "none", "btnClear", {
                                    title: tLocale("$derp_sampler_loader.dialogs.clear_deck.title", "Clear Sampler Deck"),
                                    message: tLocale("$derp_sampler_loader.dialogs.clear_deck.message", "Clear the Sampler deck?"),
                                    confirm: tLocale("$derp_sampler_loader.dialogs.clear_deck.confirm", "Clear"),
                                    mode: "delete",
                                    playSound: "delete",
                                    properties: { bastaMovalbe: false },
                                    onConfirm: () => {
                                        this.properties.samplerDeck = [];
                                        sendSignal();
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.requestDerpSync();
                                    }
                                });
                            }
                        },
                        browserSamplers: {
                            type: this.UI_TYPES.FILEBROWSER, searchTab: true,
                            icon: "dropdown",
                            items: samplerList.filter(name => !deck.some(m => m.name === name)),
                            mode: "file", rootName: tLocale("$derp_sampler_loader.browser.root_name", "samplers"), fileType: "sampler", mouseOver: false,
                            value: tLocale("$derp_sampler_loader.browser.select", "Select Sampler..."),
                            width: "full", height: "auto",
                            fontSize: t_textNormal_size,
                            themeKey: "dialog, t_textNormal", canvasShield: true,
                            searchThemeKey: "panel, t_textSystem",
                            spacing: [sW, 0], padding: [pW, pH],
                            onChange: (v) => {
                                if (!v || v === tLocale("$derp_sampler_loader.browser.select", "Select Sampler...")) return;
                                if (!this.properties.samplerDeck) this.properties.samplerDeck = [];
                                this.properties.samplerDeck.forEach(m => { m.active = false; });
                                const existing = this.properties.samplerDeck.find(m => m.name === v);
                                if (!existing) {
                                    this.properties.samplerDeck.push({ name: v, active: true });
                                } else {
                                    existing.active = true;
                                }
                                sendSignal();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        btnRefreshSamplers: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "refresh",
                            width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0],
                            themeKey: "button, t_textNormal",
                            onPress: () => {
                                window._xcpDerpSession = Date.now();
                                this.fetchSamplerData(true);
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
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    width: "full", height: "auto", margin: [mW, sH],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false, hidden: true,
                        themeKey: "t_textSystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_sampler_loader.system.properties", "Derp Sampler Loader properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    layoutSpacer: { anchor: { target: "lblTitle", axis: "y" } }
                }
            };
        };

        // --- LIFECYCLE WRAPPERS ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.handleSamplerCreated();
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(info) {
            if (onSerialize) onSerialize.apply(this, arguments);
            info.properties = info.properties || {};
            info.properties.samplerDeck = this.properties.samplerDeck;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (info.properties && info.properties.samplerDeck) {
                this.properties.samplerDeck = info.properties.samplerDeck;
            }
            this.handleSamplerConfigure();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            this.handleSamplerDraw?.();
        };

        nodeType.prototype.onResize = function(size) {
            if (this.handleSamplerResize) this.handleSamplerResize(size);
        };
    }
});