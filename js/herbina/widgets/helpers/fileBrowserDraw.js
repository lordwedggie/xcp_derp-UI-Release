export function drawPickerRow(ctx, state, row, rect, labelPaint, scale, deps = {}) {
    const {
        masterPainter = () => {},
        masterPainterText = () => {},
        inheritPickerCorners = () => 0,
        parseColorKeyText = () => ({ segments: null, hasColorKeys: false }),
        clampText = (text) => text,
        snapToScreenGrid = (value) => value,
    } = deps;

    const hovered = state.hoverRowId === row.id;
    const selected = (row.type === "file" && String(row.path ?? row.name ?? "").replace(/\\/g, "/") === String(state.config.value ?? "").replace(/\\/g, "/"))
        || (row.name && String(row.name) === String(state.config.value ?? ""));
    const searchMatched = !!(state.searchMatchRowId && row.id === state.searchMatchRowId);
    const emphasizeText = hovered || selected || searchMatched;
    const emphasizeBg = hovered;
    const rowPaint = emphasizeBg ? state.rowPaintON : state.listPaint;
    const textColor = emphasizeText
        ? (state.rowTextON?.textColor || state.rowTextON?.fill || labelPaint?.textColor || labelPaint?.fill || "#ffffff")
        : (labelPaint?.textColor || labelPaint?.fill || "#ffffff");

    if (state.config.skipBackground === false || emphasizeBg) {
        masterPainter(ctx, {
            width: rect.w,
            height: rect.h,
            posX: rect.x,
            posY: rect.y,
            paintData: { ...rowPaint, corners: inheritPickerCorners(rowPaint, state.listPaint) },
            color: rowPaint?.fill || "transparent"
        });
    }

    const pX = state.config.padding?.[0] || 4;
    const fontSize = state.rowPaintOFF?.fontSize || labelPaint?.fontSize || 10;
    const prefixText = (!row.hidePrefix && row.prefix) ? String(row.prefix).replace(/\s+$/, "") : "";
    const normalizedPrefixW = state.prefixSlotWidth || (fontSize * 1.2);
    const iconGap = state.prefixGap || 0;
    const iconOffset = (prefixText || row.reservePrefix) ? (normalizedPrefixW + iconGap) : 0;
    const maxTextWidth = Math.max(0, rect.w - (pX * 2) - iconOffset);
    const rawLabel = row.type === "file" ? row.name.replace(/\.(safetensors|json)$/i, "") : row.name;
    const { segments: pickerSegments, hasColorKeys: pickerHasKeys } = parseColorKeyText(
        rawLabel, state.node, "_OFF", textColor
    );
    const drawLabel = (pickerHasKeys && pickerSegments)
        ? rawLabel
        : clampText(rawLabel, maxTextWidth, fontSize, labelPaint?.font || "Arial", labelPaint?.fontWeight || "normal", state.config.displayMode === "ellipsis");

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    if (prefixText) {
        masterPainterText(ctx, {
            text: prefixText,
            x: snapToScreenGrid(rect.x + pX, scale),
            y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
            align: "left",
            baseline: "middle",
            paintData: {
                ...labelPaint,
                fontSize,
                fill: row.prefixColor || textColor,
            }
        });
    }

    masterPainterText(ctx, {
        text: drawLabel,
        x: row.type === "select_folder"
            ? snapToScreenGrid(rect.x + (rect.w / 2), scale)
            : snapToScreenGrid(rect.x + pX + iconOffset, scale),
        y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
        align: row.type === "select_folder" ? "center" : "left",
        baseline: "middle",
        paintData: {
            ...labelPaint,
            fontSize,
            fill: textColor,
        },
        segments: (pickerHasKeys && pickerSegments) ? pickerSegments : null
    });

    ctx.restore();
}

export function drawBreadcrumbHeaderRow(ctx, state, row, rect, labelPaint, scale, deps = {}) {
    const {
        drawPickerRow: drawPickerRowDelegate = drawPickerRow,
        isDropdownFileBrowser = () => false,
        translate = (value) => value,
        masterPainter = () => {},
        masterPainterText = () => {},
        inheritPickerCorners = () => 0,
        resolvePaintData = () => null,
        measureTextWidth = () => 0,
        clampText = (text) => text,
        snapToScreenGrid = (value) => value,
        breadcrumbPadding = [4, 1],
        breadcrumbTextKey = "t_textSystem",
    } = deps;

    const cfg = state.config || {};
    if (isDropdownFileBrowser(cfg)) {
        drawPickerRowDelegate(ctx, state, row, rect, labelPaint, scale);
        return;
    }

    const rootLabel = String(translate(cfg.rootName || "/") || "/");
    const dir = String(state.currentDir || "").replace(/^\/+|\/+$/g, "");
    const segs = dir ? dir.split("/") : [];
    const crumbs = [{ label: rootLabel, path: "" }];
    let accum = "";
    for (const seg of segs) {
        accum = accum ? `${accum}/${seg}` : seg;
        crumbs.push({ label: seg, path: accum });
    }

    masterPainter(ctx, {
        width: rect.w,
        height: rect.h,
        posX: rect.x,
        posY: rect.y,
        paintData: { ...state.listPaint, corners: inheritPickerCorners(state.listPaint, state.listPaint) },
        color: state.listPaint?.fill || "transparent"
    });

    const pX = state.config.padding?.[0] || 4;
    const [crumbPadX, crumbPadY] = breadcrumbPadding;
    const btnPaintOFF = resolvePaintData(state.node, "button", "_OFF") || state.listPaint;
    const btnPaintON = resolvePaintData(state.node, "button", "_ON") || state.rowPaintON || btnPaintOFF;
    const btnTextOFF = resolvePaintData(state.node, breadcrumbTextKey, "_OFF") || labelPaint;
    const btnTextON = resolvePaintData(state.node, breadcrumbTextKey, "_ON") || state.rowTextON || btnTextOFF;
    const measureTextPaint = btnTextOFF || labelPaint || {};
    const fontSize = measureTextPaint?.fontSize || state.rowPaintOFF?.fontSize || labelPaint?.fontSize || 10;
    const font = measureTextPaint?.font || labelPaint?.font || "Arial";
    const fontWeight = measureTextPaint?.fontWeight || labelPaint?.fontWeight || "normal";
    const sep = "\\";
    const sepW = measureTextWidth(sep, fontSize, font, fontWeight) || (fontSize * 0.6);
    const gap = Math.max(1, state.prefixGap || 0);
    const maxX = rect.x + rect.w - pX;
    let cursorX = rect.x + pX;
    const lastCrumb = crumbs[crumbs.length - 1] || null;
    const minLastTextW = Math.max(fontSize * 4, 32);
    const minLastBtnW = minLastTextW + (crumbPadX * 2);
    const buttonY = rect.y + crumbPadY;
    const buttonH = Math.max(1, rect.h - (crumbPadY * 2));

    const drawCrumbButton = (crumb, idx, x, width, allowClamp = false) => {
        if (!crumb || width <= 0) return 0;
        const hovered = state.hoverRowId === `crumb:${idx}:${crumb.path}`;
        const btnPaint = hovered ? btnPaintON : btnPaintOFF;
        const btnTextPaint = hovered ? btnTextON : btnTextOFF;
        const txtColor = btnTextPaint?.textColor || btnTextPaint?.fill || "#ffffff";
        const textLimit = Math.max(0, width - (crumbPadX * 2));
        const drawText = allowClamp
            ? clampText(String(crumb.label || ""), textLimit, fontSize, font, fontWeight, true)
            : String(crumb.label || "");
        if (!drawText) return 0;

        masterPainter(ctx, {
            width,
            height: buttonH,
            posX: x,
            posY: buttonY,
            paintData: { ...btnPaint, corners: inheritPickerCorners(btnPaint, state.listPaint) },
            color: btnPaint?.fill || "transparent"
        });
        masterPainterText(ctx, {
            text: drawText,
            x: snapToScreenGrid(x + (width / 2), scale),
            y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
            align: "center",
            baseline: "middle",
            paintData: { ...btnTextPaint, fontSize, font, fontWeight, fill: txtColor }
        });

        state.breadcrumbHitboxes.push({
            id: `crumb:${idx}:${crumb.path}`,
            path: crumb.path,
            rect: {
                left: state.panelScreenRect.left + ((x - rect.x) * scale),
                top: state.panelScreenRect.top + ((buttonY - state.panelY) * scale),
                width: width * scale,
                height: buttonH * scale,
            },
        });
        return width;
    };

    for (let i = 0; i < crumbs.length; i += 1) {
        const crumb = crumbs[i];
        const isLastCrumb = i === crumbs.length - 1;
        const text = String(crumb.label || "");
        const textW = Math.max(8, measureTextWidth(text, fontSize, font, fontWeight) || 8);
        const btnW = textW + (crumbPadX * 2);
        if (isLastCrumb) {
            const remainingW = Math.max(0, maxX - cursorX);
            drawCrumbButton(crumb, i, cursorX, Math.min(btnW, remainingW), btnW > remainingW);
            break;
        }

        const reserveForLast = lastCrumb ? (sepW + gap + minLastBtnW) : 0;
        if (cursorX + btnW + reserveForLast > maxX) {
            if (lastCrumb) {
                const remainingW = Math.max(0, maxX - cursorX);
                drawCrumbButton(lastCrumb, crumbs.length - 1, cursorX, remainingW, true);
            }
            break;
        }

        drawCrumbButton(crumb, i, cursorX, btnW, false);
        cursorX += btnW;
        if (i < crumbs.length - 1) {
            if (cursorX + sepW + minLastBtnW > maxX) {
                const remainingW = Math.max(0, maxX - cursorX);
                if (remainingW > 0 && lastCrumb) {
                    drawCrumbButton(lastCrumb, crumbs.length - 1, cursorX, remainingW, true);
                }
                break;
            }
            masterPainterText(ctx, {
                text: sep,
                x: snapToScreenGrid(cursorX + (sepW / 2), scale),
                y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
                align: "center",
                baseline: "middle",
                paintData: { ...btnTextOFF, fontSize, font, fontWeight, fill: btnTextOFF?.textColor || btnTextOFF?.fill || "#ffffff" }
            });
            cursorX += sepW + gap;
        }
    }
}

export function createFirstRowGeometry(firstRowMargin, scale) {
    const [firstRowMarginL, firstRowMarginT, firstRowMarginR, firstRowMarginB] = firstRowMargin;
    let hasRenderedFirstRow = false;

    return {
        get hasRenderedFirstRow() {
            return hasRenderedFirstRow;
        },
        markRendered() {
            hasRenderedFirstRow = true;
        },
        getRowRenderRect(baseRect) {
            if (hasRenderedFirstRow) return baseRect;
            return {
                x: baseRect.x + firstRowMarginL,
                y: baseRect.y + firstRowMarginT,
                w: Math.max(1, baseRect.w - firstRowMarginL - firstRowMarginR),
                h: Math.max(1, baseRect.h),
            };
        },
        getRowHitboxRect(baseRect, rowRect, areaLeft, areaTop) {
            if (hasRenderedFirstRow) {
                return {
                    left: areaLeft,
                    top: areaTop,
                    width: baseRect.w * scale,
                    height: baseRect.h * scale,
                };
            }
            return {
                left: areaLeft + ((rowRect.x - baseRect.x) * scale),
                top: areaTop + ((rowRect.y - baseRect.y) * scale),
                width: rowRect.w * scale,
                height: (rowRect.h + firstRowMarginB) * scale,
            };
        },
    };
}

export function calculatePickerRenderMetrics(state, geometry = {}) {
    const {
        separatorHeight = 0,
        bottomGap = 0,
        firstRowExtraHeight = 0,
    } = geometry;
    const footerCount = state.footerRow ? 1 : 0;
    const renderedScrollRows = Math.min(state.scrollRows.length, Math.max(0, state.visibleScrollRows || 0));
    const renderedRowCount = state.headerRows.length + renderedScrollRows + footerCount;
    const targetHeight = (renderedRowCount * state.rowHeight)
        + separatorHeight
        + bottomGap
        + (renderedRowCount > 0 ? firstRowExtraHeight : 0);

    return { footerCount, renderedScrollRows, renderedRowCount, targetHeight };
}

export function calculatePickerPanelLayout(state, config, anchorRect, scale, deps = {}) {
    const {
        windowHeight = globalThis.window?.innerHeight || 0,
        autoFlipBySpace = true,
    } = deps;
    const availableBelow = windowHeight - (anchorRect.top + anchorRect.height) - 8;
    const availableAbove = anchorRect.top - 8;
    const pickerHeightPx = state.currentSize[1] * scale;
    const openUpward = autoFlipBySpace
        ? (pickerHeightPx > availableBelow && availableAbove > availableBelow)
        : false;

    const panelX = config.geometry.x;
    const panelY = openUpward ? (config.geometry.y + config.geometry.h - state.currentSize[1]) : config.geometry.y;
    const panelW = config.geometry.w;
    const panelH = state.currentSize[1];
    const panelScreenRect = {
        left: anchorRect.left,
        top: openUpward ? (anchorRect.top + anchorRect.height - pickerHeightPx) : anchorRect.top,
        width: anchorRect.width,
        height: pickerHeightPx,
    };

    return { panelX, panelY, panelW, panelH, panelScreenRect, openUpward };
}

export function drawPickerRows(ctx, state, rows, geometry, deps = {}) {
    const {
        drawPickerRow: drawPickerRowDelegate = drawPickerRow,
        drawBreadcrumbHeaderRow: drawBreadcrumbHeaderRowDelegate = null,
        firstRowGeometry,
        labelPaint = state.rowPaintOFF || state.rowTextON,
        scale = 1,
        firstRowExtraHeight = 0,
        panelY = geometry.y,
        areaLeft = state.panelScreenRect?.left || 0,
        areaTop = state.panelScreenRect?.top || 0,
        yOffset = 0,
        advanceCursor = false,
    } = deps;
    let cursorY = geometry.y;

    for (let i = 0; i < (rows || []).length; i += 1) {
        const row = rows[i];
        const rowY = advanceCursor ? cursorY : (geometry.getRowY ? geometry.getRowY(row, i) : cursorY);
        const baseRect = { x: geometry.x, y: rowY, w: geometry.w, h: state.rowHeight };
        const rect = firstRowGeometry ? firstRowGeometry.getRowRenderRect(baseRect) : baseRect;
        if (row.type === "select_current" && drawBreadcrumbHeaderRowDelegate) {
            drawBreadcrumbHeaderRowDelegate(ctx, state, row, rect, labelPaint, scale);
        } else {
            drawPickerRowDelegate(ctx, state, row, rect, labelPaint, scale);
        }
        state.rowHitboxes.push({ row, rect: {
            ...(firstRowGeometry
                ? firstRowGeometry.getRowHitboxRect(baseRect, rect, areaLeft, areaTop + ((rowY - yOffset) * scale))
                : { left: areaLeft, top: areaTop + ((rowY - yOffset) * scale), width: baseRect.w * scale, height: baseRect.h * scale }),
        }});
        if (advanceCursor) {
            cursorY += state.rowHeight + (firstRowGeometry?.hasRenderedFirstRow ? 0 : firstRowExtraHeight);
            firstRowGeometry?.markRendered();
        } else if (firstRowGeometry && !firstRowGeometry.hasRenderedFirstRow) {
            firstRowGeometry.markRendered();
        }
    }

    return cursorY;
}

export function drawPickerSeparator(ctx, geometry, deps = {}) {
    const {
        lineTop = "rgba(0, 0, 0, 0.2)",
        lineBottom = "rgba(255, 255, 255, 0.05)",
    } = deps;
    const { panelX, panelW, cursorY, separatorHeight = 0 } = geometry;
    if (separatorHeight <= 0) return cursorY;

    ctx.fillStyle = lineTop;
    ctx.fillRect(panelX, cursorY, panelW, 1);
    ctx.fillStyle = lineBottom;
    ctx.fillRect(panelX, cursorY + 1, panelW, 1);
    return cursorY + separatorHeight;
}

export function calculatePickerScrollViewport(state, geometry, deps = {}) {
    const {
        scrollbarWidth = 6,
        scrollbarInset = 2,
    } = deps;
    const { panelX, panelY, panelW, panelH, cursorY, footerHeight = 0, bottomGap = 0, scale = 1, scrollMetrics } = geometry;
    const scrollAreaH = Math.max(0, panelH - (cursorY - panelY) - footerHeight - bottomGap);
    const needsScrollbar = !!(scrollMetrics?.isScrollable && scrollAreaH > 0);
    const scrollbarReserve = needsScrollbar ? (scrollbarWidth + (scrollbarInset * 2)) : 0;
    const scrollScreenRect = {
        left: state.panelScreenRect.left,
        top: state.panelScreenRect.top + ((cursorY - panelY) * scale),
        width: state.panelScreenRect.width,
        height: scrollAreaH * scale,
    };
    const clipRect = {
        x: panelX,
        y: cursorY,
        w: panelW - scrollbarReserve,
        h: scrollAreaH,
    };

    return { scrollAreaH, needsScrollbar, scrollbarReserve, scrollScreenRect, clipRect };
}

export function getVisiblePickerScrollRows(state, geometry) {
    const { cursorY, scrollAreaH } = geometry;
    const firstVisibleY = cursorY - state.scrollOffset;
    const rowYByRow = new Map();
    const rows = state.scrollRows.filter((row, index) => {
        const rowY = firstVisibleY + (index * state.rowHeight);
        const isVisible = rowY + state.rowHeight >= cursorY && rowY <= cursorY + scrollAreaH;
        if (isVisible) rowYByRow.set(row, rowY);
        return isVisible;
    });

    return { rows, rowYByRow, firstVisibleY };
}

export function shouldKeepPickerAwake(state, targetHeight, deps = {}) {
    const { isPreviewImagePending = () => false } = deps;
    const heightAnimating = Math.abs((state.currentSize?.[1] || 0) - targetHeight) > 0.5;
    const alphaAnimating = Math.abs((state.itemAlpha || 0) - 1) > 0.01;
    const previewPending = isPreviewImagePending(state);
    return heightAnimating || alphaAnimating || (state.viewportFollowFrames || 0) > 0 || previewPending;
}

export function syncPickerViewportFollow(state, scale, deps = {}) {
    const {
        ensureScreenRectVisible = () => {},
        warpMarginUnits = 10,
        durationMs = 220,
        easing = "easeOutQuad",
    } = deps;
    if ((state.viewportFollowFrames || 0) <= 0) return;

    const rect = state.panelScreenRect;
    const viewportWarpHash = `${rect.left.toFixed(2)}_${rect.top.toFixed(2)}_${rect.width.toFixed(2)}_${rect.height.toFixed(2)}`;
    if (state.lastViewportWarpHash !== viewportWarpHash) {
        state.lastViewportWarpHash = viewportWarpHash;
        const effectiveWarpMargin = warpMarginUnits * Math.max(0.000001, scale);
        ensureScreenRectVisible(rect, {
            viewportMargin: effectiveWarpMargin,
            durationMs,
            easing,
        });
    }
    state.viewportFollowFrames -= 1;
}

export function preparePickerDrawState(state, ctx, deps = {}) {
    const { computePickerPrefixSlotWidth = () => 0 } = deps;
    const labelPaint = state.rowPaintOFF || state.rowTextON;
    state.prefixSlotWidth = computePickerPrefixSlotWidth(state, ctx, labelPaint);
    state.rowHitboxes = [];
    state.breadcrumbHitboxes = [];
    state.scrollbarScreenRect = null;
    state.scrollbarThumbScreenRect = null;
    return { labelPaint };
}

export function drawPickerScrollbar(ctx, state, geometry, scrollMetrics, deps = {}) {
    const {
        masterPainter = () => {},
        inheritPickerCorners = () => 0,
        clamp01 = (value) => Math.max(0, Math.min(1, value)),
        scrollbarWidth = 6,
        scrollbarInset = 2,
        scrollbarMinThumb = 18,
    } = deps;
    const { panelX, panelY, panelW, cursorY, scrollAreaH, scale } = geometry;
    const trackX = panelX + panelW - scrollbarWidth - scrollbarInset;
    const trackY = cursorY + scrollbarInset;
    const trackH = Math.max(0, scrollAreaH - (scrollbarInset * 2));
    const thumbRatio = clamp01(scrollMetrics.viewportHeight / Math.max(scrollMetrics.viewportHeight, scrollMetrics.contentHeight));
    const thumbH = Math.max(scrollbarMinThumb, trackH * thumbRatio);
    const thumbTravel = Math.max(0, trackH - thumbH);
    const thumbT = scrollMetrics.maxScroll > 0 ? clamp01(state.scrollOffset / scrollMetrics.maxScroll) : 0;
    const thumbY = trackY + (thumbTravel * thumbT);

    masterPainter(ctx, {
        width: scrollbarWidth,
        height: trackH,
        posX: trackX,
        posY: trackY,
        paintData: { ...state.listPaint, corners: inheritPickerCorners(state.listPaint, null), border: null, shadow: null, glow: null },
        color: "rgba(0,0,0,0.22)"
    });
    masterPainter(ctx, {
        width: scrollbarWidth,
        height: thumbH,
        posX: trackX,
        posY: thumbY,
        paintData: { ...state.rowPaintON, corners: inheritPickerCorners(state.rowPaintON, state.listPaint), border: null },
        color: state.rowTextON?.fill || state.rowTextON?.textColor || "rgba(255,255,255,0.5)"
    });

    state.scrollbarScreenRect = {
        left: state.panelScreenRect.left + ((trackX - panelX) * scale),
        top: state.panelScreenRect.top + ((trackY - panelY) * scale),
        width: scrollbarWidth * scale,
        height: trackH * scale,
    };
    state.scrollbarThumbScreenRect = {
        left: state.panelScreenRect.left + ((trackX - panelX) * scale),
        top: state.panelScreenRect.top + ((thumbY - panelY) * scale),
        width: scrollbarWidth * scale,
        height: thumbH * scale,
    };
}

export function drawPickerBottomGap(ctx, state, geometry, deps = {}) {
    const { masterPainter = () => {}, inheritPickerCorners = () => 0 } = deps;
    const { panelX, panelY, panelW, panelH, bottomGap } = geometry;
    if (bottomGap <= 0) return;

    const gapY = panelY + panelH - bottomGap;
    masterPainter(ctx, {
        width: panelW,
        height: bottomGap,
        posX: panelX,
        posY: gapY,
        paintData: { ...state.listPaint, corners: inheritPickerCorners(state.listPaint, null), border: null, shadow: null, glow: null },
        color: state.listPaint?.fill || "transparent"
    });
}
