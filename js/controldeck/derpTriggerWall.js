/**
 * Path: ./js/fatha/nodes/derpTriggerWall.js
 * STATUS: VIRTUAL FATHA COMPLIANT | Refactored Core Logic
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { startStackDrag } from "../fatha/helpers/fathaDragDrop.js";
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
    triggerWall_addGroupTemplate,
    triggerWall_removeGroup,
    triggerWall_toggleExclusive,
    triggerWall_toggleShowWeight,
    triggerWall_toggleAddAlways,
    triggerWall_isGroupDuplicate,
    triggerWall_onDerpSysPanelOpen,
    triggerWall_onResize,
    triggerWall_groupDrag,
    triggerWall_groupDragEnd
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

            const varsForClamp = this.getDerpVars ? this.getDerpVars(this) : null;
            const SNAP = Math.max(1, Number(varsForClamp?.SNAP) || 1);
            const propMinW = Number(this.properties?.minWidth) || 200;
            const padL = this._padL || 0;
            const padR = this._padR || 0;
            const contentMinW = this.layout?.contentMinWidth || propMinW;
            const minW = Math.ceil(Math.max(propMinW, contentMinW + padL + padR) / SNAP) * SNAP;
            const rawW = this.size?.[0] || 0;
            const clampedW = Math.max(minW, rawW);
            if (rawW !== clampedW) {
                this.size[0] = clampedW;
                if (this.properties?.nodeSize) this.properties.nodeSize[0] = clampedW;
            }

            // ZERO-INFERENCE GATING: Early return if structure and size haven't changed
            const groupsForHash = (this.properties.triggerGroups || []).filter(g => !g.hidden);
            let currentHash = `${clampedW.toFixed(2)}_${(this.properties.triggerGroups || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`])}_${this._dropPreviewIdx}_${this._dragTrig?.tIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;
            groupsForHash.forEach(g => {
                currentHash += `|${g.id}_${g.title}_${g.isExclusive}_${g.hidden || false}`;
                g.triggers.forEach(t => { currentHash += `:${t.id}_${t.active}_${t.weight}_${t.label}_${t.disabled}_${t.hidden || false}`; });
            });
            const presetItems = this._presetItems || [];
            const presetSortKey = presetItems.join("\u0001");

            // Include preset list state so the file browser rebuilds when async preset data arrives.
            currentHash += `|${this.properties.showWeight}_${this.properties.toggleAddAlways}_${this.properties.drawHeader}_${this.properties.settingActive}_${this.properties.lastSavedPreset || ""}_${presetSortKey}`;

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

            const visibleGroupEntriesBase = (this.properties.triggerGroups || [])
                .map((group, gIdx) => ({ group, gIdx }))
                .filter(({ group }) => !group.hidden);
            const groups = visibleGroupEntriesBase.map(({ group }) => group);
            const activeTitles = groups.map(g => g.title);
            const selectedGroupOriginalIdx = (this.properties.triggerGroups || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`]);
            const selectedGroup = selectedGroupOriginalIdx !== -1 ? this.properties.triggerGroups[selectedGroupOriginalIdx] : null;
            const anySelected = selectedGroup !== null;
            const visibleGroupIndices = visibleGroupEntriesBase.map(({ gIdx }) => gIdx);
            const visibleGroupEntries = [...visibleGroupEntriesBase];
            let floatingGroupEntry = null;

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingGroupEntry] = visibleGroupEntries.splice(d.index, 1);
                if (floatingGroupEntry) {
                    visibleGroupEntries.splice(pIdx, 0, { ...floatingGroupEntry, isPreviewGhost: true });
                }
            }

            const buildGroupRows = (group, gIdx, isSelected, options = {}) => {
                const {
                    groupWidgetAlpha = 1,
                    rowAnchorPrefix = "triggerRow",
                    firstRowAnchorTarget = `lineBreak_${gIdx}`,
                    itemPressEnabled = true,
                    itemDragEnabled = true,
                    addPressEnabled = true
                } = options;

                let curR = 0;
                let curW = 0;
                const nodeW = Math.round(clampedW || 150);
                const marginX = (mW * 4);
                const maxW = nodeW - marginX;
                const triggerRows = {};

                let items = [
                    ...(group.triggers || []).map((trig, idx) => ({ type: "trig", trig, idx })).filter(i => !i.trig.hidden),
                    { type: "add" }
                ];
                if (itemDragEnabled && this._dragTrig && this._dragTrig.gIdx === gIdx) {
                    const d = this._dragTrig;
                    const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.tIdx;
                    const [moved] = items.splice(d.tIdx, 1);
                    moved.isTriggerPreviewGhost = true;
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
                        const showAdd = isSelected || this.properties.toggleAddAlways;
                        tw = showAdd ? Math.ceil(this.layout.measure({
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                            icon: "add", width: "auto", height: "match", minHeight: 22, baseHeight: 22, padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0]
                        }, { textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData })) : 0;
                    }

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
                    triggerRows[`${rowAnchorPrefix}_${gIdx}_${rIdx}`] = {
                        anchor: { target: rIdx === 0 ? firstRowAnchorTarget : `${rowAnchorPrefix}_${gIdx}_${rIdx - 1}`, axis: "y", offset: sH },
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0], minWidth: 0,
                        margin: [-mW / 2, 0, -mW / 2, isLastRow ? mH + 2 : 0],
                        ...Object.fromEntries(gItems.map(item => {
                            if (item.type === "trig") {
                                const isModalActive = this._activeModalItemKey === `triggerItem_${gIdx}_${item.idx}`;
                                const triggerActive = (item.trig.active || isModalActive) && !isBypassed && item.trig.disabled !== true;
                                const triggerItemKey = rowAnchorPrefix === "triggerRow" ? `triggerItem_${gIdx}_${item.idx}` : `${rowAnchorPrefix}Item_${gIdx}_${item.idx}`;
                                return [triggerItemKey, {
                                    type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "panel, button, t_textsmall",
                                    text: item.trig.label || "Trigger Test", mouseOver: false,
                                    width: "auto", height: "auto", padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                                    showWeight: this.properties.showWeight, weight: item.trig.weight ?? 1.0,
                                    alpha: groupWidgetAlpha,
                                    value: item.trig.active || isModalActive,
                                    state: isModalActive ? "ON" : ((isBypassed || item.trig.disabled === true) ? "DIS" : "OFF"),
                                    disabled: item.trig.disabled === true,
                                    bodyPaint: item.isTriggerPreviewGhost ? this._buttonPaintData_DIS : (isModalActive ? this._panelPaintData_ON : (triggerActive ? this._panelPaintData : this._panelPaintData_DIS)),
                                    slotPaint: isModalActive ? this._buttonPaintData_ON : (triggerActive ? this._buttonPaintData : this._buttonPaintData_DIS),
                                    labelPaint: isModalActive ? this._t_textSmallPaintData_ON : (triggerActive ? this._t_textSmallPaintData : this._t_textSmallPaintData_DIS),
                                    onDragStart: itemDragEnabled ? ((e, data) => triggerWall_itemDragStart(this, e, data, gIdx, item.idx)) : undefined,
                                    onDrag: itemDragEnabled ? ((e, data) => triggerWall_itemDrag(this, e, data)) : undefined,
                                    onDragEnd: itemDragEnabled ? ((e, data) => triggerWall_itemDragEnd(this, e, data)) : undefined,
                                    onPress: itemPressEnabled ? ((e, data) => triggerWall_itemPress(this, e, data, gIdx, item.idx, group, isBypassed)) : undefined
                                }];
                            }

                            const addItemKey = rowAnchorPrefix === "triggerRow" ? `btnAdd_${gIdx}` : `${rowAnchorPrefix}Add_${gIdx}`;
                            return [addItemKey, {
                                type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                                icon: "add", width: "match", height: trigHeight, padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0],
                                alpha: groupWidgetAlpha,
                                hidden: !(this.properties.toggleAddAlways || isSelected),
                                onPress: addPressEnabled ? (() => triggerWall_addTrigger(this, group)) : undefined
                            }];
                        }))
                    };
                });

                return triggerRows;
            };

            const textTheme = this._t_textSmallPaintData || this._t_textNormalPaintData || {};
            const trigHeight = (textTheme.fontSize || 10) + (triggerPadH * 2);

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

            visibleGroupEntries.forEach((entry) => {
                const { group, gIdx, isPreviewGhost } = entry;
                const isGroupPreviewGhost = !!isPreviewGhost;
                const regionKey = `triggerRegion_${gIdx}`;
                const isSelected = !!this._selectedRegions?.[regionKey];
                const triggerRows = buildGroupRows(group, gIdx, isSelected, {
                    groupWidgetAlpha: isGroupPreviewGhost ? 0 : 1,
                    rowAnchorPrefix: "triggerRow",
                    firstRowAnchorTarget: (!this.properties.settingActive && !isSelected) ? regionKey : `lineBreak_${gIdx}`,
                    itemPressEnabled: true,
                    itemDragEnabled: true,
                    addPressEnabled: true
                });

                layoutMap[regionKey] = {
                    type: this.UI_TYPES.REGION, themeKey: "region", regionOffset: [mW, mH, mW, 0],
                    alpha: isGroupPreviewGhost ? 0 : 1,
                    state: isSelected ? "ON" : (isBypassed ? "DIS" : "OFF"),
                    anchor: { target: lastRegionKey, axis: "y", offset: mH },
                    hoverEffect: false,
                    onDragStart: (e, data) => startStackDrag(this, data, visibleGroupIndices.indexOf(gIdx), regionKey),
                    onDrag: (e, data) => {
                        triggerWall_groupDrag(this, data, visibleGroupIndices);
                        this.refreshNodeLayoutMap();
                    },
                    onDragEnd: () => triggerWall_groupDragEnd(this),
                    onPress: () => {
                        triggerWall_groupDragEnd(this);
                        triggerWall_toggleRegion(this, regionKey);
                    },
                    margin: [mW * 2, mH, mW * 2, mH],
                    width: "full", height: "auto", dir: "col", minWidth: 0,
                    [`headerRegion_${gIdx}`]: {
                        alpha: isGroupPreviewGhost ? 0 : 1,
                        hidden: !this.properties.settingActive && !isSelected,
                        dir: "row", width: "full", height: "auto", margin: [0, -mH, -mW, 0],
                        spacing: [sW, 0],
                        [`btnRename_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textsystem",
                            alpha: isGroupPreviewGhost ? 0 : 1,
                            width: "match", height: "fill", margin: [-sW, mH], spacing: [sW * 2, 0],
                            onPress: () => triggerWall_renameGroup(this, group, gIdx)
                        },
                        [`dropdownTriggerGroup_${gIdx}`]: {
                            type: this.UI_TYPES.DROPDOWN, themeKey: "button, t_textsmall", skipBackground: false,
                            alpha: isGroupPreviewGhost ? 0 : 1,
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
                            alpha: isGroupPreviewGhost ? 0 : 1,
                            icon: "close", width: "match", height: "fill", margin: [0, sH, sW, sH],
                            hidden: this.properties.triggerGroups.length <= 1,
                            onPress: () => triggerWall_removeGroup(this, gIdx)
                        }
                    },
                    [`lineBreak_${gIdx}`]: {
                        alpha: isGroupPreviewGhost ? 0 : 1,
                        hidden: !this.properties.settingActive && !isSelected,
                        type: this.UI_TYPES.LINEBREAK, margin: [-mW, 0, -mW, sH]
                    },
                    ...triggerRows
                };
                lastRegionKey = regionKey;
            });

            if (floatingGroupEntry && this._dragThresholdMet && this._dragMouse && this._dragOffset) {
                const floatingGroup = floatingGroupEntry.group || {};
                const floatingGIdx = floatingGroupEntry.gIdx;
                const floatingRegionKey = `floatingTriggerRegion_${floatingGIdx}`;
                const floatingIsSelected = !!this._selectedRegions?.[`triggerRegion_${floatingGIdx}`];
                const floatingRows = buildGroupRows(floatingGroup, floatingGIdx, floatingIsSelected, {
                    groupWidgetAlpha: 1,
                    rowAnchorPrefix: "floatingTriggerRow",
                    firstRowAnchorTarget: (!this.properties.settingActive && !floatingIsSelected) ? floatingRegionKey : `floatingLineBreak_${floatingGIdx}`,
                    itemPressEnabled: false,
                    itemDragEnabled: false,
                    addPressEnabled: false
                });

                layoutMap[floatingRegionKey] = {
                    type: this.UI_TYPES.REGION,
                    themeKey: "region",
                    regionOffset: [mW, mH, mW, 0],
                    state: floatingIsSelected ? "ON" : (isBypassed ? "DIS" : "OFF"),
                    ignoreLayout: true,
                    x: this._dragMouse[0] - this._dragOffset[0],
                    y: this._dragMouse[1] - this._dragOffset[1],
                    zIndex: 100,
                    pulseStates: true,
                    pulseFromState: "_DIS",
                    pulseToState: "_ON",
                    pulseSpeed: 0.005,
                    width: this.layout?.regions?.[`triggerRegion_${floatingGIdx}`]?.w || "full",
                    height: "auto",
                    dir: "col",
                    minWidth: 0,
                    [`floatingHeaderRegion_${floatingGIdx}`]: {
                        hidden: !this.properties.settingActive && !floatingIsSelected,
                        dir: "row", width: "full", height: "auto", margin: [0, -mH, -mW, 0],
                        spacing: [sW, 0],
                        [`floatingBtnRename_${floatingGIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textsystem",
                            width: "match", height: "fill", margin: [-sW, mH], spacing: [sW * 2, 0]
                        },
                        [`floatingDropdownTriggerGroup_${floatingGIdx}`]: {
                            type: this.UI_TYPES.DROPDOWN, themeKey: "button, t_textsmall", skipBackground: false,
                            indicator: true, canvasShield: true, mouseOver: false,
                            width: "full", height: "auto", spacing: [sW, 0],
                            padding: [pW, pH],
                            value: floatingGroup.title || "Trigger Group",
                            items: [...(this._cachedPresetData?.triggerGroups || this.properties.triggerGroups || [])]
                                .filter(g => !activeTitles.includes(g.title) || g.title === floatingGroup.title)
                                .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                                .map(g => g.title || "Trigger Group")
                        },
                        [`floatingBtnRemoveGroup_${floatingGIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsystem",
                            icon: "close", width: "match", height: "fill", margin: [0, sH, sW, sH],
                            hidden: this.properties.triggerGroups.length <= 1
                        }
                    },
                    [`floatingLineBreak_${floatingGIdx}`]: {
                        hidden: !this.properties.settingActive && !floatingIsSelected,
                        type: this.UI_TYPES.LINEBREAK, margin: [-mW, 0, -mW, sH]
                    },
                    ...floatingRows
                };
            }

            const cachedTriggerGroupItems = [...(this._cachedPresetData?.triggerGroups || [])]
                .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                .map(g => g.title || "Trigger Group");

            layoutMap.regionSelectTriggerGroup = {
                anchor: { target: lastRegionKey, axis: "y", offset: sH },
                dir: "row", width: "full", height: "auto", margin: [mW, 0, mW, mH],
                spacing: [sW, 0],
                dropdownTriggerGroup: {
                    type: this.UI_TYPES.DROPDOWN, themeKey: "button, t_textsmall", skipBackground: false,
                    indicator: true, canvasShield: true, mouseOver: false,
                    width: "full", height: "auto", spacing: [sW, 0],
                    padding: [pW, pH],
                    value: "Select Trigger Group",
                    items: cachedTriggerGroupItems,
                    state: isBypassed ? "DIS" : (cachedTriggerGroupItems.length > 0 ? "OFF" : "DIS"),
                    onChange: (v) => {
                        if (typeof triggerWall_addGroupTemplate === "function") triggerWall_addGroupTemplate(this, v);
                    }
                }
            };
            lastRegionKey = "regionSelectTriggerGroup";

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

        const baseHandleInteraction = nodeType.prototype.handleShieldInteraction;
        nodeType.prototype.handleShieldInteraction = function(type, data) {
            if (type === "click" && this._suppressClickAfterDrag) {
                this._suppressClickAfterDrag = false;
                return true;
            }
            if (type === "resize") {
                const parsedMinW = Number(this.properties?.minWidth);
                const safeMinW = Number.isFinite(parsedMinW) && parsedMinW > 0 ? parsedMinW : 200;
                if (!this.properties) this.properties = {};
                this.properties.minWidth = safeMinW;
                if (this.layout) {
                    this.layout.contentMinWidth = Math.max(this.layout.contentMinWidth || 0, safeMinW);
                }
            }
            if (baseHandleInteraction) return baseHandleInteraction.apply(this, arguments);
            return false;
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
