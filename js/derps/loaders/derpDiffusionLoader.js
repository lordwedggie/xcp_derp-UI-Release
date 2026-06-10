import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { initDerpDiffusionLoaderCore } from "./core/derpDiffusionLoader_core.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";

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

function stripModelName(name, showFolderNames) {
    if (!showFolderNames) {
        return String(name || "").split(/[\\/]/).pop().replace(/\.(safetensors|pt|ckpt)$/i, "");
    }
    const raw = String(name || "");
    const display = raw.replace(/\.(safetensors|pt|ckpt)$/i, "");
    const lastSep = Math.max(display.lastIndexOf("/"), display.lastIndexOf("\\"));
    if (lastSep < 0) return display;
    const folder = display.slice(0, lastSep + 1);
    const file = display.slice(lastSep + 1);
    return `{{t_text_highlight::${folder}}}${file}`;
}

function getWeightDtypeItems() {
    return ["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"];
}

function buildDeckRegions(node, deck, deckKey, rowPrefix, togglePrefix, removePrefix, removeDialogKey) {
    const vars = node.getDerpVars(node);
    const [pW, pH, sH, sW] = [vars.pW, vars.pH, vars.sH, vars.sW].map(v => Number(v.toFixed(2)));
    const sendSignal = () => {
        if (node.broadcastWirelessSignal) node.broadcastWirelessSignal();
    };

    const activateDeckEntry = (entry, idx) => {
        endStackDrag(node, deckKey);
        node._dragDeckKey = null;
        if (!entry.active) {
            node.properties[deckKey].forEach((item, i) => { item.active = (i === idx); });
            sendSignal();
            node.refreshNodeLayoutMap();
            node.requestDerpSync();
        }
        return true;
    };

    const deckRegions = {};
    const deckItems = deck.map((m, idx) => ({ m, idx }));
    let floatingItem = null;

    if (node._dragTrig && node._dragThresholdMet && node._dragTrig.index !== undefined && node._dragDeckKey === deckKey) {
        const d = node._dragTrig;
        const pIdx = (node._dropPreviewIdx !== undefined) ? node._dropPreviewIdx : d.index;
        [floatingItem] = deckItems.splice(d.index, 1);
        deckItems.splice(pIdx, 0, { ...floatingItem, isPreviewGhost: true });
    }

    deckItems.forEach((item, displayIdx) => {
        const { m, idx } = item;
        const rowKey = `${rowPrefix}${idx}`;
        const isPickedUp = !!(node._dragTrig && node._dragThresholdMet && node._dragTrig.index === idx && node._dragDeckKey === deckKey && !item.isPreviewGhost);
        deckRegions[rowKey] = {
            type: node.UI_TYPES.REGION,
            dir: "row", width: "full", height: "auto",
            spacing: [0, sH],
            margin: [0, 0, 0, displayIdx < (deckItems.length - 1) ? sH : 0],
            state: item.isPreviewGhost ? "DIS" : ((isPickedUp || m.active) ? "ON" : "OFF"),
            alpha: item.isPreviewGhost ? 0 : 1.0,
            onDragStart: (e, data) => {
                node._dragDeckKey = deckKey;
                startStackDrag(node, data, idx, rowKey);
            },
            onDrag: (e, data) => {
                updateStackDrag(node, data, rowPrefix, deck.length);
                node.refreshNodeLayoutMap();
            },
            onDragEnd: () => {
                endStackDrag(node, deckKey);
                node._dragDeckKey = null;
            },
            onPress: () => activateDeckEntry(m, idx),
            regionOffset: [0, 0],
            [`${togglePrefix}${idx}`]: {
                type: node.UI_TYPES.TOGGLE_V2, iconAlign: "left", isTextOnly: true, mouseOver: true, cutoff: true, cutoffMargin: (pH * 2 + 12),
                text: stripModelName(m.name, node.properties.showFolderNames !== false),
                value: m.active,
                playSound: m.active ? null : "powerUp",
                alpha: item.isPreviewGhost ? 0 : 1.0,
                width: "full", height: "auto", padding: [pW, pH],
                themeKey: "dialog, button, t_textNormal",
                onDragStart: (e, data) => {
                    node._dragDeckKey = deckKey;
                    startStackDrag(node, data, idx, rowKey);
                },
                onDrag: (e, data) => {
                    updateStackDrag(node, data, rowPrefix, deck.length);
                    node.refreshNodeLayoutMap();
                },
                onDragEnd: () => {
                    endStackDrag(node, deckKey);
                    node._dragDeckKey = null;
                },
                onPress: () => activateDeckEntry(m, idx),
                onChange: (v) => {
                    endStackDrag(node, deckKey);
                    node._dragDeckKey = null;
                    if (!v) {
                        node.refreshNodeLayoutMap();
                        return;
                    }
                    node.properties[deckKey].forEach((entry, i) => { entry.active = (i === idx); });
                    sendSignal();
                    node.refreshNodeLayoutMap();
                    node.requestDerpSync();
                }
            },
            [`${removePrefix}${idx}`]: {
                type: node.UI_TYPES.ICONBUTTON, icon: "close",
                hidden: !m.active,
                alpha: item.isPreviewGhost ? 0 : 1.0,
                width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0], margin: [1, 1, 1, 1],
                themeKey: "button, t_textNormal",
                onPress: () => {
                    showBastaFileHandler(node, "none", `${removePrefix}${idx}`, {
                        title: tLocale(`${removeDialogKey}.title`, "Remove"),
                        message: `${tLocale(`${removeDialogKey}.message_prefix`, "Remove")} ${stripModelName(m.name, true)} ${tLocale(`${removeDialogKey}.message_suffix`, "from deck?")}`,
                        confirm: tLocale(`${removeDialogKey}.confirm`, "Remove"),
                        mode: "delete",
                        playSound: "delete",
                        onConfirm: () => {
                            const currentIdx = node.properties[deckKey].indexOf(m);
                            if (currentIdx === -1) return;
                            const wasActive = m.active;
                            node.properties[deckKey].splice(currentIdx, 1);
                            if (wasActive && node.properties[deckKey].length > 0) {
                                const nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
                                node.properties[deckKey][nextIdx].active = true;
                            }
                            sendSignal();
                            node.refreshNodeLayoutMap();
                            node.requestDerpSync();
                        }
                    });
                }
            }
        };
    });

    if (floatingItem && node._dragThresholdMet && node._dragMouse && node._dragOffset) {
        const { m, idx } = floatingItem;
        const dragX = node._dragMouse[0] - node._dragOffset[0];
        const dragY = node._dragMouse[1] - node._dragOffset[1];
        const sourceRow = node.layout?.regions?.[`${rowPrefix}${idx}`];
        deckRegions[`floating_${deckKey}`] = {
            type: node.UI_TYPES.REGION,
            themeKey: "region",
            dir: "row",
            width: sourceRow?.w || (node.size[0] - 24),
            height: sourceRow?.h || "auto",
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
                type: node.UI_TYPES.TOGGLE_V2,
                themeKey: "dialog, button, t_textNormal",
                iconAlign: "left",
                isTextOnly: true,
                mouseOver: true,
                cutoff: true,
                text: stripModelName(m.name, node.properties.showFolderNames !== false),
                value: m.active,
                width: "full",
                height: "auto",
                padding: [pW, pH],
            }
        };
    }

    return deckRegions;
}

app.registerExtension({
    name: "xcp.derpDiffusionLoader_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DerpDiffusionLoaderNode") return;
        fatha(nodeType, nodeData, 200);
        initDerpDiffusionLoaderCore(nodeType);

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = true;

            const vars = this.getDerpVars(this);
            const [mW, mH, pW, pH, sH, sW, oY] = [vars.mW, vars.mH, vars.pW, vars.pH, vars.sH, vars.sW, vars.oY].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;
            const diffusionDeck = this.properties.diffusionDeck || [];
            const diffusionList = this._diffusionList || [];
            const deckHash = diffusionDeck.map(m => `${m.name}:${m.active}`).join("|");
            const structureHash = `${deckHash}_${diffusionList.join("|")}_${this.properties.weightDtype}_${this.properties.settingActive ? 1 : 0}_${this.properties.showFolderNames}_${window._xcpDerpSession}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${mW}_${mH}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}_${this._dragDeckKey}`;
            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = structureHash;

            const sendSignal = () => {
                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
            };

            const diffusionRegions = buildDeckRegions(this, diffusionDeck, "diffusionDeck", "diffusionRow_", "diffusionToggle_", "btnRemoveDiffusion_", "$derp_diffusion_loader.dialogs.remove_diffusion");

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y" },
                    width: "full", height: "auto", dir: "col",
                    margin: [mW, mH, mW, mH],
                    regionDiffusionDeck: {
                        width: "full", height: "auto", dir: "col", spacing: [0, sH],
                        hidden: diffusionDeck.length === 0,
                        margin: [0, 0, 0, mH],
                        ...diffusionRegions
                    },
                    regionDiffusionLoader: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        hidden: this.properties.settingActive === false,
                        margin: [0, mH, 0, 0],
                        btnClearDiffusions: {
                            type: this.UI_TYPES.BUTTON,
                            text: "Clear",
                            width: "auto", height: "fill", padding: [pW, pH], spacing: [sW, 0],
                            labelAlign: ["center", "middle"],
                            state: diffusionDeck.length > 0 ? "OFF" : "DIS",
                            pulseStates: true,
                            themeKey: "button, t_textSmall",
                            onPress: () => {
                                showBastaFileHandler(this, "none", "btnClearDiffusions", {
                                    title: tLocale("$derp_diffusion_loader.dialogs.clear_diffusion_deck.title", "Clear Diffusion Deck"),
                                    message: tLocale("$derp_diffusion_loader.dialogs.clear_diffusion_deck.message", "Clear the diffusion deck?"),
                                    confirm: tLocale("$derp_diffusion_loader.dialogs.clear_diffusion_deck.confirm", "Clear"),
                                    mode: "delete",
                                    playSound: "delete",
                                    properties: { bastaMovalbe: false },
                                    onConfirm: () => {
                                        this.properties.diffusionDeck = [];
                                        sendSignal();
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.requestDerpSync();
                                    }
                                });
                            }
                        },
                        browserDiffusions: {
                            type: this.UI_TYPES.FILEBROWSER,
                            items: diffusionList.filter(name => !diffusionDeck.some(m => m.name === name)),
                            mode: "file", rootName: tLocale("$derp_diffusion_loader.browser.diffusion_root_name", "diffusion_models + unet"), fileType: "model", mouseOver: false,
                            value: tLocale("$derp_diffusion_loader.browser.select_diffusion", "Select Diffusion..."),
                            width: "full", height: "auto",
                            fontSize: t_textNormal_size,
                            themeKey: "dialog, t_textNormal", canvasShield: true,
                            spacing: [sW, 0], padding: [pW, pH],
                            onChange: (v) => {
                                this.properties.diffusionDeck = this.properties.diffusionDeck || [];
                                this.properties.diffusionDeck.forEach(m => m.active = false);
                                const existing = this.properties.diffusionDeck.find(m => m.name === v);
                                if (!existing) this.properties.diffusionDeck.push({ name: v, active: true });
                                else existing.active = true;
                                sendSignal();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                            }
                        },
                        btnRefreshDiffusions: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "refresh",
                            width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0],
                            themeKey: "button, t_textNormal",
                            onPress: () => {
                                window._xcpDerpSession = Date.now();
                                this.fetchDiffusionData(true);
                            }
                        }
                    },
                    regionWeightDtype: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        hidden: this.properties.settingActive === false,
                        margin: [0, mH, 0, 0],
                        lblWeightDtype: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textNormal",
                            text: tLocale("$derp_diffusion_loader.system.weight_dtype", "Weight DType"),
                            width: "auto", height: "auto", padding: [pW, pH]
                        },
                        dropdownWeightDtype: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown",
                            themeKey: "dialog, t_textNormal",
                            canvasShield: true,
                            width: "full", height: "auto",
                            padding: [pW, pH],
                            mode: "file",
                            rootName: "weight_dtype",
                            items: getWeightDtypeItems(),
                            value: this.properties.weightDtype || "default",
                            onChange: (val) => {
                                this.properties.weightDtype = val || "default";
                                if (typeof window._xcpCloseActiveDropdown === "function") window._xcpCloseActiveDropdown();
                                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
                                this.refreshNodeLayoutMap();
                                this.refreshDerpTemplateSysMap();
                                this.requestDerpSync();
                                if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                            }
                        }
                    },
                }
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const vars = this.getDerpVars(this);
            const [mW, mH, oY, pW, pH, sW] = [vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sW].map(v => Number(v.toFixed(2)));
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" },
                    width: "full", height: "auto", margin: [mW, mH, mW, 0],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textSystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_diffusion_loader.system.properties", "Custom node properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    regionSetting1: {
                        anchor: { target: "lblTitle", axis: "y" },
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        toggleShowFolder: {
                            type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, themeKey: "dialog, button, t_textSystem",
                            text: tLocale("$derp_diffusion_loader.system.show_folder_names", "Show Folder Names"),
                            width: "full", height: "auto", padding: [pW, pH],
                            value: this.properties.showFolderNames !== false,
                            onChange: (v) => {
                                this.properties.showFolderNames = v;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpTemplateSysMap();
                            }
                        }
                    },
                    regionSetting2: {
                        anchor: { target: "regionSetting1", axis: "y", offset: oY },
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        toggleDumpModelOnChange: {
                            type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, themeKey: "dialog, button, t_textSystem",
                            text: tLocale("$derp_diffusion_loader.system.clear_vram_on_change", "Clear VRAM on new model selection"),
                            width: "full", height: "auto", padding: [pW, pH],
                            value: this.properties.toggleDumpModelOnChange !== false,
                            onChange: (v) => {
                                this.properties.toggleDumpModelOnChange = v;
                                this.refreshDerpTemplateSysMap();
                            }
                        }
                    },
                    layoutSpacer: { anchor: { target: "regionSetting2", axis: "y", offset: oY } }
                }
            };
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.onDerpSettingsPress = () => {
                this.refreshNodeLayoutMap();
            };
            this.handleDiffusionLoaderCreated();
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(info) {
            if (onSerialize) onSerialize.apply(this, arguments);
            info.properties = info.properties || {};
            info.properties.diffusionDeck = this.properties.diffusionDeck;
            info.properties.weightDtype = this.properties.weightDtype;
            info.properties.toggleDumpModelOnChange = this.properties.toggleDumpModelOnChange;
            info.properties.settingActive = this.properties.settingActive !== false;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.onDerpSettingsPress = () => {
                this.refreshNodeLayoutMap();
            };
            if (info.properties?.diffusionDeck) this.properties.diffusionDeck = info.properties.diffusionDeck;
            if (typeof info.properties?.weightDtype === "string") this.properties.weightDtype = info.properties.weightDtype;
            this.handleDiffusionLoaderConfigure();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            this.handleLoaderDraw?.();
        };

        nodeType.prototype.onResize = function(size) {
            if (this.handleLoaderResize) this.handleLoaderResize(size);
        };
    }
});
