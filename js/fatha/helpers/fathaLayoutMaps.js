/**
 * Path: ./js/fatha/legacy/fathaLayoutMaps.js
 * STATUS: FIXED - NaN offset bug resolved, theme items injected.
 */
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { activeBastas } from "../basta.js";
import { showBastaSignalReceiver, getSignalReceiverId } from "../bastas/bastaSignalReceiver.js";
import { showBastaFileHandler, getHandlerId } from "../bastas/bastaFileHandler.js";
import { showBastaMessage } from "../bastas/bastaMessage.js";
import { playKaChing, playKaboom } from "../../herbina/masterSoundEffects.js";
import { resolvePaintData, measureTextWidth } from "../../herbina/utils/widgetsUtils.js";
import { isNodeDocked, undockNodeEdges } from "../core/masterDockEngine.js";
import { clearBypassSignalDebouncers, transmitBypassedDerpSignals } from "../core/masterSignalEngine.js";

const DEBUG_OPTIONS = ["None", "Layout", "Hitbox", "Widgets Hitbox"];
const TITLE_LABEL_DEFAULT = "Derp Nodes";

export const getPanelVars = (node) => {
    if (node && typeof node.getDerpVars === 'function') {
        const vars = node.getDerpVars(node);
        return { ...vars, oX: 0, oY: 0 };
    }
    // Strict fallback if host node is missing its Fatha variables
    return {
        mW: 0, mH: 0, sW: 2, sH: 2, oX: 0, oY: 0, pW: 2, pH: 4
    };
};

/**
 * REFACTORED: The standard layout map for Virtual Nodes.
 * Handles header, custom content regions, and the footer system button.
 */
export const getVirtualNodeLayoutMap = (node) => {
    const p = node.properties || {};
    const { mW, mH, sW, sH, oX, oY, pW, pH } = getPanelVars(node);
    const collapseIcon = p.contentCollapsed ? "add" : "subtract";
    const customKeys = Object.keys(node.layoutMap || {});
    const lastCustomRegion = (p.contentCollapsed || customKeys.length === 0) ? "headerRegion" : customKeys[customKeys.length - 1];

    const titleVisible = p.contentCollapsed || p.drawHeader !== false;
    return {
        headerRegion: {
            dir: "col", width: "full", height: "auto",
            hidden: !titleVisible,
            inSlotIdx: p.contentCollapsed ? -1 : undefined,
            outSlotIdx: p.contentCollapsed ? -1 : undefined,
            spacing: [0, sH], // THE GAP FIX: Spacing moved to parent column to separate content from the line
            headerMain: {
                dir: "row", width: "full", height: "auto",
                margin: [2, 2, 2, p.contentCollapsed ? mH: 0], // THE OVERRIDE: Restores horizontal padding for header content
                btnCollapse: {
                    type: UI_TYPES.ICONBUTTON,
                    themeKey: "buttonNode, t_textSystem",
                    icon: collapseIcon,
                    width: "match", height: "fit", spacing: [sW, 0],
                    playSound: p.contentCollapsed ? "collapseoff" : "collapseon",
                    onPress: () => {
                        if (node.collapse) node.collapse();
                        else {
                            node.properties.contentCollapsed = !node.properties.contentCollapsed;
                            if (node.requestDerpSync) node.requestDerpSync();
                        }
                    }
                },
                titleLabel: {
                    type: UI_TYPES.EDITOR, skipBackground: true, mouseOver: false,
                    themeKey: "dialog, t_textBig",
                    width: "full", height: "auto", padding: [pW, 0],
                    text: node.titleLabel || "Virtual Node",
                    noDragLock: true, spacing: [sW, 0],
                    onPress: () => false,
                    onClick: () => false,
                    onDblClick: (e, reg, data) => {
                        const paintData = resolvePaintData(node, "t_textBig");
                        const fontSize = paintData?.fontSize || 14;
                        const font = paintData?.font || "arial";
                        const textW = measureTextWidth(node.titleLabel || "Virtual Node", fontSize, font, paintData?.fontWeight || "normal");
                        const startX = reg.x + pW;

                        if (data.localX < startX || data.localX > startX + textW) return;

                        const el = node._derpDomElements?.titleLabel;
                        if (el) {
                            el._isAwake = true;
                            el.style.pointerEvents = "auto";
                            el.style.opacity = "1";
                            el.focus();
                        }
                    },
                    onBlur: (newVal) => {
                        if (newVal !== undefined) {
                            node.titleLabel = newVal;
                            node.properties.titleLabel = newVal;
                            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                            if (typeof node.syncDerpOutputs === "function") node.syncDerpOutputs();
                            node.requestDerpSync();
                        }
                    }
                },
                btnDeck: {
                    type: UI_TYPES.ICONBUTTON,
                    hidden: !isNodeDocked(node, node.graph || null),
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    icon: "undeck",
                    playSound: "undocked",
                    width: "match", height: "fill", spacing: [sW, 0],
                    onPress: () => {
                        if (undockNodeEdges(node, node.graph || null)) {
                            node.requestDerpSync();
                        }
                    }
                },
                btnSetting: {
                    type: UI_TYPES.ICONBUTTON, hidden: !p.drawSettingBtn,
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    icon: "settings",
                    width: "match", height: "fill", spacing: [sW, 0],
                    state: p.settingActive ? "ON" : "OFF",
                    onPress: () => {
                        node.properties.settingActive = !node.properties.settingActive;
                        if (node.onDerpSettingsPress) node.onDerpSettingsPress(node.properties.settingActive);
                        node.requestDerpSync();
                    }
                },
                btnSignal: {
                    type: UI_TYPES.ICONBUTTON, hidden: !p.drawSignalBtn,
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    icon: "wireless",
                    width: "match", height: "fill", spacing: [sW, 0],
                    state: activeBastas.get(getSignalReceiverId())?.hostNode === node && !activeBastas.get(getSignalReceiverId())?.isClosing ? "ON" : "OFF",
                    // THE PULSE DELEGATION FIX: Delegate the animation math directly to btnIcon.js
                    pulse: (() => {
                        const isBastaOpen = activeBastas.get(getSignalReceiverId())?.hostNode === node && !activeBastas.get(getSignalReceiverId())?.isClosing;
                        const reqTypes = node.signalFilters?.types || [];
                        const selections = node.properties?.multiSignalLabels || {};
                        const hasMissing = reqTypes.length > 0 && reqTypes.some((_, i) => !selections[i] || selections[i].includes("Select") || selections[i].includes("No "));
                        return !isBastaOpen && hasMissing;
                    })(),
                    onPress: () => showBastaSignalReceiver(node, "btnSignal", node.signalFilters || {}),
                },
                btnBypass: {
                    type: UI_TYPES.ICONBUTTON, hidden: false,
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    icon: "power",
                    width: "match", height: "fill",
                    playSound: node.mode === 4 ? "systemoff" : "systemon",
                    onPress: () => {
                        const nextMode = (node.mode === 4) ? 0 : 4;
                        node.mode = nextMode;
                        if (typeof node.onModeChange === "function") node.onModeChange(nextMode);

                        node._lastMode = null;
                        node._lastBypassState = null;
                        node._lastSignalFingerprint = null;
                        node._lastSyncedContent = null;
                        node._lastBroadcastHash = null;
                        clearBypassSignalDebouncers(node);

                        // THE ENGINE-LEVEL BYPASS FIX: React immediately to the UI toggle
                        if (nextMode === 4) {
                            transmitBypassedDerpSignals(node, {
                                forceIndexedSingleOutput: !!node.properties?.skipGenericWirelessHeartbeat
                            });
                        } else if (node.syncDerpOutputs) {
                            node.syncDerpOutputs();
                        }
                        node.requestDerpSync();
                    }
                },
            },
            headerBreak: {
                margin: [0,pH,0,0], height: 1,
                type: UI_TYPES.LINEBREAK,
                hidden: !!p.contentCollapsed
            },
        },
        ...Object.fromEntries(Object.entries(node.layoutMap || {}).map(([k, v]) => [
            k, { ...v, hidden: v.hidden || !!p.contentCollapsed }
        ])),
        footerRegion: {
            hidden: !!p.contentCollapsed,
            anchor: { target: lastCustomRegion, axis: "y", offset: oY},
            dir: "col", width: "full", height: "fill", minHeight: oY + 6,
            footerGap: { height: oY },
            systemBtn: {
                type: UI_TYPES.ICONBUTTON, noHover: false,
                themeKey: "buttonNode, t_textSystem, 3",
                objectAlign: ["center", "bottom"],
                width: 32, height: 6,
                corners: [2, 2, 0, 0]
            }
        }
    };
};

export function getPanelBaseMap(hostNode, app, sysState, closeDerpSysPanel) {
    const { mW, mH, sW, sH, oX, oY, pW, pH } = getPanelVars(hostNode);

    // THE PROFILE ANCHOR FIX: Identify the true last region of the host's custom layout to prevent overlaps
    const sysKeys = Object.keys(hostNode.sysLayoutMap || {});
    const lastSysRegion = sysKeys.length > 0 ? sysKeys[sysKeys.length - 1] : "sysDefaultControlsRegion";

    // Grab available themes dynamically from the global config
    const cfg = window.xcpDerpThemeConfig;
    const allThemes = cfg?.themes || {};
    const availableThemes = Object.keys(allThemes);
    const activeTheme = hostNode.properties?.selectedTheme || cfg?.activeTheme || (availableThemes.length > 0 ? availableThemes[0] : "Default");

    return {
        sysHeaderRegion: {
            width: "full", height: "auto", dir: "row",
            margin: [mW, mH, mW, mH], // Left, Top, Right, Bottom mapping
            padding: [0, 0], // Container stripped to allow true min-width measurement
            dropdownThemes: {
                type: UI_TYPES.DROPDOWN_DERP,
                themeKey: "dialog, t_textSmall",
                canvasShield: true,
                labelAlign: ["left", "middle"],
                spacing: [sW, 0],
                padding: [pW, pH],
                width: "full", height: "auto", minWidth: 150,
                // THE FIX 1: Provide the dropdown with data
                items: availableThemes,
                value: activeTheme,
                onChange: (val) => {
                    const node = app.graph.getNodeById(sysState.activeHostId || hostNode.id);
                    const sysCfg = window.xcpDerpThemeConfig;
                    if (node && sysCfg) {
                        sysCfg.activeTheme = val;
                        node.properties.selectedTheme = val;

                        if (sysState.sysLayoutMap?.sysHeaderRegion?.dropdownThemes) {
                            sysState.sysLayoutMap.sysHeaderRegion.dropdownThemes.value = val;
                        }

                        if (node.layout) node.layout._lastCacheKey = "";
                        if (sysState.layout) sysState.layout._lastCacheKey = "";

                        if (typeof node.onThemeUpdate === "function") node.onThemeUpdate(sysCfg);
                        const bgKey = "systemBackground";
                        sysState.currentThemeData = node[`_${bgKey}PaintData_OFF`] || node[`_${bgKey}PaintData`];

                        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
                        else node.setDirtyCanvas(true, true);
                    }
                }
            },
            btnClosePanel: {
                type: UI_TYPES.ICONBUTTON,
                themeKey: "systemButton, t_textSystem",
                noHover: false, noFilter: true,
                icon: "close",
                objectAlign: ["right", "top"],
                labelAlign: ["center", "middle"],
                width: "auto", height: "fill",
                padding: [pW, pH],
                onPress: () => closeDerpSysPanel()
            },
        },
        sysDefaultControlsRegion: {
            anchor: { target: "sysHeaderRegion", axis: "y", offset: sH },
            dir: "row",
            padding: [0, 0],
            width: "full", height: "auto",
            btnAutoWidth: {
                type: UI_TYPES.TOGGLE,
                textThemeKey: "t_textSystem",
                icon: "radio",
                value: hostNode.properties?.autoWidth !== false,
                objectAlign: ["left", "top"],
                labelAlign: ["left", "middle"],
                label: "$system.auto_width",
                width: "auto", height: "fill",
                padding: [pW, pH],

                onPress: () => {
                    hostNode.properties.autoWidth = (hostNode.properties.autoWidth !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            btnAutoHeight: {
                type: UI_TYPES.TOGGLE,
                textThemeKey: "t_textSystem",
                icon: "radio",
                value: hostNode.properties?.autoHeight !== false,
                objectAlign: ["left", "top"],
                labelAlign: ["left", "middle"],
                label: "$system.auto_height",
                width: "auto", height: "fill",
                padding: [pW, pH],
                onPress: () => {
                    hostNode.properties.autoHeight = (hostNode.properties.autoHeight !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            btnHideTitle: {
                type: UI_TYPES.TOGGLE,
                textThemeKey: "t_textSystem",
                icon: "radio",
                value: hostNode.properties?.drawHeader !== false,
                objectAlign: ["left", "top"], labelAlign: ["left", "middle"],
                label: "$system.title",
                width: "auto", height: "fill",
                padding: [pW, pH], spacing: [sW,0],
                onPress: () => {
                    hostNode.properties.drawHeader = (hostNode.properties.drawHeader !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            toggleUseAnimation: {
                type: UI_TYPES.TOGGLE,
                textThemeKey: "t_textSystem",
                icon: "radio",
                value: hostNode.properties?.useAnimations !== false,
                objectAlign: ["left", "top"], labelAlign: ["left", "middle"],
                label: "$system.animation",
                width: "auto", height: "fill",
                padding: [pW, pH],
                onPress: () => {
                    hostNode.properties.useAnimations = (hostNode.properties.useAnimations !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            spring: { width: "fit", height: 0 },
            dropdownDebug: {
                type: UI_TYPES.DROPDOWN_DERP,
                value: hostNode.properties?.debugMode || "None",
                themeKey: "panel, t_textSystem",
                hidden: true,
                canvasShield: true,
                objectAlign: ["left", "top"],
                labelAlign: ["center", "middle"],
                measureText:"Widgets Hitbox",
                width: "auto", height: "auto", minWidth: 80,
                padding: [pW, pH],
                spacing: [sW, 0],
                items: DEBUG_OPTIONS,
                onChange: (val) => {
                    const node = app.graph.getNodeById(sysState.activeHostId || hostNode.id);
                    if (node) {
                        node.properties.debugMode = val;
                        if (node.layout) node.layout._lastCacheKey = "";
                        if (sysState.layout) sysState.layout._lastCacheKey = "";
                        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
                        else node.setDirtyCanvas(true, true);
                    }
                }
            },
        },
        sysProfileRegion: {
            hidden: !hostNode._sysProfileActive,
            anchor: { target: lastSysRegion, axis: "y", offset: oY },
            dir: "row", height: "auto", width: "full", margin: [mW, mH, mW, mH],
            themeKey: "panel",
            settingsLabel: {
                type: UI_TYPES.TEXT, text: "Load settings:", themeKey: "t_textSystem",
                width: "auto", height: "auto", objectAlign: ["left", "middle"], disabled: false, spacing: [2, 0],
            },
            dropdownProfiles: {
                type: UI_TYPES.DROPDOWN, canvasShield: true,
                themeKey: "dialog, t_textSystem",
                width: "full", minWidth: 80,
                items: hostNode._sysProfileCache || ["(No Profiles Found)"],
                value: hostNode._currentProfileName || (hostNode._sysProfileCache?.[0] || "(No Profiles Found)"),
                spacing: [sW, 0], padding: [pW, pH],
                onChange: (val) => {
                    hostNode._currentProfileName = val;
                    if (hostNode.applyDerpProfile) hostNode.applyDerpProfile(val);
                }
            },
            btnRename: {
                type: UI_TYPES.ICONBUTTON, icon: "rename", width: "match", height: "fill", themeKey: "systemButton, t_textSystem", spacing: [sW, 0], labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                onPress: () => {
                    if (hostNode.onDerpRenamePress) return hostNode.onDerpRenamePress();
                    const profileName = hostNode._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                    const fileName = hostNode._sysProfileFile;
                    const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                    showBastaFileHandler(hostNode, "none", "btnRename", {
                        title: `Rename Profile: ${profileName}`,
                        message: "Enter new name for profile:", confirm: "Rename",
                        originalName: profileName,
                        fileList: hostNode._sysProfileCache || [],
                        onConfirm: async (newName) => {
                            try {
                                const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) { try { loadData = await loadRes.json(); } catch (e) {} }
                                const profiles = loadData.data || {};

                                if (profiles[newName] && !confirm(`Profile "${newName}" already exists. Overwrite?`)) return;

                                if (profiles[profileName]) {
                                    profiles[newName] = profiles[profileName];
                                    if (profileName !== newName) delete profiles[profileName];

                                    const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                    const saveRes = await fetch(`/xcp/save/${category}`, {
                                        method: "POST",
                                        body: JSON.stringify({name: fullFileName, data: profiles})
                                    });

                                    if (saveRes.ok) {
                                        playKaChing();
                                        showBastaMessage(hostNode, `Profile Renamed!`);
                                        hostNode._sysProfileData = profiles;
                                        hostNode._sysProfileCache = Object.keys(profiles).sort();
                                        hostNode._currentProfileName = newName;
                                        if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                        hostNode.setDirtyCanvas(true, true);
                                    }
                                }
                            } catch (e) { console.error("[Rename Error]:", e); }
                        }
                    });
                }
            },
            btnCopy: {
                type: UI_TYPES.ICONBUTTON, icon: "copy", width: "match", height: "fill", themeKey: "systemButton, t_textSystem", spacing: [sW, 0], labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                onPress: () => {
                    if (hostNode.onDerpCopyPress) return hostNode.onDerpCopyPress();
                    const profileName = hostNode._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                    const fileName = hostNode._sysProfileFile;
                    const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                    showBastaFileHandler(hostNode, "none", "btnCopy", {
                        title: `Duplicate Profile: ${profileName}`,
                        message: "Enter name for new profile copy:", confirm: "Duplicate",
                        mode: "duplicate",
                        originalName: profileName,
                        fileList: hostNode._sysProfileCache || [],
                        onConfirm: async (newName) => {
                            try {
                                const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) { try { loadData = await loadRes.json(); } catch (e) {} }
                                const profiles = loadData.data || {};

                                if (profiles[newName] && !confirm(`Profile "${newName}" already exists. Overwrite?`)) return;

                                if (profiles[profileName]) {
                                    profiles[newName] = JSON.parse(JSON.stringify(profiles[profileName]));

                                    const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                    const saveRes = await fetch(`/xcp/save/${category}`, {
                                        method: "POST",
                                        body: JSON.stringify({name: fullFileName, data: profiles})
                                    });

                                    if (saveRes.ok) {
                                        playKaChing();
                                        showBastaMessage(hostNode, `Profile Duplicated!`);
                                        hostNode._sysProfileData = profiles;
                                        hostNode._sysProfileCache = Object.keys(profiles).sort();
                                        hostNode._currentProfileName = newName;
                                        if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                        hostNode.setDirtyCanvas(true, true);
                                    }
                                }
                            } catch (e) { console.error("[Copy Error]:", e); }
                        }
                    });
                }
            },
            btnSave: {
                type: UI_TYPES.ICONBUTTON, icon: "save", width: "match", height: "fill", themeKey: "systemButton, t_textSystem", spacing: [sW, 0], labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                get onPress() {
                    return () => {
                        if (hostNode.onDerpSavePress) return hostNode.onDerpSavePress();

                        const isIndividual = (hostNode._sysProfileFile === "derpLoraStack" || hostNode._sysProfileFile === "derpPromptBook");
                        const bastaCategory = isIndividual ? hostNode._sysProfileFile : "settings";

                        showBastaFileHandler(hostNode, bastaCategory, "btnSave", {
                            title: "Save Profile",
                            message: "Enter name for this profile:",
                            confirm: "Save",
                            mode: "save",
                            initialSize: [250, 130],
                            fileList: hostNode._sysProfileCache || [],
                            onConfirm: async (profileName) => {
                                const profileData = hostNode.exportDerpProfile ? hostNode.exportDerpProfile() : { ...hostNode.properties };
                                const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                                const fileName = hostNode._sysProfileFile;
                                const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                                try {
                                    const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                    let loadData = { data: {} };
                                    if (loadRes.ok) { try { loadData = await loadRes.json(); } catch(e) {} }
                                    const profiles = loadData.data || {};

                                    if (profiles[profileName] && !confirm(`Profile "${profileName}" already exists. Overwrite?`)) return;

                                    profiles[profileName] = profileData;

                                    const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                    const saveRes = await fetch(`/xcp/save/${category}`, {
                                        method: "POST",
                                        body: JSON.stringify({ name: fullFileName, data: profiles })
                                    });

                                    if (saveRes.ok) {
                                        playKaChing();
                                        showBastaMessage(hostNode, "Profile Saved!");
                                        // THE CACHE SYNC: Update the profile list immediately to prevent "No Profiles Found" flickering
                                        hostNode._sysProfileData = profiles;
                                        hostNode._sysProfileCache = Object.keys(profiles).sort();
                                        hostNode._currentProfileName = profileName;
                                        if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                        hostNode.setDirtyCanvas(true, true);
                                    }
                                } catch (e) { console.error("[Save Error]:", e); }
                            }
                        });
                    };
                },
                set onPress(v) { /* THE IMMUNITY HACK */ }
            },
            btnDelete: {
                type: UI_TYPES.ICONBUTTON,
                icon: "trash",
                width: "match",
                height: "fill",
                themeKey: "systemButton, t_textSystem",
                labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                onPress: () => {
                    if (hostNode.onDerpDeletePress) return hostNode.onDerpDeletePress();

                    const profileName = hostNode._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                    const fileName = hostNode._sysProfileFile;
                    const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                    if (confirm(`Delete profile "${profileName}"?`)) {
                        (async () => {
                            try {
                                const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) {
                                    try {
                                        loadData = await loadRes.json();
                                    } catch (e) {
                                    }
                                }
                                const profiles = loadData.data || {};

                                delete profiles[profileName];

                                const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                const saveRes = await fetch(`/xcp/save/${category}`, {
                                    method: "POST",
                                    body: JSON.stringify({name: fullFileName, data: profiles})
                                });

                                if (saveRes.ok) {
                                    playKaboom();
                                    showBastaMessage(hostNode, "Profile Deleted!");
                                    // THE CACHE SYNC: Update the profile list locally after deletion
                                    hostNode._sysProfileData = profiles;
                                    hostNode._sysProfileCache = Object.keys(profiles).sort();
                                    if (hostNode._sysProfileCache.length === 0) hostNode._sysProfileCache = ["(No Profiles Found)"];
                                    hostNode._currentProfileName = hostNode._sysProfileCache[0];
                                    if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                    hostNode.setDirtyCanvas(true, true);
                                }
                            } catch (e) {
                                console.error("[Delete Error]:", e);
                            }
                        })();
                    }
                }
            }
        },
        footerMargin: {
            anchor: { target: "sysProfileRegion", axis: "y", offset: oY },  dir: "col",
            footerGap: { height: 4 },
        }
    };
}
