import { app } from "../../../../scripts/app.js";
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";

export const getTriggerWallId = () => `basta_trigger_wall_global_unique_id`;

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

    const triggers = (gIdx !== null && host.properties.triggerGroups) ? host.properties.triggerGroups[gIdx].triggers : host.properties.triggers;
    const trig = (idx !== null && triggers) ? triggers[idx] : { label: "" };
    const initialLabel = trig.label || "";
    const initialWeight = trig.weight !== undefined ? trig.weight : 1.0;

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
        titleLabel: "Trigger Wall",
        onClose: () => {
            host._activeModalItemKey = null;
            host.refreshNodeLayoutMap();
            host.setDirtyCanvas(true, true);
        },
        autoSize: true,
        targetRegion: targetRegion,
        getDerpVars: (node) => ({ ...vars, mW: 0 }),
        properties: {
            clickToClose: false,
            bastaMovalbe: true,
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
                        state: initialWeight === 1.0 ? "DIS" : "OFF", spacing: [sW, 0],
                        onPress: () => {
                            const val = 1.0;
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
                        type: UI_TYPES.SLIDER, themeKey: "panel, button, t_textSmall",
                        label: "Trigger Weight", labelAlign: ["center", "middle"],
                        value: initialWeight, min: 0, max: 2, step: 0.01,
                        width: "full", height: "full", spacing: [sW, 0],
                        onChange: (v) => {
                            const val = Math.max(0, Math.min(2, parseFloat(v) || 0));
                            config._tempWeight = val;
                            config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                            config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === 1.0 ? "DIS" : "OFF";
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
                        width: "auto", height: "full", padding: [pW, pH], measureText: "9.99",
                        onBlur: (v) => {
                            const val = Math.max(0, Math.min(2, parseFloat(v) || 0));
                            config._tempWeight = val;
                            config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                            config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                            config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === 1.0 ? "DIS" : "OFF";
                            syncBasta();
                        },
                        onKeyDown: (e, v) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                const val = Math.max(0, Math.min(2, parseFloat(v) || 0));
                                config._tempWeight = val;
                                config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                                config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                                config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                                config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === 1.0 ? "DIS" : "OFF";
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
                    text: "Cancel", padding: [pW, pH], labelAlign: ["center", "middle"],
                    width: "fit",
                    onPress: () => {
                        const b = activeBastas.get(id);
                        if (b) b.close();
                    }
                },
                spacer: { width: "full" },
                btnConfirm: {
                    type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                    text: "Confirm", padding: [pW, pH], labelAlign: ["center", "middle"],
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

    const bastaInstance = spawnBasta(id, config);

    if (!bastaInstance._isDerpInteractionPatched) {
        const originalHandler = bastaInstance.handleShieldInteraction;
        bastaInstance.handleShieldInteraction = function(type, data) {
            if (type === "dragStart" || type === "drag") {
                const hit = this._pressedRegionKey || (this.layout ? this.layout.hitTest([data.localX, data.localY], null, 0) : null);
                if (hit === "sliderWeight") {
                    const reg = this.layout.computedRegions[hit];
                    if (reg) {
                        const percent = Math.max(0, Math.min(1, (data.localX - reg.x) / reg.w));
                        const val = Math.max(0, Math.min(2, percent * 2));

                        config._tempWeight = val;
                        config.layoutMap.contentRegion.regionSlider.sliderWeight.value = val;
                        config.layoutMap.contentRegion.regionSlider.editorWeight.text = val.toFixed(2);
                        config.layoutMap.contentRegion.regionSlider.editorWeight.value = val.toFixed(2);
                        config.layoutMap.contentRegion.regionSlider.btnRevert.state = val === 1.0 ? "DIS" : "OFF";

                        this._forceSync = true;
                        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
                        if (host.syncDerpOutputs) host.syncDerpOutputs();
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