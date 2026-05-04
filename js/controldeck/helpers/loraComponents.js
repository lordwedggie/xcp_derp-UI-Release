/**
 * Path: ./js/fatha/nodes/loraComponents.js
 * ROLE: Consolidated logic for fetching, processing, and managing LoRA triggers.
 */
import { app } from "../../../../scripts/app.js";
import { playMicrowaveDing, playKaChing, playKaboom } from "../../herbina/masterSoundEffects.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";

/**
 * processTriggerData: Converts the raw backend trigger dictionary into a structured array.
 */
export function processTriggerData(triggers) {
    if (!triggers || typeof triggers !== 'object') return [];

    // THE FILTERING FIX: Only process keys that are either imported triggers (tag_*)
    // or raw trigger files (*.txt). This excludes metadata like 'name', 'setup', and 'notes'
    // from the list while ensuring the Import UI remains visible when .txt files exist.
    return Object.keys(triggers).filter(k => k.startsWith("tag_") || k.toLowerCase().endsWith(".txt")).sort().map(k => {
        const entry = triggers[k];
        const isObj = typeof entry === 'object' && entry !== null;

        const name = (isObj && entry.name) ? entry.name : k;
        const tag = (isObj ? entry.tag : entry) || "";

        return {
            key: k,
            name: name,
            display: name.replace(/\.txt$/i, ""),
            tag: tag,
            image: isObj ? entry.image : null
        };
    });
}

/**
 * fetchLoraTriggers: Primary entry point for hydrating a node with LoRA triggers.
 */
export function fetchLoraTriggers(node, loraName, index, forceEditorSync = false) {
    if (!node._loraTriggerCache) node._loraTriggerCache = {};
    if (!node._loraTriggerArrayCache) node._loraTriggerArrayCache = {};
    if (!node._loraTxtStatus) node._loraTxtStatus = {};
    if (!loraName) return;

    const sessionTime = window._xcpDerpSession || Date.now();
    const fetchPath = loraName.replace(/\\/g, "/");

    fetch(`/xcp/get_lora_triggers?name=${encodeURIComponent(fetchPath)}&t=${sessionTime}`)
        .then(r => r.ok ? r.json() : { triggers: {} })
        .then(data => {
            const triggers = data.triggers || {};
            const stack = node.properties.stackData || [];

            // THE PRESERVATION FIX: If the active trigger is missing from the server payload (due to FS lag),
            // resurrect it from the node's stack only if it existed in the cache previously.
            if (stack[index] && stack[index][0] === loraName) {
                const activeKey = stack[index][3];
                const existingEntry = node._loraTriggerCache?.[loraName]?.[activeKey];
                if (activeKey && activeKey !== "None" && !triggers[activeKey] && existingEntry) {
                    triggers[activeKey] = existingEntry;
                }
            }

            node._loraTriggerCache[loraName] = triggers;
            const triggerArray = processTriggerData(triggers);
            node._loraTriggerArrayCache[loraName] = triggerArray;
            node._loraTxtStatus[loraName] = Object.keys(triggers).some(k => k.endsWith(".txt"));

            if (stack[index] && stack[index][0] === loraName) {
                const lora = stack[index];
                if (triggerArray.length > 0) {
                    if (lora[3] === "None" || !lora[3]) {
                        lora[3] = triggerArray[0].key;
                    }

                    const activeEntry = triggerArray.find(t => t.key === lora[3]);
                    if (activeEntry) {
                        const b = window.xcpActiveBastas?.get("basta_lora_detail_global_unique_id");
                        const isEditing = b && b.hostNode === node && b._loraData?.slotIndex === index;
                        if (!isEditing || forceEditorSync) lora[4] = activeEntry.tag;
                    }
                } else {
                    // THE EMPTY SLIP FIX: If no triggers exist, force reset the entry to prevent stale data persistence
                    lora[3] = "None";
                    lora[4] = "";
                }
            }

            if (node._triggerSyncDebouncer) clearTimeout(node._triggerSyncDebouncer);
            node._triggerSyncDebouncer = setTimeout(() => {
                window._xcpDerpSession = Date.now();
                if (node.syncDerpOutputs) node.syncDerpOutputs();
                node._layoutMapHash = null;
                if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                if (node.refreshDerpLoraStackSysMap) node.refreshDerpLoraStackSysMap();
                if (node.requestDerpSync) node.requestDerpSync();
                node._forceSync = true;

                const b = window.xcpActiveBastas?.get("basta_lora_detail_global_unique_id");
                if (b && b.hostNode === node) {
                    b._layoutDirty = true;
                    b._forceSync = true;
                    if (b.requestDerpSync) b.requestDerpSync();
                }
                if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
            }, 150);
        });
}

/**
 * manageLoraTrigger: Centralized handler for New, Save, Rename, Copy, and Delete actions.
 */
export async function manageLoraTrigger(node, basta, action, params) {
    const { slotIndex, tagKey, tagName, tagContent, newName, successMsg, regionKey, image } = params;
    const stack = node.properties.stackData || [];
    const loraPath = stack[slotIndex]?.[0];
    if (!loraPath) return;

    const payload = {
        name: loraPath,
        action: action,
        tagKey: tagKey,
        tagName: tagName,
        tagContent: tagContent,
        newName: newName,
        loraName: loraPath,
        image: image
    };

    try {
        const res = await fetch("/xcp/manage_lora_tag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
            if (action === "delete") playKaboom(); else playKaChing();

            if (successMsg && basta) {
                showBastaMessage(basta, successMsg, 2000, {}, regionKey || "triggerControlRow", false);
            }

            // THE AUTO-SELECT FIX: Ensure the new key is correctly resolved even if the backend payload varies,
            // preventing fallback to the source trigger's key during duplication.
            const nextKey = data.new_key || data.updated_key || data.key || (newName ? (newName.toLowerCase().endsWith(".txt") ? newName : newName + ".txt") : tagKey);
            window._xcpDerpSession = Date.now();

            // THE CONTENT SYNC FIX: Prioritize live buffer content (tagContent) during duplication
            // and only fallback to the cache if no live content was provided.
            let newTagContent = tagContent;
            if (action === "copy" && tagKey && (newTagContent === undefined || newTagContent === null)) {
                const cache = node._loraTriggerCache?.[loraPath] || {};
                const sourceEntry = cache[tagKey];
                newTagContent = (typeof sourceEntry === 'object' ? sourceEntry.tag : sourceEntry) || "";
            } else if (action === "new_tag") {
                newTagContent = "";
            }

            if (stack[slotIndex]) {
                if (action === "delete") {
                    stack[slotIndex][3] = "None";
                    stack[slotIndex][4] = "";
                } else {
                    stack[slotIndex][3] = nextKey;
                    if (newTagContent !== undefined) stack[slotIndex][4] = newTagContent;
                }
            }

            // THE INSTANT CACHE FIX: Update BOTH raw and normalized path keys to prevent
            // cache-miss short-circuits in bastaLoraDetail.js reading the old array.
            if (!node._loraTriggerArrayCache) node._loraTriggerArrayCache = {};
            if (!node._loraTriggerCache) node._loraTriggerCache = {};

            const cacheKeyNorm = loraPath.replace(/\\/g, "/");
            const keysToUpdate = [...new Set([loraPath, cacheKeyNorm])];

            const nextName = newName || tagName || nextKey;

            keysToUpdate.forEach(k => {
                if (!node._loraTriggerArrayCache[k]) node._loraTriggerArrayCache[k] = [];
                if (!node._loraTriggerCache[k]) node._loraTriggerCache[k] = {};

                const arr = node._loraTriggerArrayCache[k];
                const dict = node._loraTriggerCache[k];

                if (action === "delete") {
                    node._loraTriggerArrayCache[k] = arr.filter(t => t.key !== tagKey);
                    delete dict[tagKey];
                } else if (action === "rename") {
                    const item = arr.find(t => t.key === tagKey);
                    if (item) {
                        item.key = nextKey;
                        item.name = nextName;
                        item.display = nextName.replace(/\.txt$/i, "");
                    }
                    const oldVal = dict[tagKey];
                    delete dict[tagKey];
                    dict[nextKey] = oldVal;
                } else if (action === "new_tag" || action === "copy") {
                    // Prevent duplicate push if function is somehow called twice
                    if (!arr.find(t => t.key === nextKey)) {
                        arr.push({
                            key: nextKey,
                            name: nextName,
                            display: nextName.replace(/\.txt$/i, ""),
                            tag: newTagContent || "",
                            image: image || null
                        });
                    }
                    dict[nextKey] = { name: nextName, tag: newTagContent || "", image: image || null };
                } else if (action === "link_image") {
                    const item = arr.find(t => t.key === tagKey);
                    if (item) {
                        item.image = image;
                        if (dict[tagKey] && typeof dict[tagKey] === 'object') dict[tagKey].image = image;
                    }
                }
            });

            if (basta) {
                basta._activeTagKey = (action === "delete") ? null : nextKey;
                basta._activeTagName = (action === "delete") ? null : nextName.replace(/\.txt$/i, "");

                // THE DOM UPDATE FIX: Manually force the editor to visually update instantly
                const editorEl = basta.dynamicElements?.loraTriggersEditor;
                if (editorEl && stack[slotIndex] && action !== "delete") {
                    editorEl.value = stack[slotIndex][4] || "";
                    editorEl.text = stack[slotIndex][4] || "";

                    // THE FOCUS FIX: Ensure the new duplicate/trigger is immediately selected and ready for editing
                    if (action === "copy" || action === "new_tag") {
                        editorEl.focus();
                    }
                }

                // THE DROPDOWN SYNC FIX: Target the widget correctly whether it's nested or flattened
                const dropRegion = basta.layout?.regions?.triggerControlRow?.dropdownTrigger || basta.layout?.regions?.dropdownTrigger;
                if (dropRegion && action !== "delete") {
                    dropRegion.value = nextKey;
                    dropRegion.text = nextName.replace(/\.txt$/i, "");
                }

                basta._layoutDirty = true;
                basta._forceSync = true;
                if (basta.setDirtyCanvas) basta.setDirtyCanvas(true, true);
                if (basta.requestDerpSync) basta.requestDerpSync();
            }

            // THE SYNC ENGINE FIX: Propagate the new identity globally and force immediate UI redraw
            if (node.syncDerpOutputs) node.syncDerpOutputs();
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.refreshDerpLoraStackSysMap) node.refreshDerpLoraStackSysMap();
            node._forceSync = true;
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);

            // THE RACE CONDITION FIX: Delay the verification fetch to ensure the OS file system has committed the new trigger file
            // before overwriting the local array cache.
            setTimeout(() => {
                fetchLoraTriggers(node, loraPath, slotIndex, action !== "save");
            }, 800);
            return data;
        }
    } catch (e) {
        console.error(`[xcpDerp] Trigger Management Error (${action}):`, e);
    }
}

/**
 * getRatingColor: Resolves a palette color for a given rating.
 */
export function getRatingColor(palette, rating, key = "_OFF") {
    if (!palette || !palette.palettes) return null;
    const pal = palette.palettes.find(p => parseInt(p.id, 10) === parseInt(rating || 0, 10));
    if (pal && pal.entries?.main) {
        const c = pal.entries.main[key] || pal.entries.main["_OFF"];
        if (c) return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] !== undefined ? c[3] : 1.0})`;
    }
    return null;
}

/**
 * saveLoraRating: Posts a rating update to the server and syncs the UI.
 */
export async function saveLoraRating(node, basta, loraName, rating) {
    try {
        const res = await fetch("/xcp/save_lora_rating", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: loraName, rating: rating })
        });
        const data = await res.json();
        if (data.success) {
            playKaChing();
            if (node._loraRatings) node._loraRatings[loraName] = rating;
            if (basta) {
                basta._forceSync = true;
                if (basta.requestDerpSync) basta.requestDerpSync();
            }
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.setDirtyCanvas) node.setDirtyCanvas(true);
        }
    } catch (e) {
        console.error("[xcpDerp] Rating Save Error:", e);
    }
}

/**
 * getLoraRatingDropdownProps: Generates props for the rating selection dropdown.
 */
export function getLoraRatingDropdownProps(node, basta, loraData) {
    const items = [
        { key: 0, display: "None" },
        { key: 1, display: "S - Awesome" },
        { key: 2, display: "A - Excellent" },
        { key: 3, display: "B - Great" },
        { key: 4, display: "C - Good" },
        { key: 5, display: "D - Average" },
        { key: 6, display: "E - Poor" },
        { key: 7, display: "F - Trash" }
    ];

    return {
        items: items,
        value: loraData.rating || 0,
        text: items.find(i => i.key === (loraData.rating || 0))?.display || "None",
        onChange: (val) => {
            const lName = loraData.rawFileName || loraData.name;
            loraData.rating = val;
            saveLoraRating(node, basta, lName, val);
        }
    };
}

/**
 * getLoraTriggerDropdownProps: Generates props for the trigger selection dropdown in the detail panel.
 */
export function getLoraTriggerDropdownProps(node, basta, loraData) {
    const lName = loraData.rawFileName || loraData.name;
    const triggers = node._loraTriggerArrayCache?.[lName] || [];
    const items = triggers.length > 0 ? triggers : [{ key: "None", display: "None", tag: "" }];

    const stack = node.properties.stackData || [];
    const slotIdx = loraData.slotIndex;
    const currentKey = stack[slotIdx]?.[3] || "None";

    return {
        items: items,
        value: currentKey,
        text: items.find(i => i.key === currentKey)?.display || "None",
        onChange: (newKey) => {
            if (!stack[slotIdx]) return;
            const entry = items.find(i => i.key === newKey);

            stack[slotIdx][3] = newKey;
            stack[slotIdx][4] = entry ? (entry.tag || "") : "";

            // THE SELECTION SYNC FIX: Force immediate refresh of all UI layers and signal transmission
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.refreshDerpLoraStackSysMap) node.refreshDerpLoraStackSysMap();
            if (node.syncDerpOutputs) node.syncDerpOutputs();
            if (node.requestDerpSync) node.requestDerpSync();
            node._forceSync = true;

            if (basta) {
                basta._activeTagKey = newKey;
                basta._activeTagName = entry ? entry.display : "None";
                if (basta.requestDerpSync) basta.requestDerpSync();
                basta._forceSync = true;

                // Update the tag editor value if it exists
                const editorEl = basta.dynamicElements?.loraTriggersEditor;
                if (editorEl) {
                    editorEl.value = stack[slotIdx][4];
                    editorEl.text = stack[slotIdx][4];
                }
            }

            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        }
    };
}

/**
 * getLoraLoaderProps: Logic for the file browser within the detail panel.
 */
export const getLoraLoaderProps = (host, basta, loraData) => ({
    useAnim: basta.properties.useAnimations !== false,
    state: "OFF",
    disabled: false,
    ratingsList: host._loraRatings || {},
    ratingsPalette: host._ratingsPalette || loraData.ratingsPalette,
    items: host._loraList || [],
    previewList: host._loraPreviewList || [],
    onChange: (newPath) => {
        const stack = host.properties.stackData || [];
        const idx = loraData.slotIndex;
        if (stack[idx] !== undefined) {
            // 1. REPLACE LORA PATH, ENABLE LORA, & RESET TRIGGERS
            stack[idx][0] = newPath;
            stack[idx][5] = false; // Auto-Enable on swap
            stack[idx][3] = "None";
            stack[idx][4] = "";

            // 2. TRIGGER REFRESH: Update the host node face and sync to Python
            if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
            if (host.syncDerpOutputs) host.syncDerpOutputs();
            if (host.requestDerpSync) host.requestDerpSync();
            host._shouldSync = true;
            host.setDirtyCanvas(true, true);

            // 3. PANEL RE-SYNC: Force the host to re-open the panel for this slot index.
            const b = window.xcpActiveBastas?.get("basta_lora_detail_global_unique_id");
            if (b) b._skipAnimOnce = true;

            if (host.layout?.regions[`loraPreview_${idx}`]?.onPress) {
                host.layout.regions[`loraPreview_${idx}`].onPress();
            }

            // 4. START TRIGGER FETCH
            if (host.fetchDerpLoraTriggers) {
                host.fetchDerpLoraTriggers(newPath, idx);
            }
        }
    }
});

/**
 * fetchLoraRating: Core metadata lookup for node entries.
 */
export function fetchLoraRating(node, loraName) {
    if (!node._loraRatings) node._loraRatings = {};
    if (!node._loraSetup) node._loraSetup = {};
    fetch(`/xcp/get_lora_info?name=${encodeURIComponent(loraName)}&lite=true`)
        .then(r => r.json())
        .then(data => {
            if (data) {
                if (data.rating !== undefined) node._loraRatings[loraName] = data.rating;
                if (data.setup?.sliderStrength) node._loraSetup[loraName] = data.setup;

                if (node._ratingSyncDebouncer) clearTimeout(node._ratingSyncDebouncer);
                node._ratingSyncDebouncer = setTimeout(() => {
                    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                    if (node.refreshDerpLoraStackSysMap) node.refreshDerpLoraStackSysMap();
                    if (node.requestDerpSync) node.requestDerpSync();
                    node._forceSync = true;

                    if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
                }, 150);
            }
        }).catch(() => {});
}

/**
 * syncRatingColorsCache: Pre-computes CSS strings for a node's rating palette.
 */
export function syncRatingColorsCache(node) {
    if (!node._ratingsPalette) return;
    node._ratingColorsCache = {};
    (node._ratingsPalette.palettes || []).forEach(p => {
        const rId = parseInt(p.id, 10);
        const main = p.entries?.main;
        if (main) {
            const cOn = main._ON || [255, 255, 255, 1];
            const cOff = main._OFF || [200, 200, 200, 1];
            const cDis = main._DIS || [100, 100, 100, 0.5];
            node._ratingColorsCache[rId] = {
                ON: `rgba(${cOn[0]}, ${cOn[1]}, ${cOn[2]}, ${cOn[3] ?? 1.0})`,
                OFF: `rgba(${cOff[0]}, ${cOff[1]}, ${cOff[2]}, ${cOff[3] ?? 1.0})`,
                DIS: `rgba(${cDis[0]}, ${cDis[1]}, ${cDis[2]}, ${cDis[3] ?? 1.0})`
            };
        }
    });
}

/**
 * resolveRatingColor: Efficiently pulls state-aware color from cache with fallbacks.
 */
export function resolveRatingColor(node, loraName, isSelected, isBypassed) {
    const rating = parseInt(node._loraRatings?.[loraName] || 0, 10);
    const cache = node._ratingColorsCache?.[rating];
    if (!cache) return isSelected ? "rgba(255, 255, 255, 1)" : "rgba(150, 150, 150, 1)";

    if (isBypassed) return cache.DIS;
    return isSelected ? cache.ON : cache.OFF;
}

/**
 * fetchLoraData: Centralized metadata and file list fetcher.
 */
export function fetchLoraData(node, showNotification = false) {
    fetch("/xcp/get_loras")
        .then(r => r.json())
        .then(data => {
            node._loraList = data.items || [];
            node._loraPreviewList = data.has_preview || [];
            if (data.ratings) node._loraRatings = { ...(node._loraRatings || {}), ...data.ratings };
            // Invalidate layout cache to force immediate rebuild with the new list
            node._layoutMapHash = null;

            // Hydrate triggers for current stack
            const stack = node.properties?.stackData || [];
            stack.forEach((lora, index) => {
                if (lora[0] && typeof node.fetchDerpLoraTriggers === "function") {
                    node.fetchDerpLoraTriggers(lora[0], index);
                }
            });

            // THE VALIDATION FIX: Run stack integrity check after the list is updated
            if (node.validateLoraStack) node.validateLoraStack();

            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();

            if (showNotification) {
                showBastaMessage(node, "Lora list updated", 3000, { fade: true, grow: true }, "btnRefreshModels", false, "info", "microwave");
            }
        }).catch(err => console.warn("[xcpDerp] LoRA data fetch failed:", err));
}