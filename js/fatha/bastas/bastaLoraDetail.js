/**
 * Path: ./js/fatha/bastas/bastaLoraDetail.js
 * ROLE: A detailed info panel for LoRA models, including previews and metadata.
 */
import { UI_TYPES } from "../core/masterLayoutTypes.js";


import { showBastaMessage } from "./bastaMessage.js";
import { showBastaFileHandler } from "./bastaFileHandler.js";
import { getLoraDetailId, handleBastaLoraDetail, cleanTriggerText,
    openCivitAI, openCivArchive, getLoraTriggerEditorProps,
    getLoraNotesEditorPropsWrapped, getLoraTriggerDropdownProps } from "./core/bastaLoraDetail_core.js";
import { manageLoraTrigger, getRatingColor, getLoraRatingDropdownProps, getLoraLoaderProps, processTriggerData } from "../../controldeck/helpers/loraComponents.js";
import { colorPulse2, parseColor, animateAlpha } from "../../herbina/masterAnimator.js";
import { resolvePaintData, measureTextHeight } from "../../herbina/utils/widgetsUtils.js";
import { calculatePreviewDisplayHeight, switchLoraImage, setLoraCover, calculatePreviewAspectRatio, deleteLoraDetailImage } from "../../controldeck/helpers/loraImages.js";

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
            resolvePaint: 0,
            measureText: 0,
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

function flushBLDPerf(basta) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    const now = performance.now();
    if (now - perf.lastLog < 1000) return;
    const seconds = Math.max((now - perf.lastLog) / 1000, 0.001);
    const perSec = (value) => Math.round((value || 0) / seconds);
    console.log(
        `[BLDPerf] ${basta.title || basta.titleLabel || "bastaLoraDetail"} | ` +
        `layoutBuild=${perSec(perf.layoutBuild)}/s ` +
        `resolvePaint=${perSec(perf.resolvePaint)}/s ` +
        `measureText=${perSec(perf.measureText)}/s`
    );
    perf.layoutBuild = 0;
    perf.resolvePaint = 0;
    perf.measureText = 0;
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

export { getLoraDetailId };

function getTriggerItemsForPath(host, loraPath) {
    const cache = host?._loraTriggerArrayCache;
    if (!cache || !loraPath) return [];

    const normalized = String(loraPath).replace(/\\/g, "/");
    const windowsStyle = normalized.replace(/\//g, "\\");
    return cache[loraPath] || cache[normalized] || cache[windowsStyle] || [];
}

export const createLoraDetailLayoutMap = (host, targetRegion, loraData, id) => (basta, vars) => {
    bumpBLDPerf(basta, "layoutBuild");
    flushBLDPerf(basta);
    const { mW, mH, sW, sH, oY, pW, pH } = vars;

    const bgPal = { path: "_system/NODE_loraDetail_default.json", entry: "background" };
    const btnPal = { path: "_system/NODE_loraDetail_default.json", entry: "button" };
    const civitPal = { path: "_system/NODE_loraDetail_default.json", entry: "CivitAI" };
    const civArchivePal = { path: "_system/NODE_loraDetail_default.json", entry: "CivArchive" };
    const folderPal = { path: "_system/NODE_loraDetail_default.json", entry: "Folder" };
    const ratPal = { path: "_system/PALETTE_ratings_default.json", entry: "ratings" };

    const liveStack = host.properties?.stackData || [];
    const currentPath = loraData.loraPath || liveStack[loraData.slotIndex]?.[0] || loraData.rawFileName || loraData.name || "";

    const hasImages = (loraData.images ? loraData.images.length : (loraData.imageCount || 0)) >= 1;

    // THE STABLE POSITION FIX: Cache measured height to prevent anchor slide during alpha fade.
    // Always hydrate from live region height when available; gating by alpha can leave stale
    // values until a later interaction (e.g. next/prev image click).
    const liveNavH = basta.layout?.regions?.imageHandlingRegion?.h || 0;
    if (liveNavH > 5) {
        basta._navH = liveNavH;
    }
    const stableNavH = liveNavH > 5 ? liveNavH : (basta._navH || 26);

    // THE INITIAL HYDRATION: Ensure metadata is fetched as soon as the panel is mapped if not already cached
    if (!loraData._setupFetched) {
        loraData._setupFetched = true;
        fetch(`/xcp/get_lora_info?name=${encodeURIComponent(currentPath)}`)
            .then(r => r.json())
            .then(info => {
                loraData.setup = info.setup || {};
                loraData.notes = info.notes || loraData.notes || "";
                loraData.loraPath = info.loraPath || currentPath;

                // THE SYNC FIX: Push fetched setup data to the host node cache
                if (!host._loraSetup) host._loraSetup = {};
                host._loraSetup[currentPath] = loraData.setup;
                if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();

                basta._layoutDirty = true;
                basta.setDirtyCanvas(true);
            }).catch(() => {
            loraData._setupFetched = true;
            basta._layoutDirty = true;
            basta.setDirtyCanvas(true);
        });
    }

    const ratingProps = getLoraRatingDropdownProps(host, basta, loraData);
    // While preview is loading, reserve space as a 1024x1024 placeholder (1:1 aspect)
    // so panel geometry is stable before the real image ratio is known.
    const previewAspectForLayout = loraData.aspectRatio || 1;
    const previewH = Math.floor(calculatePreviewDisplayHeight(basta, previewAspectForLayout, mW));
    const loaderProps = getLoraLoaderProps(host, basta, loraData);
    const triggerItems = getTriggerItemsForPath(host, currentPath);

    // THE RESET ENGINE: If the model or slot has changed, clear the stale trigger selection
    if (basta._lastLoraName !== currentPath || basta._lastSlotIndex !== loraData.slotIndex) {
        basta._lastLoraName = currentPath;
        basta._lastSlotIndex = loraData.slotIndex;
        basta._activeTagKey = null;
        basta._activeTagName = null;
    }

    // THE SELECTION SYNC: Initialize Basta state from the host's active stack selection
    const stack = host.properties.stackData || [];
    const idx = loraData.slotIndex;
    if (triggerItems.length === 0) {
        // Preserve the current trigger selection during transient empty-cache windows.
        // Save/fetch rebuilds can briefly produce no trigger items even though the trigger
        // still exists on disk; clearing here causes the post-save disappearance bug.
    } else {
        const nodeSelectionKey = stack[idx]?.[3];

        let activeEntry = triggerItems.find(t => t.key === basta._activeTagKey) ||
            triggerItems.find(t => t.key === nodeSelectionKey) ||
            triggerItems[0];

        if (activeEntry) {
            const isNewSelection = basta._activeTagKey !== activeEntry.key;
            basta._activeTagKey = activeEntry.key;
            basta._activeTagName = activeEntry.name;

            if (isNewSelection) {
                const lName = loraData.rawFileName || loraData.name;
                const session = window._xcpDerpSession || Date.now();
                loraData._previewLoading = true;
                // Keep cover image on auto selection changes.
                // Only next/prev controls should switch to archived sub-images.
                loraData.currentImageIndex = -1;
                loraData.previewUrl = `/xcp/get_lora_preview?name=${encodeURIComponent(lName)}&v=${session}`;
                debugPreviewSet(loraData, "bastaLoraDetail:autoSelection", loraData.previewUrl);
                loraData.aspectRatio = null;
                calculatePreviewAspectRatio(basta, loraData, () => {
                    basta._forceSync = true;
                    if (typeof basta.requestViewportFit === "function") basta.requestViewportFit(10);
                    if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true);
                });
            }

            if (stack[idx] && (isNewSelection || !stack[idx][4])) {
                stack[idx][3] = activeEntry.key;
                stack[idx][4] = activeEntry.tag;
                loraData.tags = (activeEntry.tag || "").split(',').map(t => t.trim()).filter(t => t !== "");
                if (host.syncDerpOutputs) host.syncDerpOutputs();
            }
        }
    }

    const isSaveEnabled = (() => {
        const items = triggerItems;
        const active = items.find(t => t.key === basta._activeTagKey);
        if (!active) return false;

        const liveStack = host.properties?.stackData || [];
        const editorEl = basta.dynamicElements?.loraTriggersEditor;
        const currentContent = (editorEl && document.activeElement === editorEl) ?
            editorEl.value : (liveStack[loraData.slotIndex]?.[4] ?? "");

        return (currentContent.trim() !== active.tag.trim());
    })();

    // THE SAVE PULSE: Set up colors for the Save button pulse loop in update()
    let initialPulseColor = null;
    if (isSaveEnabled && (window.xcpDerpSettings?.useAnimations !== false)) {
        if (!basta._savePulseColors) {
            const paintDIS = profileResolvePaint(basta, "button", "_DIS");
            const paintON = profileResolvePaint(basta, "button", "_ON");
            basta._savePulseColors = { a: parseColor(paintDIS?.fill), b: parseColor(paintON?.fill) };
        }
        initialPulseColor = basta.layout?.regions?.btnSaveTrigger?.btnColor || `rgba(${basta._savePulseColors.a.join(',')})`;
    } else if (basta._savePulseColors) {
        delete basta._savePulseColors;
    }

    const ratingBorder = getRatingColor(loraData.ratingsPalette, loraData.rating || 1, "_OFF");

    return {
        contentRegion: {
            themeKey: "background", palette: bgPal,
            anchor: { target: "headerRegion", axis: "y" },
            dir: "col",
            width: "full",
            height: "auto",
            margin: [mW, 0],
            spacing: [0, sH],
            headerSpacer: { height: mH },
            loraLoaderRow: {
                dir: "row", width: "full", height: "auto", margin: [0, 0, 0, mH],
                btnAddNote: {
                    type: UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textSmall",
                    width: "match", height: "full", padding: [pW, pH], spacing: [sW, 0], margin: [0, 0, 0, 0],
                    hidden: !!loraData.notes,
                    onPress: () => {
                        const liveStack = host.properties?.stackData || [];
                        const lName = liveStack[loraData.slotIndex]?.[0] || currentPath;
                        const val = " ";
                        loraData.notes = val;
                        fetch("/xcp/save_lora_notes", {
                            method: "POST",
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: lName, notes: val })
                        });
                        const row = basta.layout?.regions?.loraLoaderRow;
                        if (row) {
                            if (row.btnAddNote) row.btnAddNote.hidden = true;
                            if (row.btnDeleteNote) row.btnDeleteNote.hidden = false;
                        }
                        if (basta.layout?.regions?.editorLoraNotes) {
                            basta.layout.regions.editorLoraNotes.hidden = false;
                            basta.layout.regions.editorLoraNotes.text = val;
                            basta.layout.regions.editorLoraNotes.value = val;
                        }
                        basta._forceSync = true;
                        basta.setDirtyCanvas(true);
                    }
                },
                loraLoader: {
                    type: UI_TYPES.FILEBROWSER,
                    displayMode: "cutoff",
                    indicator: true,
                    minWidth: 50,
                    themeKey: "dialog, t_textSmall",
                    text: currentPath.split(/[\\/]/).pop() || "Unknown",
                    value: currentPath,
                    fileType: "lora",
                    width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0], margin: [0, 0, 0, 0],
                    canvasShield: true,
                    ...loaderProps
                },
                btnDeleteNote: {
                    type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall", labelAlign: ["center", "middle"],
                    text: "Delete Notes", width: "auto", height: "auto", padding: [pW, pH],
                    hidden: !loraData.notes, spacing: [sW, 0], margin: [0, 0, 0, 0],
                    onPress: () => {
                        const liveStack = host.properties?.stackData || [];
                        const lName = liveStack[loraData.slotIndex]?.[0] || currentPath;
                        loraData.notes = "";
                        fetch("/xcp/save_lora_notes", {
                            method: "POST",
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: lName, notes: "" })
                        });
                        const row = basta.layout?.regions?.loraLoaderRow;
                        if (row) {
                            if (row.btnAddNote) row.btnAddNote.hidden = false;
                            if (row.btnDeleteNote) row.btnDeleteNote.hidden = true;
                        }
                        if (basta.layout?.regions?.editorLoraNotes) {
                            basta.layout.regions.editorLoraNotes.hidden = true;
                            basta.layout.regions.editorLoraNotes.text = "";
                            basta.layout.regions.editorLoraNotes.value = "";
                        }
                        basta._forceSync = true;
                        basta.setDirtyCanvas(true);
                    }
                },
                btnSettings: {
                    type: UI_TYPES.ICONBUTTON, icon: "settings", themeKey: "button, t_textSmall",
                    state: basta._showLoraSettings ? "ON" : "OFF",
                    width: "match", height: "full", spacing: [sW, 0],
                    onPress: () => {
                        basta._showLoraSettings = !basta._showLoraSettings;
                        if (basta._showLoraSettings && !loraData._setupFetched) {
                            fetch(`/xcp/get_lora_info?name=${encodeURIComponent(currentPath)}`)
                                .then(r => r.json())
                                .then(info => {
                                    loraData._setupFetched = true;
                                    loraData.setup = info.setup || {};

                                    // THE SYNC FIX: Push fetched setup data to the host node cache
                                    if (!host._loraSetup) host._loraSetup = {};
                                    host._loraSetup[currentPath] = loraData.setup;
                                    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();

                                    basta._layoutDirty = true;
                                    basta.setDirtyCanvas(true);
                                }).catch(() => {
                                loraData._setupFetched = true;
                                basta._layoutDirty = true;
                                basta.setDirtyCanvas(true);
                            });
                        } else {
                            basta._layoutDirty = true;
                            basta.setDirtyCanvas(true);
                        }
                    }
                }
            },
            loraSettingsRegion: {
                dir: "row", width: "full", height: "auto", margin: [0, 0, 0, sH],
                hidden: !basta._showLoraSettings,
                labelMin: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSystem",
                    text: "Min:", width: "auto", spacing: [sW, 0],
                },
                editorMin: {
                    type: UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                    text: String(loraData.setup?.sliderStrength?.[0] ?? host.properties.sliderMin ?? -2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                    measureText: "00",
                    onBlur: (v) => {
                        const val = parseFloat(v); if (isNaN(val)) return;
                        if (!loraData.setup) loraData.setup = {};
                        if (!loraData.setup.sliderStrength) loraData.setup.sliderStrength = [host.properties.sliderMin ?? -2.0, host.properties.sliderMax ?? 2.0, host.properties.sliderStep ?? 0.05, host.properties.sliderDefault ?? 1.0];
                        if (loraData.setup.sliderStrength[0] === val) return;
                        loraData.setup.sliderStrength[0] = val;

                        // THE SYNC FIX: Update host cache and refresh node face
                        if (!host._loraSetup) host._loraSetup = {};
                        host._loraSetup[currentPath] = loraData.setup;
                        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();

                        fetch("/xcp/manage_lora_tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: currentPath, action: "update_setup", setup_data: { sliderStrength: loraData.setup.sliderStrength } })});
                    }
                },
                labelMax: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSystem",
                    text: "Max:", width: "auto", spacing: [sW, 0],
                },
                editorMax: {
                    type: UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                    text: String(loraData.setup?.sliderStrength?.[1] ?? host.properties.sliderMax ?? 2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                    measureText: "00",
                    onBlur: (v) => {
                        const val = parseFloat(v); if (isNaN(val)) return;
                        if (!loraData.setup) loraData.setup = {};
                        if (!loraData.setup.sliderStrength) loraData.setup.sliderStrength = [host.properties.sliderMin ?? -2.0, host.properties.sliderMax ?? 2.0, host.properties.sliderStep ?? 0.05, host.properties.sliderDefault ?? 1.0];
                        if (loraData.setup.sliderStrength[1] === val) return;
                        loraData.setup.sliderStrength[1] = val;

                        if (!host._loraSetup) host._loraSetup = {};
                        host._loraSetup[currentPath] = loraData.setup;
                        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();

                        fetch("/xcp/manage_lora_tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: currentPath, action: "update_setup", setup_data: { sliderStrength: loraData.setup.sliderStrength } })});
                    }
                },
                labelStep: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSystem",
                    text: "Step:", width: "auto", spacing: [sW, 0],
                },
                editorStep: {
                    type: UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                    text: String(loraData.setup?.sliderStrength?.[2] ?? host.properties.sliderStep ?? 0.05), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                    measureText: "0.00",
                    onBlur: (v) => {
                        const val = parseFloat(v); if (isNaN(val)) return;
                        if (!loraData.setup) loraData.setup = {};
                        if (!loraData.setup.sliderStrength) loraData.setup.sliderStrength = [host.properties.sliderMin ?? -2.0, host.properties.sliderMax ?? 2.0, host.properties.sliderStep ?? 0.05, host.properties.sliderDefault ?? 1.0];
                        if (loraData.setup.sliderStrength[2] === val) return;
                        loraData.setup.sliderStrength[2] = val;

                        if (!host._loraSetup) host._loraSetup = {};
                        host._loraSetup[currentPath] = loraData.setup;
                        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();

                        fetch("/xcp/manage_lora_tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: currentPath, action: "update_setup", setup_data: { sliderStrength: loraData.setup.sliderStrength } })});
                    }
                },
                labelDefault: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSystem",
                    text: "Def:", width: "auto", spacing: [sW, 0],
                },
                editorDefault: {
                    type: UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                    text: String(loraData.setup?.sliderStrength?.[3] ?? host.properties.sliderDefault ?? 1.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                    measureText: "0.00",
                    onBlur: (v) => {
                        const val = parseFloat(v); if (isNaN(val)) return;
                        if (!loraData.setup) loraData.setup = {};
                        if (!loraData.setup.sliderStrength) loraData.setup.sliderStrength = [host.properties.sliderMin ?? -2.0, host.properties.sliderMax ?? 2.0, host.properties.sliderStep ?? 0.05, host.properties.sliderDefault ?? 1.0];
                        if (loraData.setup.sliderStrength[3] === val) return;
                        loraData.setup.sliderStrength[3] = val;

                        if (!host._loraSetup) host._loraSetup = {};
                        host._loraSetup[currentPath] = loraData.setup;
                        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();

                        fetch("/xcp/manage_lora_tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: currentPath, action: "update_setup", setup_data: { sliderStrength: loraData.setup.sliderStrength } })});
                    }
                },
            },
            editorLoraNotes: {
                type: UI_TYPES.EDITOR, multiline: true, canvasShield: true, switchOnEditing: true,
                themeKey: "panel, t_textSmall", skipBackground: true,
                labelAlign: ["left", "top"],
                width: "full",
                padding: [pW, pH], margin: [0, 0, 0, sH],
                hidden: !loraData.notes,
                ...getLoraNotesEditorPropsWrapped(host, basta, loraData, currentPath, vars)
            },
            loraPreview: {
                type: UI_TYPES.IMAGE_HTML, drawMode: "both", strokeZIndex: true,
                isSelected: basta._previewSelected,
                showPasteOverlay: !!basta._previewSelected,
                overlayText: [
                    { text: "Ready to accept image pasting (CTRL-V)", themeKey: "t_textBig", offset: -6 },
                    { text: "Image will be saved in the lora's subfolder", themeKey: "t_textSmall", offset: 8 }
                ],
                pulseColorA: [0, 0, 0, 0.8],
                pulseColorB: [255, 255, 255, 1.0],
                pulseFreq: 0.003,
                imageUrl: loraData.previewUrl || null,
                suppressPlaceholder: !!loraData._previewLoading,
                borderColor: ratingBorder,
                borderWeight: 1.5,
                borderInsideRatio: 0.4,
                aspectFit: "contain",
                width: "full",
                height: previewH,
                margin: [0, 0, 0, sH],

                onPress: () => {
                    basta._previewSelected = !basta._previewSelected;
                    if (basta.layout?.regions?.loraPreview) {
                        basta.layout.regions.loraPreview.isSelected = !!basta._previewSelected;
                        basta.layout.regions.loraPreview.showPasteOverlay = !!basta._previewSelected;
                    }
                    if (basta._compDataCache?.loraPreview) {
                        basta._compDataCache.loraPreview.isSelected = !!basta._previewSelected;
                        basta._compDataCache.loraPreview.showPasteOverlay = !!basta._previewSelected;
                    }
                    const dropZone = basta._derpDomElements?.loraPreview_dropzone;
                    if (basta._previewSelected && dropZone && typeof dropZone.focus === "function") {
                        dropZone.focus({ preventScroll: true });
                    }
                    basta._derpAwakeFrames = Math.max(basta._derpAwakeFrames || 0, 2);
                    basta.requestDerpSync();
                }
            },
            imageHandlingRegion: {
                themeKey: "background", palette: bgPal,
                type: UI_TYPES.REGION, regionOffset: [0, 0, 0, 0], corners: [null, null, -1, -1],
                hidden: !hasImages,
                spawnAnim: false,
                alpha: basta._navAlpha,
                anchor: { target: "loraPreview", axis: "y", offset: -previewH },
                dir: "row", width: "full", height: "auto", margin: [0, -sH, mW, sH],
                btnImagePrevious: {
                    type: UI_TYPES.ICONBUTTON, icon: "leftarrow", themeKey: "button, t_textSystem", palette: btnPal,
                    alpha: basta._navAlpha, margin: [sW, sH, 0, sH],
                    objectAlign: ["left", "middle"],
                    width: "match", height: "full", spacing: [sH, 0],
                    onPress: () => {
                        if (basta._navAlpha < 0.5) return;
                        switchLoraImage(basta, "prev");
                    }
                },
                btnSetCover: {
                    type: UI_TYPES.BUTTON, themeKey: "button, t_textSystem", palette: btnPal, objectAlign:["left", "middle"],
                    alpha: basta._navAlpha, spacing: [sH, 0],
                    text: "Set as Cover", labelAlign: ["center", "middle"],
                    width: "auto", height: "full", padding: [pW, pH], margin: [0, sH],
                    // THE COVER GUARD: Hide the button if we are currently viewing the cover (index -1) or no sub-images exist
                    hidden: !hasImages || loraData.currentImageIndex === -1,
                    onPress: () => {
                        if (basta._navAlpha < 0.5) return;
                        setLoraCover(basta);
                    }
                },
                btnSetTrigger: {
                    // THE TYPE REVERSION: Returning to standard BUTTON for reliability
                    type: UI_TYPES.BUTTON,
                    themeKey: "button, t_textSystem", palette: btnPal,margin: [0, sH],
                    text: "Link", labelAlign: ["center", "middle"],
                    alpha: basta._navAlpha,
                    width: "fit", height: "fit",
                    padding: [pW, pH],spacing: [sH, 0],
                    onPress: () => {
                        const liveStack = host.properties?.stackData || [];
                        const livePath = (liveStack[loraData.slotIndex]?.[0] || loraData.rawFileName || loraData.name || "").replace(/\\/g, "/");
                        // THE PROPERTY SYNC: Match the navigation state keys used in switchLoraImage
                        const currentImg = loraData.images?.[loraData.currentImageIndex];

                        if (currentImg && basta._activeTagKey) {
                            manageLoraTrigger(host, basta, "link_image", {
                                slotIndex: loraData.slotIndex,
                                tagKey: basta._activeTagKey,
                                image: currentImg,
                                successMsg: "Image Linked",
                                regionKey: "btnSetTrigger"
                            });
                        }
                    }
                },
                btnDeleteImage: {
                    type: UI_TYPES.BUTTON,
                    themeKey: "button, t_textSystem", palette: btnPal,
                    text: "Delete", labelAlign: ["center", "middle"],
                    alpha: basta._navAlpha,
                    state: (loraData.currentImageIndex === -1 || (loraData.images || []).length === 0) ? "DIS" : "OFF",
                    width: "fit", height: "fit",
                    padding: [pW, pH], spacing: [sH, 0], margin: [0, sH],
                    onPress: () => {
                        const idx = loraData.currentImageIndex ?? -1;
                        if (basta._navAlpha < 0.5 || idx === -1) return;
                        const imgList = loraData.images || [];
                        const loraBase = currentPath.split(/[\\/]/).pop().replace(/\.safetensors$/i, "");
                        const coverExt = loraData.coverFilename ? loraData.coverFilename.split('.').pop() : "png";
                        const displayFilename = decodeURIComponent((idx === -1) ? (loraBase + "." + coverExt) : (imgList[idx] || "Unknown")).split(/[\\/]/).pop();
                        showBastaFileHandler(basta, "none", "btnDeleteImage", {
                            title: "Delete Image",
                            message: `Delete image: ${displayFilename}?`,
                            confirm: "Delete",
                            mode: "delete",
                            originalName: displayFilename,
                            initialSize: [160, 100],
                            properties: {
                                autoWidth: false,
                                messageWrap: true,
                                layoutMapOverride: {
                                    contentRegion: {
                                        infoRegion: {
                                            labelMain: { labelAlign: ["center", "middle"] }
                                        }
                                    }
                                }
                            },
                            onConfirm: () => {
                                deleteLoraDetailImage(basta, loraData, () => {
                                    showBastaMessage(basta, `Deleted: ${displayFilename}`, 3000, { fade: true, grow: true }, "btnDeleteImage", false, "success");
                                    if (basta.setDirtyCanvas) basta.setDirtyCanvas(true);
                                });
                            }
                        });
                    }
                },
                btnImageNext: {
                    type: UI_TYPES.ICONBUTTON, icon: "rightarrow", themeKey: "button, t_textSystem", palette: btnPal,
                    alpha: basta._navAlpha,
                    objectAlign: ["right", "middle"],
                    width: "match", height: "full", margin: [0, sH, sW, sH],
                    onPress: () => {
                        if (basta._navAlpha < 0.5) return;
                        switchLoraImage(basta, "next");
                    }
                }
            },
            labelRegion: {
                themeKey: "background", palette: bgPal,
                type: UI_TYPES.REGION, regionOffset: [0, sH, 0, sH], corners: [0, 0, 0, 0],
                hidden: !hasImages,
                spawnAnim: false, alpha: basta._navAlpha,
                anchor: { target: "imageHandlingRegion", axis: "y",},
                dir: "row", width: "full", height: "auto", margin: [0, 0, 0, sH],
                labelImageName: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSystem",
                    alpha: basta._navAlpha,
                    displayMode: "cutoff",
                    text: (() => {
                        const idx = loraData.currentImageIndex ?? -1;
                        const list = loraData.images || [];
                        let fname = (idx === -1) ? (loraData.coverFilename || "Cover") : (list[idx] || "Unknown");
                        return decodeURIComponent(fname).replace("__PRIMARY_PREVIEW__", "");
                    })(),
                    labelAlign: ["left", "middle"], width: "full", margin: [mW, 0],
                },
                labelCount: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSystem",
                    alpha: basta._navAlpha,
                    text: (() => {
                        const idx = loraData.currentImageIndex ?? -1;
                        const list = loraData.images || [];
                        const total = list.length + (loraData.hasCover ? 1 : 0);
                        const currentIdx = idx + (loraData.hasCover ? 2 : 1);
                        return `Image ${currentIdx} / ${total}`;
                    })(),
                    labelAlign: ["right", "middle"], width: "auto", margin: [mW, 0],
                }
            },
            externalRow: {
                type: UI_TYPES.REGION, themeKey: "background", palette: bgPal, regionOffset: [sW, sH, sW, -1],
                corners: [0, 0, null, null],
                hidden: !basta._externalReady,
                spawnAnim: false,
                alpha: basta._navAlpha,
                anchor: { target: "loraPreview", axis: "y", offset: -stableNavH - sH*2 },
                dir: "row", width: "full", height: "auto", margin: [sW, mH, sW, mH],
                btnCivit: {
                    type: UI_TYPES.BUTTON, labelAlign: ["center", "middle"], padding: [pW, pH],
                    themeKey: "button, t_textSmall", palette: civitPal,
                    alpha: basta._navAlpha,
                    text: "CivitAI",
                    width: "auto", spacing: [sW, 0],
                    objectAlign: ["left", "middle"],
                    onPress: async () => {
                        if (basta._navAlpha < 0.5) return;
                        openCivitAI(basta, loraData);
                    }
                },
                btnCivArchive: {
                    type: UI_TYPES.BUTTON, labelAlign: ["center", "middle"], padding: [pW, pH],
                    themeKey: "button, t_textSmall", palette: civArchivePal,
                    alpha: basta._navAlpha,
                    text: "CivArchive",
                    width: "auto", spacing: [sW, 0],
                    onPress: async () => {
                        if (basta._navAlpha < 0.5) return;
                        openCivArchive(basta, loraData);
                    }
                },
                spring: { width: "full" },
                btnOpenFolder: {
                    type: UI_TYPES.BUTTON, labelAlign: ["center", "middle"], padding: [pW, pH],
                    themeKey: "button, t_textSmall", palette: folderPal,
                    alpha: basta._navAlpha,
                    text: "Open LoRA folder",
                    width: "auto", spacing: [sW, 0],
                    onPress: (e) => {
                        if (basta._navAlpha < 0.5) return;
                        const liveStack = host.properties?.stackData || [];
                        const fileName = liveStack[loraData.slotIndex]?.[0] || currentPath;
                        const isShift = (e && e.shiftKey) ||
                            (window.app && window.app.canvas && window.app.canvas.shift_down) ||
                            (window.app && window.app.shiftDown);
                        const sub = isShift ? "" : "&subfolder=true";

                        fetch(`/xcp/open_folder?name=${encodeURIComponent(fileName)}${sub}`);
                    }
                }
            },
            triggerControlRow: {
                themeKey: "background",
                anchor: { target: "loraPreview", axis: "y", offset: oY },
                dir: "row", width: "full", height: "auto", spacing: [sW, 0], margin: [0, 0, 0, sH],
                btnNew: {
                    type: UI_TYPES.ICONBUTTON, icon: "new", themeKey: "button, t_textSmall",
                    width: "match", height: "full", spacing: [sW, 0],
                    onPress: () => {
                        const defaultName = `Trigger_${String(triggerItems.length + 1).padStart(2, '0')}`;
                        showBastaFileHandler(basta, "none", "btnNew", {
                            title: "New Trigger", confirm: "Create", originalName: defaultName, mode: "newTrigger",
                            message: "Enter name for new trigger:",
                            fileList: triggerItems.map(t => t.name),
                            onConfirm: (newName) => manageLoraTrigger(host, basta, "new_tag", { slotIndex: loraData.slotIndex, tagName: newName, tagContent: "", successMsg: "Trigger Created", regionKey: "btnNew" })
                        });
                    }
                },
                btnRenameTrigger: {
                    type: UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textSmall",
                    width: "match", height: "full", spacing: [sW, 0],
                    state: basta._activeTagKey ? "OFF" : "DIS",
                    onPress: () => {
                        const currentName = (basta._activeTagName || "").replace(/\.txt$/i, "");
                        showBastaFileHandler(basta, "none", "btnRenameTrigger", {
                            title: "Rename Trigger", confirm: "Rename", originalName: currentName, mode: "rename",
                            message: "Enter new name for trigger entry:",
                            fileList: triggerItems.map(t => t.name.replace(/\.txt$/i, "")),
                            onConfirm: (newName) => manageLoraTrigger(host, basta, "rename", { slotIndex: loraData.slotIndex, tagKey: basta._activeTagKey, newName: newName, successMsg: "Trigger Renamed", regionKey: "btnRenameTrigger" })
                        });
                    }
                },
                btnCopyTrigger: {
                    type: UI_TYPES.ICONBUTTON, icon: "copy", themeKey: "button, t_textSmall",
                    width: "match", height: "full", spacing: [sW, 0],
                    state: basta._activeTagKey ? "OFF" : "DIS",
                    onPress: () => {
                        const currentName = (basta._activeTagName || "").replace(/\.txt$/i, "");
                        // THE COMMIT FIX: Capture the live content from the host's stack data (updated via onInput)
                        // to ensure the duplicate contains the current editor buffer.
                        const liveContent = host.properties.stackData[loraData.slotIndex]?.[4] || "";

                        showBastaFileHandler(basta, "none", "btnCopyTrigger", {
                            title: "Copy Trigger", confirm: "Duplicate", originalName: currentName, mode: "duplicate",
                            message: "Enter name for duplicated trigger entry:",
                            fileList: triggerItems.map(t => t.name.replace(/\.txt$/i, "")),
                            onConfirm: (newName) => manageLoraTrigger(host, basta, "copy", {
                                slotIndex: loraData.slotIndex,
                                tagKey: basta._activeTagKey,
                                newName: newName,
                                tagContent: liveContent, // Inject current buffer
                                successMsg: "Trigger Duplicated",
                                regionKey: "btnCopyTrigger"
                            })
                        });
                    }
                },
                btnCleanTrigger: {
                    type: UI_TYPES.ICONBUTTON, icon: "clean", themeKey: "button, t_textSmall",
                    width: "match", height: "full", spacing: [sW, 0],
                    state: basta._activeTagKey ? "OFF" : "DIS",
                    onPress: () => {
                        const stack = host.properties.stackData || [];
                        const idx = loraData.slotIndex;
                        if (stack[idx]) {
                            const cleaned = cleanTriggerText(stack[idx][4]);
                            stack[idx][4] = cleaned;
                            loraData.tags = cleaned.split(',').map(t => t.trim()).filter(t => t !== "");
                            if (host.syncDerpOutputs) host.syncDerpOutputs();
                            basta._forceSync = true;
                            basta.requestDerpSync();
                            host.setDirtyCanvas(true);
                        }
                    }
                },
                btnSaveTrigger: {
                    type: UI_TYPES.ICONBUTTON, icon: "save", themeKey: "button, t_textSmall",
                    width: "match", height: "full", spacing: [sW, 0], mouseOver: false,
                    state: isSaveEnabled ? "OFF" : "DIS",
                    btnColor: initialPulseColor,
                    onPress: () => {
                        const editorEl = basta.dynamicElements?.loraTriggersEditor;
                        const content = editorEl ? editorEl.value : (host.properties.stackData[loraData.slotIndex]?.[4] || "");

                        // THE OPTIMISTIC FEEDBACK FIX: Manually disable state and clear pulse to provide instant visual feedback
                        basta._isSaving = true;
                        if (basta.layout?.regions?.btnSaveTrigger) basta.layout.regions.btnSaveTrigger.state = "DIS";
                        if (basta._compDataCache?.btnSaveTrigger) basta._compDataCache.btnSaveTrigger.state = "DIS";

                        manageLoraTrigger(host, basta, "save", { slotIndex: loraData.slotIndex, tagKey: basta._activeTagKey, tagContent: content, successMsg: "Trigger Saved", regionKey: "triggerControlRow" }).finally(() => {
                            basta._isSaving = false;
                            basta.requestDerpSync();
                        });
                    }
                },
                dropdownTrigger: {
                    type: UI_TYPES.DROPDOWN_DERP, themeKey: "button, t_textSmall", measureText: "Select Trigger...",
                    state: (triggerItems && triggerItems.length > 0) ? "OFF" : "DIS",
                    canvasShield: true, width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                    indicator: "on",
                    bypassHashOptimization: true, // THE LIST SYNC FIX: Force widget to update items array past layout hash
                    ...getLoraTriggerDropdownProps(host, basta, loraData, triggerItems, currentPath, vars)
                },
                btnDeleteTrigger: {
                    type: UI_TYPES.ICONBUTTON, icon: "trash", themeKey: "button, t_textSmall",
                    width: "match", height: "full",
                    state: basta._activeTagKey ? "OFF" : "DIS",
                    onPress: () => {
                        const currentName = basta._activeTagName || basta._activeTagKey;
                        showBastaFileHandler(basta, "none", "btnDeleteTrigger", {
                            title: "Delete Trigger", confirm: "Delete", warning: "Delete Trigger?",
                            message: `Permanently delete trigger entry: ${currentName}?`,
                            originalName: currentName,
                            mode: "delete",
                            onConfirm: () => manageLoraTrigger(host, basta, "delete", { slotIndex: loraData.slotIndex, tagKey: basta._activeTagKey, successMsg: "Trigger Deleted", regionKey: "btnDeleteTrigger" })
                        });
                    }
                }
            },
            loraTriggersEditor: {
                type: UI_TYPES.EDITOR, multiline: true, canvasShield: true, switchOnEditing: true,
                themeKey: "dialog, t_textSmall",
                labelAlign: ["left", "top"],
                width: "full",
                minHeight: (mH * 3.5),
                padding: [pW, pH], margin: [0, 0, 0, sH],
                anchor: { target: "triggerControlRow", axis: "y", offset: sH },
                ...getLoraTriggerEditorProps(host, basta, loraData, currentPath, vars)
            },
            tagImportRow: {
                themeKey: "background",
                anchor: { target: "loraTriggersEditor", axis: "y", offset: oY },
                dir: "row", width: "full", height: "auto", margin: [0, 0, 0, sH],
                // THE DYNAMIC TXT DETECTION FIX: Scan the current triggers directly to ensure accurate UI state rather than relying on stale host flags
                hidden: !triggerItems.some(t => (t.key || "").toLowerCase().endsWith(".txt")),
                toggleRemoveTxt: {
                    type: UI_TYPES.TOGGLE, textThemeKey: "t_textSmall", labelAlign: ["left", "middle"],
                    text: "Remove .txt files after import", icon: "radial",
                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                    state: "OFF",
                    // THE PERSISTENCE FIX: Bind value to the instance variable so it survives the layout engine's frame-by-frame reflows
                    value: basta._removeTxt ?? true,
                    onChange: (v) => {
                        basta._removeTxt = v;
                        basta.requestDerpSync();
                    }
                },
                btnImport: {
                    type: UI_TYPES.BUTTON, objectAlign: ["right", "middle"],
                    labelAlign: ["center", "middle"], padding: [pW, pH],
                    themeKey: "button, t_textSmall",
                    state: "OFF",
                    text: "Import Triggers",
                    width: "auto", height: "auto",
                    onPress: async () => {
                        const liveStack = host.properties?.stackData || [];
                        const fileName = liveStack[loraData.slotIndex]?.[0] || currentPath;
                        try {
                            const removeTxt = basta._removeTxt !== false;
                            const res = await fetch("/xcp/import_lora_tags", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: fileName, remove_txt: removeTxt })
                            });

                            if (res.ok) {
                                const data = await res.json();
                                // THE ATOMIC HANDSHAKE: Use the 'triggers' data returned directly from Python.
                                // This provides the definitive state of the filesystem, ensuring the UI
                                // hides the import row immediately and correctly.
                                if (data.success && data.triggers) {
                                    const triggers = data.triggers;
                                    const triggerArray = processTriggerData(triggers);
                                    const cleanPath = fileName.replace(/\\/g, "/");

                                    if (host) {
                                        if (!host._loraTriggerCache) host._loraTriggerCache = {};
                                        if (!host._loraTriggerArrayCache) host._loraTriggerArrayCache = {};

                                        host._loraTriggerCache[fileName] = triggers;
                                        host._loraTriggerCache[cleanPath] = triggers;
                                        host._loraTriggerArrayCache[fileName] = triggerArray;
                                        host._loraTriggerArrayCache[cleanPath] = triggerArray;

                                        if (host._loraTxtStatus) {
                                            host._loraTxtStatus[fileName] = false;
                                            host._loraTxtStatus[cleanPath] = false;
                                        }
                                        if (host.syncDerpOutputs) host.syncDerpOutputs();
                                        if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
                                    }

                                    const msg = removeTxt ? "Import & Cleanup Complete" : `Imported ${data.count || 0} triggers`;
                                    showBastaMessage(basta, msg, 3000, {}, "btnImport", false, "success");

                                    basta._layoutDirty = true;
                                    basta._forceSync = true;
                                    if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
                                } else {
                                    showBastaMessage(basta, "Import Failed", 3000, { width: basta.size[0] }, "btnImport", false, "error");
                                }
                            } else {
                                showBastaMessage(basta, "Server Error", 3000, { width: basta.size[0] }, "btnImport", false, "error");
                            }
                        } catch (e) {
                            showBastaMessage(basta, "Network Error", 3000, { width: basta.size[0] }, "btnImport", false, "error");
                        }
                    }
                }
            },
        },

        footerRegion: {
            themeKey: "background",
            anchor: { target: "contentRegion", axis: "y", offset: mH },
            dir: "row", width: "full", margin: [mW, 0, mW, mH],
            labelRating: {
                type: UI_TYPES.TEXT,
                themeKey: "t_textNormal", text: "Rating:", width: "auto", spacing: [sW, 0],
                labelAlign: ["left", "middle"]
            },
            dropdownLoraRating: {
                type: UI_TYPES.DROPDOWN_DERP, themeKey: "button, t_textSmall", measureText: "A - Excellent",
                canvasShield: true, width: "auto", height: "auto", padding: [pW, pH],
                labelAlign: ["center", "middle"],
                ...ratingProps
            },
            btnCloseFooter: {
                type: UI_TYPES.BUTTON,
                themeKey: "buttonNode, t_textNormal",
                objectAlign: ["right", "middle"],
                labelAlign: ["center", "middle"], padding: [pW, pH],
                text: "Close",
                width: "auto",
                height: "auto",
                onPress: () => {
                    // THE IMMEDIATE STATE FIX: Reset host slot indicator and immediately force structural sync
                    host._activeDetailSlot = null;
                    host._layoutDirty = true;
                    host._forceSync = true;
                    host._derpAwakeFrames = 5;

                    if (typeof host.refreshNodeLayoutMap === "function") host.refreshNodeLayoutMap();
                    if (typeof host.setDirtyCanvas === "function") host.setDirtyCanvas(true, true);
                    basta.close();
                }
            }
        }
    };
    basta.layoutMap = lMap;
    return lMap;
}

export function showBastaLoraDetail(host, targetRegion = null, loraData = {}) {
    return handleBastaLoraDetail(host, targetRegion, loraData, createLoraDetailLayoutMap);
}
