/**
 * Path: ./js/fatha/nodes/derpTriggerWall_core.js
 * ROLE: Core logic and lifecycle separation for Derp Trigger Wall.
 */

import { showTriggerWall } from "../../fatha/bastas/bastaTriggerWall.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { settleDerpSizeBeforeDraw } from "../../fatha/core/fathaHandler.js";
import { isLinearDeckGroup, isNodeDocked } from "../../fatha/core/masterDockEngine.js";

// Sync structural-only data from runtime cache to workflow-serializable properties
function syncTriggerGroupToProperties(node) {
    if (!node.properties) return;
    const full = node._triggerGroupData || [];
    node.properties.triggerGroups = full
        .filter(g => !g.hidden)
        .map(g => ({ id: g.id, title: g.title, isExclusive: !!g.isExclusive, triggers: (g.triggers || []).filter(t => !t.hidden).map(t => ({ id: t.id, label: t.label, weight: t.weight, active: !!t.active })) }));
}

// Ensure runtime cache exists, seeded from properties if needed
export function ensureTriggerGroupData(node, force = false) {
    if (force || !Array.isArray(node._triggerGroupData)) {
        node._triggerGroupData = (node.properties.triggerGroups || []).map(g => ({ ...g, triggers: (g.triggers || []).map(t => ({ ...t, active: t.active !== false, weight: t.weight ?? 1.0 })) }));
    }
    return node._triggerGroupData;
}

function applyDeckProfileToData(node, deckGroups) {
    if (!Array.isArray(deckGroups) || !Array.isArray(node._triggerGroupData)) return;
    const deckMap = new Map(deckGroups.map(g => [g.id, g]));
    node._triggerGroupData.forEach(group => {
        const deck = deckMap.get(group.id);
        if (deck && Array.isArray(deck.triggers)) {
            const triggerMap = new Map(deck.triggers.map(t => [t.id, t]));
            (group.triggers || []).forEach(trig => {
                const dt = triggerMap.get(trig.id);
                if (dt) { trig.weight = dt.weight; trig.active = !!dt.active; }
            });
        }
    });
}

function refreshAndSync(node, syncOutputs = true, dirtyFull = false, settleOptions = {}) {
    syncTriggerGroupToProperties(node);
    node.refreshNodeLayoutMap();
    if (typeof settleDerpSizeBeforeDraw === "function") settleDerpSizeBeforeDraw(node, settleOptions);
    if (syncOutputs && node.syncDerpOutputs) node.syncDerpOutputs();
    node.setDirtyCanvas(true, dirtyFull);
    if (window.app?.graph?.change) window.app.graph.change();
}

function openTriggerWallModal(node, key) {
    node._activeModalItemKey = key;
    node._hoveredRegionKey = null;
    refreshAndSync(node, false, true);
    showTriggerWall(node, key);
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
        (node._triggerGroupData || node.properties.triggerGroups || []).filter(g => !g.hidden).forEach(group => {
            const groupTrigs = (group.triggers || []).filter(t => t.active && t.label && t.disabled !== true && !t.hidden).map(t => {
                const w = t.weight !== undefined ? t.weight : 1.0;
                return w === 1.0 ? t.label : `(${t.label}:${w.toFixed(2)})`;
            });
            if (groupTrigs.length > 0) allActiveStrings.push(groupTrigs.join(", "));
        });
    }
    const outContent = allActiveStrings.length > 0 ? allActiveStrings.join(", ") + ", " : "";
    const syncFingerprint = `${isBypassed ? "bypass" : "live"}__${nodeName}__${outContent}`;

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
        // Avoid forcing a full foreground/background redraw on every signal update.
        // This path can fire frequently during interaction and causes frame-time spikes.
        window.app.canvas.setDirty(true, false);
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
    node.properties.isWirelessTransmitter = true;
    node.properties.skipGenericWirelessHeartbeat = true;
    node.outputs = [];

    node.titleLabel = "Derp Trigger Wall";
    node.properties.titleLabel = "Derp Trigger Wall";
    node.properties.outputName = "Triggers";
    node.properties.lastSavedPreset = node.properties.lastSavedPreset || "";
    node.properties.loadedTriggerPreset = node.properties.loadedTriggerPreset || null;
    const initialGroupId = `grp_${Date.now()}`;
    node._triggerGroupData = [{
        id: initialGroupId,
        title: "Trigger Group 1",
        isExclusive: false,
        triggers: [{ id: `trig_${Date.now()}`, active: true, weight: 1.0 }]
    }];
    syncTriggerGroupToProperties(node);
    node.properties.triggers = []; // THE COLLISION FIX: Clear legacy array
    node.properties.showWeight = true;
    node.properties.toggleAddAlways = true;
    node.properties.drawSettingBtn = true;
    node.properties.settingActive = false;
    node._lastSettingActive = false;
    node.properties.exclusiveMode = false;
    node.properties.autoWidth = false;
    node.properties.autoHeight = true;
    node.properties.useCollapsedTotalHeight = true;
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
        if (node.properties.showWeight === undefined) node.properties.showWeight = true;
        node._lastDerpW = null; // Force frame-one rebuild in onDrawForeground
        node._lastSyncedContent = null;
        ensureTriggerGroupData(node, true); // force re-seed from deserialized properties
        // Load deck profile to restore weights/active states
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

    setTimeout(() => {
        if (node.id === -1 || !node.syncDerpOutputs) return;
        node._lastSyncedContent = null;
        node.syncDerpOutputs();
    }, 64);
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
        node._lastSyncedContent = null;
        if (node.syncDerpOutputs) node.syncDerpOutputs();
        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
        node._lastBypassState = isBypassed;
        node.requestDerpSync();
    }

    // THE REFLOW FIX: Only rebuild layout map if the physical width actually changed
    const currentW = Math.round(node.size[0]);
    const widthBucket = Math.round(currentW / 10) * 10;
    if (node._lastDerpWBucket !== widthBucket) {
        node._lastDerpW = currentW;
        node._lastDerpWBucket = widthBucket;
        const graph = node.graph || window.app?.graph || null;
        const suppressDockedWidthRefreshSync = !!(graph && isNodeDocked(node, graph) && isLinearDeckGroup(node, graph, "vertical"));
        if (suppressDockedWidthRefreshSync) node._suppressDockedWidthRefreshSync = true;
        try {
            node.refreshNodeLayoutMap();
        } finally {
            if (suppressDockedWidthRefreshSync) node._suppressDockedWidthRefreshSync = false;
        }
    }

    if (originalCallback) originalCallback.apply(node, [ctx]);

    if (node.flags?.collapsed) return;

    // THE TITLE REFRESH FIX: Update wireless registry if the title label changed
    if (node._lastTitleLabel !== node.titleLabel) {
        node._lastTitleLabel = node.titleLabel;
        if (node.syncDerpOutputs) node.syncDerpOutputs();
    }
}

export function triggerWall_onDeselected(node) {
    const suppressRegionDeselect = Date.now() < (node._suppressRegionDeselectUntil || 0);
    if ((node._selectedRegions && Object.keys(node._selectedRegions).length > 0) || node._activeModalItemKey) {
        if (!suppressRegionDeselect) node._selectedRegions = {};
        node._activeModalItemKey = null; // THE CLEANUP FIX: Clear modal theme lock on deselection
        node.refreshNodeLayoutMap();
        node.setDirtyCanvas(true);
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

export async function triggerWall_updateDeckPresetList(node) {
    try {
        const res = await fetch("/xcp/list/triggerWallDeck");
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const json = await res.json();
        node._deckPresetItems = json.items || [];
        node._sortedDeckPresetItemsKey = null;
        node._layoutMapHash = null;
        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
    } catch (e) {
        console.error("[xcpDerp] Failed to fetch deck presets:", e);
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

export async function triggerWall_onLoadDeckProfile(node, presetName) {
    if (!presetName) return;
    try {
        const res = await fetch(`/xcp/load/triggerWallDeck?name=${encodeURIComponent(presetName)}`);
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const json = await res.json();
        if (json?.data?.triggerGroups) {
            ensureTriggerGroupData(node);
            node._triggerGroupData = json.data.triggerGroups;
            syncTriggerGroupToProperties(node);
            node.properties.lastSavedDeckPreset = presetName;
            node._layoutMapHash = null;
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.syncDerpOutputs) node.syncDerpOutputs();
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        }
    } catch (e) {
        console.warn("[xcpDerp] Failed to load deck profile:", e);
    }
}

export function triggerWall_onThemeUpdate(node, config) {
    node.handleThemeUpdate(config);
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap();
    if (node.refreshDerpTriggerWallSysMap) node.refreshDerpTriggerWallSysMap();
    node.requestDerpSync();
}

export function triggerWall_applyPalette(node) {
    if (window.xcpDerpThemeConfig) node.handleThemeUpdate(window.xcpDerpThemeConfig);
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap();
    if (node.refreshDerpTriggerWallSysMap) node.refreshDerpTriggerWallSysMap();
    node.requestDerpSync();
}

export function triggerWall_addGroup(node) {
    ensureTriggerGroupData(node);
    node._triggerGroupData.push({
        id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        title: `Trigger Group ${node._triggerGroupData.length + 1}`,
        triggers: [{ id: `trig_${Math.random().toString(16).slice(2, 8)}`, active: true, weight: 1.0 }],
        isExclusive: false
    });
    refreshAndSync(node, true, false);
}

export function triggerWall_groupDrag(node, data, visibleGroupIndices = []) {
    if (!node._dragTrig || node._dragTrig.index === undefined) return;

    if (!node._dragThresholdMet) {
        const driftX = Math.abs(data.localX - node._dragMouse[0]);
        const driftY = Math.abs(data.localY - node._dragMouse[1]);
        if (driftX > 2.5 || driftY > 2.5) {
            endStackDrag(node, "");
        }
        return;
    }

    node._dragMouse = [data.localX, data.localY];
    const mouseY = data.localY;
    const draggedVisibleIdx = node._dragTrig.index;
    const stableRegs = [];

    visibleGroupIndices.forEach((gIdx, visibleIdx) => {
        if (visibleIdx === draggedVisibleIdx) return;
        const reg = node.layout?.regions?.[`triggerRegion_${gIdx}`];
        if (reg) stableRegs.push(reg);
    });

    stableRegs.sort((a, b) => a.y - b.y);

    let targetIdx = 0;
    for (let i = 0; i < stableRegs.length; i++) {
        const reg = stableRegs[i];
        const thresholdY = reg.y + (reg.h / 2);
        if (mouseY > thresholdY) targetIdx = i + 1;
        else break;
    }

    if (stableRegs.length > 0) {
        const lastReg = stableRegs[stableRegs.length - 1];
        const tailThresholdY = lastReg.y + (lastReg.h * 0.5);
        const belowLastRowY = lastReg.y + lastReg.h;
        if (mouseY >= tailThresholdY || mouseY >= belowLastRowY) {
            targetIdx = stableRegs.length;
        }
    }

    if (node._dropPreviewIdx !== targetIdx) {
        node._dropPreviewIdx = targetIdx;
        node.refreshNodeLayoutMap();
    }
    node.setDirtyCanvas(true);
}

export function triggerWall_reorderGroups(node, fromVisibleIdx, toVisibleIdx) {
    ensureTriggerGroupData(node);
    const allGroups = node._triggerGroupData;
    const visibleActualIndices = allGroups.reduce((acc, group, actualIdx) => {
        if (!group?.hidden) acc.push(actualIdx);
        return acc;
    }, []);

    if (
        fromVisibleIdx === toVisibleIdx ||
        fromVisibleIdx < 0 ||
        toVisibleIdx < 0 ||
        fromVisibleIdx >= visibleActualIndices.length ||
        toVisibleIdx >= visibleActualIndices.length
    ) return;

    const selectedActualIdx = visibleActualIndices.find((actualIdx) => node._selectedRegions?.[`triggerRegion_${actualIdx}`]);
    const selectedGroupId = selectedActualIdx !== undefined ? allGroups[selectedActualIdx]?.id : null;

    const visibleGroups = visibleActualIndices.map((actualIdx) => allGroups[actualIdx]);
    const [moved] = visibleGroups.splice(fromVisibleIdx, 1);
    visibleGroups.splice(toVisibleIdx, 0, moved);

    let visibleCursor = 0;
    node._triggerGroupData = allGroups.map((group) => {
        if (group?.hidden) return group;
        return visibleGroups[visibleCursor++];
    });

    if (selectedGroupId) {
        node._selectedRegions = {};
        const newSelectedIdx = node._triggerGroupData.findIndex((group) => !group?.hidden && group?.id === selectedGroupId);
        if (newSelectedIdx !== -1) node._selectedRegions[`triggerRegion_${newSelectedIdx}`] = true;
    }

    node._layoutMapHash = null;
    refreshAndSync(node, true, true);
}

export function triggerWall_groupDragEnd(node) {
    const fromVisibleIdx = node._dragTrig?.index;
    const toVisibleIdx = node._dropPreviewIdx;
    endStackDrag(node, "");
    node._floatingPreviewSnapshot = null;

    if (fromVisibleIdx !== undefined && toVisibleIdx !== undefined && fromVisibleIdx !== toVisibleIdx) {
        triggerWall_reorderGroups(node, fromVisibleIdx, toVisibleIdx);
    }
}

export function triggerWall_itemDragStart(node, e, data, gIdx, tIdx) {
    const key = `triggerItem_${gIdx}_${tIdx}`;
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
    const group = node._triggerGroupData[node._dragTrig.gIdx];
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
    node._floatingPreviewSnapshot = null;

    if (!drag) return;

    if (finalTarget !== undefined && finalTarget !== drag.tIdx) {
        const group = node._triggerGroupData[drag.gIdx];
        const [moved] = group.triggers.splice(drag.tIdx, 1);
        group.triggers.splice(finalTarget, 0, moved);
        refreshAndSync(node, true, false);
    } else {
        refreshAndSync(node, false, false);
    }
}

export function triggerWall_itemPress(node, e, data, gIdx, tIdx, group, isBypassed) {
    endStackDrag(node, "");
    const item = { idx: tIdx, trig: group.triggers[tIdx] };
    if (isBypassed || item.trig.disabled === true) return;
    const key = `triggerItem_${gIdx}_${item.idx}`;
    if (e?.shiftKey) {
        openTriggerWallModal(node, key);
        return;
    }
    item.trig.active = !item.trig.active;
    node._triggerWallCacheSuspendUntil = performance.now() + 220;
    if (group.isExclusive && item.trig.active) {
        group.triggers.forEach((t, i) => { if (i !== item.idx) t.active = false; });
    }
    refreshAndSync(node, true, true);
}

export function triggerWall_itemContextMenu(node, e, gIdx, tIdx, group, isBypassed) {
    endStackDrag(node, "");
    const trig = group?.triggers?.[tIdx];
    if (isBypassed || trig?.disabled === true) return false;
    openTriggerWallModal(node, `triggerItem_${gIdx}_${tIdx}`);
    return false;
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
    refreshAndSync(node, false, false);
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
            triggerWall_autosave(node);
        }
    });
}

export function triggerWall_changeGroupTemplate(node, group, v) {
    const library = node._cachedPresetData?.triggerGroups || node._triggerGroupData || [];
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
    triggerWall_autosave(node);
}

export function triggerWall_addGroupTemplate(node, v) {
    const library = node._cachedPresetData?.triggerGroups || [];
    const template = library.find(tg => tg.title === v);
    if (!template) return;

    const cleanData = JSON.parse(JSON.stringify(template));
    ensureTriggerGroupData(node);
    node._triggerGroupData.push(cleanData);
    node._layoutMapHash = null;
    refreshAndSync(node, true, true);
    triggerWall_autosave(node);
}

export function triggerWall_removeGroup(node, gIdx) {
    ensureTriggerGroupData(node);
    const group = node._triggerGroupData[gIdx];
    if (group) group.hidden = true;
    refreshAndSync(node, true, false, { forceAutoHeight: true });
    triggerWall_autosave(node);
}

export function triggerWall_confirmRemoveGroup(node, gIdx) {
    ensureTriggerGroupData(node);
    const group = node._triggerGroupData?.[gIdx];
    if (!group) return;
    const groupTitle = String(group.title || `Trigger Group ${gIdx + 1}`);
    const removeMessage = `Remove '${groupTitle}' from the wall?`;

    showBastaFileHandler(node, "none", `btnRemoveGroup_${gIdx}`, {
        title: "Remove Trigger Group",
        mode: "delete",
        message: removeMessage,
        confirm: "Remove",
        properties: {
            messageThemeKey: "t_textNormal",
            showMessageLinebreak: true,
            layoutMapOverride: {
                contentRegion: {
                    infoRegion: {
                        labelMain: {
                            text: removeMessage,
                            themeKey: "t_textNormal"
                        },
                        messageBreak: {
                            hidden: false
                        }
                    }
                }
            }
        },
        onConfirm: async () => {
            triggerWall_removeGroup(node, gIdx);
            showBastaMessage(node, `Removed '${groupTitle}'.`, 1800, { width: 260 }, `btnRemoveGroup_${gIdx}`, false, "success");
            node.requestDerpSync();
        }
    });
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
    const groups = node._triggerGroupData || [];
    const selectedIdx = groups.findIndex((g, i) => !g.hidden && node._selectedRegions?.[`triggerRegion_${i}`]);
    if (selectedIdx === -1) return true;
    const selectedGroup = groups[selectedIdx];
    const cached = node._cachedPresetData?.triggerGroups || [];
    return cached.some(g => g.title === selectedGroup.title);
}

function getTriggerGroupTextSignature(group) {
    return JSON.stringify(
        (group?.triggers || [])
            .filter(t => !t.hidden)
            .map(t => String(t.label || ""))
    );
}

export function triggerWall_hasProfileGroup(node, group) {
    const cached = node._cachedPresetData?.triggerGroups || [];
    return cached.some(g => g.title === group?.title);
}

export function triggerWall_hasGroupTextChanges(node, group) {
    const cached = node._cachedPresetData?.triggerGroups || [];
    const savedGroup = cached.find(g => g.title === group?.title);
    if (!savedGroup) return false;
    return getTriggerGroupTextSignature(savedGroup) !== getTriggerGroupTextSignature(group);
}

export async function triggerWall_addSelectedGroupToProfile(node) {
    const presetName = node.properties?.lastSavedPreset || _triggerWall_autosaveKey(node);
    if (!presetName) return;

    const groups = node._triggerGroupData || [];
    const selectedIdx = groups.findIndex((g, i) => !g.hidden && node._selectedRegions?.[`triggerRegion_${i}`]);
    if (selectedIdx === -1) return;

    const selectedGroup = groups[selectedIdx];
    const presetData = cloneTriggerPresetData(node._cachedPresetData) || {
        fileType: "xcp_derp_trigger_preset",
        version: "1.0.0",
        timestamp: Date.now(),
        triggerGroups: []
    };

    if (!Array.isArray(presetData.triggerGroups)) presetData.triggerGroups = [];
    if (presetData.triggerGroups.some(g => g.title === selectedGroup.title)) return;

    const cleanGroup = {
        id: selectedGroup.id || `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        title: selectedGroup.title,
        isExclusive: !!selectedGroup.isExclusive,
        triggers: (selectedGroup.triggers || [])
            .filter(t => !t.hidden)
            .map(t => ({
                id: t.id || `trig_${Math.random().toString(16).slice(2, 8)}`,
                label: t.label
            }))
    };

    presetData.timestamp = Date.now();
    presetData.triggerGroups.push(cleanGroup);

    try {
        const response = await fetch("/xcp/save/triggerWallDeck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: presetName, data: presetData })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Unknown error");

        setLoadedTriggerPreset(node, presetName, presetData);
        node._layoutMapHash = null;
        refreshAndSync(node, false, true);
        showBastaMessage(node, "Profile Saved!", 3000, { fade: true, grow: true }, "btnAddTriggerToProfile", false, "success");
    } catch (e) {
        console.error("[xcpDerp] Failed to save trigger group to profile:", e);
        showBastaMessage(node, "Save Failed", 3000, { fade: true, grow: true }, "btnAddTriggerToProfile", false, "error");
    }
}

export async function triggerWall_saveGroupToProfile(node, group, targetRegion = "floatingBtnSave") {
    const presetName = node.properties?.lastSavedPreset;
    if (!presetName || !group) return;

    const presetData = cloneTriggerPresetData(node._cachedPresetData);
    if (!presetData || !Array.isArray(presetData.triggerGroups)) return;

    const savedIdx = presetData.triggerGroups.findIndex(g => g.title === group.title);
    if (savedIdx === -1) return;

    const cleanGroup = {
        id: group.id || `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        title: group.title,
        isExclusive: !!group.isExclusive,
        triggers: (group.triggers || [])
            .filter(t => !t.hidden)
            .map(t => ({
                id: t.id || `trig_${Math.random().toString(16).slice(2, 8)}`,
                label: t.label
            }))
    };

    presetData.timestamp = Date.now();
    presetData.triggerGroups[savedIdx] = cleanGroup;

    try {
        const response = await fetch("/xcp/save/triggerWall", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: presetName, data: presetData })
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Unknown error");

        setLoadedTriggerPreset(node, presetName, presetData);
        node._layoutMapHash = null;
        refreshAndSync(node, false, true);
        showBastaMessage(node, "Profile Saved!", 3000, { fade: true, grow: true }, targetRegion, false, "success");
    } catch (e) {
        console.error("[xcpDerp] Failed to overwrite trigger group in profile:", e);
        showBastaMessage(node, "Save Failed", 3000, { fade: true, grow: true }, targetRegion, false, "error");
    }
}

export async function triggerWall_saveCurrentProfile(node, targetRegion = "btnSaveTriggerGroup") {
    const presetName = node.properties?.lastSavedPreset || _triggerWall_autosaveKey(node);
    if (!presetName) return;

    const presetData = cloneTriggerPresetData(node._cachedPresetData) || {
        fileType: "xcp_derp_trigger_preset",
        version: "1.0.0",
        timestamp: Date.now(),
        triggerGroups: [],
    };

    if (!Array.isArray(presetData.triggerGroups)) presetData.triggerGroups = [];

    const visibleGroups = (node.properties?.triggerGroups || []).filter((g) => !g?.hidden);
    const byTitle = new Map(presetData.triggerGroups.map((g) => [String(g?.title || ""), g]));

    visibleGroups.forEach((group) => {
        const cleanGroup = {
            id: group.id || `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            title: group.title,
            isExclusive: !!group.isExclusive,
            triggers: (group.triggers || [])
                .filter((t) => !t.hidden)
                .map((t) => ({
                    id: t.id || `trig_${Math.random().toString(16).slice(2, 8)}`,
                    label: t.label,
                })),
        };
        byTitle.set(String(cleanGroup.title || ""), cleanGroup);
    });

    presetData.triggerGroups = Array.from(byTitle.values());
    presetData.timestamp = Date.now();

    try {
        const response = await fetch("/xcp/save/triggerWallDeck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: presetName, data: presetData }),
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Unknown error");

        setLoadedTriggerPreset(node, presetName, presetData);
        node._layoutMapHash = null;
        refreshAndSync(node, false, true);
        const savedName = String(presetName || "").split(/[\\/]/).pop() || String(presetName || "");
        showBastaSystemMessage(node, "Profile Saved: ", 3000, { fade: true, grow: true }, targetRegion, "success", null, savedName);
    } catch (e) {
        console.error("[xcpDerp] Failed to save current profile:", e);
        showBastaMessage(node, "Save Failed", 3000, { fade: true, grow: true }, targetRegion, false, "error");
    }
}

export async function triggerWall_saveDeckProfile(node) {
    const presetName = node.properties?.lastSavedPreset;
    if (!presetName) return;
    const deckData = {
        fileType: "xcp_derp_trigger_deck",
        version: "1.0.0",
        timestamp: Date.now(),
        triggerGroups: (node._triggerGroupData || []).filter(g => !g.hidden).map(g => ({
            id: g.id,
            title: g.title,
            isExclusive: !!g.isExclusive,
            triggers: (g.triggers || []).filter(t => !t.hidden).map(t => ({
                id: t.id,
                label: t.label,
                weight: t.weight,
                active: !!t.active
            }))
        }))
    };
    try {
        await fetch("/xcp/save/triggerWallDeck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: presetName, data: deckData })
        });
    } catch (e) {
        console.warn("[xcpDerp] Deck profile save failed:", e);
    }
}

export async function triggerWall_loadDeckProfile(node) {
    const presetName = node.properties?.lastSavedPreset;
    if (!presetName) return null;
    try {
        const res = await fetch(`/xcp/load/triggerWallDeck?name=${encodeURIComponent(presetName)}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data?.triggerGroups || null;
    } catch (e) {
        console.warn("[xcpDerp] Deck profile load failed:", e);
        return null;
    }
}

function _triggerWall_autosaveKey(node) {
    const workflowId = node?.graph?.extra?.workflowId || node?.graph?.name || node?.id || "unknown";
    return `_autosave_${workflowId}`;
}

export async function triggerWall_autosave(node) {
    if (!node?._triggerGroupData || !node?.id) return;
    const key = _triggerWall_autosaveKey(node);
    const deckData = {
        fileType: "xcp_derp_trigger_autosave",
        version: "1.0.0",
        timestamp: Date.now(),
        triggerGroups: (node._triggerGroupData || []).filter(g => !g.hidden).map(g => ({
            id: g.id,
            title: g.title,
            isExclusive: !!g.isExclusive,
            triggers: (g.triggers || []).filter(t => !t.hidden).map(t => ({
                id: t.id,
                label: t.label,
                weight: t.weight,
                active: !!t.active
            }))
        }))
    };
    try {
        await fetch("/xcp/save/triggerWallDeck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: key, data: deckData })
        });
    } catch (e) {
        // silent best-effort
    }
}

export async function triggerWall_autoload(node) {
    try {
        const res = await fetch(`/xcp/load/triggerWallDeck?name=${encodeURIComponent(_triggerWall_autosaveKey(node))}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data?.triggerGroups || null;
    } catch (e) { return null; }
}

export function triggerWall_onDerpSysPanelOpen(node, panel) {
    node._derpPanel = panel;
    if (panel.showProfiles) {
        panel.showProfiles("derpTriggerWall", "triggerWallDeck");
    }
    if (node.sysLayoutMap) panel.setLayoutMap(node.sysLayoutMap);
}

export function triggerWall_onResize(node, size) {
    const minW = node.properties.minWidth || 200;
    const safeW = Math.max(minW, size[0] || minW);
    const safeH = Math.max(50, size[1] || 150);
    node.size = [safeW, safeH];
    node.properties.nodeSize = [safeW, safeH];
    node._layoutMapHash = null;
    if (node.layout) node.layout._lastCacheKey = "";
    // Avoid forcing an immediate secondary sync chain here. Docking and live resize
    // already have their own settlement paths, and an extra requestDerpSync from
    // TriggerWall can cause stack position drift during structural changes.
    node._forceSync = true;
    node._layoutDirty = true;
    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
}
