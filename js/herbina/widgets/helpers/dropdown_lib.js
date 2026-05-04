/**
 * Specialist: ./herbina/widgets/dropdown_lib.js
 * ROLE: Shared Hybrid HTML overlay engine for Dropdown and FileBrowser widgets.
 */
import { getNextZIndex } from "../../utils/widgetsUtils.js";

const scrollHideId = "derp-scrollbar-hide-style";
if (!document.getElementById(scrollHideId)) {
    const style = document.createElement("style");
    style.id = scrollHideId;
    style.innerHTML = `
        .derp-scrollbar-hidden::-webkit-scrollbar { display: none !important; }
        .derp-scrollbar-hidden { -ms-overflow-style: none !important; scrollbar-width: none !important; }
    `;
    document.head.appendChild(style);
}

export const DROPDOWN_ANIM_SETTINGS = {
    lerpFactor: 0.325,
    lerpCurve: 0.5,
    alphaFactor: 0.2,
    fadeThreshold: 0.5,
    anchorSize: [10, 4]
};

export function isWidgetAnimationEnabled(config, node, app) {
    try {
        const isOff = (v) => v === false || String(v).toLowerCase() === "false" || String(v).toLowerCase() === "off";

        if (node?.properties && isOff(node.properties.useAnimations)) return false;
        if (config && (isOff(config.useAnim) || isOff(config.showAnim))) return false;
        if (node?.properties) {
            const p = node.properties;
            if (isOff(p.useAnim) || isOff(p.showAnim) || isOff(p.animations)) return false;
        }
        if (isOff(window.xcpDerpSettings?.useAnimations) || isOff(window.xcpDerpSettings?.showAnim)) return false;
        return true;
    } catch (e) {
        return true;
    }
}

export function createHybridDropdownHTML(callbacks = {}, glyphs = ["▼", "▲"]) {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.zIndex = getNextZIndex();
    el.style.display = "none";
    el.style.userSelect = "none";
    el.style.pointerEvents = "auto";
    el.style.boxSizing = "border-box";

    const label = document.createElement("div");
    label.style.width = "100%";
    label.style.height = "100%";
    label.style.display = "flex";
    label.style.boxSizing = "border-box";
    label.style.pointerEvents = "none";
    label.style.whiteSpace = "nowrap";
    label.style.overflow = "hidden";
    el.appendChild(label);
    el._label = label;

    const arrow = document.createElement("div");
    arrow.innerHTML = Array.isArray(glyphs) ? glyphs[0] : glyphs;
    arrow.style.position = "absolute";
    arrow.style.pointerEvents = "none";
    el.appendChild(arrow);
    el._arrow = arrow;

    el._glyphs = Array.isArray(glyphs) ? glyphs : [glyphs, glyphs];
    el._callbacks = callbacks;
    document.body.appendChild(el);
    return el;
}

export function buildPickerDOMContainer(picker, listPaint, scale, sH) {
    const headerWrapper = document.createElement("div");
    headerWrapper.style.display = "flex";
    headerWrapper.style.flexDirection = "column";
    headerWrapper.style.width = "100%";
    headerWrapper.style.flexShrink = "0";
    headerWrapper.style.position = "relative";
    headerWrapper.style.zIndex = "10";
    headerWrapper.style.overflow = "hidden";
    const hp = listPaint?.fill;
    headerWrapper.style.backgroundColor = Array.isArray(hp) ? `rgba(${hp[0]}, ${hp[1]}, ${hp[2]}, ${hp[3] ?? 1})` : (hp || "rgb(30, 30, 30)");
    picker.appendChild(headerWrapper);
    picker._headerWrapper = headerWrapper;

    const separator = document.createElement("div");
    separator.style.width = "100%";
    separator.style.display = "flex";
    separator.style.flexDirection = "column";
    separator.style.flexShrink = "0";
    const line1 = document.createElement("div");
    line1.style.width = "100%";
    line1.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    const line2 = document.createElement("div");
    line2.style.width = "100%";
    line2.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
    separator.appendChild(line1);
    separator.appendChild(line2);
    picker.appendChild(separator);
    picker._separator = separator;
    picker._sepHeightBase = (sH * 2) + 2;

    const scrollBounds = document.createElement("div");
    scrollBounds.style.position = "relative";
    scrollBounds.style.width = "100%";
    scrollBounds.style.display = "flex";
    scrollBounds.style.flexDirection = "column";
    scrollBounds.style.overflow = "hidden";
    scrollBounds.classList.add("derp-scrollbar-hidden");
    picker.appendChild(scrollBounds);
    picker._scrollBounds = scrollBounds;

    const contentWrapper = document.createElement("div");
    contentWrapper.style.position = "absolute";
    contentWrapper.style.top = "0px";
    contentWrapper.style.left = "0px";
    contentWrapper.style.display = "flex";
    contentWrapper.style.flexDirection = "column";
    contentWrapper.style.width = "100%";
    contentWrapper.style.overflow = "visible";
    scrollBounds.appendChild(contentWrapper);
    picker._contentWrapper = contentWrapper;

    const previewBox = document.createElement("div");
    previewBox.style.position = "fixed";
    previewBox.style.display = "none";
    previewBox.style.pointerEvents = "none";
    previewBox.style.zIndex = getNextZIndex() + 3000;
    previewBox.style.overflow = "hidden";
    previewBox.style.backgroundColor = "rgba(0,0,0,0.8)";
    previewBox.style.border = `${1 * scale}px solid rgba(0, 0, 0, 0.5)`;
    previewBox.style.borderRadius = `${4 * scale}px`;
    previewBox.style.boxShadow = "0 4px 15px rgba(0,0,0,0.5)";

    const previewImg = document.createElement("img");
    previewImg.style.width = "100%";
    previewImg.style.height = "auto";
    previewImg.style.objectFit = "contain";
    previewBox.appendChild(previewImg);
    picker._previewBox = previewBox;
    picker._previewImg = previewImg;
    document.body.appendChild(previewBox);

    return { headerWrapper, separator, scrollBounds, contentWrapper, previewBox, previewImg };
}

export function handleHybridPickerClosePhase(activePicker, lastOpenTime, app) {
    if (!activePicker) return false;
    if (Date.now() - lastOpenTime < 150) return true;
    return false;
}

export function finalizeHybridPickerCleanup(activePicker, toggleShieldCallback, closeCallback) {
    if (activePicker) {
        if (activePicker._cleanupScrollEvents) activePicker._cleanupScrollEvents();
        if (activePicker._previewBox) activePicker._previewBox.remove();
        activePicker.remove();
        toggleShieldCallback(false, closeCallback);
    }
}

export function appendHybridPickerRow(container, sourceEl, paintOFF, paintON, scale, dynamicRowHeight, glyph, contentHTML, isSelected = false, pX = 8, iconOffset = 0, glyphSpacing = 0, glyphSizeMult = 1, sideMargin = 0) {
    const row = document.createElement("div");
    row.style.userSelect = "none";
    row.style.boxSizing = "border-box";
    row.style.height = `${dynamicRowHeight * scale}px`;
    row.style.flexShrink = "0";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.whiteSpace = "nowrap";
    row.style.overflow = "hidden";
    row.style.padding = `0px ${(pX + sideMargin) * scale}px`;

    const activePaint = isSelected ? (paintON || paintOFF) : paintOFF;
    const fs = (activePaint?.fontSize || 10);
    row.style.fontSize = `${fs * scale}px`;
    row.style.fontFamily = activePaint?.font || "Arial";
    row.style.color = activePaint?.textColor || activePaint?.fill || "white";

    if (glyph) {
        const gSpan = document.createElement("span");
        gSpan.innerText = glyph;
        gSpan.style.display = "inline-block";
        gSpan.style.width = `${iconOffset * scale}px`;
        gSpan.style.marginRight = `${glyphSpacing * scale}px`;
        gSpan.style.fontSize = `${fs * glyphSizeMult * scale}px`;
        gSpan.style.flexShrink = "0";
        row._glyphSpan = gSpan;
        row.appendChild(gSpan);
    }

    const cSpan = document.createElement("span");
    cSpan.innerHTML = contentHTML;
    row._contentSpan = cSpan;
    row.appendChild(cSpan);

    container.appendChild(row);
    return row;
}

/**
 * THE ZOOM SCROLL FIX: Shared logic to stabilize scrollbars during Canvas zooming.
 * Absorbs floating-point rounding errors and cleans up phantom library elements.
 */
export function syncHybridScroll(picker, scale, updateScrollFn) {
    if (!picker || !picker._scrollBounds) return;
    if (!picker._lastScrollHash) picker._lastScrollHash = "";

    const dRowH = picker._dynamicRowHeight || 24;
    const scrollCount = picker._contentWrapper ? picker._contentWrapper.children.length : 0;
    const headerCount = picker._headerWrapper ? picker._headerWrapper.children.length : 0;
    const currentH = picker._currentSize[1].toFixed(2);

    const scrollHash = `${scale.toFixed(3)}_${currentH}_${scrollCount}_${headerCount}`;
    if (picker._lastScrollHash === scrollHash) return;
    picker._lastScrollHash = scrollHash;
        const sepHeightLocal = picker._sepHeightBase || 0;
        const visibleLimit = picker._visibleLimit || 15;

        const viewportH = (picker._currentSize[1] - (headerCount * dRowH) - sepHeightLocal);
        picker._scrollBounds.style.height = `${(viewportH * scale) + 1}px`;

        const isShort = (scrollCount <= (visibleLimit - headerCount));

    if (isShort) {
        picker._scrollBounds.style.overflowY = "hidden";
        if (picker._contentWrapper) {
            picker._contentWrapper.style.maxHeight = `${viewportH * scale}px`;
            picker._contentWrapper.style.overflow = "hidden";
        }
    } else {
        picker._scrollBounds.style.overflowY = "scroll";
        if (picker._contentWrapper) {
            picker._contentWrapper.style.maxHeight = "none";
            picker._contentWrapper.style.overflow = "visible";
        }
    }
        if (updateScrollFn) updateScrollFn(picker._scrollBounds, picker._contentWrapper, scale);

    if (isShort) {
        Array.from(picker._scrollBounds.children).forEach(c => {
            if (c !== picker._contentWrapper) c.style.display = "none";
        });
    }
}
