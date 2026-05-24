/**
 * Path: ./js/fatha/bastas/bastaLoraDetail_core.js
 * ROLE: Core logic and instantiation handling for LoRA Detail panel.
 */
import { app } from "../../../../../scripts/app.js";
import { spawnBasta } from "../../basta.js";
import { animateAlpha, getPulsedColor } from "../../../herbina/masterAnimator.js";

const IMAGE_NAV_ALPHA_SPEED = 0.15;
import { showBastaMessage } from "../bastaMessage.js";
import { showBastaFileHandler } from "../bastaFileHandler.js";
import { resolvePaintData, measureTextHeight } from "../../../herbina/utils/widgetsUtils.js";
import { initLoraImageHandlers, calculatePreviewAspectRatio, refreshLoraImageList } from "../../../controldeck/helpers/loraImages.js";
import { getLoraDetailTitle } from "../../../controldeck/helpers/loraComponents.js";

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

function getNormalizedLoraPath(value) {
    return String(value || "").replace(/\\/g, "/");
}

function getLiveLoraPath(host, loraData) {
    const liveStack = host?.properties?.stackData || [];
    const slotIdx = loraData?.slotIndex;
    const livePath = Number.isInteger(slotIdx) ? liveStack[slotIdx]?.[0] : null;
    return getNormalizedLoraPath(livePath || loraData?.loraPath || loraData?.rawFileName || loraData?.path || loraData?.name || "");
}

function updateLoraPreviewList(host, oldPath, newPath, hasPreview = false) {
    if (!host) return;
    const nextList = Array.isArray(host._loraPreviewList) ? [...host._loraPreviewList] : [];
    const oldNorm = getNormalizedLoraPath(oldPath);
    const oldBack = oldNorm.replace(/\//g, "\\");
    const newNorm = getNormalizedLoraPath(newPath);
    const newBack = newNorm.replace(/\//g, "\\");

    const filtered = nextList.filter((item) => item !== oldNorm && item !== oldBack);
    if (hasPreview) {
        if (!filtered.includes(newNorm)) filtered.push(newNorm);
        if (newBack !== newNorm && !filtered.includes(newBack)) filtered.push(newBack);
    }
    host._loraPreviewList = filtered;
}

export async function renameLoraBundle(host, basta, loraData, newName) {
    const oldPath = getLiveLoraPath(host, loraData);
    const trimmedName = String(newName || "").trim();
    if (!oldPath || !trimmedName) return false;

    const parentDir = oldPath.includes("/") ? oldPath.split("/").slice(0, -1).join("/") : "";
    const nextPath = getNormalizedLoraPath(parentDir ? `${parentDir}/${trimmedName}` : trimmedName);

    const res = await fetch("/xcp/rename_lora_bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName: oldPath, newName: nextPath })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success !== true) {
        throw new Error(data.error || tLocale("$basta_lora_detail.messages.rename_failed", "Rename failed"));
    }

    const liveStack = host?.properties?.stackData || [];
    const slotIdx = loraData?.slotIndex;
    const finalPath = getNormalizedLoraPath(data.newName || nextPath);
    const finalBaseName = String(data.baseName || trimmedName).trim() || trimmedName;
    const hasPreview = !!data.hasPreview;

    if (Number.isInteger(slotIdx) && liveStack[slotIdx]) {
        liveStack[slotIdx][0] = finalPath;
    }

    loraData.name = finalBaseName;
    loraData.rawFileName = finalPath;
    loraData.loraPath = finalPath;
    loraData.path = finalPath;
    loraData.hasCover = hasPreview;
    loraData.coverFilename = hasPreview ? (data.coverFilename || loraData.coverFilename || null) : null;
    loraData.currentImageIndex = -1;
    loraData.aspectRatio = null;
    loraData._previewLoading = false;
    loraData.previewUrl = hasPreview ? `/xcp/get_lora_preview?name=${encodeURIComponent(finalPath)}&v=${Date.now()}` : null;

    updateLoraPreviewList(host, oldPath, finalPath, hasPreview);

    if (host._loraTriggerCache) {
        const triggerData = host._loraTriggerCache[oldPath] || host._loraTriggerCache[oldPath.replace(/\//g, "\\")];
        if (triggerData) {
            host._loraTriggerCache[finalPath] = triggerData;
            host._loraTriggerCache[finalPath.replace(/\//g, "\\")] = triggerData;
        }
    }

    if (host._loraTriggerArrayCache) {
        const triggerArray = host._loraTriggerArrayCache[oldPath] || host._loraTriggerArrayCache[oldPath.replace(/\//g, "\\")];
        if (triggerArray) {
            host._loraTriggerArrayCache[finalPath] = triggerArray;
            host._loraTriggerArrayCache[finalPath.replace(/\//g, "\\")] = triggerArray;
        }
    }

    if (host.syncDerpOutputs) host.syncDerpOutputs();
    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
    if (host.refreshDerpLoraStackSysMap) host.refreshDerpLoraStackSysMap();
    if (typeof host.requestDerpSync === "function") host.requestDerpSync();
    else if (typeof host.setDirtyCanvas === "function") host.setDirtyCanvas(true, true);

    if (basta) {
        basta.titleLabel = getLoraDetailTitle(finalPath, loraData.rating, hasPreview);
        basta._loraData = loraData;
        basta._lastLoraName = finalPath;
        basta._layoutDirty = true;
        basta._forceSync = true;
        refreshLoraImageList(basta, loraData);
        if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
        else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
    }

    return true;
}

function getTriggerItemsForPath(host, loraPath) {
    const cache = host?._loraTriggerArrayCache;
    if (!cache || !loraPath) return [];

    const normalized = String(loraPath).replace(/\\/g, "/");
    const windowsStyle = normalized.replace(/\//g, "\\");
    return cache[loraPath] || cache[normalized] || cache[windowsStyle] || [];
}

function debugPreviewSet(loraData, source, url) {
    try {
        if (window._xcpDebugLoraPreviewSwitch !== true) return;
        const name = loraData?.rawFileName || loraData?.name || "unknown";
        const idx = loraData?.currentImageIndex;
        console.debug(`[LoRA Preview] ${source} | name=${name} | idx=${idx} | url=${url}`);
    } catch (_) {
        // no-op
    }
}

function getBLDPerf(basta) {
    if (!basta || !window.DERP_BLD_PROFILE) return null;
    if (!basta._bldPerf) {
        basta._bldPerf = {
            layoutBuild: 0,
            update: 0,
            dirty: 0,
            syncReq: 0,
            hostRefresh: 0,
            resolvePaint: 0,
            measureText: 0,
            avgUpdateMs: 0,
            updateMs: 0,
            lastLog: performance.now()
        };
    }
    return basta._bldPerf;
}

function bumpBLDPerf(basta, key, amount = 1) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    perf[key] = (perf[key] || 0) + amount;
}

function getBLDSourceLine(stack) {
    if (!stack) return "unknown";
    const lines = String(stack).split("\n").map(line => line.trim());
    return lines.find(line =>
        line &&
        !line.includes("getBLDSourceLine") &&
        !line.includes("bumpBLDSource") &&
        !line.includes("markBLDDirty") &&
        !line.includes("Error")
    ) || "unknown";
}

function bumpBLDSource(basta, key) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    if (!perf[key]) perf[key] = new Map();
    const source = getBLDSourceLine(new Error().stack);
    perf[key].set(source, (perf[key].get(source) || 0) + 1);
}

function flushBLDPerf(basta) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    const now = performance.now();
    if (now - perf.lastLog < 1000) return;
    const seconds = Math.max((now - perf.lastLog) / 1000, 0.001);
    const perSec = (value) => Math.round((value || 0) / seconds);
    const avgUpdateMs = perf.update > 0 ? perf.updateMs / perf.update : 0;
    console.log(
        `[BLDPerf] ${basta.title || basta.titleLabel || "bastaLoraDetail"} | ` +
        `layoutBuild=${perSec(perf.layoutBuild)}/s ` +
        `update=${perSec(perf.update)}/s ` +
        `avgUpdateMs=${avgUpdateMs.toFixed(3)} ` +
        `dirty=${perSec(perf.dirty)}/s ` +
        `syncReq=${perSec(perf.syncReq)}/s ` +
        `hostRefresh=${perSec(perf.hostRefresh)}/s ` +
        `resolvePaint=${perSec(perf.resolvePaint)}/s ` +
        `measureText=${perSec(perf.measureText)}/s`
    );
    if (perf.dirtySources?.size) {
        const top = [...perf.dirtySources.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([source, count]) => `${perSec(count)}/s ${source}`);
        console.log(`[BLDPerf:dirtySources] ${top.join(" | ")}`);
        perf.dirtySources.clear();
    }
    if (perf.hostRefreshSources?.size) {
        const top = [...perf.hostRefreshSources.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([source, count]) => `${perSec(count)}/s ${source}`);
        console.log(`[BLDPerf:hostRefreshSources] ${top.join(" | ")}`);
        perf.hostRefreshSources.clear();
    }
    perf.layoutBuild = 0;
    perf.update = 0;
    perf.dirty = 0;
    perf.syncReq = 0;
    perf.hostRefresh = 0;
    perf.resolvePaint = 0;
    perf.measureText = 0;
    perf.updateMs = 0;
    perf.lastLog = now;
}

function profileResolvePaint(basta, ...args) {
    bumpBLDPerf(basta, "resolvePaint");
    return resolvePaintData(basta, ...args);
}

function profileMeasureText(basta, ...args) {
    bumpBLDPerf(basta, "measureText");
    return measureTextHeight(...args);
}

function markBLDDirty(basta, structural = false) {
    bumpBLDPerf(basta, "dirty");
    bumpBLDSource(basta, "dirtySources");
    if (structural) bumpBLDPerf(basta, "syncReq");
}

export const getLoraDetailId = () => `basta_lora_detail_global_unique_id`;

initLoraImageHandlers(getLoraDetailId);

function deselectLoraPreview(basta) {
    if (!basta || !basta._previewSelected) return false;
    basta._previewSelected = false;
    if (basta.layout?.regions?.loraPreview) {
        basta.layout.regions.loraPreview.isSelected = false;
        basta.layout.regions.loraPreview.showPasteOverlay = false;
    }
    if (basta._compDataCache?.loraPreview) {
        basta._compDataCache.loraPreview.isSelected = false;
        basta._compDataCache.loraPreview.showPasteOverlay = false;
    }
    bumpBLDPerf(basta, "syncReq");
    if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
    else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
    return true;
}

export const getNotesEditorProps = (host, basta, loraData, vars) => {
    const { mW, mH, pW, pH, sH } = vars;
    return {
        useAnim: basta.properties.useAnimations !== false,
        height: (() => {
            const val = (loraData.notes || "");
            const innerW = (basta.size ? basta.size[0] : (basta.targetSize ? basta.targetSize[0] : 220)) - (mW * 2) - (pW * 2);

            // THE HEIGHT CACHE FIX: Prevent redundant text measurement every frame
            const hKey = `notes_${val.length}_${innerW}`;
            if (basta._hCache?.[hKey]) return basta._hCache[hKey];
            if (!basta._hCache) basta._hCache = {};

            const paint = profileResolvePaint(basta, "t_textSmall", "OFF");
            const fs = paint?.fontSize || 10;

            const segments = val.split('\n');
            let textH = 0;
            segments.forEach(s => {
                textH += profileMeasureText(basta, s || " ", innerW, { font: paint?.font, fontSize: fs, fontWeight: paint?.fontWeight });
            });

            const finalH = Math.max(mH * 2, textH + sH);
            basta._hCache[hKey] = finalH;
            return finalH;
        })(),
        text: loraData.notes || "",
        value: loraData.notes || "",
        onInput: (val, el, config) => {
            loraData.notes = val;
            if (config) {
                config.text = val;
                config.value = val;
                markBLDDirty(basta, true);
                basta._layoutDirty = true; // Flag for structural resize on next frame
            }
            if (el && !el._derpStyled) {
                const paint = profileResolvePaint(basta, "t_textSmall", "OFF");
                if (paint) {
                    el.style.fontFamily = paint.font || "Arial, sans-serif";
                    el.style.fontSize = (paint.fontSize || 10) + "px";
                    const c = paint.fill;
                    el.style.color = Array.isArray(c) ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] ?? 1})` : (c || "white");
                }
                el.style.backgroundColor = "transparent";
                el.style.textAlign = "left";
                el.style.alignItems = "flex-start";
                el.style.alignContent = "flex-start";
                el._derpStyled = true;
            }

            // THE ALIGNMENT FIX: Use the identical dynamic inner-width calculation as loraTriggersEditor
            if (el) {
                const paint = profileResolvePaint(basta, "t_textSmall", "OFF");
                const fs = paint?.fontSize || 10;
                const innerW = (basta.size ? basta.size[0] : (basta.targetSize ? basta.targetSize[0] : 220)) - (mW * 2) - (pW * 2);

                const segments = val.split('\n');
                let newH = 0;
                segments.forEach(s => {
                    newH += profileMeasureText(basta, s || " ", innerW, { font: paint?.font, fontSize: fs, fontWeight: paint?.fontWeight });
                });

                if (Math.abs(newH - (el._lastH || 0)) > 2) {
                    el._lastH = newH;
                    bumpBLDPerf(basta, "syncReq");
                    if (basta.requestDerpSync) basta.requestDerpSync();
                }
            }
        },
        onBlur: (val, el) => {
            const finalValue = (val !== undefined) ? val : (el ? el.value : (loraData.notes || ""));
            loraData.notes = finalValue;
            // THE SAVE FIX: Use the correct payload for the notes endpoint
            fetch("/xcp/save_lora_notes", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: loraData.rawFileName || loraData.name,
                    notes: finalValue
                })
            });
            // THE VISIBILITY FIX: Ensure it hides if the user manually cleared the text
            if (basta && basta.layout?.regions?.editorLoraNotes) {
                basta.layout.regions.editorLoraNotes.hidden = !finalValue;
                markBLDDirty(basta, true);
                basta._layoutDirty = true;
                basta._forceSync = true;
                if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
                else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
            }
        }
    };
};

export async function openCivitAI(basta, loraData) {
    const currentData = basta._loraData || loraData;
    if (currentData.civitaiUrl) {
        window.open(currentData.civitaiUrl, "_blank");
        return;
    }

    if (!currentData.civitaiModelId && currentData.hashes?.length > 0) {
        const h = currentData.hashes[0];
        try {
            const apiRes = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${h}`);
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                currentData.civitaiModelId = apiData.modelId;
                currentData.civitaiVersionId = apiData.id;
                const vParam = apiData.id ? `?modelVersionId=${apiData.id}` : "";
                currentData.civitaiUrl = `https://civitai.com/models/${apiData.modelId}${vParam}`;
                currentData.metadataString = `CivitAI URL: ${currentData.civitaiUrl}`;

                if (basta) {
                    basta._forceSync = true;
                    if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
                    else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
                }

                window.open(currentData.civitaiUrl, "_blank");
                return;
            }
        } catch (e) {
            console.error(`[xcpDerp] CivitAI Lookup Error:`, e);
        }
    }

    if (currentData.civitaiModelId) {
        const vParam = currentData.civitaiVersionId ? `?modelVersionId=${currentData.civitaiVersionId}` : "";
        window.open(`https://civitai.com/models/${currentData.civitaiModelId}${vParam}`, "_blank");
        return;
    }

    const cleanName = (currentData.name || "").split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
    window.open(`https://civitai.com/search/models?query=${encodeURIComponent(cleanName)}&modelType=LORA&modelStatus=Published`, "_blank");
}

export async function openCivArchive(basta, loraData) {
    const currentData = basta._loraData || loraData;

    // THE HASH FIX: CivArchive's search engine treats raw hashes as fuzzy text and returns unrelated junk.
    // Instead, we use Civitai's API to resolve the hash to a Model ID, then leverage CivArchive's URL parity.
    if (!currentData.civitaiModelId && currentData.hashes?.length > 0) {
        const h = currentData.hashes[0];
        try {
            const apiRes = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${h}`);
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                currentData.civitaiModelId = apiData.modelId;
                currentData.civitaiVersionId = apiData.id;
                const vParam = apiData.id ? `?modelVersionId=${apiData.id}` : "";
                currentData.civitaiUrl = `https://civitai.com/models/${apiData.modelId}${vParam}`;
                currentData.metadataString = `CivitAI URL: ${currentData.civitaiUrl}`;

                if (basta) {
                    basta._forceSync = true;
                    if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
                    else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
                }
            }
        } catch (e) {
            console.error(`[xcpDerp] CivitAI Hash Lookup Error:`, e);
        }
    }

    if (currentData.civitaiModelId) {
        const vParam = currentData.civitaiVersionId ? `?modelVersionId=${currentData.civitaiVersionId}` : "";
        window.open(`https://civarchive.com/models/${currentData.civitaiModelId}${vParam}`, "_blank");
    } else {
        // Fallback: Exact name search (wrapped in quotes) to avoid fuzzy matching garbage
        const cleanName = (currentData.name || "").split(/[\\/]/).pop().replace(/\.[^/.]+$/, "");
        window.open(`https://civarchive.com/search/models?query="${encodeURIComponent(cleanName)}"`, "_blank");
    }
}

export const getEditorProps = (host, basta, loraData, initialTr, vars) => {
    const { mW, mH, pW, pH, sH } = vars;
    return {
        useAnim: basta.properties.useAnimations !== false,
        spellCheck: true,
        hidden: !basta._activeTagKey,
        height: (() => {
            const val = (host.properties.stackData[loraData.slotIndex]?.[4] ?? "");
            const innerW = (basta.size ? basta.size[0] : (basta.targetSize ? basta.targetSize[0] : 220)) - (mW * 2) - (pW * 2);

            // THE HEIGHT CACHE FIX: Prevent redundant text measurement every frame
            const hKey = `editor_${val.length}_${innerW}`;
            if (basta._hCache?.[hKey]) return basta._hCache[hKey];
            if (!basta._hCache) basta._hCache = {};

            const paint = profileResolvePaint(basta, "t_textSmall", "OFF");
            const fs = paint?.fontSize || 10;

            const segments = val.split('\n');
            let textH = 0;
            segments.forEach(s => {
                textH += profileMeasureText(basta, s || " ", innerW, { font: paint?.font, fontSize: fs, fontWeight: paint?.fontWeight });
            });

            const finalH = Math.max(mH * 4, textH + fs + sH);
            basta._hCache[hKey] = finalH;
            return finalH;
        })(),
        text: (host.properties.stackData[loraData.slotIndex]?.[4] ?? ""),
        value: (host.properties.stackData[loraData.slotIndex]?.[4] ?? ""),
        onInput: (val, el, config) => {
            // THE INTEGRITY FIX: Resolve live data from the host to prevent stale closures during LoRA swaps
            const liveStack = host.properties?.stackData || [];
            const idx = loraData.slotIndex;
            const currentLora = liveStack[idx];

            if (!currentLora) return;

            if (config) {
                config.text = val;
                config.value = val;
                basta._layoutDirty = true;
            }

            // THE CRASH FIX: Use safe navigation and fallback to region width to prevent "undefined reading w"
            if (el && !el._derpStyled) {
                const paint = profileResolvePaint(basta, "t_textSmall", "OFF");
                if (paint) {
                    el.style.fontFamily = paint.font || "Arial, sans-serif";
                    el.style.fontSize = (paint.fontSize || 10) + "px";
                    const c = paint.fill;
                    el.style.color = Array.isArray(c) ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] ?? 1})` : (c || "white");
                }
                el.style.backgroundColor = "transparent";
                el.style.textAlign = "left";
                el.style.alignItems = "flex-start";
                el.style.alignContent = "flex-start";
                el._derpStyled = true;
            }
            if (currentLora) {
                currentLora[4] = val;
                loraData.tags = val.split(',').map(t => t.trim()).filter(t => t !== "");

                if (host.syncDerpOutputs) host.syncDerpOutputs();

                // THE LIVE CACHE FIX: Resolve triggers from host cache instead of the captured 'tr' closure
                const liveTr = (host._loraTriggerCache?.[currentLora[0]] || host._loraTriggerCache?.[loraData.rawFileName] || initialTr || {});
                const entryData = liveTr[basta._activeTagKey];
                const originalContent = (typeof entryData === 'object' ? entryData.tag : entryData) ?? "";

                if (basta.layout?.regions?.btnSaveTrigger) {
                    basta.layout.regions.btnSaveTrigger.state = (val.trim() !== originalContent.trim()) ? "OFF" : "DIS";
                }

                if (typeof host.requestDerpSync === "function") host.requestDerpSync();
                else host.setDirtyCanvas(true);
                if (basta.requestDerpSync) basta.requestDerpSync();
                else if (basta.setDirtyCanvas) basta.setDirtyCanvas(true);

                if (el) {
                    const paint = profileResolvePaint(basta, "t_textSmall", "OFF");
                    const fs = paint?.fontSize || 10;
                    const innerW = (basta.size ? basta.size[0] : (basta.targetSize ? basta.targetSize[0] : 220)) - (mW * 2) - (pW * 2);

                    const segments = val.split('\n');
                    let newH = 0;
                    segments.forEach(s => {
                        newH += profileMeasureText(basta, s || " ", innerW, { font: paint?.font, fontSize: fs, fontWeight: paint?.fontWeight });
                    });

                    if (Math.abs(newH - (el._lastH || 0)) > 2) {
                        el._lastH = newH;
                        bumpBLDPerf(basta, "syncReq");
                        if (basta.requestDerpSync) basta.requestDerpSync();
                    }
                }
            }
        },
        onBlur: (val, el) => {
            const stack = host.properties.stackData || [];
            const idx = loraData.slotIndex;
            if (stack[idx]) {
                const finalValue = (val !== undefined) ? val : (el ? el.value : (stack[idx][4] || ""));

                stack[idx][4] = finalValue || "";
                loraData.tags = (finalValue || "").split(',').map(t => t.trim()).filter(t => t !== "");
                if (host.syncDerpOutputs) host.syncDerpOutputs();
                if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
                bumpBLDPerf(basta, "syncReq");
                if (basta.requestDerpSync) basta.requestDerpSync();
            }
        }
    };
};

export const getLoraNotesEditorPropsWrapped = (host, basta, loraData, currentPath, vars) => {
    const props = getNotesEditorProps(host, basta, loraData, vars);
    const baseInput = props.onInput;
    const baseBlur = props.onBlur;

    props.onInput = (val, el, config) => {
        loraData.notes = val;
        if (baseInput) baseInput(val, el, config);
    };

    props.onBlur = (val, el) => {
        const finalValue = (val !== undefined) ? val : (el ? el.value : (loraData.notes || ""));
        loraData.notes = finalValue;
        const liveStack = host.properties?.stackData || [];
        const livePath = liveStack[loraData.slotIndex]?.[0] || currentPath;
        fetch("/xcp/save_lora_notes", {
            method: "POST", headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: livePath, notes: finalValue })
        });
        if (basta.layout?.regions?.editorLoraNotes) {
            basta.layout.regions.editorLoraNotes.hidden = !finalValue;
            markBLDDirty(basta, true);
            basta._layoutDirty = true;
            basta._forceSync = true;
            if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
            else basta.setDirtyCanvas(true);
        }
    };

    return props;
};

export const getLoraTriggerEditorProps = (host, basta, loraData, currentPath, vars) => {
    const tr = (host._loraTriggerCache?.[currentPath.replace(/\\/g, "/")] || host._loraTriggerCache?.[currentPath] || {});
    const props = getEditorProps(host, basta, loraData, tr, vars);
    const baseInput = props.onInput;
    const baseBlur = props.onBlur;

    props.onInput = (val, el, config) => {
        const liveStack = host.properties?.stackData || [];
        const liveLora = liveStack[loraData.slotIndex];
        if (liveLora) {
            liveLora[4] = val;
            loraData.tags = val.split(',').map(t => t.trim()).filter(t => t !== "");
            if (host.syncDerpOutputs) host.syncDerpOutputs();

            const livePath = liveLora[0] || currentPath;
            const liveCacheKey = livePath.replace(/\\/g, "/");
            const liveTr = host._loraTriggerCache?.[liveCacheKey] || host._loraTriggerCache?.[livePath] || {};
            const entryData = liveTr[basta._activeTagKey];
            const originalContent = (typeof entryData === 'object' ? entryData.tag : entryData) ?? "";

            if (basta.layout?.regions?.btnSaveTrigger) {
                basta.layout.regions.btnSaveTrigger.state = (val.trim() !== originalContent.trim()) ? "OFF" : "DIS";
            }
            markBLDDirty(basta, false);
            if (typeof host.requestDerpSync === "function") host.requestDerpSync();
            else host.setDirtyCanvas(true);
        }
        if (baseInput) baseInput(val, el, config);
    };

    props.onBlur = (val, el) => {
        const liveStack = host.properties?.stackData || [];
        const liveLora = liveStack[loraData.slotIndex];
        if (liveLora) {
            const finalValue = (val !== undefined) ? val : (el ? el.value : (liveLora[4] || ""));
            liveLora[4] = finalValue || "";
            loraData.tags = (finalValue || "").split(',').map(t => t.trim()).filter(t => t !== "");
            if (host.syncDerpOutputs) host.syncDerpOutputs();
            if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
            bumpBLDPerf(basta, "syncReq");
            if (basta.requestDerpSync) basta.requestDerpSync();
        }
    };

    return props;
};

export const getLoraTriggerDropdownProps = (host, basta, loraData, triggerItems, currentPath, vars) => {
    return {
        // THE PREVIEW FIX: Ensure trigger preview images match the dropdown item height and keep aspect ratio.
        itemImageHeight: "match",
        items: triggerItems.length > 0 ? triggerItems.map(t => ({
            ...t,
            // THE PROPERTY FIX: The dropdown engine expects 'imageUrl', not 'image'
            imageUrl: t.image ? `/xcp/get_lora_image?name=${encodeURIComponent(currentPath)}&file=${encodeURIComponent(t.image)}&v=${window._xcpDerpSession || Date.now()}` : null
        })) : [{ key: "None", display: tLocale("$basta_lora_detail.trigger.none", "None"), tag: "", name: tLocale("$basta_lora_detail.trigger.none", "None") }],
        // THE FACE FIX: Explicitly supply imageUrl to the root widget to render the active selection on the closed dropdown
        imageUrl: (() => {
            const active = triggerItems.find(t => t.key === basta._activeTagKey);
            return (active && active.image) ? `/xcp/get_lora_image?name=${encodeURIComponent(currentPath)}&file=${encodeURIComponent(active.image)}&v=${window._xcpDerpSession || Date.now()}` : null;
        })(),
        value: basta._activeTagKey || (triggerItems.length > 0 ? triggerItems[0].key : "No triggers found"),
        text: (() => {
            const active = triggerItems.find(t => t.key === basta._activeTagKey);
            if (active) return active.display;
            // THE PENDING FIX: Display the new name immediately while fetch/rebuild is in flight
            return basta._activeTagName || (triggerItems.length > 0 ? triggerItems[0].display : tLocale("$basta_lora_detail.trigger.none_found", "No triggers found"));
        })(),
        onChange: (val) => {
            if (val === "No triggers found" || val === tLocale("$basta_lora_detail.trigger.none_found", "No triggers found")) return;
            const matched = triggerItems.find(t => t.key === val);
            if (matched) {
                basta._activeTagKey = matched.key;
                basta._activeTagName = matched.name;
                const stack = host.properties.stackData || [];
                const idx = loraData.slotIndex;
                if (stack[idx]) {
                    // THE SYNC FIX: Prefer the resolved tag from the array cache which contains instant updates
                    let tagContent = matched.tag;
                    if (tagContent === undefined) {
                        const liveTr = host._loraTriggerCache?.[currentPath.replace(/\\/g, "/")] || host._loraTriggerCache?.[currentPath] || {};
                        tagContent = typeof liveTr[matched.key] === 'object' ? (liveTr[matched.key].tag || "") : (liveTr[matched.key] || "");
                    }
                    stack[idx][3] = matched.key;
                    stack[idx][4] = tagContent || "";
                    loraData.tags = (tagContent || "").split(',').map(t => t.trim()).filter(t => t !== "");

                    // THE DOM SYNC FIX: Force editor to show new content immediately on dropdown change
                    const editorEl = basta.dynamicElements?.loraTriggersEditor;
                    if (editorEl) editorEl.value = tagContent || "";

                    // Keep cover image by default on trigger dropdown changes.
                    // Only explicit next/prev actions should switch to archived images.
                    const lName = loraData.rawFileName || loraData.name;
                    const session = window._xcpDerpSession || Date.now();
                    loraData.currentImageIndex = -1;
                    loraData.previewUrl = `/xcp/get_lora_preview?name=${encodeURIComponent(lName)}&v=${session}`;
                    debugPreviewSet(loraData, "bastaLoraDetail_core:triggerDropdownChange", loraData.previewUrl);
                    loraData.aspectRatio = null;
                    calculatePreviewAspectRatio(basta, loraData, () => {
                        markBLDDirty(basta, false);
                        basta._forceSync = true;
                        if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
                        else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true);
                    });

                    if (host.syncDerpOutputs) host.syncDerpOutputs();
                    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
                    if (host.refreshDerpLoraStackSysMap) host.refreshDerpLoraStackSysMap();
                    if (typeof host.requestDerpSync === "function") host.requestDerpSync();
                    else host.setDirtyCanvas(true);
                }
            }
            bumpBLDPerf(basta, "syncReq");
            basta.requestDerpSync();
        }
    };
};

/**
 * cleanTriggerText: Formats trigger words to ensure proper comma spacing and a trailing comma.
 */
export const cleanTriggerText = (text) => {
    if (!text) return "";
    // THE INTEGRITY FIX: Preserve newlines and clean individual comma-separated segments
    return text.split('\n').map(segment => {
        if (!segment.trim()) return "";
        return segment.split(',').map(t => t.trim()).filter(t => t !== "").join(', ') + ", ";
    }).join('\n');
};

// THE SELECTION GUARD: Deselect preview if user clicks anywhere else on the window
window.addEventListener("pointerdown", (e) => {
    const basta = window.xcpActiveBastas?.get(getLoraDetailId());
    if (!basta || !basta._previewSelected) return;

    // DESELECTION LOGIC: If the click is not on the shield, it's outside the panel.
    // If it's on the shield, the internal handleShieldInteraction wrapper handles deselection.
    const rect = basta.interactionShield?.getBoundingClientRect();
    const isOverShield = rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

    if (!isOverShield) deselectLoraPreview(basta);
}, true);

window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const basta = window.xcpActiveBastas?.get(getLoraDetailId());
    if (deselectLoraPreview(basta)) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}, true);

export function handleBastaLoraDetail(host, targetRegion, loraData, layoutMapFactory) {
    const id = getLoraDetailId();

    // THE DROP-ORPHAN FIX: If a dropdown is open when we switch LoRAs, it must be closed
    // immediately because its host element is about to be destroyed.
    if (typeof window._xcpCloseActiveDropdown === "function") window._xcpCloseActiveDropdown();

    const existing = window.xcpActiveBastas?.get(id);
    if (existing) existing.destroy(); // kill the bastard if it's already born

    const loraPath = loraData.loraPath || loraData.rawFileName || loraData.path || loraData.name || "";
    const loraName = getLoraDetailTitle(loraPath, loraData.rating, !!loraData.previewUrl);

    if (loraData.previewUrl && !loraData.aspectRatio) {
        const b = window.xcpActiveBastas?.get(id);
        calculatePreviewAspectRatio(b, loraData, () => {
            if (b) b._skipAnimOnce = true;
        });
    }

    if (!loraData.metadataString) {
        loraData.metadataString = tLocale("$basta_lora_detail.metadata.loading", "Loading...");
        const fileName = loraData.rawFileName || loraData.name;
        const sessionTime = window._xcpDerpSession || Date.now();
        const fetchPath = (fileName || "").replace(/\\/g, "/");

        fetch(`/xcp/get_lora_info?name=${encodeURIComponent(fetchPath)}&t=${sessionTime}`)
            .then(r => r.ok ? r.json() : {})
            .then(async data => {
                let rawMeta = data.metadata || data.info || {};
                if (typeof rawMeta === "string") { try { rawMeta = JSON.parse(rawMeta); } catch(e) { rawMeta = { Raw: rawMeta }; } }
                const metaEntries = (typeof rawMeta === "object" && rawMeta !== null) ? Object.entries(rawMeta) : [];

                loraData.baseModel = (data.baseModel && data.baseModel !== "Unknown") ? data.baseModel : (rawMeta.ss_base_model_version || loraData.baseModel || tLocale("$basta_lora_detail.labels.unknown", "Unknown"));

                const potentialHashes = [
                    data.full_hash, data.auto_hash, data.hash
                ].filter(h => h && typeof h === 'string' && h.length === 64)
                    .map(h => String(h).trim().toLowerCase());

                loraData.hashes = [...new Set(potentialHashes)];

                const metaLink = metaEntries.find(([k, v]) => typeof v === "string" && v.includes("civitai.com"))?.[1];
                loraData.civitaiUrl = data.civitai_url || data.url || metaLink || null;

                if (loraData.civitaiUrl && loraData.civitaiUrl.includes("civitai.com")) {
                    const match = loraData.civitaiUrl.match(/https:\/\/civitai\.com\/models\/(\d+)/);
                    if (match) {
                        loraData.civitaiUrl = match[0];
                        if (!loraData.civitaiModelId) loraData.civitaiModelId = match[1];
                    }
                }

                loraData.civitaiName = data.civitai_name || rawMeta.civitai_name || rawMeta["modelspec.title"] || data.name || null;
                loraData.civitaiModelId = loraData.civitaiModelId || rawMeta.civitai_model_id || rawMeta.ss_civitai_model_id || null;
                loraData.civitaiVersionId = rawMeta.civitai_version_id || rawMeta.ss_civitai_version_id || null;

                // THE STRUCTURAL GUARD: Force the rating to exist even if missing from JSON/Metadata
                const rawR = data.rating !== undefined ? data.rating : (rawMeta.rating !== undefined ? rawMeta.rating : null);
                loraData.rating = rawR !== null ? parseInt(rawR, 10) : 0;

                // THE NOTES SYNC: Check rawMeta (the _info.json sidecar object) as well for the notes entry
                loraData.notes = data.notes || rawMeta.notes || "";

                const b = window.xcpActiveBastas?.get(id);
                if (b) {
                    const rInt = loraData.rating;
                    const ratingBadge = (rInt >= 1 && rInt <= 7) ? (ratingGlyphs[rInt] || "") : (host.properties.previewList?.includes(loraData.name) ? "🖻 " : "🖺 ");
                    b.titleLabel = ratingBadge + (loraData.name || tLocale("$basta_lora_detail.title", "LoRA Detail")).replace(/\.safetensors$/i, "");
                    markBLDDirty(b, false);
                    b._forceSync = true;
                    if (typeof b.requestDerpSync === "function") b.requestDerpSync();
                    else if (typeof b.setDirtyCanvas === "function") b.setDirtyCanvas(true, true);
                }

                const applyDirectLink = (modelId, versionId, modelName) => {
                    loraData.civitaiModelId = modelId;
                    loraData.civitaiVersionId = versionId || null;
                    const vParam = versionId ? `?modelVersionId=${versionId}` : "";
                    loraData.civitaiUrl = `https://civitai.com/models/${modelId}${vParam}`;
                    loraData.civitaiName = modelName || loraData.civitaiName;
                    loraData.metadataString = `CivitAI URL: ${loraData.civitaiUrl}`;
                    const b = window.xcpActiveBastas?.get(id);
                    if (b) {
                        // THE NOTES SYNC FIX: Ensure editor visibility is updated in the direct link branch
                        if (b.layout?.regions?.editorLoraNotes) {
                            b.layout.regions.editorLoraNotes.hidden = !loraData.notes;
                            b.layout.regions.editorLoraNotes.text = loraData.notes || "";
                            b.layout.regions.editorLoraNotes.value = loraData.notes || "";
                        }
                        markBLDDirty(b, false);
                        b._forceSync = true;
                        b._skipAnimOnce = true;
                        if (typeof b.requestDerpSync === "function") b.requestDerpSync();
                        else if (typeof b.setDirtyCanvas === "function") b.setDirtyCanvas(true, true);
                    }
                };

                if (loraData.civitaiModelId && !loraData.civitaiUrl) {
                    const vParam = loraData.civitaiVersionId ? `?modelVersionId=${loraData.civitaiVersionId}` : "";
                    loraData.civitaiUrl = `https://civitai.com/models/${loraData.civitaiModelId}${vParam}`;
                }

                const allowedKeys = ["ss_resolution", "ss_clip_skip", "ss_network_dim", "ss_network_alpha", "ss_epoch"];
                const cleanMeta = metaEntries
                    .filter(([k]) => (!k.startsWith("ss_") || allowedKeys.includes(k)) && !k.startsWith("modelspec.") && !k.includes("datasets") && !k.includes("bucket"))
                    .map(([k, v]) => `${k.replace("ss_", "")}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
                 const fallbackMetaStr = cleanMeta.length > 0 ? cleanMeta.join("\n") : tLocale("$basta_lora_detail.metadata.no_readable", "No human-readable metadata found.");

                const fallbackToMeta = () => {
                    loraData.metadataString = fallbackMetaStr;
                    const b = window.xcpActiveBastas?.get(id);
                    if (b) {
                        // THE UI REFRESH: Update title label with rating/icon and toggle notes editor visibility
                        const rInt = loraData.rating;
                        const ratingBadge = (rInt >= 1 && rInt <= 7) ? (ratingGlyphs[rInt] || "") : (host.properties.previewList?.includes(loraData.name) ? "🖻 " : "🖺 ");
                        b.titleLabel = ratingBadge + (loraData.name || tLocale("$basta_lora_detail.title", "LoRA Detail")).replace(/\.safetensors$/i, "");

                        if (b.layout?.regions?.editorLoraNotes) {
                            b.layout.regions.editorLoraNotes.hidden = !loraData.notes;
                            b.layout.regions.editorLoraNotes.text = loraData.notes || "";
                            b.layout.regions.editorLoraNotes.value = loraData.notes || "";
                            b.layout.regions.editorLoraNotes.minHeight = loraData.notes ? profileMeasureText(b, loraData.notes, (b.layout.regions.editorLoraNotes.w || 200) - 12, 10, "Arial, sans-serif") + 24 : 0;
                        }
                    }
                };

                if (loraData.civitaiModelId || loraData.civitaiUrl) {
                    const resolvedId = loraData.civitaiModelId || (loraData.civitaiUrl && loraData.civitaiUrl.match(/models\/(\d+)/)?.[1]);
                    applyDirectLink(resolvedId, loraData.civitaiVersionId, loraData.civitaiName);
                } else {
                    fallbackToMeta();
                }
            }).catch(() => {
            loraData.baseModel = tLocale("$basta_lora_detail.labels.unknown", "Unknown");
            loraData.metadataString = tLocale("$basta_lora_detail.metadata.failed", "Failed to fetch metadata.");
            const b = window.xcpActiveBastas?.get(id);
            if (b) {
                markBLDDirty(b, false);
                b._forceSync = true;
                b._skipAnimOnce = true;
                if (typeof b.requestDerpSync === "function") b.requestDerpSync();
                else if (typeof b.setDirtyCanvas === "function") b.setDirtyCanvas(true, true);
            }
        });
    }

    const onScanTags = (purge = false) => {
        showBastaMessage(host, purge ? tLocale("$basta_lora_detail.messages.purging_syncing", "Purging & Syncing Triggers...") : tLocale("$basta_lora_detail.messages.scanning", "Scanning for Triggers..."), 2000, {fade:true}, null, false, "info", "shuffle");
        fetch("/xcp/extract_lora_tags", {
            method: "POST",
            body: JSON.stringify({ name: loraData.name, remove_txt: purge })
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    showBastaMessage(host, `${tLocale("$basta_lora_detail.messages.success_prefix", "Success!")} ${data.count} ${tLocale("$basta_lora_detail.messages.triggers_processed", "Triggers processed.")}`, 3000, {fade:true}, null, false, "success", "success");
                    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
                }
            });
    };

    const onManageTags = () => {
        const category = `lora_triggers?name=${encodeURIComponent(loraData.name)}`;
        showBastaFileHandler(host, category, targetRegion, {
            title: `${tLocale("$basta_lora_detail.dialogs.manage.title", "Manage")}: ${loraData.name.replace(/\.safetensors$/i, "")}`,
            mode: "rename"
        });
    };

    const config = {
        host: host,
        titleLabel: loraName,
        autoSize: true,
        targetRegion: (host && host.properties && host.properties[`bastaOffset_${id}`]) ? null : targetRegion,
        properties: {
            clickToClose: false,
            bastaMovalbe: true,
            bastaSingleton: true,
            autoWidth: false,
            minWidth: 200,
            autoHeight: true,
            snapHeight: false
        },
        initialSize: [200, 260],
        layoutMap: layoutMapFactory(host, targetRegion, loraData, id)
    };
    const instance = spawnBasta(id, config);

    instance._loraData = loraData;
    instance._previewSelected = false;
    instance._navAlpha = 0;
    instance._uiHovered = false;
    instance._lastUiHovered = false;
    instance._hoveredRegionKey = null;
    instance._lastHoverKey = null;
    instance._externalReady = false;

    const currentPath = loraData.loraPath || loraData.rawFileName || loraData.path || loraData.name || "";
    const triggerItems = getTriggerItemsForPath(host, currentPath);
    const currentEntry = host.properties.stackData[loraData.slotIndex] || [];
    const currentKey = currentEntry[3] || "";
    const currentTag = currentEntry[4] || "";
    const activeMatch = triggerItems.find(t => t.key === currentKey)
        || triggerItems.find(t => t.tag === currentTag || t.name === currentTag);
    instance._activeTagKey = activeMatch ? activeMatch.key : null;
    instance._activeTagName = activeMatch ? activeMatch.name : null;

    // THE SYNC BRIDGE FIX: Ensure the Basta panel instantly rebuilds whenever the host node updates its internal state (like receiving async triggers)
    if (host && !host._derpBastaRefreshHooked) {
        const orgRefresh = host.refreshNodeLayoutMap;
        if (orgRefresh) {
            host.refreshNodeLayoutMap = function() {
                const prevHash = this._layoutMapHash;
                const res = orgRefresh.apply(this, arguments);
                const b = window.xcpActiveBastas?.get(getLoraDetailId());
                const nextHash = this._layoutMapHash;
                if (b && b.hostNode === this && prevHash !== nextHash) {
                    bumpBLDPerf(b, "hostRefresh");
                    bumpBLDSource(b, "hostRefreshSources");
                    markBLDDirty(b, true);
                    b._layoutDirty = true;
                    b._forceSync = true;
                    if (typeof b.requestDerpSync === "function") b.requestDerpSync();
                    else if (typeof b.setDirtyCanvas === "function") b.setDirtyCanvas(true, true);
                }
                return res;
            };
        }
        host._derpBastaRefreshHooked = true;
    }


    if (instance) {
        // THE TRIGGER REFRESH FIX: Wrap the host's fetch logic to guarantee a global cache bust whenever triggers change
        const orgFetch = host.fetchDerpLoraTriggers;
        if (orgFetch && !host._derpFetchWrapped) {
            host.fetchDerpLoraTriggers = function() {
                window._xcpDerpSession = Date.now();
                return orgFetch.apply(this, arguments);
            };
            host._derpFetchWrapped = true;
        }
        instance._loraData = loraData;
        refreshLoraImageList(instance, loraData);

        // THE IMAGE UPLOAD FIX: Create a dedicated upload function that supports both manual selection and pasting
        instance.uploadLoraPreview = (blob, isCover = false) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const base64 = reader.result.split(',')[1];
                const loraData = instance._loraData;
                if (!loraData) return;

                const lName = loraData.name;
                const lPath = loraData.loraPath || loraData.rawFileName || loraData.path; // THE MODEL NAME FIX: Pass the full path for backend resolution
                const pData = await app.graphToPrompt();

                fetch("/xcp/upload_lora_preview", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: lName,
                        loraPath: lPath,
                        image: base64,
                        is_cover: isCover,
                        prompt: pData.output,
                        extra_pnginfo: { workflow: pData.workflow },
                        model_name_prefix: (() => {
                            const sigs = window.xcpDerpSignals;
                            if (!sigs) return "Unknown_Model";
                            const mId = host?.properties?.multiSignalIds?.Model || host?.properties?.modelSignalId;
                            const sig = sigs[mId] || Object.values(sigs).find(s => s.type?.toUpperCase() === "MODEL" && s.value?.model_name_prefix);
                            return sig?.value?.model_name_prefix || host?.properties?.selectedModel || "Unknown_Model";
                        })()
                    })
                }).then(r => r.json()).then(data => {
                    if (data.success) {
                        refreshLoraImageList(instance, loraData);
                        if (isCover) {
                            loraData.previewUrl = `/xcp/get_lora_preview?name=${encodeURIComponent(lName)}&v=${Date.now()}`;
                            debugPreviewSet(loraData, "bastaLoraDetail_core:uploadCover", loraData.previewUrl);
                            instance._forceSync = true;
                        }
                    }
                });
            };
        };

        // THE ASYNC DATA POLLER: Optimized for Array Cache
        instance._derpKnownTriggers = -1;
        if (!instance._derpLoraDetailInitialized) {
            const orgUpdate = instance.update;
            instance.update = function() {
                const bldUpdateStart = window.DERP_BLD_PROFILE ? performance.now() : 0;
                let needsVisualDirty = false;
                let needsFullDirty = false;
                const liveStack = host.properties?.stackData || [];
                const slotIdx = this._loraData?.slotIndex ?? loraData.slotIndex;
                const path = liveStack[slotIdx]?.[0] || "";
                const tCount = getTriggerItemsForPath(host, path).length;

                if (this._derpKnownTriggers !== tCount) {
                    this._derpKnownTriggers = tCount;
                    if (tCount > 0) {
                        markBLDDirty(this, true);
                        this._layoutDirty = true;
                        this._forceSync = true;
                        this._derpAwakeFrames = 30;
                        needsFullDirty = true;
                    }
                }

                if (this._lastHoverKey !== this._hoveredRegionKey || this._lastUiHovered !== this._uiHovered) {
                    this._lastHoverKey = this._hoveredRegionKey;
                    this._lastUiHovered = this._uiHovered;
                    // THE HOVER SPAM FIX: Region hover states only need a canvas redraw, not a full structural layout sync
                    this._derpAwakeFrames = 10;
                    needsVisualDirty = true;
                }
                const hKey = this._hoveredRegionKey;
                const hasImages = (loraData.images ? loraData.images.length : (loraData.imageCount || 0)) >= 1;

                // Startup readiness gate: reveal externalRow only after nav geometry exists,
                // so position is correct before first hover interaction.
                if (!this._externalReady) {
                    const navH = this.layout?.regions?.imageHandlingRegion?.h || 0;
                    if (navH > 5) {
                        this._externalReady = true;
                        this._navH = navH;
                        markBLDDirty(this, true);
                        this._layoutDirty = true;
                        this._forceSync = true;
                        this._derpAwakeFrames = Math.max(this._derpAwakeFrames || 0, 8);
                        needsFullDirty = true;
                    }
                }

                const liveNavH = this.layout?.regions?.imageHandlingRegion?.h || 0;
                if (liveNavH > 5) {
                    const prevNavH = this._navH || 0;
                    if (Math.abs(prevNavH - liveNavH) > 0.5) {
                        this._navH = liveNavH;
                        markBLDDirty(this, true);
                        this._layoutDirty = true;
                        this._forceSync = true;
                        this._derpAwakeFrames = Math.max(this._derpAwakeFrames || 0, 4);
                        needsFullDirty = true;
                    }
                }

                // THE HOVER FIX: Explicitly check for true to ensure animation triggers/reverses correctly
                // when the mouse leaves for the empty canvas.
                const isHoveringNav = this._isDerpResizing || (!this._isSaving && (this._uiHovered === true) && (
                    hKey === "loraPreview" ||
                    hKey === "imageHandlingRegion" ||
                    hKey === "externalRow" ||
                    hKey === "triggerControlRow" || hKey === "btnSaveTrigger" ||
                    (hKey && (
                        hKey.startsWith("btnImage") || hKey === "btnSetCover" || hKey === "btnSetTrigger" || hKey === "btnDeleteImage" ||
                        hKey.startsWith("btnCiv") || hKey === "btnOpenFolder"
                    ))
                ));

                const targetAlpha = isHoveringNav ? 1.0 : 0.0;
                if (this._navAlpha === undefined) this._navAlpha = 0;

                const prevAlpha = this._navAlpha;
                const alphaRes = animateAlpha(this._navAlpha, targetAlpha, IMAGE_NAV_ALPHA_SPEED, this.properties.useAnimations !== false);
                this._navAlpha = alphaRes.value;

                let isPulsing = false;

                // THE PERF FIX: Distribute visual updates directly to caches to avoid deep layout computes
                if (alphaRes.isAnimating) {
                    this._derpAwakeFrames = 10;
                    isPulsing = true;
                    const updateAlpha = (key) => {
                        if (this.layout?.regions?.[key]) this.layout.regions[key].alpha = this._navAlpha;
                        if (this._compDataCache?.[key]) this._compDataCache[key].alpha = this._navAlpha;
                    };
                    ["imageHandlingRegion", "btnImagePrevious", "btnSetCover", "btnSetTrigger", "btnDeleteImage", "btnImageNext",
                        "labelRegion", "labelImageName", "labelCount",
                        "externalRow", "externalRowBg", "btnCivit", "btnCivArchive", "btnOpenFolder"].forEach(updateAlpha);
                    needsVisualDirty = true;
                }

                // THE PERF FIX: Move high-frequency pulse math out of the layout factory
                if (!this._isSaving && this._savePulseColors && this.layout?.regions?.btnSaveTrigger && this.layout.regions.btnSaveTrigger.state !== "DIS") {
                    const pulsedColor = getPulsedColor(this._savePulseColors.a, this._savePulseColors.b, 0.005);
                    this.layout.regions.btnSaveTrigger.btnColor = pulsedColor;
                    if (this._compDataCache?.btnSaveTrigger) this._compDataCache.btnSaveTrigger.btnColor = pulsedColor;
                    this._derpAwakeFrames = 2;
                    isPulsing = true;
                    needsVisualDirty = true;
                }

                if (this._previewSelected && (window.xcpDerpSettings?.useAnimations !== false)) {
                    this._derpAwakeFrames = 2;
                    isPulsing = true;
                    needsVisualDirty = true;
                }

                if (needsFullDirty) {
                    if (this.requestDerpSync) this.requestDerpSync();
                    else if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                } else if (needsVisualDirty) {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true);
                }

                const orgRes = orgUpdate ? orgUpdate.apply(this, arguments) : false;
                if (window.DERP_BLD_PROFILE) {
                    bumpBLDPerf(this, "update");
                    bumpBLDPerf(this, "updateMs", performance.now() - bldUpdateStart);
                    flushBLDPerf(this);
                }
                return isPulsing || alphaRes.isAnimating || orgRes;
            };

            instance.onClose = () => {
                // THE CLEANUP FIX: Guarantee slot is cleared and memory is released after any close sequence
                host._activeDetailSlot = null;
                host._layoutDirty = true;
                host._forceSync = true;
                host._derpAwakeFrames = 5;

                if (instance._loraData) {
                    instance._loraData.previewUrl = null;
                    instance._loraData.images = [];
                }
                if (typeof host.refreshNodeLayoutMap === "function") host.refreshNodeLayoutMap();
                if (typeof host.requestDerpSync === "function") host.requestDerpSync();
                else if (typeof host.setDirtyCanvas === "function") host.setDirtyCanvas(true, true);
            };

            const originalHandler = instance.handleShieldInteraction;
            instance.handleShieldInteraction = function(type, data) {
                if (type === "hover") this._uiHovered = true;

                // THE INTERACTION GATE: Prevent high-frequency mouse events (move/hover) from flooding the CPU
                if (type === "move" || type === "hover") {
                    if (this._syncLock) {
                        this._pendingHoverData = data;
                        return false;
                    }
                    this._syncLock = true;
                    setTimeout(() => {
                        this._syncLock = false;
                        if (this._pendingHoverData) {
                            originalHandler.call(this, type, this._pendingHoverData);
                            this._pendingHoverData = null;
                        }
                    }, 32);
                }

                if (type === "click") {
                    const overKey = this._pressedRegionKey || "";
                    const previewReg = this.layout?.regions?.loraPreview;
                    const localMouse = [data.localX || 0, data.localY || 0];
                    const isPreviewDirectHit = previewReg && this.layout?.hitTest?.(localMouse, previewReg);
                    if (!overKey && isPreviewDirectHit && typeof previewReg.onPress === "function") {
                        previewReg.onPress(data.originalEvent, data);
                        return true;
                    }
                    const isPreviewHit = (overKey === "loraPreview") || overKey.startsWith("btn") || isPreviewDirectHit;

                    if (!isPreviewHit) {
                        deselectLoraPreview(this);
                    }
                }
                return originalHandler.apply(this, arguments);
            };
            instance._derpLoraDetailInitialized = true;
        }

        instance.layoutMap = layoutMapFactory(host, targetRegion, loraData, id);
        instance.titleLabel = config.titleLabel;
        instance._forceSync = true;
        instance._skipAnimOnce = true;
        // Startup pre-sync: warm nav region layout once so externalRow/image nav geometry
        // is correct before first user hover/mouse move.
        instance._navAlpha = Math.max(instance._navAlpha || 0, 0.02);
        instance._layoutDirty = true;
        instance._derpAwakeFrames = Math.max(instance._derpAwakeFrames || 0, 12);
        if (typeof instance.requestDerpSync === "function") instance.requestDerpSync();
        else if (typeof instance.setDirtyCanvas === "function") instance.setDirtyCanvas(true, true);
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
                instance._forceSync = true;
                instance._layoutDirty = true;
                if (typeof instance.requestDerpSync === "function") instance.requestDerpSync();
                else if (typeof instance.setDirtyCanvas === "function") instance.setDirtyCanvas(true, true);
            });
        }
    }
    return instance;
}
