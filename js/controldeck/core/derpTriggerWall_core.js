/**
 * Path: ./js/fatha/nodes/derpTriggerWall_core.js
 * ROLE: Core logic and lifecycle separation for Derp Trigger Wall.
 */

import { showTriggerWall } from "../../fatha/bastas/bastaTriggerWall.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";

function refreshAndSync(node, syncOutputs = true, dirtyFull = false) {
    node.refreshNodeLayoutMap();
    if (syncOutputs && node.syncDerpOutputs) node.syncDerpOutputs();
    node.setDirtyCanvas(true, dirtyFull);
}

function cloneTriggerPresetData(data) {
    return data ? JSON.parse(JSON.stringify(data)) : null;
}

function setLoadedTriggerPreset(node, presetName, presetData) {
    const clonedPreset = cloneTriggerPresetData(presetData);
    node._cachedPresetData = clonedPreset;
    node.properties.lastSavedPreset = presetName || "";
    node.properties.loadedTriggerPreset = clonedPreset;
}

export function triggerWall_syncOutputs(node) {
    if (node.id === -1) return;

    // THE ASSASSIN EVASION: Rename the debouncer so fatha.js doesn't kill it during bypass
    if (node._twSyncDebouncer) clearTimeout(node._twSyncDebouncer);

    node.outputs = [{ name: "Triggers", type: "STRING", label: "Triggers" }];

    const baseId = String(node.id);
    const signalId = `${baseId}:0`;
    const nodeName = node.titleLabel || node.title || "Derp Trigger Wall";

    const isBypassed = node.mode === 4 || node.mode === 2 || node._derpSpoofedBypass;
    let allActiveStrings = [];

    // ONLY process triggers if NOT bypassed; otherwise, outContent remains empty string ""
    if (!isBypassed) {
        (node.properties.triggerGroups || []).filter(g => !g.hidden).forEach(group => {
            const groupTrigs = (group.triggers || []).filter(t => t.active && t.label && t.disabled !== true && !t.hidden).map(t => {
                const w = t.weight !== undefined ? t.weight : 1.0;
                return w === 1.0 ? t.label : `(${t.label}:${w.toFixed(2)})`;
            });
            if (groupTrigs.length > 0) allActiveStrings.push(groupTrigs.join(", "));
        });
    }
    const outContent = allActiveStrings.length > 0 ? allActiveStrings.join(", ") + ", " : "";
    const syncFingerprint = `${nodeName}__${outContent}`;

    // ZERO-INFERENCE GATING: Prevent redundant signal broadcast and server sync
    if (node._lastSyncedContent === syncFingerprint) return;
    node._lastSyncedContent = syncFingerprint;

    // THE BYPASS SIGNAL ENFORCER: Ensure root and index signals are identical and cleared on bypass
    const signalEntries = [baseId, signalId];
    signalEntries.forEach(sid => {
        window.xcpDerpSignals[sid] = {
            nodeId: sid,
            nodeName: sid.includes(":") ? `${nodeName} [Triggers]` : nodeName,
            nodeType: node.type || "Node",
            type: "STRING",
            value: outContent,
            upstreamIds: [],
            timestamp: Date.now()
        };
    });

    node._twSyncDebouncer = setTimeout(() => {
        // Broadcast the primary root signal to the Python server
        fetch("/xcp/update_signal", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: baseId, value: outContent })
        });
        // Also ensure the indexed port is updated for receivers specifically looking for :0
        fetch("/xcp/update_signal", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: signalId, value: outContent })
        });
    }, 100);

    // Notify Receivers immediately
    if (window.app?.graph?._nodes) {
        window.app.graph._nodes.forEach(n => {
            if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
        });
        window.app.canvas.setDirty(true, true);
    }

    // THE HEIST CLEANUP: Purge physical slots after the registry update
    setTimeout(() => {
        if (node.outputs && node.outputs.length > 0) {
            node.outputs.forEach(o => { if (o.links) o.links = null; });
            node.outputs = [];
        }
    }, 1);
}

export function triggerWall_onNodeCreated(node, originalCallback) {
    if (originalCallback) originalCallback.apply(node);
    node._derpClickOutside = (e) => {
        if (node.interactionShield && !node.interactionShield.contains(e.target)) {
            if (node._selectedRegions && Object.keys(node._selectedRegions).length > 0) {
                node._selectedRegions = {};
                node.refreshNodeLayoutMap();
                node.setDirtyCanvas(true);
            }
        }
    };
    window.addEventListener("pointerdown", node._derpClickOutside, true);

    node.properties.isWirelessTransmitter = true;
    node.outputs = [];

    node.titleLabel = "Derp Trigger Wall";
    node.properties.titleLabel = "Derp Trigger Wall";
    node.properties.outputName = "Triggers";
    node.properties.lastSavedPreset = node.properties.lastSavedPreset || "";
    node.properties.loadedTriggerPreset = node.properties.loadedTriggerPreset || null;
    const initialGroupId = `grp_${Date.now()}`;
    node.properties.triggerGroups = [{
        id: initialGroupId,
        title: "Trigger Group 1",
        isExclusive: false,
        triggers: [{ id: `trig_${Date.now()}`, active: true, weight: 1.0 }]
    }];
    node.properties.triggers = []; // THE COLLISION FIX: Clear legacy array
    node.properties.showWeight = false;
    node.properties.toggleAddAlways = true;
    node.properties.drawSettingBtn = true;
    node.properties.settingActive = false;
    node._lastSettingActive = false;
    node.properties.exclusiveMode = false;
    node.properties.autoWidth = false;
    node.properties.autoHeight = true;
    node.properties.minWidth = 200;
    node.properties.optimizeHoverDirty = true;
    node.properties.optimizeHoverNoSync = true;
    node.properties.nodeSize = [300, 150];
    node.size = [300, 150];

    node.refreshNodeLayoutMap();
    node.refreshDerpTriggerWallSysMap();
    if (typeof triggerWall_updatePresetList === "function") triggerWall_updatePresetList(node);

    setTimeout(() => {
        if (typeof node.syncDerpOutputs === "function" && node.id !== -1) {
            node.syncDerpOutputs();
        }
    }, 1);
}

export function triggerWall_onConfigure(node, info, originalCallback) {
    if (originalCallback) originalCallback.apply(node, [info]);

    if (node.outputs && node.outputs.length > 0) {
        node.outputs.forEach(o => { if (o.links) o.links = null; });
        node.outputs = [];
    }

    if (info && info.properties) {
        node._lastDerpW = null; // Force frame-one rebuild in onDrawForeground
        node._cachedPresetData = cloneTriggerPresetData(node.properties.loadedTriggerPreset);
        node.refreshNodeLayoutMap();
        node.refreshDerpTriggerWallSysMap();
        if (!node._cachedPresetData && node.properties.lastSavedPreset) {
            fetch(`/xcp/load/triggerWall?name=${encodeURIComponent(node.properties.lastSavedPreset)}`)
                .then(r => { if (!r.ok) return null; return r.json(); })
                .then(json => {
                    if (json && json.data) {
                        setLoadedTriggerPreset(node, node.properties.lastSavedPreset, json.data);
                        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                    }
                });
        }
    }
    if (node.syncDerpOutputs) node.syncDerpOutputs();
}

export function triggerWall_onDrawForeground(node, ctx, originalCallback) {
    if (node._lastSettingActive !== node.properties.settingActive) {
        node._lastSettingActive = node.properties.settingActive;
        node.refreshNodeLayoutMap();
    }

    if (node.layout) {
        node.layout.contentMinWidth = node.properties.minWidth || 200;
    }

    const isBypassed = node.mode === 4 || node.mode === 2 || node._derpSpoofedBypass;
    if (node._lastBypassState !== isBypassed) {
        if (node.syncDerpOutputs) node.syncDerpOutputs();
        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
        node._lastBypassState = isBypassed;
        node.requestDerpSync();
    }

    // THE REFLOW FIX: Only rebuild layout map if the physical width actually changed
    const currentW = Math.round(node.size[0]);
    if (node._lastDerpW !== currentW) {
        node._lastDerpW = currentW;
        node.refreshNodeLayoutMap();
    }

    if (originalCallback) originalCallback.apply(node, [ctx]);

    if (node.flags?.collapsed) return;

    // THE TITLE REFRESH FIX: Update wireless registry if the title label changed
    if (node._lastTitleLabel !== node.titleLabel) {
        node._lastTitleLabel = node.titleLabel;
        if (node.syncDerpOutputs) node.syncDerpOutputs();
    }
}

export function triggerWall_onRemoved(node, originalCallback) {
    if (originalCallback) originalCallback.apply(node);
    window.removeEventListener("pointerdown", node._derpClickOutside, true);
}

export function triggerWall_onDeselected(node) {
    if ((node._selectedRegions && Object.keys(node._selectedRegions).length > 0) || node._activeModalItemKey) {
        node._selectedRegions = {};
        node._activeModalItemKey = null; // THE CLEANUP FIX: Clear modal theme lock on deselection
        node.refreshNodeLayoutMap();
        node.setDirtyCanvas(true);
    }
}

export async function triggerWall_onSavePreset(node, manualName = null) {
    const name = manualName || prompt("Enter preset name:", node.properties.lastSavedPreset || "my_triggers");
    if (!name) return;

    node.properties.triggerGroups.forEach(group => {
        if (!group.id) group.id = `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        if (group.triggers) {
            group.triggers.forEach(t => {
                if (!t.id) t.id = `trig_${Math.random().toString(16).slice(2, 8)}`;
            });
        }
    });

    const presetData = {
        fileType: "xcp_derp_trigger_preset",
        version: "1.0.0",
        timestamp: Date.now(),
        triggerGroups: node.properties.triggerGroups.filter(g => !g.hidden).map(group => ({
            id: group.id,
            title: group.title,
            isExclusive: !!group.isExclusive,
            triggers: group.triggers.filter(t => !t.hidden).map(t => ({
                id: t.id,
                label: t.label,
                weight: t.weight,
                active: !!t.active
            }))
        }))
    };

    try {
        const response = await fetch("/xcp/save/triggerWall", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, data: presetData })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        if (result.success) {
            setLoadedTriggerPreset(node, name, presetData);
            if (typeof triggerWall_updatePresetList === "function") triggerWall_updatePresetList(node);
            console.log(`[xcpDerp] Preset '${name}' saved successfully.`);
        } else {
            throw new Error(result.error || "Unknown error");
        }
    } catch (e) {
        console.error("[xcpDerp] Failed to save preset:", e);
        alert("Save failed: " + e.message);
    }
}

export async function triggerWall_updatePresetList(node) {
    try {
        const res = await fetch("/xcp/list/triggerWall");
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const json = await res.json();
        node._presetItems = json.items || [];
        node._sortedPresetItemsKey = null;
        node._layoutMapHash = null;
        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
    } catch (e) {
        console.error("[xcpDerp] Failed to fetch trigger presets:", e);
    }
}

export async function triggerWall_onLoadPreset(node, presetName) {
    if (!presetName) return;
    try {
        const res = await fetch(`/xcp/load/triggerWall?name=${encodeURIComponent(presetName)}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const json = await res.json();
        if (json.data && (json.data.fileType === "xcp_derp_trigger_preset" || json.data.triggerGroups)) {
            setLoadedTriggerPreset(node, presetName, json.data);

            node._layoutMapHash = null;
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            node.setDirtyCanvas(true, true);
        } else if (json.error) {
            console.error("[xcpDerp] Server error loading preset:", json.error);
        }
    } catch (e) {
        console.error("[xcpDerp] Failed to load preset:", e);
    }
}

export function triggerWall_handleShieldInteraction(node, type, data, origHandle) {
    const handled = origHandle ? origHandle.apply(node, [type, data]) : false;
    if (type === "click" && !handled) {
        if (node._selectedRegions && Object.keys(node._selectedRegions).length > 0) {
            node._selectedRegions = {};
            node.refreshNodeLayoutMap();
            node.setDirtyCanvas(true);
        }
    }
    return handled;
}

export function triggerWall_onThemeUpdate(node, config) {
    node.handleThemeUpdate(config);
    node.refreshNodeLayoutMap();
    if (node.refreshDerpTriggerWallSysMap) node.refreshDerpTriggerWallSysMap();
}

export function triggerWall_applyPalette(node) {
    if (window.xcpDerpThemeConfig) node.handleThemeUpdate(window.xcpDerpThemeConfig);
    node.refreshNodeLayoutMap();
    if (node.refreshDerpTriggerWallSysMap) node.refreshDerpTriggerWallSysMap();
}

export function triggerWall_addGroup(node) {
    node.properties.triggerGroups.push({
        id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        title: `Trigger Group ${node.properties.triggerGroups.length + 1}`,
        triggers: [{ id: `trig_${Math.random().toString(16).slice(2, 8)}`, active: true, weight: 1.0 }],
        isExclusive: false
    });
    node.refreshNodeLayoutMap();
    if (node.syncDerpOutputs) node.syncDerpOutputs();
    node.setDirtyCanvas(true);
}

export function triggerWall_itemDragStart(node, e, data, gIdx, tIdx) {
    const key = `triggerItem_${gIdx}_${tIdx}`;
    const state = node._trigState?.[key];
    if (state && data.localX >= state.g.x && data.localX <= (state.g.x + state.g.w)) {
        return;
    }
    const reg = node.layout.regions[key];
    if (!reg) return;
    node._dragTrig = { key, gIdx, tIdx };
    node._dragOffset = [data.localX - reg.x, data.localY - reg.y];
    node._dragMouse = [data.localX, data.localY];
}

export function triggerWall_itemDrag(node, e, data) {
    if (!node._dragTrig) return;
    node._dragMouse = [data.localX, data.localY];
    const mouseX = data.localX;
    const mouseY = data.localY;
    const group = node.properties.triggerGroups[node._dragTrig.gIdx];
    if (!group || !group.triggers || group.triggers.length === 0) return;

    const regions = node.layout?.regions;
    if (!regions) return;

    const stableRegs = [];
    for (let i = 0; i < group.triggers.length; i++) {
        if (i === node._dragTrig.tIdx) continue;
        const r = regions[`triggerItem_${node._dragTrig.gIdx}_${i}`];
        if (r) stableRegs.push(r);
    }

    if (stableRegs.length === 0) {
        if (node._dropPreviewIdx !== 0) {
            node._dropPreviewIdx = 0;
            node.refreshNodeLayoutMap();
        }
        node.setDirtyCanvas(true);
        return;
    }

    // Sort once, then group by Y in a single pass.
    stableRegs.sort((a, b) => (a.y - b.y) || (a.x - b.x));

    const rows = [];
    let currentRow = null;
    const rowThreshold = 5;
    for (let i = 0; i < stableRegs.length; i++) {
        const reg = stableRegs[i];
        if (!currentRow || Math.abs(currentRow.y - reg.y) >= rowThreshold) {
            currentRow = { y: reg.y, h: reg.h, items: [reg] };
            rows.push(currentRow);
        } else {
            currentRow.items.push(reg);
            if (reg.h > currentRow.h) currentRow.h = reg.h;
        }
    }

    let targetIdx = 0, foundRow = -1;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i], next = rows[i+1];
        const splitY = next ? (r.y + r.h + next.y) / 2 : Infinity;
        if (mouseY < splitY) { foundRow = i; break; }
        targetIdx += r.items.length;
    }

    if (foundRow !== -1) {
        const rowItems = rows[foundRow].items;
        for (let i = 0; i < rowItems.length; i++) {
            const reg = rowItems[i];
            if (mouseX > (reg.x + (reg.w / 2))) targetIdx++;
        }
    }

    if (node._dropPreviewIdx !== targetIdx) {
        node._dropPreviewIdx = targetIdx;
        node.refreshNodeLayoutMap();
    }
    node.setDirtyCanvas(true);
}

export function triggerWall_itemDragEnd(node, e, data) {
    const drag = node._dragTrig;
    const finalTarget = node._dropPreviewIdx;
    node._dragTrig = null;
    node._dragMouse = null;
    node._dragOffset = null;
    node._dropPreviewIdx = undefined;

    if (!drag) return;

    if (finalTarget !== undefined && finalTarget !== drag.tIdx) {
        const group = node.properties.triggerGroups[drag.gIdx];
        const [moved] = group.triggers.splice(drag.tIdx, 1);
        group.triggers.splice(finalTarget, 0, moved);
        refreshAndSync(node, true, false);
    } else {
        refreshAndSync(node, false, false);
    }
}

export function triggerWall_itemPress(node, e, data, gIdx, tIdx, group, isBypassed) {
    const item = { idx: tIdx, trig: group.triggers[tIdx] };
    if (isBypassed || item.trig.disabled === true) return;
    const key = `triggerItem_${gIdx}_${item.idx}`;
    if (data.hitArea === "text") {
        node._activeModalItemKey = key;
        node._hoveredRegionKey = null;
        refreshAndSync(node, false, true);
        showTriggerWall(node, key);
    } else if (data.hitArea === "glyph") {
        item.trig.active = !item.trig.active;
        if (group.isExclusive && item.trig.active) {
            group.triggers.forEach((t, i) => { if (i !== item.idx) t.active = false; });
        }
        refreshAndSync(node, true, true);
    }
}

export function triggerWall_addTrigger(node, group) {
    if (group.isExclusive) {
        group.triggers.forEach(t => t.active = false);
    }
    group.triggers.push({ id: `trig_${Math.random().toString(16).slice(2, 8)}`, active: true, label: "", weight: 1.0 });
    refreshAndSync(node, true, false);
}

export function triggerWall_toggleRegion(node, regionKey) {
    if (!node._selectedRegions) node._selectedRegions = {};
    const wasSelected = node._selectedRegions[regionKey];
    node._selectedRegions = {};
    if (!wasSelected) node._selectedRegions[regionKey] = true;
    node.refreshNodeLayoutMap();
}

export function triggerWall_renameGroup(node, group, gIdx) {
    const currentTitle = group.title || "Trigger Group";
    showBastaFileHandler(node, "none", `btnRename_${gIdx}`, {
        title: "Rename Trigger Group",
        confirm: "Rename",
        originalName: currentTitle,
        mode: "rename",
        message: "Enter new name for trigger group:",
        onConfirm: async (newName) => {
            group.title = newName;
            refreshAndSync(node, true, false);
        }
    });
}

export function triggerWall_changeGroupTemplate(node, group, v) {
    const library = node._cachedPresetData?.triggerGroups || node.properties.triggerGroups || [];
    const template = library.find(tg => tg.title === v);
    if (template) {
        const cleanData = JSON.parse(JSON.stringify(template));
        Object.keys(group).forEach(key => delete group[key]);
        Object.assign(group, cleanData);
    } else {
        group.title = v;
    }
    node._layoutMapHash = null;
    refreshAndSync(node, true, true);
}

export function triggerWall_addGroupTemplate(node, v) {
    const library = node._cachedPresetData?.triggerGroups || [];
    const template = library.find(tg => tg.title === v);
    if (!template) return;

    const cleanData = JSON.parse(JSON.stringify(template));
    if (!Array.isArray(node.properties.triggerGroups)) node.properties.triggerGroups = [];
    node.properties.triggerGroups.push(cleanData);
    node._layoutMapHash = null;
    refreshAndSync(node, true, true);
}

export function triggerWall_removeGroup(node, gIdx) {
    const group = node.properties.triggerGroups[gIdx];
    if (group) group.hidden = true;
    refreshAndSync(node, true, false);
}

export function triggerWall_toggleExclusive(node, selectedGroup, anySelected, isBypassed) {
    if (!anySelected || isBypassed || !selectedGroup) return;
    selectedGroup.isExclusive = !selectedGroup.isExclusive;
    if (selectedGroup.isExclusive) {
        let first = true;
        selectedGroup.triggers.forEach(t => { if (t.active) { if (first) first = false; else t.active = false; } });
    }
    refreshAndSync(node, true, false);
}

export function triggerWall_toggleShowWeight(node) {
    node.properties.showWeight = !node.properties.showWeight;
    node._layoutMapHash = null; // Force layout refresh for state change
    node.refreshNodeLayoutMap();
    if (node.refreshDerpTriggerWallSysMap) node.refreshDerpTriggerWallSysMap();
    node.requestDerpSync();
}

export function triggerWall_toggleAddAlways(node) {
    node.properties.toggleAddAlways = !node.properties.toggleAddAlways;
    node._layoutMapHash = null; // Force layout refresh for state change
    node.refreshNodeLayoutMap();
    if (node.refreshDerpTriggerWallSysMap) node.refreshDerpTriggerWallSysMap();
    node.requestDerpSync();
}

export function triggerWall_isGroupDuplicate(node) {
    const groups = node.properties.triggerGroups || [];
    const selectedIdx = groups.findIndex((g, i) => !g.hidden && node._selectedRegions?.[`triggerRegion_${i}`]);
    if (selectedIdx === -1) return true;
    const selectedGroup = groups[selectedIdx];
    const cached = node._cachedPresetData?.triggerGroups || [];
    return cached.some(g => g.title === selectedGroup.title);
}

export function triggerWall_onDerpSysPanelOpen(node, panel) {
    if (node.sysLayoutMap) panel.setLayoutMap(node.sysLayoutMap);
}

export function triggerWall_onResize(node, size) {
    const minW = node.properties.minWidth || 200;
    const safeW = Math.max(minW, size[0] || minW);
    const safeH = Math.max(50, size[1] || 150);
    node.size = [safeW, safeH];
    node.properties.nodeSize = [safeW, safeH];
    // Avoid rebuilding twice during drag-resize; onDrawForeground handles width-delta rebuild.
    node.requestDerpSync();
}
