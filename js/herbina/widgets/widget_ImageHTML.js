/**
 * Path: ./Herbina/widgets/widget_ImageHTML.js
 * ROLE: Canvas-native image rendering.
 */
import { masterPainter } from "../masterPainter.js";
import { resolveWidgetEnv, resolvePaintData, calculateScreenCoords } from "../utils/widgetsUtils.js";

const NORMAL_STROKE_WEIGHT = 1;
const SELECTION_STROKE_WEIGHT = 2;
const BYPASS_BRIGHTNESS = 0.75; // THE DARKNESS FIX: Adjusts image brightness when bypassed

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
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;

    if (!overlayPass && (drawMode === "both" || drawMode === "image")) {
        if (paintData) {
            masterPainter(ctx, {
                posX: x, posY: y, width: w, height: h,
                paintData: paintData, color: paintData.fill || config.btnColor || "transparent"
            });
        } else if (config.btnColor && config.btnColor !== "transparent") {
            ctx.save();
            ctx.fillStyle = config.btnColor;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 4);
                ctx.fill();
            } else {
                ctx.fillRect(x, y, w, h);
            }
            ctx.restore();
        }

        // 2. Load and Draw Image Natively
        if (config.imageUrl) {
            if (!node._imageInstanceCache) node._imageInstanceCache = {};

            // THE DECODE GATING: Only create a new Image object if the URL has changed.
            let imgObj = node._imageInstanceCache[config.key];
            if (!imgObj || imgObj._lastUrl !== config.imageUrl) {
                imgObj = new Image();
                imgObj._lastUrl = config.imageUrl;
                imgObj._isLoaded = false;
                imgObj.onload = () => {
                    imgObj._isLoaded = true;
                    if (node.setDirtyCanvas) {
                        node._derpAwakeFrames = 5;
                        node.setDirtyCanvas(true);
                    }
                };
                imgObj.src = config.imageUrl;
                node._imageInstanceCache[config.key] = imgObj;
            }

            if (imgObj._isLoaded && imgObj.naturalWidth > 0) {
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

                // Apply rounding and clipping to the main context
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4);
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

            } else if (!config.isSelected && imgObj && imgObj.complete) {
                // THE FALLBACK FIX: Display placeholder text if the image asset failed to load
                ctx.save();
                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.font = "6px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("No image found", x + w / 2, y + h / 2);
                ctx.restore();
            }
        } else {
            // THE SUPPRESSION FIX: Do not draw the missing image text when the preview is selected (to keep the paste overlay clean)
            if (!config.isSelected) {
                ctx.save();
                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.font = "6px Arial";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("No Image", x + w / 2, y + h / 2);
                ctx.restore();
            }
            // THE CACHE CLEANUP: If no image URL is present, purge any existing cache for this key
            if (node._derpImgCache && node._derpImgCache[config.key]) {
                delete node._derpImgCache[config.key];
            }
        }
    }

    if ((!!overlayPass === strokeOnOverlay) && (drawMode === "both" || drawMode === "stroke")) {
        let activePulseColor = null;
        if (config.isSelected && config.pulseColorA && config.pulseColorB) {
            const t = (Math.sin(Date.now() * (config.pulseFreq || 0.003)) + 1) / 2;
            const cA = config.pulseColorA, cB = config.pulseColorB;
            const r = Math.round(cA[0] + (cB[0] - cA[0]) * t);
            const g = Math.round(cA[1] + (cB[1] - cA[1]) * t);
            const b = Math.round(cA[2] + (cB[2] - cA[2]) * t);
            const a = (cA[3] + (cB[3] - cA[3]) * t).toFixed(2);
            activePulseColor = `rgba(${r}, ${g}, ${b}, ${a})`;
            if (node.setDirtyCanvas) node._derpAwakeFrames = 2;
        }
        if (config.isSelected && config.showPasteOverlay && Array.isArray(config.overlayText)) {
            config.overlayText.forEach(item => {
                const pData = resolvePaintData(node, item.themeKey || "t_textSmall", "OFF");
                if (!pData) return;

                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                // Apply font size overrides from the layoutMap or fallback to the resolved theme size
                const fontSize = item.fontSize || pData.fontSize || 10;
                ctx.font = `${pData.fontWeight || ""} ${fontSize}px ${pData.font || "Arial"}`;

                ctx.fillStyle = activePulseColor || "white";
                ctx.fillText(item.text, x + (w / 2), y + (h / 2) + (item.offset || 0));
                ctx.restore();
            });
        }

        ctx.save();
        let bColor = (config.isSelected && activePulseColor) ? activePulseColor : (config.borderColor || paintData?.border?.color || "black");
        if (Array.isArray(bColor)) bColor = `rgba(${bColor[0]}, ${bColor[1]}, ${bColor[2]}, ${bColor[3] ?? 1})`;
        ctx.strokeStyle = bColor;
        // THE SELECTION STROKE FIX: Force weight 2 during paste-ready pulses and center the stroke path
        const weight = (config.isSelected && config.showPasteOverlay) ? SELECTION_STROKE_WEIGHT : (paintData?.border?.width || NORMAL_STROKE_WEIGHT);
        ctx.lineWidth = weight;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, 4);
            ctx.stroke();
        } else {
            ctx.strokeRect(x, y, w, h);
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
        if (app && app.canvas && (dropZone._lastHash !== domHash)) {
            const coords = calculateScreenCoords(node, app, x, y, w, h);

            if (coords) {
                dropZone._lastHash = domHash;
                dropZone.style.left = `${coords.x}px`;
                dropZone.style.top = `${coords.y}px`;
                dropZone.style.width = `${coords.w}px`;
                dropZone.style.height = `${coords.h}px`;
                dropZone.style.opacity = alpha;
                dropZone.style.visibility = "visible";
            }
        }
    } else if (node._derpDomElements && node._derpDomElements[config.key + "_dropzone"]) {
        node._derpDomElements[config.key + "_dropzone"].remove();
        delete node._derpDomElements[config.key + "_dropzone"];
    }
}