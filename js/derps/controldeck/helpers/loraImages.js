/**
 * Path: ./js/fatha/nodes/loraImages.js
 * ROLE: Centralized image handling for LoRA previews (creation, deletion, display, and resizing operations).
 */
import { app } from "../../../../../scripts/app.js";
import { playKaChing, playKaboom } from "../../../herbina/masterSoundEffects.js";
import { showBastaMessage } from "../../../fatha/bastas/bastaMessage.js";

const PREVIEW_LONG_SIDE_TARGET = 1024; // THE RESIZE FIX: Target for the long side of the image
const PREVIEW_RESIZE_QUALITY = 1.00;   // THE OPTIMIZATION FIX: Compression quality for the preview upload

const THUMBNAIL_LONG_SIDE_TARGET = 256; // THE RESIZE FIX: Target for the long side of the thumbnail
const THUMBNAIL_RESIZE_QUALITY = 0.9;    // THE OPTIMIZATION FIX: Compression quality for the thumbnail upload

function getLiveLoraName(basta, loraData) {
    const liveStack = basta?.hostNode?.properties?.stackData || [];
    const slotIdx = loraData?.slotIndex;
    const liveName = Number.isInteger(slotIdx) ? liveStack[slotIdx]?.[0] : null;
    return (liveName || loraData?.loraPath || loraData?.rawFileName || loraData?.name || "").replace(/\\/g, "/");
}

/**
 * Calculates and caches the aspect ratio of the preview image to trigger layout reflows.
 */
export function calculatePreviewAspectRatio(basta, loraData, onComplete) {
    if (!loraData.previewUrl || loraData.aspectRatio) {
        if (onComplete) onComplete();
        return;
    }
    const img = new Image();
    img.onload = () => {
        loraData.aspectRatio = img.naturalWidth / img.naturalHeight;
        loraData._previewLoading = false;
        // THE MEMORY RELEASE FIX: Explicitly destroy the image object to free RAM/GPU memory immediately
        img.onload = null;
        img.onerror = null;
        img.src = "";

        if (basta) {
            basta._forceSync = true;
            if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true);
        }
        if (onComplete) onComplete(loraData.aspectRatio);
    };
    img.onerror = () => {
        loraData.aspectRatio = 1.0;
        loraData._previewLoading = false;
        img.onload = null;
        img.onerror = null;
        img.src = "";
        if (onComplete) onComplete();
    };
    img.src = loraData.previewUrl;
}

/**
 * Standardizes the URL generation for fetching preview images and thumbnails.
 */
export function getPreviewImageUrl(loraName, isThumbnail = false) {
    if (!loraName) return null;
    // THE CACHE STABILITY FIX: Use a persistent session ID. If missing, initialize it once to prevent per-frame URL mutations.
    if (!window._xcpDerpSession) window._xcpDerpSession = Date.now();
    const session = window._xcpDerpSession;
    return `/xcp/get_lora_preview?name=${encodeURIComponent(loraName)}${isThumbnail ? '&thumbnail=true' : ''}&v=${session}`;
}

export function getLoraImageUrl(loraName, fileName) {
    if (!loraName || !fileName) return null;
    if (!window._xcpDerpSession) window._xcpDerpSession = Date.now();
    const session = window._xcpDerpSession;
    return `/xcp/get_lora_image?name=${encodeURIComponent(loraName)}&file=${encodeURIComponent(fileName)}&v=${session}`;
}

/**
 * switchLoraImage: Cycles through the available images in the LoRA's subfolder.
 */
export function switchLoraImage(basta, direction = "next") {
    const loraData = basta._loraData;
    // THE COVER COUNT FIX: Navigation is enabled if there is at least ONE archived image to switch to from the cover
    if (!loraData || !loraData.images || loraData.images.length < 1) return;

    let idx = loraData.currentImageIndex ?? -1;
    const count = loraData.images.length;

    // THE GALLERY LOOP FIX: Cycle strictly through the sub-images (0 to count-1).
    // If we start from the cover (-1), jump into the gallery. Once inside, skip the cover to keep the gallery navigation clean.
    if (direction === "next") {
        idx++;
        if (idx >= count || idx < 0) idx = 0;
    } else {
        idx--;
        if (idx < 0) idx = count - 1;
    }

    loraData.currentImageIndex = idx;
    const lName = getLiveLoraName(basta, loraData);
    const session = window._xcpDerpSession || Date.now();

    // Construct URL based on whether we are viewing the primary cover or an archived sub-image
    loraData._previewLoading = true;
    if (idx === -1) {
        loraData.previewUrl = `/xcp/get_lora_preview?name=${encodeURIComponent(lName)}&v=${session}`;
    } else {
        const fileName = loraData.images[idx];
        loraData.previewUrl = `/xcp/get_lora_image?name=${encodeURIComponent(lName)}&file=${encodeURIComponent(fileName)}&v=${session}`;
    }

    loraData.aspectRatio = null; // THE REFLOW FIX: Clear aspect ratio to force recalculation on new image load
    calculatePreviewAspectRatio(basta, loraData, () => {
        basta._forceSync = true;
        if (typeof basta.requestViewportFit === "function") basta.requestViewportFit(10);
        if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true);
    });
}

/**
 * setLoraCover: Promotes a sub-image to be the primary preview cover.
 */
export function setLoraCover(basta) {
    const loraData = basta._loraData;
    // THE COVER GUARD: Prevent promoting the cover to itself (index -1)
    if (!loraData || !loraData.images || loraData.currentImageIndex === -1 || loraData.currentImageIndex === undefined) return;

    const currentFile = loraData.images[loraData.currentImageIndex];

    const lName = getLiveLoraName(basta, loraData);
    fetch("/xcp/set_lora_cover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: lName, file: currentFile, no_backup: true })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            playKaChing();
            window._xcpDerpSession = Date.now();

            loraData.previewUrl = getPreviewImageUrl(lName);
            loraData.currentImageIndex = -1;
            loraData.hasCover = true;
            loraData.aspectRatio = null;

            // THE HOST SYNC FIX: Force the parent node to pick up the new session timestamp and re-render its face
            if (basta.hostNode) {
                if (!Array.isArray(basta.hostNode._loraPreviewList)) basta.hostNode._loraPreviewList = [];
                if (!basta.hostNode._loraPreviewList.includes(lName)) basta.hostNode._loraPreviewList.push(lName);
                if (basta.hostNode.refreshNodeLayoutMap) basta.hostNode.refreshNodeLayoutMap();
                if (basta.hostNode.setDirtyCanvas) basta.hostNode.setDirtyCanvas(true, true);
            }

            // THE REFRESH FIX: Immediately refresh the list to reflect the swap
            refreshLoraImageList(basta, loraData);
            calculatePreviewAspectRatio(basta, loraData, () => {
                basta._forceSync = true;
                if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
            });
        }
    });
}

/**
 * refreshLoraImageList: Discovers images in the subfolder for legacy support.
 * This handles folders populated before the indexing feature was added.
 */
export function refreshLoraImageList(basta, loraData, targetFile = null) {
    const lName = getLiveLoraName(basta, loraData);
    if (!lName) return;

    fetch(`/xcp/list_lora_images?name=${encodeURIComponent(lName)}`)
        .then(r => (r.ok && r.status !== 204) ? r.json() : { images: [] })
        .catch(() => ({ images: [] }))
        .then(data => {
            const rawList = data.images || [];
            // THE COVER PERSISTENCE FIX: Identify if a primary preview exists independently of the sub-images list
            const coverFile = rawList.find(img => img.startsWith("__PRIMARY_PREVIEW__"));
            loraData.hasCover = !!coverFile;
            loraData.coverFilename = coverFile || null;

            if (rawList.length > 0) {
                // THE BROWSING LIST FIX: Remove the primary cover from the navigation list so browsing only cycles through sub-images
                loraData.images = rawList.filter(img => !img.startsWith("__PRIMARY_PREVIEW__"));
                loraData.imageCount = loraData.images.length;

                const currentFile = targetFile || loraData.previewUrl?.split('file=')[1]?.split('&')[0];
                let resolvedIdx = currentFile ? loraData.images.indexOf(decodeURIComponent(currentFile)) : -1;

                if (resolvedIdx === -1 && loraData.images.length > 0) resolvedIdx = 0;
                loraData.currentImageIndex = resolvedIdx;

                // Keep the current cover preview on initial open when no explicit sub-image is selected.
                // This prevents the UI from flashing cover first, then auto-switching to another image.
                if (resolvedIdx !== -1 && !currentFile && basta) {
                    loraData.currentImageIndex = -1;
                }

                if (loraData.currentImageIndex === -1) {
                    loraData.previewUrl = loraData.hasCover ? getPreviewImageUrl(lName) : (loraData.images[0] ? getLoraImageUrl(lName, loraData.images[0]) : null);
                } else if (loraData.images[loraData.currentImageIndex]) {
                    loraData.previewUrl = getLoraImageUrl(lName, loraData.images[loraData.currentImageIndex]);
                }

                if (basta) {
                    basta._forceSync = true;
                    basta.requestDerpSync();
                }
            } else {
                // THE EMPTY LIST FIX: Reset navigation state if no images are found
                loraData.images = [];
                loraData.imageCount = 0;
                loraData.currentImageIndex = -1;
                loraData.previewUrl = loraData.hasCover ? getPreviewImageUrl(lName) : null;
            }
        });
}

/**
 * resizeImage: Resizes an image dataURL so that its longest side matches the target.
 */
export function resizeImage(dataUrl, targetLongSide, quality, callback) {
    const img = new Image();
    img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > h) {
            if (w > targetLongSide) {
                h *= targetLongSide / w;
                w = targetLongSide;
            }
        } else {
            if (h > targetLongSide) {
                w *= targetLongSide / h;
                h = targetLongSide;
            }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        callback(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
}

/**
 * Calculates the display height for a preview layout region based on the available width.
 */
export function calculatePreviewDisplayHeight(basta, aspectRatio, marginW) {
    if (!aspectRatio) return basta.layout?.regions?.loraPreview?.h || 180;
    // Use the live resized width first so Basta-dependent regions reflow while dragging.
    const liveWidth = basta?.properties?.nodeSize?.[0] || basta?.size?.[0] || basta?.targetSize?.[0] || 440;
    const w = liveWidth;
    return (w - (marginW * 2)) / aspectRatio;
}

/**
 * Initializes the global clipboard hijack to intercept Paste (Creation) and Delete operations.
 */
export function initLoraImageHandlers(getLoraDetailIdFunc) {
    if (window._xcpLoraImageHandlersInitialized) return;
    window._xcpLoraImageHandlersInitialized = true;

    window.addEventListener("paste", (e) => {
        const basta = window.xcpActiveBastas?.get(getLoraDetailIdFunc());
        if (!basta?._previewSelected) return;
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();

        const clipboardItems = e.clipboardData?.items;
        if (clipboardItems) {
            for (const item of clipboardItems) {
                if (item.type.startsWith("image/")) {
                    const blob = item.getAsFile();
                    if (!blob) continue;
                    const reader = new FileReader();
                    reader.onload = async () => {
                        const lName = basta._loraData?.rawFileName || basta._loraData?.name;
                        const isCover = !basta._loraData?.hasCover;
                        const pData = await app.graphToPrompt();

                        resizeImage(reader.result, PREVIEW_LONG_SIDE_TARGET, PREVIEW_RESIZE_QUALITY, (resizedImage) => {
                            fetch("/xcp/upload_lora_preview", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    name: lName,
                                    loraPath: basta._loraData?.loraPath || basta._loraData?.rawFileName || basta._loraData?.path || lName,
                                    image: resizedImage,
                                    is_cover: isCover,
                                    prompt: pData.output,
                                    extra_pnginfo: { workflow: pData.workflow },
                                    model_name_prefix: (() => {
                                        const h = basta.hostNode;
                                        const sigs = window.xcpDerpSignals;
                                        if (!sigs) return "Unknown_Model";
                                        const mId = h?.properties?.multiSignalIds?.Model || h?.properties?.modelSignalId;
                                        const sig = sigs[mId] || Object.values(sigs).find(s => String(s.type || "").toUpperCase() === "MODEL" && s.value?.model_name_prefix);
                                        return sig?.value?.model_name_prefix || h?.properties?.selectedModel || "Unknown_Model";
                                    })()
                                })
                            }).then(async (r) => {
                                const data = await r.json().catch(() => ({}));
                                if (!r.ok || data.success !== true) throw new Error(data.error || `Preview upload failed (${r.status})`);
                                return data;
                            }).then(data => {
                                if (data.success) {
                                    const msg = isCover ? "Image set as primary cover" : "Image saved to subfolder";
                                    showBastaMessage(basta, msg, 3000, {}, "loraPreview", false);
                                    playKaChing();
                                    window._xcpDerpSession = Date.now();

                                    if (basta._loraData) {
                                        const lNameNorm = lName.replace(/\\/g, "/");
                                        if (basta.hostNode) {
                                            if (!basta.hostNode._loraPreviewList) basta.hostNode._loraPreviewList = [];
                                            if (!basta.hostNode._loraPreviewList.includes(lNameNorm)) basta.hostNode._loraPreviewList.push(lNameNorm);
                                            if (!basta.hostNode._loraPreviewList.includes(lName)) basta.hostNode._loraPreviewList.push(lName);

                                            if (basta.hostNode.refreshNodeLayoutMap) basta.hostNode.refreshNodeLayoutMap();
                                            if (basta.hostNode.setDirtyCanvas) basta.hostNode.setDirtyCanvas(true);
                                        }

                                        basta._loraData.previewUrl = resizedImage;
                                        basta._loraData.aspectRatio = null;

                                        calculatePreviewAspectRatio(basta, basta._loraData, () => {
                                            refreshLoraImageList(basta, basta._loraData, data.file);
                                            basta._previewSelected = false;
                                            basta._forceSync = true;
                                            if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true);
                                        });
                                    }
                                }
                            }).catch((err) => {
                                console.error("[xcpDerp] Preview Upload Error:", err);
                            });
                        });
                    };
                    reader.readAsDataURL(blob);
                    break;
                }
            }
        }
    }, { capture: true });

    window.addEventListener("keydown", (e) => {
        const basta = window.xcpActiveBastas?.get(getLoraDetailIdFunc());
        if (basta && basta._previewSelected) {
            if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopImmediatePropagation();

                const lName = basta._loraData?.rawFileName || basta._loraData?.name;
                if (lName) {
                    fetch("/xcp/delete_lora_preview", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            name: lName,
                            model_name_prefix: basta.hostNode?.activeModelPrefix || "Unknown_Model"
                        })
                    }).then(r => r.json()).then(data => {
                        if (data.success) {
                            if (data.moved) {
                                const cleanMoved = String(data.moved).split(/[\\/]/).pop();
                                showBastaMessage(basta, "Previous image moved as " + cleanMoved, 3000, {}, "loraPreview", false);
                            }
                            playKaboom();
                            window._xcpDerpSession = Date.now();
                            if (basta._loraData) {
                                basta._loraData.previewUrl = null;
                                basta._loraData.aspectRatio = null;
                            }
                            basta._previewSelected = false;

                            if (basta.hostNode && basta.hostNode._loraPreviewList) {
                                const lNameNorm = lName.replace(/\\/g, "/");
                                basta.hostNode._loraPreviewList = basta.hostNode._loraPreviewList.filter(n => n !== lName && n !== lNameNorm);
                                if (basta.hostNode.refreshNodeLayoutMap) basta.hostNode.refreshNodeLayoutMap();
                                if (basta.hostNode.setDirtyCanvas) basta.hostNode.setDirtyCanvas(true);
                            }

                            basta._forceSync = true;
                            if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
                        }
                    });
                }
            }
        }
    }, true);
}
export function deleteLoraDetailImage(basta, loraData, onComplete) {
    const host = basta.hostNode;
    const liveStack = host?.properties?.stackData || [];
    const lName = liveStack[loraData.slotIndex]?.[0] || loraData.rawFileName || loraData.name;

    const imgList = loraData.images || [];
    const idx = loraData.currentImageIndex ?? -1;

    // THE FILENAME RESOLUTION: Use the stored cover filename to ensure the correct extension is passed to the server
    const filename = (idx === -1) ? loraData.coverFilename : imgList[idx];

    if (!filename) return;

    fetch("/xcp/delete_lora_image", {
        method: "POST", headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: lName, filename: filename })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                playKaboom();
                window._xcpDerpSession = Date.now();

                if (idx === -1) {
                    loraData.hasCover = false;
                    loraData.coverFilename = null;
                    loraData.previewUrl = getPreviewImageUrl(lName);
                    debugPreviewSet(loraData, "deleteLoraDetailImage:coverFallback", loraData.previewUrl);
                } else {
                    loraData.images.splice(idx, 1);
                    if (loraData.images.length === 0) {
                        loraData.currentImageIndex = -1;
                        loraData.previewUrl = getPreviewImageUrl(lName);
                    } else {
                        if (loraData.currentImageIndex >= loraData.images.length) {
                            loraData.currentImageIndex = 0;
                        }
                        const session = window._xcpDerpSession || Date.now();
                        const nextFileName = loraData.images[loraData.currentImageIndex];
                        loraData.previewUrl = `/xcp/get_lora_image?name=${encodeURIComponent(lName)}&file=${encodeURIComponent(nextFileName)}&v=${session}`;
                        debugPreviewSet(loraData, "deleteLoraDetailImage:nextImage", loraData.previewUrl);
                    }
                }

                loraData.aspectRatio = null;
                calculatePreviewAspectRatio(basta, loraData);

                basta._forceSync = true;
                if (onComplete) onComplete();
            } else {
                showBastaMessage(basta, "Delete Failed", 3000, {}, "btnDeleteImage", false);
            }
        });
}
