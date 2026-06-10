/**
 * Path: ./Herbina/widgets/widget_ImageHTML.js
 * ROLE: Canvas-native image rendering.
 */
import { masterPainter } from "../masterPainter.js";
import { resolveWidgetEnv, resolvePaintData, calculateScreenCoords } from "../utils/widgetsUtils.js";
import { getPulsedColor } from "../masterAnimator.js";

const NORMAL_STROKE_WEIGHT = 1;
const SELECTION_STROKE_WEIGHT = 2;
const DEFAULT_IMAGE_AREA_STROKE_COLOR = "rgba(0,0,0,0.3)";
const DEFAULT_IMAGE_AREA_FILL_COLOR = "rgba(0,0,0,0.5)";
const BYPASS_BRIGHTNESS = 0.75;
const PLACEHOLDER_FONT_SIZE = 6; // THE DARKNESS FIX: Adjusts image brightness when bypassed

// THE RESIZE TARGETS: Matches constants in loraImages.js to maintain quality vs performance balance
const PREVIEW_LONG_SIDE_TARGET = 1024;
const THUMBNAIL_LONG_SIDE_TARGET = 256;

export function syncImageHTML(ctx, node, app, config, overlayPass = false) {
    if (node.flags?.collapsed || config.hidden || node._isDerpCulled) {
        if (node._derpDomElements && node._derpDomElements[config.key + "_dropzone"]) {
            node._derpDomElements[config.key + "_dropzone"].style.visibility = "hidden";
        }
        return;
    }

    if (node._derpDomElements && node._derpDomElements[config.key]) {
        node._derpDomElements[config.key].remove();
        delete node._derpDomElements[config.key];
    }

    // THE SUBPIXEL FIX: Force integer coordinates to prevent the canvas engine from using
    // expensive subpixel anti-aliasing for clipping masks, strokes, and downscaled images.
    const x = Math.floor(config.geometry.x);
    const y = Math.floor(config.geometry.y);
    const w = Math.floor(config.geometry.w);
    const h = Math.floor(config.geometry.h);

    const drawMode = config.drawMode || "both";
    const strokeOnOverlay = !!config.strokeZIndex;
    const cornerRadius = Number(config.cornerRadius ?? 4);
    const currentImageObj = node._imageInstanceCache?.[config.key];
    const previousImageObj = node._imageInstanceCache?.[config.key + "_previous"];
    const hasDisplayedImage = !!(
        (currentImageObj?._isLoaded && currentImageObj._lastUrl === config.imageUrl) ||
        (previousImageObj?._isLoaded && previousImageObj._lastUrl === config.previousImageUrl)
    );
    const drawBackground = !(config.hideBackgroundWhenImage && hasDisplayedImage);

    const stateHash = `${node.mode}_${window._xcpDerpSession}_${config.imageUrl}_${config.state}_${w}_${h}_${config.btnColor}_${node._xcpTrueSelected}_${config.alpha}`;
    const cache = node._imageHTMLCache || (node._imageHTMLCache = {});
    const itemCache = cache[config.key] || (cache[config.key] = {});

    let props, paintData, alpha;
    if (itemCache.hash === stateHash && itemCache.res && !node._forceSync) {
        props = itemCache.res.props;
        paintData = itemCache.res.paintData;
        alpha = itemCache.res.alpha;
    } else {
        const res = resolveWidgetEnv(node, config, app);
        props = res.props;
        alpha = res.alpha;
        paintData = resolvePaintData(node, props.bodyKey, config.state || "OFF", config.btnColor);
        itemCache.hash = stateHash;
        itemCache.res = { props, paintData, alpha };
    }

    if (alpha <= 0) return;

    const markImageLoadSettled = (imgObj) => {
        if (!imgObj || imgObj._loadSettled) return;
        imgObj._loadSettled = true;
        node._pendingImageLoads = Math.max(0, Number(node._pendingImageLoads || 0) - 1);
        node._passiveWholeWallCacheSuspendUntil = Math.max(
            Number(node._passiveWholeWallCacheSuspendUntil || 0),
            performance.now() + 260
        );
    };

    const resolvePlaceholderTextPaint = () => {
        const themeParts = String(config.themeKey || "").split(",").map((p) => p.trim()).filter(Boolean);
        const explicitTextKey = props?.textKey || themeParts[1] || themeParts[0] || "t_textNormal";
        return resolvePaintData(node, explicitTextKey, config.state || "OFF") || null;
    };

    const drawPlaceholderText = (text) => {
        const textPaint = resolvePlaceholderTextPaint();
        const fontSize = Number(config.placeholderFontSize ?? PLACEHOLDER_FONT_SIZE);
        const fontFamily = textPaint?.font || "Arial";
        const fontWeight = config.fontWeight || textPaint?.fontWeight || "normal";
        const textColor = textPaint?.textColor || textPaint?.fill || "rgba(255,255,255,0.4)";
        const shouldShrinkToFit = !!config.placeholderShrinkToFit;
        const padX = Math.max(0, Number(config.placeholderPadX ?? 0));
        const padY = Math.max(0, Number(config.placeholderPadY ?? 0));
        const minFontSize = Math.max(6, Number(config.placeholderMinFontSize ?? 6));

        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect && cornerRadius > 0) ctx.roundRect(x, y, w, h, cornerRadius);
        else ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let fittedSize = fontSize;
        if (shouldShrinkToFit) {
            const maxTextW = Math.max(1, w - (padX * 2));
            const maxTextH = Math.max(1, h - (padY * 2));
            for (let fs = fontSize; fs >= minFontSize; fs -= 1) {
                ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;
                const metrics = ctx.measureText(String(text || ""));
                const textW = metrics.width || 0;
                const textH = (metrics.actualBoundingBoxAscent || fs * 0.8) + (metrics.actualBoundingBoxDescent || fs * 0.2);
                if (textW <= maxTextW && textH <= maxTextH) {
                    fittedSize = fs;
                    break;
                }
            }
        }

        ctx.font = `${fontWeight} ${fittedSize}px ${fontFamily}`;
        ctx.fillText(String(text || ""), x + w / 2, y + h / 2);
        ctx.restore();
    };

    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;

    if (!overlayPass && (drawMode === "both" || drawMode === "image")) {
        if (drawBackground) {
            ctx.save();
            ctx.fillStyle = DEFAULT_IMAGE_AREA_FILL_COLOR;
            if (ctx.roundRect && cornerRadius > 0) {
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, cornerRadius);
                ctx.fill();
            } else {
                ctx.fillRect(x, y, w, h);
            }
            ctx.restore();
        }

        if (paintData && drawBackground) {
            masterPainter(ctx, {
                posX: x, posY: y, width: w, height: h,
                paintData: paintData, color: paintData.fill || config.btnColor || "transparent"
            });
        } else if (drawBackground && config.btnColor && config.btnColor !== "transparent") {
            ctx.save();
            ctx.fillStyle = config.btnColor;
            if (ctx.roundRect && cornerRadius > 0) {
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, cornerRadius);
                ctx.fill();
            } else {
                ctx.fillRect(x, y, w, h);
            }
            ctx.restore();
        }

        // 2. Load and Draw Image Natively
        if (config.imageUrl || config.previousImageUrl) {
            if (!node._imageInstanceCache) node._imageInstanceCache = {};

            const ensureImage = (cacheKey, url) => {
                if (!url) return null;
                let localObj = node._imageInstanceCache[cacheKey];
                if (!localObj || localObj._lastUrl !== url) {
                    if (cacheKey === config.key && localObj && localObj._isLoaded && localObj._lastUrl && localObj._lastUrl !== url) {
                        node._imageInstanceCache[config.key + "_previous"] = localObj;
                    }
                    localObj = new Image();
                    localObj._lastUrl = url;
                    localObj._isLoaded = false;
                    localObj._loadFailed = false;
                    localObj._loadSettled = false;
                    node._pendingImageLoads = Math.max(0, Number(node._pendingImageLoads || 0)) + 1;
                    localObj.onload = () => {
                        localObj._isLoaded = true;
                        localObj._loadFailed = false;
                        markImageLoadSettled(localObj);
                        if (node.setDirtyCanvas) {
                            node._derpAwakeFrames = 5;
                            node._forceSync = true;
                            node.setDirtyCanvas(true, true);
                        }
                    };
                    localObj.onerror = () => {
                        localObj._isLoaded = false;
                        localObj._loadFailed = true;
                        markImageLoadSettled(localObj);
                        if (node.setDirtyCanvas) {
                            node._derpAwakeFrames = 5;
                            node._forceSync = true;
                            node.setDirtyCanvas(true, true);
                        }
                    };
                    localObj.src = url;
                    if (localObj.complete) {
                        if (localObj.naturalWidth > 0) {
                            localObj._isLoaded = true;
                            localObj._loadFailed = false;
                        } else {
                            localObj._isLoaded = false;
                            localObj._loadFailed = true;
                        }
                        markImageLoadSettled(localObj);
                    }
                    node._imageInstanceCache[cacheKey] = localObj;
                }
                return localObj;
            };

            const drawImageObject = (imgObj, imageAlpha = 1) => {
                if (!imgObj || !imgObj._isLoaded || !(imgObj.naturalWidth > 0) || imageAlpha <= 0) return false;
                // THE DUAL-TARGET CACHE FIX: Pre-render to target resolution (1024 or 256) to maintain
                // texture quality during zooms and resizing while keeping grayscale filters off the main loop.
                const targetSize = config.isThumbnail ? THUMBNAIL_LONG_SIDE_TARGET : PREVIEW_LONG_SIDE_TARGET;
                const imgRatio = imgObj.naturalWidth / imgObj.naturalHeight;

                let cW = targetSize, cH = targetSize;
                if (imgRatio > 1) cH = targetSize / imgRatio;
                else cW = targetSize * imgRatio;
                cW = Math.floor(cW); cH = Math.floor(cH);

                if (imgObj._renderCacheW !== cW || imgObj._renderCacheH !== cH || imgObj._renderCacheGray !== config.grayscale) {
                    if (!imgObj._renderCache) imgObj._renderCache = document.createElement("canvas");
                    const offCanvas = imgObj._renderCache;
                    offCanvas.width = cW;
                    offCanvas.height = cH;
                    const offCtx = offCanvas.getContext("2d");

                    if (config.grayscale === true) offCtx.filter = `grayscale(100%) brightness(${BYPASS_BRIGHTNESS})`;
                    offCtx.imageSmoothingQuality = "medium";
                    offCtx.drawImage(imgObj, 0, 0, cW, cH);

                    imgObj._renderCacheW = cW;
                    imgObj._renderCacheH = cH;
                    imgObj._renderCacheGray = config.grayscale;
                }

                ctx.save();
                if (imageAlpha < 1) ctx.globalAlpha *= imageAlpha;

                // Apply rounding and clipping to the main context
                ctx.beginPath();
                if (ctx.roundRect && cornerRadius > 0) ctx.roundRect(x, y, w, h, cornerRadius);
                else ctx.rect(x, y, w, h);
                ctx.clip();

                const boxRatio = w / h;
                let drawW = w, drawH = h, drawX = x, drawY = y;

                if (config.aspectFit === "contain") {
                    if (imgRatio > boxRatio) {
                        drawW = w; drawH = w / imgRatio; drawY = y + (h - drawH) / 2;
                    } else {
                        drawH = h; drawW = h * imgRatio; drawX = x + (w - drawW) / 2;
                    }
                } else {
                    if (imgRatio > boxRatio) {
                        drawW = h * imgRatio; drawX = x - (drawW - w) / 2;
                    } else {
                        drawH = w / imgRatio; drawY = y - (drawH - h) / 2;
                    }
                }

                ctx.imageSmoothingQuality = "low";
                ctx.drawImage(imgObj._renderCache, Math.floor(drawX), Math.floor(drawY), Math.floor(drawW), Math.floor(drawH));
                ctx.restore();
                return true;
            };

            const currentObj = ensureImage(config.key, config.imageUrl);
            const previousObj = ensureImage(config.key + "_previous", config.previousImageUrl);
            const transitionAlpha = Math.max(0, Math.min(1, Number(config.transitionAlpha ?? 1)));
            const hasCrossfade = !!(config.previousImageUrl && config.imageUrl && transitionAlpha < 1);

            let drew = false;
            if (hasCrossfade) {
                drew = drawImageObject(previousObj, 1 - transitionAlpha) || drew;
                drew = drawImageObject(currentObj, transitionAlpha) || drew;
            } else {
                drew = drawImageObject(currentObj, 1) || drew;
            }

            if (!drew && !config.suppressPlaceholder && !config.isSelected && currentObj?._loadFailed) {
                // Only display the missing-image fallback after a confirmed load failure.
                drawPlaceholderText("No image found");
            }
        } else {
            // THE SUPPRESSION FIX: Do not draw the missing image text when the preview is selected (to keep the paste overlay clean)
            if (!config.suppressPlaceholder && !config.isSelected) {
                drawPlaceholderText("No Image");
            }
            // THE CACHE CLEANUP: If no image URL is present, purge any existing image state for this key
            // so stale previous/current URLs cannot keep triggering failed image requests.
            if (node._imageInstanceCache) {
                delete node._imageInstanceCache[config.key];
                delete node._imageInstanceCache[config.key + "_previous"];
            }
            if (node._derpImgCache && node._derpImgCache[config.key]) {
                delete node._derpImgCache[config.key];
            }
        }
    }

    if ((!!overlayPass === strokeOnOverlay) && (drawMode === "both" || drawMode === "stroke")) {
        let activePulseColor = null;
        if (config.isSelected && config.pulseColorA && config.pulseColorB) {
            const cA = config.pulseColorA, cB = config.pulseColorB;
            activePulseColor = getPulsedColor(cA, cB, config.pulseFreq || 0.003);
            if (node.setDirtyCanvas) node._derpAwakeFrames = 2;
        }
        if (config.isSelected && config.showPasteOverlay && Array.isArray(config.overlayText)) {
            config.overlayText.forEach(item => {
                const pData = resolvePaintData(node, item.themeKey || "t_textSmall", "OFF");
                if (!pData) return;

                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Auto-fit overlay text so it always stays within the preview bounds.
                const padX = Math.max(2, item.padX ?? 6);
                const padY = Math.max(2, item.padY ?? 6);
                const maxTextW = Math.max(1, w - (padX * 2));
                const maxTextH = Math.max(1, h - (padY * 2));

                const preferredSize = item.fontSize || pData.fontSize || 10;
                const minSize = Math.max(6, item.minFontSize ?? 6);
                const fontWeight = item.fontWeight || config.fontWeight || pData.fontWeight || "normal";
                const fontFamily = pData.font || "Arial";
                const overlayCache = node._imageHtmlOverlayCache || (node._imageHtmlOverlayCache = {});
                const overlayKey = `${config.key}|${String(item.text || "")}|${maxTextW}|${maxTextH}|${preferredSize}|${minSize}|${fontWeight}|${fontFamily}`;
                let fittedSize = overlayCache[overlayKey];

                if (!fittedSize) {
                    fittedSize = Math.max(minSize, preferredSize);
                    // Shrink text until it fits width/height budget.
                    for (let fs = preferredSize; fs >= minSize; fs -= 1) {
                        ctx.font = `${fontWeight} ${fs}px ${fontFamily}`;
                        const metrics = ctx.measureText(String(item.text || ""));
                        const textW = metrics.width || 0;
                        const textH = (metrics.actualBoundingBoxAscent || fs * 0.8) + (metrics.actualBoundingBoxDescent || fs * 0.2);
                        if (textW <= maxTextW && textH <= maxTextH) {
                            fittedSize = fs;
                            break;
                        }
                    }
                    overlayCache[overlayKey] = fittedSize;
                }

                ctx.font = `${fontWeight} ${fittedSize}px ${fontFamily}`;

                ctx.fillStyle = activePulseColor || "white";
                ctx.fillText(item.text, x + (w / 2), y + (h / 2) + (item.offset || 0));
                ctx.restore();
            });
        }

        ctx.save();
        let bColor = (config.isSelected && activePulseColor) ? activePulseColor : (config.borderColor || paintData?.border?.color || DEFAULT_IMAGE_AREA_STROKE_COLOR);
        if (Array.isArray(bColor)) bColor = `rgba(${bColor[0]}, ${bColor[1]}, ${bColor[2]}, ${bColor[3] ?? 1})`;
        ctx.strokeStyle = bColor;
        const weight = (config.isSelected && config.showPasteOverlay)
            ? SELECTION_STROKE_WEIGHT
            : ((config.borderWeight ?? paintData?.border?.width) || NORMAL_STROKE_WEIGHT);
        ctx.lineWidth = weight;
        // Draw border using configurable inside/outside split.
        // insideRatio=0.5 means centered on edge; 0.3 means 30% inside / 70% outside.
        const insideRatio = Math.max(0, Math.min(1, Number(config.borderInsideRatio ?? 0.5)));
        const inset = weight * (insideRatio - 0.5);
        const strokeX = x + inset;
        const strokeY = y + inset;
        const strokeW = Math.max(0, w - (inset * 2));
        const strokeH = Math.max(0, h - (inset * 2));
        if (ctx.roundRect && cornerRadius > 0) {
            ctx.beginPath();
            ctx.roundRect(strokeX, strokeY, strokeW, strokeH, cornerRadius);
            ctx.stroke();
        } else {
            ctx.strokeRect(strokeX, strokeY, strokeW, strokeH);
        }
        ctx.restore();
    }
    ctx.restore();

    if (!overlayPass && config.allowImageDrop && (drawMode === "both" || drawMode === "image")) {
        if (!node._derpDomElements) node._derpDomElements = {};
        let dropZone = node._derpDomElements[config.key + "_dropzone"];

        if (!dropZone) {
            dropZone = document.createElement("div");
            dropZone.style.position = "absolute";
            dropZone.style.zIndex = "1000";
            dropZone.style.cursor = "pointer";
            dropZone.tabIndex = 0;

            // Interaction Feedback
            dropZone.addEventListener("focus", () => dropZone.style.outline = "none");
            dropZone.addEventListener("click", (e) => {
                if (typeof dropZone._onPreviewClick === "function") {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone._onPreviewClick(e);
                }
            });
            dropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                dropZone.style.backgroundColor = "rgba(76, 175, 80, 0.3)";
            });
            dropZone.addEventListener("dragleave", (e) => {
                e.preventDefault();
                dropZone.style.backgroundColor = "transparent";
            });

            // Drop Handler
            dropZone.addEventListener("drop", (e) => {
                e.preventDefault();
                dropZone.style.backgroundColor = "transparent";
                const file = e.dataTransfer?.files?.[0];
                if (file && file.type.startsWith("image/") && config.onImageDropped) {
                    config.onImageDropped(file);
                }
            });

            // Paste Handler
            dropZone.addEventListener("paste", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
                if (item && config.onImageDropped) {
                    config.onImageDropped(item.getAsFile());
                }
            });

            document.body.appendChild(dropZone);
            node._derpDomElements[config.key + "_dropzone"] = dropZone;
        }

        // THE DOM SYNC GATING: Prevent layout thrashing by strictly relying on physical coordinate changes.
        // Removed node._shouldSync bypass which forced continuous DOM reflows during UI interaction loops.
        const domHash = `${node._lastDerpX}_${node._lastDerpY}_${app.canvas.ds.scale}_${w}_${h}_${node.interactionShield?.style.display}`;
        dropZone._onPreviewClick = typeof config.onPress === "function" ? config.onPress : null;
        if (app?.canvas && dropZone._lastHash !== domHash) {
            const coords = calculateScreenCoords(node, app, x, y, w, h);

            if (coords) {
                dropZone._lastHash = domHash;
                dropZone.style.left = `${coords.x}px`;
                dropZone.style.top = `${coords.y}px`;
                dropZone.style.width = `${coords.w}px`;
                dropZone.style.height = `${coords.h}px`;
                dropZone.style.opacity = alpha;
                dropZone.style.visibility = "visible";
                if (config.isSelected && document.activeElement !== dropZone) dropZone.focus({ preventScroll: true });
            }
        }
    } else if (node._derpDomElements && node._derpDomElements[config.key + "_dropzone"]) {
        node._derpDomElements[config.key + "_dropzone"].remove();
        delete node._derpDomElements[config.key + "_dropzone"];
    }
}
