import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpClipLoaderCore } from "./core/derpClipLoader_core.js";
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

function stripClipName(name, showFolderNames) {
    const display = showFolderNames ? name : String(name || "").split(/[\\/]/).pop();
    return display.replace(/\.(safetensors|pt|ckpt)$/i, "");
}

function getClipTypeItems() {
    return [
        "stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi", "ltxv", "pixart", "cosmos",
        "lumina2", "wan", "hidream", "chroma", "ace", "omnigen2", "qwen_image", "hunyuan_image",
        "flux2", "ovis", "longcat_image", "cogvideox", "lens", "pixeldit", "ideogram4",
        { value: "z_image", display: "Z-Image (ZIT)" }
    ];
}

function getClipDeviceItems() {
    return ["default", "cpu"];
}

app.registerExtension({
    name: "xcp.derpClipLoader_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DerpClipLoaderNode") return;
        fatha(nodeType, nodeData, 200);
        initDerpClipLoaderCore(nodeType);

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = true;

            const vars = this.getDerpVars(this);
            const [mW, mH, pW, pH, sH, sW, oY] = [vars.mW, vars.mH, vars.pW, vars.pH, vars.sH, vars.sW, vars.oY].map(v => Number(v.toFixed(2)));
            const t_textNormal_size = vars.t_textNormal_size;
            const clipDeck = this.properties.clipDeck || [];
            const clipList = this._clipList || [];
            const deckHash = clipDeck.map(m => `${m.name}:${m.active}`).join("|");
            const structureHash = `${deckHash}_${clipList.join("|")}_${this.properties.showFolderNames}_${this.properties.clipType}_${this.properties.clipDevice}_${this.properties.settingActive ? 1 : 0}_${window._xcpDerpSession}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${mW}_${mH}_${this._dropPreviewIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;
            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = structureHash;

            const sendSignal = () => {
                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
            };
            const activateClipEntry = (entry, idx) => {
                endStackDrag(this, "clipDeck");
                if (!entry.active) {
                    this.properties.clipDeck.forEach((item, i) => { item.active = (i === idx); });
                    sendSignal();
                    this.refreshNodeLayoutMap();
                    this.requestDerpSync();
                }
                return true;
            };

            const deckRegions = {};
            const deckItems = clipDeck.map((m, idx) => ({ m, idx }));
            let floatingItem = null;
            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingItem] = deckItems.splice(d.index, 1);
                deckItems.splice(pIdx, 0, { ...floatingItem, isPreviewGhost: true });
            }

            deckItems.forEach((item, displayIdx) => {
                const { m, idx } = item;
                const rowKey = `clipRow_${idx}`;
                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === idx && !item.isPreviewGhost);
                deckRegions[rowKey] = {
                    type: this.UI_TYPES.REGION,
                    dir: "row", width: "full", height: "auto",
                    spacing: [0, sH],
                    margin: [0, 0, 0, displayIdx < (deckItems.length - 1) ? sH : 0],
                    state: item.isPreviewGhost ? "DIS" : ((isPickedUp || m.active) ? "ON" : "OFF"),
                    alpha: item.isPreviewGhost ? 0 : 1.0,
                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                    onDrag: (e, data) => { updateStackDrag(this, data, "clipRow_", clipDeck.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "clipDeck"),
                    onPress: () => activateClipEntry(m, idx),
                    regionOffset: [0, 0],
                    [`clipToggle_${idx}`]: {
                        type: this.UI_TYPES.TOGGLE_V2, iconAlign: "left", isTextOnly: true, mouseOver: true, cutoff: true,
                        text: stripClipName(m.name, this.properties.showFolderNames !== false),
                        value: m.active,
                        playSound: m.active ? null : "powerUp",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "full", height: "auto", padding: [pW, pH],
                        themeKey: "dialog, button, t_textNormal",
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "clipRow_", clipDeck.length); this.refreshNodeLayoutMap(); },
                        onDragEnd: () => endStackDrag(this, "clipDeck"),
                        onPress: () => activateClipEntry(m, idx),
                        onChange: (v) => {
                            endStackDrag(this, "clipDeck");
                            if (!v) {
                                this.refreshNodeLayoutMap();
                                return;
                            }
                            this.properties.clipDeck.forEach((entry, i) => { entry.active = (i === idx); });
                            sendSignal();
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    [`btnRemoveClip_${idx}`]: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "close",
                        hidden: !m.active,
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0], margin: [1, 1, 1, 1],
                        themeKey: "button, t_textNormal",
                        onPress: () => {
                            showBastaFileHandler(this, "none", `btnRemoveClip_${idx}`, {
                                title: tLocale("$derp_clip_loader.dialogs.remove_clip.title", "Remove CLIP"),
                                message: `${tLocale("$derp_clip_loader.dialogs.remove_clip.message_prefix", "Remove")} ${stripClipName(m.name, true)} ${tLocale("$derp_clip_loader.dialogs.remove_clip.message_suffix", "from deck?")}`,
                                confirm: tLocale("$derp_clip_loader.dialogs.remove_clip.confirm", "Remove"),
                                mode: "delete",
                                playSound: "delete",
                                onConfirm: () => {
                                    const currentIdx = this.properties.clipDeck.indexOf(m);
                                    if (currentIdx === -1) return;
                                    const wasActive = m.active;
                                    this.properties.clipDeck.splice(currentIdx, 1);
                                    if (wasActive && this.properties.clipDeck.length > 0) {
                                        const nextIdx = currentIdx > 0 ? currentIdx - 1 : 0;
                                        this.properties.clipDeck[nextIdx].active = true;
                                    }
                                    sendSignal();
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
                const sourceRow = this.layout?.regions?.[`clipRow_${idx}`];
                deckRegions.floatingClipRow = {
                    type: this.UI_TYPES.REGION,
                    themeKey: "region",
                    dir: "row",
                    width: sourceRow?.w || (this.size[0] - (mW * 2)),
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
                        type: this.UI_TYPES.TOGGLE_V2,
                        iconAlign: "left",
                        isTextOnly: true,
                        mouseOver: true,
                        cutoff: true,
                        text: stripClipName(m.name, this.properties.showFolderNames !== false),
                        value: m.active,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        themeKey: "dialog, button, t_textNormal",
                    }
                };
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y" },
                    width: "full", height: "auto", dir: "col",
                    margin: [mW, mH, mW, mH],
                    regionClipDeck: {
                        width: "full", height: "auto", dir: "col", spacing: [0, sH],
                        hidden: clipDeck.length === 0,
                        margin: [0, 0, 0, mH],
                        ...deckRegions
                    },
                    regionClipLoader: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        hidden: this.properties.settingActive === false,
                        margin: [0, mH, 0, 0],
                        btnClearClips: {
                            type: this.UI_TYPES.BUTTON,
                            text: "Clear",
                            width: "auto", height: "fill", padding: [pW, pH], spacing: [sW, 0],
                            labelAlign: ["center", "middle"],
                            state: clipDeck.length > 0 ? "OFF" : "DIS",
                            pulseStates: true,
                            themeKey: "button, t_textSmall",
                            onPress: () => {
                                showBastaFileHandler(this, "none", "btnClearClips", {
                                    title: tLocale("$derp_clip_loader.dialogs.clear_deck.title", "Clear CLIP Deck"),
                                    message: tLocale("$derp_clip_loader.dialogs.clear_deck.message", "Clear the CLIP deck?"),
                                    confirm: tLocale("$derp_clip_loader.dialogs.clear_deck.confirm", "Clear"),
                                    mode: "delete",
                                    playSound: "delete",
                                    properties: { bastaMovalbe: false },
                                    onConfirm: () => {
                                        this.properties.clipDeck = [];
                                        sendSignal();
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.requestDerpSync();
                                    }
                                });
                            }
                        },
                        browserClips: {
                            type: this.UI_TYPES.FILEBROWSER,
                            items: clipList.filter(name => !clipDeck.some(m => m.name === name)),
                            mode: "file", rootName: tLocale("$derp_clip_loader.browser.root_name", "text_encoders"), fileType: "model", mouseOver: false,
                            value: tLocale("$derp_clip_loader.browser.select", "Select CLIP..."),
                            width: "full", height: "auto",
                            fontSize: t_textNormal_size,
                            themeKey: "dialog, t_textNormal", canvasShield: true,
                            spacing: [sW, 0], padding: [pW, pH],
                            onChange: (v) => {
                                this.properties.clipDeck = this.properties.clipDeck || [];
                                this.properties.clipDeck.forEach(m => m.active = false);
                                const existing = this.properties.clipDeck.find(m => m.name === v);
                                if (!existing) this.properties.clipDeck.push({ name: v, active: true });
                                else existing.active = true;
                                sendSignal();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                            }
                        },
                        btnRefreshClips: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "refresh",
                            width: "match", height: "fill", objectAlign: ["left", "middle"], spacing: [sW, 0],
                            themeKey: "button, t_textNormal",
                            onPress: () => {
                                window._xcpDerpSession = Date.now();
                                this.fetchClipData(true);
                            }
                        }
                    },
                    regionClipOptions: {
                        dir: "col", width: "full", height: "auto", spacing: [0, sH],
                        hidden: this.properties.settingActive === false,
                        margin: [0, mH, 0, 0],
                        regionClipType: {
                            dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                            hidden: this.properties.settingActive === false,
                            lblClipType: {
                                type: this.UI_TYPES.TEXT,
                                measureText: "device",
                                themeKey: "t_textNormal",
                                text: tLocale("$derp_clip_loader.options.type", "type"),
                                width: "auto", height: "auto", padding: [pW, pH]
                            },
                            browserClipType: {
                                type: this.UI_TYPES.FILEBROWSER,
                                icon: "dropdown",
                                themeKey: "dialog, t_textNormal",
                                canvasShield: true,
                                width: "full", height: "auto",
                                padding: [pW, pH],
                                mode: "file",
                                rootName: "type",
                                items: getClipTypeItems(),
                                value: this.properties.clipType || "stable_diffusion",
                                onChange: (val) => {
                                    this.properties.clipType = val || "stable_diffusion";
                                    if (typeof window._xcpCloseActiveDropdown === "function") window._xcpCloseActiveDropdown();
                                    if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
                                    this.refreshNodeLayoutMap();
                                    this.refreshDerpTemplateSysMap();
                                    this.requestDerpSync();
                                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                                }
                            }
                        },
                        regionClipDevice: {
                            dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                            hidden: this.properties.settingActive === false,
                            margin: [0, sH, 0, 0],
                            lblClipDevice: {
                                type: this.UI_TYPES.TEXT,
                                themeKey: "t_textNormal",
                                text: tLocale("$derp_clip_loader.options.device", "device"),
                                width: "auto", height: "auto", padding: [pW, pH]
                            },
                            browserClipDevice: {
                                type: this.UI_TYPES.FILEBROWSER,
                                icon: "dropdown",
                                themeKey: "dialog, t_textNormal",
                                canvasShield: true,
                                width: "full", height: "auto",
                                padding: [pW, pH],
                                mode: "file",
                                rootName: "device",
                                items: getClipDeviceItems(),
                                value: this.properties.clipDevice || "default",
                                onChange: (val) => {
                                    this.properties.clipDevice = val || "default";
                                    if (typeof window._xcpCloseActiveDropdown === "function") window._xcpCloseActiveDropdown();
                                    if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
                                    this.refreshNodeLayoutMap();
                                    this.refreshDerpTemplateSysMap();
                                    this.requestDerpSync();
                                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                                }
                            }
                        }
                    }
                }
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const vars = this.getDerpVars(this);
            const [mW, mH, pW, pH, sW, oY] = [vars.mW, vars.mH, vars.pW, vars.pH, vars.sW, vars.oY].map(v => Number(v.toFixed(2)));
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" },
                    width: "full", height: "auto", margin: [mW, mH, mW, 0],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textSystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_clip_loader.system.properties", "Custom node properties:"),
                        width: "full", padding: [pW, pH]
                    },
                    toggleShowFolder: {
                        anchor: { target: "lblTitle", axis: "y" },
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true, themeKey: "dialog, button, t_textNormal",
                        text: tLocale("$derp_clip_loader.system.show_folder_names", "Show Folder Names"),
                        width: "full", height: "auto", padding: [pW, pH],
                        value: this.properties.showFolderNames !== false,
                        onChange: (v) => {
                            this.properties.showFolderNames = v;
                            this.refreshNodeLayoutMap();
                            this.refreshDerpTemplateSysMap();
                        }
                    }
                }
            };
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.onDerpSettingsPress = () => {
                this.refreshNodeLayoutMap();
            };
            this.handleClipLoaderCreated();
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(info) {
            if (onSerialize) onSerialize.apply(this, arguments);
            info.properties = info.properties || {};
            info.properties.clipDeck = this.properties.clipDeck;
            info.properties.clipType = this.properties.clipType;
            info.properties.clipDevice = this.properties.clipDevice;
            info.properties.settingActive = this.properties.settingActive !== false;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.onDerpSettingsPress = () => {
                this.refreshNodeLayoutMap();
            };
            if (info.properties?.clipDeck) this.properties.clipDeck = info.properties.clipDeck;
            if (typeof info.properties?.clipType === "string") this.properties.clipType = info.properties.clipType;
            if (typeof info.properties?.clipDevice === "string") this.properties.clipDevice = info.properties.clipDevice;
            this.handleClipLoaderConfigure();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            this.handleClipLoaderDraw?.();
        };

        nodeType.prototype.onResize = function(size) {
            if (this.handleClipLoaderResize) this.handleClipLoaderResize(size);
        };
    }
});
