/**
 * Path: ./js/fatha/nodes/derpTriggerWall.js
 * STATUS: VIRTUAL FATHA COMPLIANT | Refactored Core Logic
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import {
    triggerWall_syncOutputs,
    triggerWall_onNodeCreated,
    triggerWall_onConfigure,
    triggerWall_onDrawForeground,
    triggerWall_onRemoved,
    triggerWall_onDeselected,
    triggerWall_onSavePreset,
    triggerWall_onLoadPreset,
    triggerWall_updatePresetList,
    triggerWall_handleShieldInteraction,
    triggerWall_onThemeUpdate,
    triggerWall_applyPalette,
    triggerWall_addGroup,
    triggerWall_itemDragStart,
    triggerWall_itemDrag,
    triggerWall_itemDragEnd,
    triggerWall_itemPress,
    triggerWall_addTrigger,
    triggerWall_toggleRegion,
    triggerWall_renameGroup,
    triggerWall_changeGroupTemplate,
    triggerWall_removeGroup,
    triggerWall_toggleExclusive,
    triggerWall_toggleShowWeight,
    triggerWall_toggleAddAlways,
    triggerWall_isGroupDuplicate,
    triggerWall_onDerpSysPanelOpen,
    triggerWall_onResize
} from "./core/derpTriggerWall_core.js";

function bumpTWPerfCounter(node, key) {
    if (!node) return;
    if (!window.DERP_TW_PROFILE) return;
    if (!node._twPerf) {
        node._twPerf = {
            windowStart: performance.now(),
            refreshCount: 0,
            syncReqCount: 0,
            dirtyCount: 0
        };
    }
    if (key === "refresh") node._twPerf.refreshCount++;
    if (key === "sync") node._twPerf.syncReqCount++;
    if (key === "dirty") node._twPerf.dirtyCount++;

    const now = performance.now();
    if (now - node._twPerf.windowStart >= 1000) {
        console.log(
            `[TWPerf] ${node.titleLabel || node.title || "TriggerWall"} | ` +
            `refresh=${node._twPerf.refreshCount}/s syncReq=${node._twPerf.syncReqCount}/s dirty=${node._twPerf.dirtyCount}/s`
        );
        node._twPerf.windowStart = now;
        node._twPerf.refreshCount = 0;
        node._twPerf.syncReqCount = 0;
        node._twPerf.dirtyCount = 0;
    }
}

app.registerExtension({
    name: "xcp.derpTriggerWall_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("triggerwall")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);
        if (window.DERP_TW_PROFILE) {
            console.log("[TWPerf] profiler active (set window.DERP_TW_PROFILE = false to disable)");
        }

        // Initialize the Virtual Fatha framework hijacking
        fatha(nodeType, nodeData, 200);

        const origHandle = nodeType.prototype.handleShieldInteraction;
        nodeType.prototype.handleShieldInteraction = function (type, data) {
            return triggerWall_handleShieldInteraction(this, type, data, origHandle);
        };

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            triggerWall_onThemeUpdate(this, config);
        };

        nodeType.prototype.applyPalette = function() {
            triggerWall_applyPalette(this);
        };

        nodeType.prototype.onDerpSettingsPress = function() {
            this.refreshNodeLayoutMap();
        };

        const originalRequestDerpSync = nodeType.prototype.requestDerpSync;
        nodeType.prototype.requestDerpSync = function() {
            bumpTWPerfCounter(this, "sync");
            if (originalRequestDerpSync) return originalRequestDerpSync.apply(this, arguments);
        };

        const originalSetDirtyCanvas = nodeType.prototype.setDirtyCanvas;
        nodeType.prototype.setDirtyCanvas = function() {
            bumpTWPerfCounter(this, "dirty");
            if (originalSetDirtyCanvas) return originalSetDirtyCanvas.apply(this, arguments);
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (!this.layout || !this.getDerpVars) return;
            bumpTWPerfCounter(this, "refresh");

            const minW = this.properties?.minWidth || 200;
            const rawW = this.size?.[0] || 0;
            const clampedW = Math.max(minW, rawW);
            if (rawW !== clampedW) {
                this.size[0] = clampedW;
                if (this.properties?.nodeSize) this.properties.nodeSize[0] = clampedW;
            }

            // ZERO-INFERENCE GATING: Early return if structure and size haven't changed
            const groupsForHash = (this.properties.triggerGroups || []).filter(g => !g.hidden);
            let currentHash = `${clampedW.toFixed(2)}_${(this.properties.triggerGroups || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`])}_${this._dropPreviewIdx}_${this._dragTrig?.tIdx}`;
            groupsForHash.forEach(g => {
                currentHash += `|${g.id}_${g.title}_${g.isExclusive}_${g.hidden || false}`;
                g.triggers.forEach(t => { currentHash += `:${t.id}_${t.active}_${t.weight}_${t.label}_${t.disabled}_${t.hidden || false}`; });
            });
            // Keep hash focused on geometry-affecting fields only.
            currentHash += `|${this.properties.showWeight}_${this.properties.toggleAddAlways}_${this.properties.drawHeader}_${this.properties.settingActive}_${this.properties.lastSavedPreset || ""}`;

            if (this._layoutMapHash === currentHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = currentHash;

            const triggerPadW = 1, triggerPadH = 1;
            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;

            if (!this.properties.triggerGroups || this.properties.triggerGroups.filter(g => !g.hidden).length === 0) {
                const legacy = (this.properties.triggers || [{ active: true }]).map(t => ({
                    id: t.id || `trig_${Math.random().toString(16).slice(2, 8)}`,
                    weight: 1.0,
                    ...t
                }));
                this.properties.triggerGroups = [{
                    id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                    title: this.properties.regionTitle || "Trigger Group 1",
                    triggers: legacy,
                    isExclusive: false
                }];
                this.properties.triggers = [];
            }

            const groups = (this.properties.triggerGroups || []).filter(g => !g.hidden);
            const activeTitles = groups.map(g => g.title);
            const selectedGroupOriginalIdx = (this.properties.triggerGroups || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`]);
            const selectedGroup = selectedGroupOriginalIdx !== -1 ? this.properties.triggerGroups[selectedGroupOriginalIdx] : null;
            const anySelected = selectedGroup !== null;

            const textTheme = this._t_textSmallPaintData || this._t_textNormalPaintData || {};
            const trigHeight = (textTheme.fontSize || 10) + (triggerPadH * 2);

            const presetItems = this._presetItems || [];
            const presetSortKey = presetItems.join("\u0001");
            if (this._sortedPresetItemsKey !== presetSortKey) {
                this._sortedPresetItemsKey = presetSortKey;
                this._sortedPresetItems = [...presetItems].sort((a, b) => String(a).localeCompare(String(b)));
            }

            const layoutMap = {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y", },
                    width: "full", height: "auto", dir: "col", padding: [0, 0], minWidth: 0,
                    margin: [mW, mH, mW, 0],
                }
            };

            layoutMap.groupControlRow1 = {
                anchor: { target: "contentRegion", axis: "y" },
                dir: "row", width: "full", height: "auto", margin: [mW, mH, mW, mH],
                addGroup: {
                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textsmall", labelAlign: ["center", "middle"],
                    text: "New trigger group", width: "fit", padding: [pW, pH],
                    onPress: () => triggerWall_addGroup(this)
                },
                btnSaveTriggerGroup: {
                    type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textnormal",
                    icon: "save", width: "match", height: "fill", margin: [sW, 0, 0, 0],
                    state: "OFF",
                    onPress: () => {
                        if (triggerWall_onSavePreset) {
                            triggerWall_onSavePreset(this);
                        }
                    }
                },
                filebrowserTrigger: {
                    type: this.UI_TYPES.FILEBROWSER, themeKey: "button, t_textsmall", canvasShield: true,
                    text: this.properties.lastSavedPreset || "Load trigger profiles", mouseOver: false,
                    icon: this.properties.lastSavedPreset ? "file" : "folder",
                    width: "full", height: "fill", padding: [pW, pH], margin: [sW, 0, 0, 0],
                    items: this._sortedPresetItems || [],
                    indicator: true,
                    rootName: "Presets",
                    onChange: (val) => {
                        if (typeof triggerWall_onLoadPreset === "function") triggerWall_onLoadPreset(this, val);
                    }
                },
            };

            let lastRegionKey = "groupControlRow1";

            this.properties.triggerGroups.forEach((group, gIdx) => {
                if (group.hidden) return;
                const triggerRows = {};
                let curR = 0, curW = 0;
                const nodeW = Math.round(clampedW || 150);
                const marginX = (mW * 4);
                const maxW = nodeW - marginX;

                let items = [
                    ...(group.triggers || []).map((trig, idx) => ({ type: "trig", trig, idx })).filter(i => !i.trig.hidden),
                    { type: "add" }
                ];
                if (this._dragTrig && this._dragTrig.gIdx === gIdx) {
                    const d = this._dragTrig;
                    const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.tIdx;
                    const [moved] = items.splice(d.tIdx, 1);
                    moved.isPreviewGhost = true; // Tag for visual styling in the next step
                    items.splice(pIdx, 0, moved);
                }

                const trigGroups = items.reduce((acc, item) => {
                    let tw = 0;
                    if (item.type === "trig") {
                        tw = Math.ceil(this.layout.measure({
                            type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "panel, button, t_textsmall",
                            text: item.trig.label || "Trigger Test", width: "auto", height: "auto",
                            padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                            showWeight: this.properties.showWeight, weight: item.trig.weight ?? 1.0
                        }, { textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData }));
                    } else {
                        const isSelected = !!this._selectedRegions?.[`triggerRegion_${gIdx}`];
                        const showAdd = isSelected || this.properties.toggleAddAlways;
                        tw = showAdd ? Math.ceil(this.layout.measure({
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                            icon: "add", width: "auto", height: "match", minHeight: 22, baseHeight: 22, padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0]
                        }, { textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData })) : 0;
                    }

                    // Keep per-item measure cache reset to avoid stale width reuse across
                    // varying trigger payloads (label/weight/theme), which can break wrapping.
                    if (this.layout._measureCache) this.layout._measureCache.clear();

                    const spacing = acc[curR].length > 0 ? sW : 0;
                    if (curW + tw + spacing > maxW && acc[curR].length > 0) {
                        curR++;
                        curW = 0;
                    }

                    if (!acc[curR]) acc[curR] = [];
                    acc[curR].push(item);
                    curW += (acc[curR].length > 1 ? sW : 0) + tw;
                    return acc;
                }, [[]]);

                trigGroups.forEach((gItems, rIdx) => {
                    const isLastRow = rIdx === trigGroups.length - 1;
                    triggerRows[`triggerRow_${gIdx}_${rIdx}`] = {
                        anchor: { target: rIdx === 0 ? `lineBreak_${gIdx}` : `triggerRow_${gIdx}_${rIdx - 1}`, axis: "y", offset: sH },
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0], minWidth: 0,
                        margin: [-mW / 2, 0, -mW / 2, isLastRow ? mH + 2: 0],
                        ...Object.fromEntries(gItems.map(item => {
                            if (item.type === "trig") {
                                const isModalActive = this._activeModalItemKey === `triggerItem_${gIdx}_${item.idx}`;
                                const triggerActive = (item.trig.active || isModalActive) && !isBypassed && item.trig.disabled !== true;

                                return [`triggerItem_${gIdx}_${item.idx}`, {
                                    type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "panel, button, t_textsmall",
                                    text: item.trig.label || "Trigger Test", mouseOver: false,
                                    width: "auto", height: "auto", padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                                    showWeight: this.properties.showWeight, weight: item.trig.weight ?? 1.0,
                                    value: item.trig.active || isModalActive,
                                    state: isModalActive ? "ON" : ((isBypassed || item.trig.disabled === true) ? "DIS" : "OFF"),
                                    disabled: item.trig.disabled === true,

                                    bodyPaint: item.isPreviewGhost ? this._buttonPaintData_DIS : (isModalActive ? this._panelPaintData_ON : (triggerActive ? this._panelPaintData : this._panelPaintData_DIS)),
                                    slotPaint: isModalActive ? this._buttonPaintData_ON : (triggerActive ? this._buttonPaintData : this._buttonPaintData_DIS),
                                    labelPaint: isModalActive ? this._t_textSmallPaintData_ON : (triggerActive ? this._t_textSmallPaintData : this._t_textSmallPaintData_DIS),
                                    onDragStart: (e, data) => triggerWall_itemDragStart(this, e, data, gIdx, item.idx),
                                    onDrag: (e, data) => triggerWall_itemDrag(this, e, data),
                                    onDragEnd: (e, data) => triggerWall_itemDragEnd(this, e, data),
                                    onPress: (e, data) => triggerWall_itemPress(this, e, data, gIdx, item.idx, group, isBypassed)
                                }];
                            } else {
                                return [`btnAdd_${gIdx}`, {
                                    type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                                    icon: "add", width: "match", height: trigHeight, padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0],
                                    hidden: !(this.properties.toggleAddAlways || this._selectedRegions?.[`triggerRegion_${gIdx}`]),
                                    onPress: () => triggerWall_addTrigger(this, group)
                                }];
                            }
                        }))
                    };
                });

                const regionKey = `triggerRegion_${gIdx}`;
                const isSelected = !!this._selectedRegions?.[regionKey];

                layoutMap[regionKey] = {
                    type: this.UI_TYPES.REGION, themeKey: "region", regionOffset: [mW, mH, mW, 0],
                    state: isSelected ? "ON" : (isBypassed ? "DIS" : "OFF"),
                    anchor: { target: lastRegionKey, axis: "y", offset: mH },
                    hoverEffect: false,
                    onPress: () => triggerWall_toggleRegion(this, regionKey),
                    margin: [mW * 2, mH, mW * 2, mH],
                    width: "full", height: "auto", dir: "col", minWidth: 0,
                    [`headerRegion_${gIdx}`]: {
                        hidden: !this.properties.settingActive && !isSelected,
                        dir: "row", width: "full", height: "auto", margin: [0, -mH, -mW, 0],
                        spacing: [sW, 0],
                        [`btnRename_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textsystem",
                            width: "match", height: "fill", margin: [-sW, mH], spacing: [sW * 2, 0],
                            onPress: () => triggerWall_renameGroup(this, group, gIdx)
                        },
                        [`dropdownTriggerGroup_${gIdx}`]: {
                            type: this.UI_TYPES.DROPDOWN, themeKey: "button, t_textsmall", skipBackground: false,
                            indicator: true, canvasShield: true, mouseOver: false,
                            width: "full", height: "auto", spacing: [sW, 0],
                            padding: [pW, pH],
                            value: group.title || "Trigger Group",
                            items: [...(this._cachedPresetData?.triggerGroups || this.properties.triggerGroups || [])]
                                .filter(g => !activeTitles.includes(g.title) || g.title === group.title)
                                .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                                .map(g => g.title || "Trigger Group"),
                            onChange: (v) => triggerWall_changeGroupTemplate(this, group, v)
                        },

                        [`btnRemoveGroup_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsystem",
                            icon: "close", width: "match", height: "fill", margin: [0, sH, sW, sH],
                            hidden: this.properties.triggerGroups.length <= 1,
                            onPress: () => triggerWall_removeGroup(this, gIdx)
                        }
                    },
                    [`lineBreak_${gIdx}`]: {
                        hidden: !this.properties.settingActive && !isSelected,
                        type: this.UI_TYPES.LINEBREAK, margin: [-mW, 0, -mW, sH]
                    },
                    ...triggerRows
                };
                lastRegionKey = regionKey;
            });

            layoutMap.regionOption1 = {
                hidden: !anySelected,
                anchor: { target: lastRegionKey, axis: "y", offset: sH },
                dir: "row", width: "full", height: "auto", margin: [mW, 0, mW, mH],
                spacing: [sW, 0],
                toggleExclusive: {
                    type: this.UI_TYPES.TOGGLE_V2, themeKey: "button, t_textSmall",
                    isTextOnly: true, mouseOver: false, cutoff: false,
                    text: "Mutually exclusive",
                    width: "auto", height: "auto", padding: [pW, pH],
                    value: !!selectedGroup?.isExclusive,
                    state: isBypassed ? "DIS" : (anySelected ? (selectedGroup.isExclusive ? "ON" : "OFF") : "DIS"),
                    onPress: () => triggerWall_toggleExclusive(this, selectedGroup, anySelected, isBypassed)
                },
                btnSaveToCurrent: {
                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                    text: "Save to current", width: "auto", height: "auto", padding: [pW, pH],
                    state: isBypassed ? "DIS" : (triggerWall_isGroupDuplicate(this) ? "DIS" : "OFF"),
                    onPress: () => { }
                }
            };
            if (anySelected) lastRegionKey = "regionOption1";

            layoutMap.bottomSpacer = {
                anchor: { target: lastRegionKey, axis: "y" },
                width: "full", height: mH
            };

            this.layoutMap = layoutMap;

            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTriggerWallSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" }, margin: [mW, mH], spacing: [0, sH],
                    width: "full", height: "auto",
                    regionOption1: {
                        dir: "row", width: "full", height: "auto",
                        toggleShowWeight: {
                            type: this.UI_TYPES.TOGGLE,
                            textThemeKey: "t_textsystem",
                            icon: "radio",
                            value: !!this.properties.showWeight,
                            objectAlign: ["left", "top"],
                            labelAlign: ["left", "middle"],
                            label: "Show Trigger Weight",
                            width: "auto", height: "fill",
                            padding: [pW, pH],
                            onPress: () => triggerWall_toggleShowWeight(this)
                        },
                        toggleAddAlways: {
                            type: this.UI_TYPES.TOGGLE, textThemeKey: "t_textSystem", icon: "radio",
                            value: !!this.properties.toggleAddAlways,
                            objectAlign: ["left", "top"],
                            labelAlign: ["left", "middle"],
                            label: "Add trigger button always visible",
                            width: "auto", height: "fill",
                            padding: [pW, pH],
                            onPress: () => triggerWall_toggleAddAlways(this)
                        },
                    },
                }
            };
        };

        nodeType.prototype.syncDerpOutputs = function() {
            triggerWall_syncOutputs(this);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            triggerWall_onDerpSysPanelOpen(this, panel);
        };

        nodeType.prototype.onResize = function(size) {
            triggerWall_onResize(this, size);
        };
        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            triggerWall_onNodeCreated(this, onCreated);
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            triggerWall_onConfigure(this, info, onConfigure);
        };
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            triggerWall_onRemoved(this, onRemoved);
        };
        nodeType.prototype.onDeselected = function() {
            triggerWall_onDeselected(this);
        };
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            triggerWall_onDrawForeground(this, ctx, onDrawForeground);
        };
    }
});
