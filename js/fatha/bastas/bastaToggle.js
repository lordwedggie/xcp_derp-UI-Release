import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { showBastaFileHandler } from "./bastaFileHandler.js";

export const getToggleBastaId = () => `basta_toggle_global_unique_id`;

function releaseToggleModalState(host) {
    if (!host) return;
    host._toggleBastaOpen = false;
    host._layoutMapHash = undefined;
    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
    if (host.requestDerpSync) host.requestDerpSync();
    if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
}

export function showBastaToggle(host, targetRegion = null) {
    const id = getToggleBastaId();
    const vars = host.getDerpVars ? host.getDerpVars(host) : { mW: 4, mH: 2, pW: 2, pH: 4, sW: 2, sH: 2, oY: 4 };
    const { mW, mH, pW, pH, sW, sH, oY } = vars;
    const parts = String(targetRegion || "").split("_");
    const toggleIndex = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    const toggleItems = Array.isArray(host.properties?.toggleItems) && host.properties.toggleItems.length > 0
        ? host.properties.toggleItems
        : [{ label: host.properties?.signalName || "Bypass Toggle", value: host.properties?.toggleState !== false }];
    const targetItem = toggleItems[toggleIndex] || toggleItems[0] || { label: "Bypass Toggle", value: true };
    const initialLabel = targetItem.label || "Bypass Toggle";

    host._toggleBastaOpen = true;

    const syncBasta = () => {
        const b = activeBastas.get(id);
        if (b) {
            b._layoutMapHash = undefined;
            b._forceSync = true;
        }
        if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
    };

    const applyLabel = (value) => {
        const nextValue = String(value || "").trim() || "Bypass Toggle";
        if (!Array.isArray(host.properties.toggleItems) || host.properties.toggleItems.length === 0) {
            host.properties.toggleItems = [{ label: host.properties?.signalName || "Bypass Toggle", value: host.properties?.toggleState !== false }];
        }

        if (!host.properties.toggleItems[toggleIndex]) {
            host.properties.toggleItems[toggleIndex] = { label: nextValue, value: true };
        } else {
            host.properties.toggleItems[toggleIndex].label = nextValue;
        }

        host.properties.signalName = host.properties.toggleItems[0]?.label || nextValue;
        host.properties.toggleState = host.properties.toggleItems[0]?.value !== false;
        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
        if (host.refreshDerpToggleSysMap) host.refreshDerpToggleSysMap();
        if (host.syncDerpOutputs) host.syncDerpOutputs();
        if (host.requestDerpSync) host.requestDerpSync();
        if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
    };

    const addNewToggle = (value) => {
        const nextValue = String(value || "").trim() || "Bypass Toggle";
        if (!Array.isArray(host.properties.toggleItems) || host.properties.toggleItems.length === 0) {
            host.properties.toggleItems = [{ label: host.properties?.signalName || "Bypass Toggle", value: host.properties?.toggleState !== false }];
        }
        host.properties.toggleItems.push({
            label: nextValue,
            value: true
        });
        host.properties.signalName = host.properties.toggleItems[0]?.label || "Bypass Toggle";
        host.properties.toggleState = host.properties.toggleItems[0]?.value !== false;
        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
        if (host.refreshDerpToggleSysMap) host.refreshDerpToggleSysMap();
        if (host.syncDerpOutputs) host.syncDerpOutputs();
        if (host.requestDerpSync) host.requestDerpSync();
        if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
    };

    const removeToggle = () => {
        if (!Array.isArray(host.properties.toggleItems) || host.properties.toggleItems.length <= 1) return;
        host.properties.toggleItems.splice(toggleIndex, 1);
        host.properties.signalName = host.properties.toggleItems[0]?.label || "Bypass Toggle";
        host.properties.toggleState = host.properties.toggleItems[0]?.value !== false;
        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
        if (host.refreshDerpToggleSysMap) host.refreshDerpToggleSysMap();
        if (host.syncDerpOutputs) host.syncDerpOutputs();
        if (host.requestDerpSync) host.requestDerpSync();
        if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
    };

    const config = {
        host,
        titleLabel: "Toggle Label",
        onClose: () => {
            releaseToggleModalState(host);
        },
        autoSize: true,
        targetRegion,
        getDerpVars: () => ({ ...vars, mW: 0 }),
        properties: {
            clickToClose: false,
            bastaMovalbe: false,
            bastaSingleton: true,
            autoWidth: false,
            snapHeight: false
        },
        initialSize: [200, 50],
        _tempLabel: initialLabel,
        _addAsNewToggle: false,
        layoutMap: {
            contentRegion: {
                anchor: { target: "headerRegion", axis: "y", offset: 0 },
                dir: "col",
                width: "full",
                height: "auto",
                margin: [mW, mH],
                regionEditor: {
                    dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                    editorToggleLabel: {
                        type: UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textnormal",
                        text: initialLabel,
                        value: initialLabel,
                        spellCheck: true,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        onBlur: (v) => {
                            config._tempLabel = v;
                            config.layoutMap.contentRegion.regionEditor.editorToggleLabel.text = v;
                            config.layoutMap.contentRegion.regionEditor.editorToggleLabel.value = v;
                            syncBasta();
                        },
                        onKeyDown: (e, v) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                config._tempLabel = v;
                                if (config._addAsNewToggle) addNewToggle(v);
                                else applyLabel(v);
                                const b = activeBastas.get(id);
                                if (b) b.close();
                            }
                        }
                    },
                    btnRemove: {
                        type: UI_TYPES.ICONBUTTON,
                        themeKey: "button, t_textSystem",
                        icon: "delete",
                        width: "match",
                        height: "auto",
                        margin: [0, 0],
                        state: toggleItems.length <= 1 ? "DIS" : "OFF",
                        onPress: () => {
                            if (toggleItems.length <= 1) return;
                            showBastaFileHandler(host, "none", "btnRemove", {
                                title: "Remove Toggle",
                                message: `Remove toggle ${initialLabel}?`,
                                confirm: "Remove",
                                mode: "delete",
                                playSound: "delete",
                                onConfirm: () => {
                                    removeToggle();
                                    const b = activeBastas.get(id);
                                    if (b) b.close();
                                }
                            });
                        }
                    }
                }
            },
            regionOption: {
                anchor: { target: "contentRegion", axis: "y", offset: sH },
                dir: "row",
                width: "full",
                height: "auto",
                margin: [mW, 0, mW, mH],
                toggleNew: {
                    type: UI_TYPES.TOGGLE_V2,
                    themeKey: "button, t_textSmall", skipBackground: true,
                    text: "Add as new Toggle",
                    value: false,
                    width: "auto",
                    height: "auto",
                    padding: [pW, pH],
                    onPress: () => {
                        config._addAsNewToggle = !config._addAsNewToggle;
                        config.layoutMap.regionOption.toggleNew.value = config._addAsNewToggle;
                        syncBasta();
                    }
                }
            },
            buttonRegion: {
                anchor: { target: "regionOption", axis: "y", offset: sH },
                dir: "row",
                width: "full",
                height: "auto",
                margin: [mW, mH],
                spacing: [sW, 0],
                btnCancel: {
                    type: UI_TYPES.BUTTON,
                    themeKey: "button, t_textSmall",
                    text: "Cancel",
                    padding: [pW, pH],
                    labelAlign: ["center", "middle"],
                    width: "fit",
                    onPress: () => {
                        const b = activeBastas.get(id);
                        if (b) b.close();
                    }
                },
                spacer: { width: "full" },
                btnConfirm: {
                    type: UI_TYPES.BUTTON,
                    themeKey: "button, t_textSmall",
                    text: "Confirm",
                    padding: [pW, pH],
                    labelAlign: ["center", "middle"],
                    width: "fit",
                    onPress: () => {
                        if (config._addAsNewToggle) addNewToggle(config._tempLabel);
                        else applyLabel(config._tempLabel);
                        const b = activeBastas.get(id);
                        if (b) b.close();
                    }
                }
            },
        }
    };

    const existing = activeBastas.get(id);
    if (existing) {
        existing.hostNode = host;
        existing.targetRegion = targetRegion;
        existing.titleLabel = config.titleLabel;
        existing.onClose = config.onClose;
        existing.layoutMap = config.layoutMap;
        existing._toggleConfig = config;
        existing._layoutMapHash = undefined;
        existing._forceSync = true;
    }

    const bastaInstance = spawnBasta(id, config);
    bastaInstance._toggleConfig = config;

    if (!bastaInstance._isToggleClosePatched) {
        const originalClose = bastaInstance.close;
        bastaInstance.close = function() {
            const liveHost = this.hostNode || host;
            releaseToggleModalState(liveHost);
            return originalClose.apply(this, arguments);
        };
        bastaInstance._isToggleClosePatched = true;
    }

    return bastaInstance;
}
