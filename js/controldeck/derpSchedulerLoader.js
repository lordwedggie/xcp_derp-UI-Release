/**
 * Path: ./js/controldeck/derpSchedulerLoader.js
 * STATUS: VIRTUAL FATHA COMPLIANT | SCHEDULER LOADER
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpSchedulerLoaderCore } from "./core/derpSchedulerLoader_core.js";
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
    name: "xcp.derpSchedulerLoader_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("schedulerloader")) return;

        fatha(nodeType, nodeData, 200);
        initDerpSchedulerLoaderCore(nodeType);

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = false;

            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH, sW] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sH, vars.sW
            ].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;

            const deck = this.properties.schedulerDeck || [];
            const schedulerList = this._schedulerList || [];
            const deckHash = deck.map(m => `${m.name}:${m.active}`).join("|");
            const structureHash = `${deckHash}_${schedulerList.join("|")}_${window._xcpDerpSession}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${mW}_${mH}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;

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

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingItem] = deckItems.splice(d.index, 1);
                const ghost = { ...floatingItem, isPreviewGhost: true };
                deckItems.splice(pIdx, 0, ghost);
            }

            deckItems.forEach((item, displayIdx) => {
                const { m, idx } = item;
                const rowKey = `schedulerRow_${idx}`;
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
                    onDrag: (e, data) => { updateStackDrag(this, data, "schedulerRow_", deck.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "schedulerDeck"),
                    onPress: () => {
                        endStackDrag(this, "schedulerDeck");
                        if (!m.active) {
                            this.properties.schedulerDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    regionOffset: [0, 0],
                    [`schedulerToggle_${idx}`]: {
                        type: this.UI_TYPES.TOGGLE_V2,
                        iconAlign: "left",
                        isTextOnly: true,
                        mouseOver: true,
                        cutoff: true,
                        key: `schedulerToggle_${idx}`,
                        text: m.name,
                        value: m.active,
                        playSound: m.active ? null : "powerUp",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        themeKey: "button, t_textNormal",
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "schedulerRow_", deck.length); this.refreshNodeLayoutMap(); },
                        onDragEnd: () => endStackDrag(this, "schedulerDeck"),
                        onChange: (v) => {
                            endStackDrag(this, "schedulerDeck");
                            if (!v) {
                                this.refreshNodeLayoutMap();
                                return;
                            }
                            this.properties.schedulerDeck.forEach((item, i) => { item.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    [`btnRemoveScheduler_${idx}`]: {
                        type: this.UI_TYPES.ICONBUTTON,
                        icon: "close",
                        iconScale: 0.5,
                        hidden: !m.active,
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "match", height: "full", padding: [pW, pH], margin: [0, sH, sW, sH],
                        themeKey: "button, t_textNormal",
                        onPress: () => {
                            showBastaFileHandler(this, "none", `btnRemoveScheduler_${idx}`, {
                                title: tLocale("$derp_scheduler_loader.dialogs.remove_scheduler.title", "Remove Scheduler"),
                                message: `${tLocale("$derp_scheduler_loader.dialogs.remove_scheduler.message_prefix", "Remove")} ${m.name} ${tLocale("$derp_scheduler_loader.dialogs.remove_scheduler.message_suffix", "from deck?")}`,
                                confirm: tLocale("$derp_scheduler_loader.dialogs.remove_scheduler.confirm", "Remove"),
                                mode: "delete",
                                playSound: "delete",
                                onConfirm: () => {
                                    const currentIdx = this.properties.schedulerDeck.indexOf(m);
                                    if (currentIdx === -1) return;

                                    const wasActive = m.active;
                                    this.properties.schedulerDeck.splice(currentIdx, 1);

                                    if (wasActive && this.properties.schedulerDeck.length > 0) {
                                        const nextIdx = (currentIdx > 0) ? currentIdx - 1 : 0;
                                        this.properties.schedulerDeck[nextIdx].active = true;
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
                const sourceRow = this.layout?.regions?.[`schedulerRow_${idx}`];
                const floatingRowWidth = sourceRow?.w || (this.size[0] - (mW * 2));
                const floatingRowHeight = sourceRow?.h || "auto";

                deckRegions.floatingSchedulerRow = {
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
                        themeKey: "button, t_textNormal",
                    },
                    floatingRemoveBtn: {
                        type: this.UI_TYPES.ICONBUTTON,
                        icon: "close",
                        iconScale: 0.5,
                        hidden: !m.active,
                        width: "match",
                        height: "full",
                        padding: [pW, pH],
                        margin: [0, sH, sW, sH],
                        themeKey: "button, t_textNormal",
                    }
                };
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y" },
                    width: "full", height: "auto", dir: "col",
                    margin: [mW, mH, mW, mH],
                    regionSchedulerDeck: {
                        width: "full", height: "auto", dir: "col", spacing: [0, sH],
                        hidden: deck.length === 0,
                        margin: [0, 0, 0, mH],
                        ...deckRegions
                    },
                    regionSchedulerLoader: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        margin: [0, mH, 0, 0],
                        btnClear: {
                            type: this.UI_TYPES.BUTTON,
                            text: "Clear",
                            width: "auto", height: "fill", padding: [pW, pH], spacing: [sW, 0],
                            labelAlign: ["center", "middle"],
                            themeKey: "button, t_textSmall",
                            onPress: () => {
                                showBastaFileHandler(this, "none", "btnClear", {
                                    title: tLocale("$derp_scheduler_loader.dialogs.clear_deck.title", "Clear Scheduler Deck"),
                                    message: tLocale("$derp_scheduler_loader.dialogs.clear_deck.message", "Clear the Scheduler deck?"),
                                    confirm: tLocale("$derp_scheduler_loader.dialogs.clear_deck.confirm", "Clear"),
                                    mode: "delete",
                                    playSound: "delete",
                                    properties: { bastaMovalbe: false },
                                    onConfirm: () => {
                                        this.properties.schedulerDeck = [];
                                        sendSignal();
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.requestDerpSync();
                                    }
                                });
                            }
                        },
                        browserSchedulers: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown",
                            items: schedulerList.filter(name => !deck.some(m => m.name === name)),
                            value: tLocale("$derp_scheduler_loader.browser.select", "Select Scheduler..."),
                            width: "full", height: "auto",
                            mode: "file",
                            rootName: "schedulers",
                            themeKey: "panel, t_textNormal",
                            canvasShield: true,
                            spacing: [sW, 0], padding: [pW, pH],
                            onChange: (v) => {
                                if (!v || v === tLocale("$derp_scheduler_loader.browser.select", "Select Scheduler...")) return;
                                if (!this.properties.schedulerDeck) this.properties.schedulerDeck = [];
                                this.properties.schedulerDeck.forEach(m => { m.active = false; });
                                const existing = this.properties.schedulerDeck.find(m => m.name === v);
                                if (!existing) {
                                    this.properties.schedulerDeck.push({ name: v, active: true });
                                } else {
                                    existing.active = true;
                                }
                                sendSignal();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        btnRefreshSchedulers: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "refresh",
                            width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0],
                            themeKey: "button, t_textNormal",
                            onPress: () => {
                                window._xcpDerpSession = Date.now();
                                this.fetchSchedulerData(true);
                            }
                        }
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sH] = [
                vars.mW, vars.mH, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" },
                    width: "full", height: "auto", margin: [mW, sH],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, hidden: true, mouseOver: false,
                        themeKey: "t_textSystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_scheduler_loader.system.properties", "Custom node properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    layoutSpacer: { anchor: { target: "lblTitle", axis: "y", offset: oY } }
                }
            };
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.handleSchedulerCreated();
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(info) {
            if (onSerialize) onSerialize.apply(this, arguments);
            info.properties = info.properties || {};
            info.properties.schedulerDeck = this.properties.schedulerDeck;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (info.properties && info.properties.schedulerDeck) {
                this.properties.schedulerDeck = info.properties.schedulerDeck;
            }
            this.handleSchedulerConfigure();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            this.handleSchedulerDraw?.();
        };

        nodeType.prototype.onResize = function(size) {
            if (this.handleSchedulerResize) this.handleSchedulerResize(size);
        };
    }
});
