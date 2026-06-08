/**
 * Path: ./Herbina/widgets/textLabel.js
 * STATUS: PROTOCOL COMPLIANT | UNIFIED ENVIRONMENT INTEGRATED
 */
import { masterPainter, masterPainterText } from "../masterPainter.js";
import { applyHTMLTheme, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR } from "../masterPainterHTML.js";
import { toRGBA } from "../utils/colorMath.js";
import { resolveWidgetEnv, measureTextWidth, resolvePaintData, colorSegmentsToHTML, getDerpTextLineHeight, buildColorSegmentTextShadow } from "../utils/widgetsUtils.js";
import { animateWidgetColors, getPulsedColor, parseColor } from "../masterAnimator.js";

function scaleEffectAlpha(colorStr, factor) {
    if (!colorStr) return "transparent";
    const match = String(colorStr).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return colorStr;
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha * factor})`;
}

function buildTextShadowLayer(effect, scale) {
    if (!effect) return null;
    const offX = (Number(effect.offsetX) || 0) * DERP_HTML_OFFSET_FACTOR * scale;
    const offY = (Number(effect.offsetY) || 0) * DERP_HTML_OFFSET_FACTOR * scale;
    const blur = Math.max(0, (Number(effect.blur) || 0) * DERP_HTML_BLUR_FACTOR * scale);
    const color = scaleEffectAlpha(effect.color, DERP_HTML_ALPHA_FACTOR);
    return `${offX}px ${offY}px ${blur}px ${color}`;
}

function buildTextShadow(paintData, scale) {
    const layers = [
        buildTextShadowLayer(paintData?.shadow, scale),
        buildTextShadowLayer(paintData?.glow, scale)
    ].filter(Boolean);
    return layers.length ? layers.join(", ") : "none";
}

function sliceColorSegmentsByVisibleRange(segments, startIndex, endIndex) {
    if (!segments || startIndex >= endIndex) return null;
    const lineSegments = [];
    let cursor = 0;

    for (const segment of segments) {
        const text = String(segment.text || "");
        const segmentStart = cursor;
        const segmentEnd = cursor + text.length;
        cursor = segmentEnd;

        if (segmentEnd <= startIndex) continue;
        if (segmentStart >= endIndex) break;

        const from = Math.max(0, startIndex - segmentStart);
        const to = Math.min(text.length, endIndex - segmentStart);
        if (from >= to) continue;

        lineSegments.push({ ...segment, text: text.slice(from, to) });
    }

    return lineSegments.length ? lineSegments : null;
}

function getLineColorSegments(segments, line, cursorRef) {
    if (!segments || !line) return null;
    const lineText = String(line);
    const start = cursorRef.value;
    const end = start + lineText.length;
    cursorRef.value = end;
    return sliceColorSegmentsByVisibleRange(segments, start, end);
}

export function createTextLabel(callbacks = {}) {
    return {
        type: "textLabel",
        text: callbacks.text || callbacks.label || "Text Label",
        fontWeight: callbacks.fontWeight || "normal",
        state: callbacks.state !== undefined ? callbacks.state : false,
        themeKey: callbacks.themeKey || "t_textsmall",
        wrap: callbacks.wrap || false,
        // Protocol Properties
        btnColor: callbacks.btnColor || null,
        labelColor: callbacks.labelColor || null
    };
}

export function syncTextLabel(ctx, node, config) {
    if (!config.geometry) return;
    const { x, y, w, h } = config.geometry;

    // THE FAST-HASH GATING: Prevent expensive theme resolution and paint data generation if state is static
    const isPressed = node._pressedRegionKey === config.key;
    const isHovered = (config.mouseOver !== false && node._hoveredRegionKey === config.key);
    const valStr = (config.text || config.label || "").toString();
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${valStr}_${config.alpha}`;

    const cache = node._textLabelCache || (node._textLabelCache = {});
    const itemCache = cache[config.key] || (cache[config.key] = {});

    if (itemCache.hash === stateHash && itemCache.res && !node._forceSync) {
        var { props, stateStr, bodyPaint: envBodyPaint, labelPaint: labelPaintData, alpha, colorSegments, hasColorKeys, visibleDisplayText } = itemCache.res;
    } else {
        var { props, stateStr, bodyPaint: envBodyPaint, labelPaint: labelPaintData, alpha, colorSegments, hasColorKeys, visibleDisplayText } = resolveWidgetEnv(node, config);
        itemCache.hash = stateHash;
        itemCache.res = { props, stateStr, bodyPaint: envBodyPaint, labelPaint: labelPaintData, alpha, colorSegments, hasColorKeys, visibleDisplayText };
    }

    // THE SKIP FIX: Background is hidden if themeKey is simple OR skipBackground is explicit
    const isTextOnly = (config.themeKey && !config.themeKey.includes(",")) || config.skipBackground === true;

    // 2. CENTRALIZED ANIMATED COLORS & ALPHA
    const rawBg = envBodyPaint?.fill || config.btnColor || "transparent";
    // THE THEME FIX: Removed hardcoded DIS alpha override so the _DIS theme key is strictly respected
    let rawIc = labelPaintData?.textColor || labelPaintData?.fill || "red";

    const useAnim =
        (config.showAnim !== false) &&
        (window.xcpDerpSettings?.useAnimations !== false) &&
        (window.DERP_GLOBAL_SETTINGS?.useAnimation !== false);
    const sysAlpha = alpha;
    const animKey = `_textLabel_anim_${config.key}`;

    let targetBg = rawBg;
    let targetIc = rawIc;
    if (config.pulseStates === true && useAnim) {
        const fromState = config.pulseFromState || "_ON";
        const toState = config.pulseToState || "_DIS";
        const baseLabelKey = config.themeKey ? config.themeKey.split(",").map(s => s.trim())[0] : "t_textSmall";
        const baseBodyKey = config.themeKey && config.themeKey.includes(",") ? config.themeKey.split(",").map(s => s.trim())[0] : null;
        const offLabel = resolvePaintData(node, baseLabelKey, fromState) || labelPaintData;
        const onLabel = resolvePaintData(node, baseLabelKey, toState) || labelPaintData;

        const offIc = parseColor(offLabel?.textColor || offLabel?.fill || rawIc);
        const onIc = parseColor(onLabel?.textColor || onLabel?.fill || rawIc);
        targetIc = getPulsedColor(offIc, onIc, config.pulseSpeed || 0.005);

        if (baseBodyKey) {
            const offBody = resolvePaintData(node, baseBodyKey, fromState) || envBodyPaint;
            const onBody = resolvePaintData(node, baseBodyKey, toState) || envBodyPaint;
            const offBg = parseColor(offBody?.fill || rawBg);
            const onBg = parseColor(onBody?.fill || rawBg);
            targetBg = getPulsedColor(offBg, onBg, config.pulseSpeed || 0.005);
        }
    }

    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, targetBg, targetIc, sysAlpha, useAnim);
    if (isAnimating && node) node._derpAwakeFrames = 5;

    if (alpha <= 0) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;

    const bodyPaint = isTextOnly ? null : envBodyPaint;

    // 1. Render Background
    if (bodyPaint) {
        masterPainter(ctx, {
            posX: x, posY: y, width: w, height: h,
            paintData: bodyPaint,
            color: fillColor // THE FIX: Apply animated color
        });
    }

    // 2. Text Logic (Canvas)
    const displayText = props.displayText;
    const measureDisplayText = visibleDisplayText || displayText;
    if (displayText == null || displayText === "") return;

    // Resolve color and paint data
    let finalTextColor = iconColor; // THE FIX: Use animated color
    if (Array.isArray(finalTextColor)) finalTextColor = toRGBA(finalTextColor);

    const finalPaint = {
        ...(labelPaintData || {}),
        font: labelPaintData?.font || "arial",
        fontSize: props.fontSize || labelPaintData?.fontSize || 10,
        fontWeight: config.fontWeight || labelPaintData?.fontWeight || props.fontWeight || "normal",
        fill: finalTextColor
    };

    const pX = props.padding?.[0] || 0;
    const pY = props.padding?.[1] || 0;
    const innerW = w - (pX * 2);

    ctx.save();

    // THE CUTOFF FIX: Strictly apply clipping region if the widget's displayMode requests it
    if (config.displayMode === "cutoff") {
        ctx.beginPath();
        ctx.rect(x + pX, y, innerW, h);
        ctx.clip();
    }

    // THE OPTIMIZATION: Word Wrapping Cache
    const font = finalPaint.font || "arial";
    const fontWeight = finalPaint.fontWeight || "normal";
    const cacheW = Math.round(innerW * 10) / 10;
    const cacheKey = `${measureDisplayText}_${cacheW}_${finalPaint.fontSize}_${font}_${fontWeight}`;
    if (!node._textLabelCache) node._textLabelCache = {};
    let lines = node._textLabelCache[config.key]?.key === cacheKey ? node._textLabelCache[config.key].lines : null;

    if (!lines) {
        lines = [];
        if (config.wrap && innerW > 0) {
            const words = measureDisplayText.toString().split(' ');
            let currentLine = '';

            for (let n = 0; n < words.length; n++) {
                let testLine = currentLine + words[n] + ' ';
                let metrics = measureTextWidth(testLine, finalPaint.fontSize, font, fontWeight);
                if (metrics > innerW && n > 0) {
                    lines.push(currentLine.trim());
                    currentLine = words[n] + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine.trim());
        } else {
            lines = [measureDisplayText.toString()];
        }
        node._textLabelCache[config.key] = { key: cacheKey, lines };
    }

    // 3. Render Lines
    const [alignX, alignY] = props.labelAlign || ["left", "middle"];
    const lineHeight = getDerpTextLineHeight(finalPaint.fontSize);
    const totalTextH = lines.length * lineHeight;

    // THE POSITION FIX: Shift startY down by (lineHeight / 2) to account for baseline="middle"
    let startY = y + pY + (lineHeight / 2);
    if (alignY === "middle") startY = y + (h / 2) - (totalTextH / 2) + (lineHeight / 2);
    if (alignY === "bottom") startY = y + h - pY - totalTextH + (lineHeight / 2);

    const colorLineCursor = { value: 0 };
    lines.forEach((line, i) => {
        const lineSegments = hasColorKeys ? getLineColorSegments(colorSegments, line, colorLineCursor) : null;
        masterPainterText(ctx, {
            x: (alignX === "center") ? x + (w / 2) : (alignX === "right" ? x + w - pX : x + pX),
            y: startY + (i * lineHeight) + (props.fontOffset || 0),
            text: line,
            paintData: finalPaint,
            align: alignX,
            baseline: "middle",
            segments: lineSegments
        });
    });

    ctx.restore(); // THE CUTOFF FIX: Restore context after clipping
    ctx.restore(); // THE ALPHA FIX: Restore context after global alpha
}
export function syncTextLabelHTML(element, node, app, config) {
    if (!element || !config.geometry) return;
    const { w } = config.geometry;

    // THE FAST-HASH GATING: Prevent layout thrashing and theme resolution unless interactive state or content changes
    const isPressed = node._pressedRegionKey === config.key || element.dataset?.isPressed === "true";
    const isHovered = (config.mouseOver !== false && (node._hoveredRegionKey === config.key || element.dataset?.isHovered === "true"));
    const valStr = (config.text || config.label || "").toString();
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${valStr}_${config.alpha}`;

    const needsFullSync = node._shouldSync || element._lastStateHash !== stateHash || (element._isAnimating && (window.xcpDerpSettings?.useAnimations !== false));

    if (!needsFullSync && element._lastProps && !node._forceSync) {
        var { props, stateStr, bodyPaint: envBodyPaint, labelPaint: labelPaintData, alignments, coords, textAnchor, alpha, colorSegments, hasColorKeys, visibleDisplayText } = element._lastProps;
    } else {
        var { props, stateStr, bodyPaint: envBodyPaint, labelPaint: labelPaintData, alignments, coords, textAnchor, alpha, colorSegments, hasColorKeys, visibleDisplayText } = resolveWidgetEnv(node, config, app, element);
        element._lastProps = { props, stateStr, bodyPaint: envBodyPaint, labelPaint: labelPaintData, alignments, coords, textAnchor, alpha, colorSegments, hasColorKeys, visibleDisplayText };
        element._lastStateHash = stateHash;
    }

    // 2. CENTRALIZED ANIMATED COLORS & ALPHA
    const rawBg = envBodyPaint?.fill || config.btnColor || "transparent";
    // THE THEME FIX: Removed hardcoded DIS alpha override so the _DIS theme key is strictly respected
    let rawIc = labelPaintData?.textColor || labelPaintData?.fill || "red";

    const useAnim =
        (config.showAnim !== false) &&
        (window.xcpDerpSettings?.useAnimations !== false) &&
        (window.DERP_GLOBAL_SETTINGS?.useAnimation !== false);
    const sysAlpha = alpha;
    const animKey = `_textLabel_html_anim_${config.key}`;

    let targetBg = rawBg;
    let targetIc = rawIc;
    if (config.pulseStates === true && useAnim) {
        const fromState = config.pulseFromState || "_ON";
        const toState = config.pulseToState || "_DIS";
        const baseLabelKey = config.themeKey ? config.themeKey.split(",").map(s => s.trim())[0] : "t_textSmall";
        const baseBodyKey = config.themeKey && config.themeKey.includes(",") ? config.themeKey.split(",").map(s => s.trim())[0] : null;
        const offLabel = resolvePaintData(node, baseLabelKey, fromState) || labelPaintData;
        const onLabel = resolvePaintData(node, baseLabelKey, toState) || labelPaintData;

        const offIc = parseColor(offLabel?.textColor || offLabel?.fill || rawIc);
        const onIc = parseColor(onLabel?.textColor || onLabel?.fill || rawIc);
        targetIc = getPulsedColor(offIc, onIc, config.pulseSpeed || 0.005);

        if (baseBodyKey) {
            const offBody = resolvePaintData(node, baseBodyKey, fromState) || envBodyPaint;
            const onBody = resolvePaintData(node, baseBodyKey, toState) || envBodyPaint;
            const offBg = parseColor(offBody?.fill || rawBg);
            const onBg = parseColor(onBody?.fill || rawBg);
            targetBg = getPulsedColor(offBg, onBg, config.pulseSpeed || 0.005);
        }
    }

    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, targetBg, targetIc, sysAlpha, useAnim);
    element._isAnimating = isAnimating;

    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (isAnimating && node) node._derpAwakeFrames = 5;

    if (!coords) return;
    const scale = coords.scale;

    // THE SKIP FIX: Background is hidden if themeKey is simple OR skipBackground is explicit
    const isTextOnly = (config.themeKey && !config.themeKey.includes(",")) || config.skipBackground === true;
    const bodyPaint = isTextOnly ? null : envBodyPaint;
    const isWrapping = config.wrap === true;

    // Content Handling
    const displayText = props.displayText || "";
    const measureDisplayText = visibleDisplayText || displayText;
    const isCutoff = config.displayMode === "cutoff";
    const fontWeight = config.fontWeight || labelPaintData?.fontWeight || props.fontWeight || "normal";
    const textShadow = buildTextShadow(labelPaintData, coords?.scale || 1);

    // THE OPTIMIZATION: DOM Thrash Gate using stable theme colors and content
    const alignKey = Array.isArray(props.labelAlign) ? props.labelAlign.join(",") : "";
    const syncKey = `${stateStr}-${rawBg}-${rawIc}-${displayText}-${scale}-${isWrapping}-${isCutoff}-${coords.width}-${coords.height}-${props.padding?.[0]}-${props.padding?.[1]}-${fontWeight}-${alignKey}-${textShadow}`;
    if (element._lastSyncKey !== syncKey || node._forceSync) {
        element._lastSyncKey = syncKey;

        // THE FIX: Move Content Handling INSIDE the thrash gate to prevent constant DOM invalidation
        if (hasColorKeys && colorSegments) {
            element.innerHTML = colorSegmentsToHTML(
                colorSegments,
                rawIc || labelPaintData?.fill || labelPaintData?.textColor,
                { getTextShadow: (segment) => buildColorSegmentTextShadow(segment, labelPaintData, scale) }
            );
        } else if (displayText.includes("<") && displayText.includes(">")) {
            element.innerHTML = displayText;
        } else {
            element.innerText = displayText;
        }

        // Dimension and Style Reset
        Object.assign(element.style, {
            position: "absolute",
            left: coords.left,
            top: coords.top,
            width: coords.width,
            height: coords.height,
            // THE HTML WRAP FIX: Use block display when wrapping so internal HTML tags (like <b>)
            // don't get forced into a single flex row.
            display: isWrapping ? "block" : (textAnchor?.display || "flex"),
            boxSizing: "border-box",
            pointerEvents: "auto",
            cursor: "default",
            whiteSpace: isWrapping ? "normal" : "nowrap",
            wordBreak: isWrapping ? "break-word" : "normal",
            // THE CUTOFF FIX: Correctly map HTML CSS properties for native clipping support
            overflow: isCutoff ? "hidden" : "visible",
            textOverflow: isCutoff ? "clip" : "unset"
        });

        // Font Sizing and Shrinking logic
        let fontSize = props.fontSize || labelPaintData?.fontSize || 10;
        if (!isWrapping && !config.noShrink && measureDisplayText.length > 0) {
            const limit = w - (props.padding?.[0] * 2 || 0);
            while (measureTextWidth(measureDisplayText, fontSize, labelPaintData?.font || "arial", fontWeight) > limit && fontSize > 4) {
                fontSize -= 0.5;
            }
        }

        // Color Resolution
        let finalTextColor = labelPaintData?.textColor || labelPaintData?.fill || "red";
        if (Array.isArray(finalTextColor)) finalTextColor = toRGBA(finalTextColor);

        element.style.opacity = alpha;

        // Paint Construction
        const activePaint = bodyPaint || {
            ...(labelPaintData || {}),
            fill: "transparent",
            stroke: 0,
            border: "none",
            textColor: finalTextColor
        };

        // THE FIX: Protocol Compliance. Use stable theme colors for the layout-heavy CSS pass.
        applyHTMLTheme(element, {
            ...activePaint,
            font: labelPaintData?.font || activePaint.font || "arial",
            fontSize: fontSize,
            fontWeight,
            fill: rawBg,
            textColor: rawIc
        }, scale);
        element.style.textShadow = textShadow;

        // Text-Only Overrides
        if (isTextOnly) {
            element.style.background = "transparent";
            element.style.backgroundColor = "transparent";
            element.style.border = "none";
            element.style.boxShadow = "none";
        }

        // Final Alignment and Spacing
        const [alignX, alignY] = props.labelAlign || ["left", "middle"];
        const lineHeight = getDerpTextLineHeight(fontSize) * scale;

        Object.assign(element.style, {
            justifyContent: textAnchor ? textAnchor.justifyContent : (alignments.justify[alignX] || "flex-start"),
            alignItems: alignments.align[alignY] || "center",
            textAlign: textAnchor ? textAnchor.align : alignX,
            padding: `${(props.padding?.[1] || 0) * scale}px ${(props.padding?.[0] || 0) * scale}px`,
            fontSize: `${fontSize * scale}px`,
            fontWeight,
            fontStyle: "normal",
            lineHeight: `${lineHeight}px`,
            transform: props.fontOffset ? `translateY(${props.fontOffset * scale}px)` : "none"
        });
    }

    // THE FAST-PATH FIX: Prevent redundant style writes
    if (element.style.color !== iconColor) element.style.color = iconColor;
    const finalBgColor = isTextOnly ? "transparent" : fillColor;
    if (element.style.backgroundColor !== finalBgColor) element.style.backgroundColor = finalBgColor;
}
