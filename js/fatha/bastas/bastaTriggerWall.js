import { app } from "../../../../scripts/app.js";
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";

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

const TRIGGER_WEIGHT_MIN = -2;
const TRIGGER_WEIGHT_MAX = 2;
const TRIGGER_WEIGHT_DEFAULT = 1.0;

function clampTriggerWeight(value) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return TRIGGER_WEIGHT_DEFAULT;
    return Math.max(TRIGGER_WEIGHT_MIN, Math.min(TRIGGER_WEIGHT_MAX, num));
}

export const getTriggerWallId = () => `basta_trigger_wall_global_unique_id`;

function releaseTriggerWallModalState(host, preserveSelection = true) {
    if (!host) return;
    host._activeModalItemKey = null;
    host._triggerWallModalOpen = false;
    host._layoutMapHash = undefined;
    if (preserveSelection) {
        host._suppressRegionDeselectUntil = Date.now() + 400;
    }
    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
    if (host.requestDerpSync) host.requestDerpSync();
    if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
}

export function showTriggerWall(host, targetRegion = null) {
    host._dragTrig = null;
    host._dragMouse = null;
    host._dragOffset = null;
    host._dropPreviewIdx = undefined;

    const id = getTriggerWallId();
    const vars = host.getDerpVars ? host.getDerpVars(host) : { mW: 4, mH: 2, pW: 2, pH: 4, sW: 2, sH: 2, oY: 4 };
    const { mW, mH, pW, pH, sW, sH, oX, oY } = vars;

    const parts = targetRegion ? targetRegion.split("_") : [];
    const gIdx = parts.length > 2 ? parseInt(parts[1]) : null;
    const idx = parts.length > 2 ? parseInt(parts[2]) : (parts.length > 1 ? parseInt(parts[1]) : null);

    if (host.properties) {
        delete host.properties[`bastaOffset_${id}`];
    }

    const triggers = (gIdx !== null && host._triggerGroupData) ? host._triggerGroupData[gIdx].triggers : host.properties.triggers;
    const trig = (idx !== null && triggers) ? triggers[idx] : { label: "" };
    const initialLabel = trig.label || "";
    const initialWeight = clampTriggerWeight(trig.weight !== undefined ? trig.weight : TRIGGER_WEIGHT_DEFAULT);
    host._triggerWallModalOpen = true;

    const syncBasta = () => {
        const b = activeBastas.get(id);
        if (b) {
            b._layoutMapHash = undefined;
            b._forceSync = true;
        }
        if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
    };

    const config = {
        host: host,
        titleLabel: tLocale("$derp_trigger_wall.modal.title", "Trigger Wall"),
        onClose: () => {
            releaseTriggerWallModalState(host, true);
        },
        autoSize: true,
        targetRegion: targetRegion,
        getDerpVars: (node) => ({ ...vars, mW: 0 }),
        properties: {
            clickToClose: false,
            bastaMovalbe: false,
            bastaSingleton: true,
            autoWidth: false,
            snapHeight: false
        },
        initialSize: [180, 50],
        _tempLabel: initialLabel,
        _tempWeight: initialWeight,
        layoutMap: {
            contentRegion: {
                anchor: { target: "headerRegion", axis: "y", offset: 0 },
                dir: "col",
                width: "full",
                height: "auto",
                margin: [mW, mH],
                regionEditor: {
                    dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                    editorTrigger: {
                        type: UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textnormal",
                        text: initialLabel,
                        spellCheck: true,
                        width: "full", height: "auto", spacing: [sW, 0],
                        padding: [pW, pH],
                        onBlur: (v) => {
                            config._tempLabel = v;
                            config.layoutMap.contentRegion.regionEditor.editorTrigger.text = v;
                            syncBasta();
                        },
                        onKeyDown: (e, v) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                trig.label = v;
                                trig.weight = config._tempWeight;
                                config._tempLabel = v;
                                config.layoutMap.contentRegion.regionEditor.editorTrigger.text = v;
                                host.refreshNodeLayoutMap();
                                if (host.syncDerpOutputs) host.syncDerpOutputs();
                                const b = activeBastas.get(id);
                                if (b) b.close();
                            }
                        }
                    },
                    btnRemove: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textSystem",
                        icon: "delete", width: "match", height: "auto", margin: [0, 0],
                        onPress: () => {
                            trig.hidden = true;
                            host.refreshNodeLayoutMap();
                            if (host.syncDerpOutputs) host.syncDerpOutputs();
                            const b = activeBastas.get(id);
                            if (b) b.close();
                        }
                    }
                },
                regionSlider: {
                    dir: "row", width: "full", height: "auto", margin: [0, mH, 0, 0],
                    btnRevert: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textSmall",
                        icon: "revert", width: "match", height: "full", margin: [0, 0], padding: [pW, pH],
                        state: initialWeight === TRIGGER_WEIGHT_DEFAULT ? "DIS" : "OFF", spacing: [sW, 0],
                        onPress: () => {
                            const val = TRIGGER_WEIGHT_DEFAULT;
                            config._tempWeight = val;
                            config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                            config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.btnRevert.state = "DIS";
                            const b = activeBastas.get(id);
                            if (b) {
                                b._layoutMapHash = undefined;
                                b._forceSync = true;
                            }
                            if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
                        }
                    },
                    sliderWeight: {
                        type: UI_TYPES.SLIDER, themeKey: "panel, button, t_textSmall", mouseOver: false,
                        label: tLocale("$derp_trigger_wall.modal.trigger_weight", "Trigger Weight"), labelAlign: ["center", "middle"],
                        value: initialWeight, min: TRIGGER_WEIGHT_MIN, max: TRIGGER_WEIGHT_MAX, step: 0.01,
                        width: "full", height: "full", spacing: [sW, 0],
                        onChange: (v) => {
                            const val = clampTriggerWeight(v);
                            config._tempWeight = val;
                            config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                            config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === TRIGGER_WEIGHT_DEFAULT ? "DIS" : "OFF";
                            const b = activeBastas.get(id);
                            if (b) {
                                b._layoutMapHash = undefined;
                                b._forceSync = true;
                            }
                            if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
                        }
                    },
                    editorWeight: {
                        type: UI_TYPES.EDITOR, themeKey: "dialog, t_textNormal",
                        text: initialWeight.toFixed(2),
                        value: initialWeight.toFixed(2),
                        width: "auto", height: "full", padding: [pW, pH], measureText: "-2.00",
                        onBlur: (v) => {
                            const val = clampTriggerWeight(v);
                            config._tempWeight = val;
                            config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                            config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === TRIGGER_WEIGHT_DEFAULT ? "DIS" : "OFF";
                            syncBasta();
                        },
                        onKeyDown: (e, v) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                const val = clampTriggerWeight(v);
                                config._tempWeight = val;
                                config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                                config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                                config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                                config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === TRIGGER_WEIGHT_DEFAULT ? "DIS" : "OFF";
                                const b = activeBastas.get(id);
                                if (b) {
                                    b._layoutMapHash = undefined;
                                    b._forceSync = true;
                                }
                                if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
                            }
                        }
                    }
                }
            },
            buttonRegion: {
                anchor: { target: "contentRegion", axis: "y", offset: sH },
                dir: "row",
                width: "full",
                height: "auto",
                margin: [mW, mH],
                spacing: [sW, 0],
                btnCancel: {
                    type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                    text: tLocale("$widgets.cancel", "Cancel"), padding: [pW, pH], labelAlign: ["center", "middle"],
                    width: "fit",
                    onPress: () => {
                        const b = activeBastas.get(id);
                        if (b) b.close();
                    }
                },
                spacer: { width: "full" },
                btnConfirm: {
                    type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                    text: tLocale("$widgets.confirm", "Confirm"), padding: [pW, pH], labelAlign: ["center", "middle"],
                    width: "fit",
                    onPress: () => {
                        trig.label = config._tempLabel;
                        trig.weight = config._tempWeight;
                        config.layoutMap.contentRegion.regionEditor.editorTrigger.text = config._tempLabel;
                        host.refreshNodeLayoutMap();
                        if (host.syncDerpOutputs) host.syncDerpOutputs();
                        const b = activeBastas.get(id);
                        if (b) b.close();
                    }
                }
            }
        }
    };

    const existing = activeBastas.get(id);
    if (existing) {
        existing.hostNode = host;
        existing.targetRegion = targetRegion;
        existing.offset = config.offset || [0, 0];
        existing.titleLabel = config.titleLabel;
        existing.onClose = config.onClose;
        existing.layoutMap = config.layoutMap;
        existing._triggerWallConfig = config;
        existing._layoutMapHash = undefined;
        existing._forceSync = true;
    }

    const bastaInstance = spawnBasta(id, config);
    bastaInstance._triggerWallConfig = config;

    if (!bastaInstance._isTriggerWallClosePatched) {
        const originalClose = bastaInstance.close;
        bastaInstance.close = function() {
            const liveHost = this.hostNode || host;
            releaseTriggerWallModalState(liveHost, true);
            return originalClose.apply(this, arguments);
        };
        bastaInstance._isTriggerWallClosePatched = true;
    }

    if (!bastaInstance._isTriggerWallDestroyPatched) {
        const originalDestroy = bastaInstance.destroy;
        bastaInstance.destroy = function() {
            const liveHost = this.hostNode || host;
            releaseTriggerWallModalState(liveHost, true);
            return originalDestroy.apply(this, arguments);
        };
        bastaInstance._isTriggerWallDestroyPatched = true;
    }

    if (!bastaInstance._isDerpInteractionPatched) {
        const originalHandler = bastaInstance.handleShieldInteraction;
        bastaInstance.handleShieldInteraction = function(type, data) {
            const liveConfig = this._triggerWallConfig || config;
            const liveHost = this.hostNode || host;
            if (type === "dragStart" || type === "drag") {
                const hit = this._pressedRegionKey || (this.layout ? this.layout.hitTest([data.localX, data.localY], null, 0) : null);
                if (hit === "sliderWeight") {
                    const reg = this.layout.computedRegions[hit];
                    if (reg) {
                        const percent = Math.max(0, Math.min(1, (data.localX - reg.x) / reg.w));
                        const val = TRIGGER_WEIGHT_MIN + (percent * (TRIGGER_WEIGHT_MAX - TRIGGER_WEIGHT_MIN));

                        liveConfig._tempWeight = val;
                        liveConfig.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                        liveConfig.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                        liveConfig.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                        liveConfig.layoutMap.contentRegion.regionSlider.btnRevert.state = val === TRIGGER_WEIGHT_DEFAULT ? "DIS" : "OFF";

                        this._forceSync = true;
                        if (liveHost.refreshNodeLayoutMap) liveHost.refreshNodeLayoutMap();
                        if (liveHost.syncDerpOutputs) liveHost.syncDerpOutputs();
                        if (this.setDirtyCanvas) this.setDirtyCanvas(true);
                        if (app.canvas) app.canvas.setDirty(true, true); // THE WAKE FIX
                        return true;
                    }
                }
            }
            if (originalHandler) return originalHandler.apply(this, arguments);
            return false;
        };
        bastaInstance._isDerpInteractionPatched = true;
    }

    return bastaInstance;
}
