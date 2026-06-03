/**
 * Path: ./js/fatha/bastas/bastaSearchTab.js
 * ROLE: Minimal editor-only Basta for FileBrowser search.
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { MASTER_Z } from "../core/masterZ.js";
import { measureTextWidth } from "../../herbina/utils/widgetsUtils.js";

const SEARCH_TAB_HEIGHT = 20;
const SEARCH_TAB_WIDTH = 180;
const SEARCH_GLYPH = "⌕";
const SEARCH_THEME_KEY = "dialog, t_textSmall";
const SEARCH_GLYPH_MARGIN_PX = 4;
const SEARCH_TEXT_MARGIN_PX = 1;
const SEARCH_GLYPH_SCALE = 1.5;

function removeSearchGlyphOverlay(basta) {
    const overlay = basta?._searchGlyphOverlay;
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
    if (basta) basta._searchGlyphOverlay = null;
}

function ensureSearchGlyphOverlay(basta, el) {
    if (!basta || !el) return null;
    if (basta._searchGlyphOverlay?.isConnected) return basta._searchGlyphOverlay;
    const overlay = document.createElement("div");
    overlay.textContent = SEARCH_GLYPH;
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.position = "fixed";
    overlay.style.pointerEvents = "none";
    overlay.style.userSelect = "none";
    overlay.style.zIndex = String(MASTER_Z.searchGlyphOverlay);
    overlay.style.opacity = "0.9";
    overlay.style.boxSizing = "border-box";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "flex-start";
    overlay.style.transformOrigin = "0 0";
    document.body.appendChild(overlay);
    basta._searchGlyphOverlay = overlay;
    return overlay;
}

function measureSearchGlyphWidth(el) {
    if (!el) return 0;
    const cs = window.getComputedStyle(el);
    const fontSize = Number.parseFloat(cs.fontSize || "12") || 12;
    return measureTextWidth(SEARCH_GLYPH, fontSize * SEARCH_GLYPH_SCALE, cs.fontFamily || "Arial", cs.fontWeight || "normal");
}

function updateSearchGlyphOverlayPosition(basta, el) {
    const overlay = ensureSearchGlyphOverlay(basta, el);
    if (!overlay || !el) return;
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const visualScale = Math.max(0.0001, rect.height / Math.max(1, el.offsetHeight || rect.height));
    const baseFontSize = Number.parseFloat(cs.fontSize || "12") || 12;
    overlay.style.fontFamily = cs.fontFamily;
    overlay.style.fontWeight = cs.fontWeight;
    overlay.style.fontStyle = cs.fontStyle;
    overlay.style.fontSize = `${baseFontSize * SEARCH_GLYPH_SCALE}px`;
    overlay.style.lineHeight = cs.lineHeight;
    overlay.style.color = cs.color;
    overlay.style.left = `${Math.round(rect.left)}px`;
    overlay.style.top = `${Math.round(rect.top)}px`;
    overlay.style.width = `${Math.max(1, el.offsetWidth || 0)}px`;
    overlay.style.height = `${Math.max(1, el.offsetHeight || 0)}px`;
    overlay.style.paddingLeft = `${SEARCH_GLYPH_MARGIN_PX}px`;
    overlay.style.transform = `scale(${visualScale})`;
}

function trackSearchGlyphOverlay(basta, retries = 600) {
    if (!basta || retries <= 0) {
        removeSearchGlyphOverlay(basta);
        return;
    }
    if (!activeBastas.has(basta.id)) {
        removeSearchGlyphOverlay(basta);
        return;
    }
    const el = basta._derpDomElements?.editorSearch;
    if (!el || el.style.display === "none") {
        requestAnimationFrame(() => trackSearchGlyphOverlay(basta, retries - 1));
        return;
    }
    applySearchEditorGlyphPadding(el);
    updateSearchGlyphOverlayPosition(basta, el);
    requestAnimationFrame(() => trackSearchGlyphOverlay(basta, retries - 1));
}

function applySearchEditorGlyphPadding(el) {
    if (!el) return;
    const leftPad =
        SEARCH_GLYPH_MARGIN_PX
        + Math.round(el._glyphMeasuredWidth || 10)
        + SEARCH_TEXT_MARGIN_PX;
    const px = `${Math.round(leftPad)}px`;
    if (el.style.paddingLeft !== px) {
        el.style.paddingLeft = px;
    }
}

function focusSearchEditor(basta, retries = 8) {
    if (!basta || retries <= 0) return;
    const el = basta._derpDomElements?.editorSearch;
    if (!el) {
        requestAnimationFrame(() => focusSearchEditor(basta, retries - 1));
        return;
    }
    el._isAwake = true;
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
    applySearchEditorGlyphPadding(el);
    el.focus();
}

export function getBastaSearchTabId(host, targetRegion = null) {
    return `basta_search_tab_${host?.id || "host"}_${targetRegion || "node"}`;
}

export function closeBastaSearchTab(host, targetRegion = null, reason = "implicit") {
    const basta = activeBastas.get(getBastaSearchTabId(host, targetRegion));
    if (!basta) return false;
    removeSearchGlyphOverlay(basta);
    return basta.close(reason);
}

export function showBastaSearchTab(host, targetRegion = null, params = {}) {
    if (!host) return null;

    const id = getBastaSearchTabId(host, targetRegion);
    const existing = activeBastas.get(id);
    if (existing?.hostNode?.properties) {
        existing.hostNode.properties[`bastaOffset_${id}`] = null;
    }

    const finalWidth = Math.max(80, Number(params.width) || SEARCH_TAB_WIDTH);
    const initialHeight = Math.max(12, Number(params.height) || SEARCH_TAB_HEIGHT);
    const useAnimations = window.DERP_GLOBAL_SETTINGS?.useAnimation !== false;

    const config = {
        host,
        targetRegion: null,
        warpOnOpen: false,
        initialSize: [finalWidth, initialHeight],
        properties: {
            drawHeader: false,
            clickToClose: false,
            bastaMovalbe: false,
            bastaSingleton: true,
            bastaSelectable: false,
            autoWidth: false,
            autoHeight: true,
            snapHeight: false,
            useAnimations,
            bastaBackgroundKey: "#picker",
            searchThemeKey: params.themeKey || SEARCH_THEME_KEY,
            searchValue: String(params.value || ""),
        },
        layoutMap: (basta, vars) => {
            const { mW, mH, pW, pH } = vars;
            return {
                contentRegion: {
                    anchor: null,
                    dir: "col",
                    width: "full",
                    height: "auto",
                    margin: [mW, mH, mW, mH],
                    editorSearch: {
                        type: UI_TYPES.EDITOR,
                        themeKey: basta.properties.searchThemeKey,
                        width: "full",
                        height: initialHeight,
                        padding: [pW, pH],
                        value: basta.properties.searchValue || "",
                        text: basta.properties.searchValue || "",
                        placeholder: params.placeholder || "Search...",
                        canvasShield: true,
                        switchOnEditing: true,
                        onKeyDown: (event, value) => {
                            if (event?.key !== "Enter") return;
                            event.preventDefault();
                            event.stopPropagation();
                            if (typeof params.onEnter === "function") {
                                params.onEnter(value, basta, event);
                            }
                        },
                        onInput: (value) => {
                            basta.properties.searchValue = value;
                            if (typeof params.onInput === "function") params.onInput(value, basta);
                        },
                    },
                },
                footerRegion: {
                    hidden: true,
                },
            };
        },
    };

    const basta = spawnBasta(id, config);
    if (!basta) return null;

    const target = host.layout?.regions?.[targetRegion] || null;
    const finalOffsetX = target
        ? Math.round(target.x)
        : Math.round(((host.size?.[0] || finalWidth) - finalWidth) / 2);
    const finalOffsetY = target
        ? Math.round(target.y - basta.targetSize[1])
        : Math.round(-basta.targetSize[1]);

    basta._searchTabAnchorRegion = targetRegion || null;

    if (useAnimations && target) {
        basta.offset = [Math.round(target.x), Math.round(target.y)];
        basta.targetSize = [finalWidth, basta.targetSize[1]];
        basta.properties.nodeSize = [finalWidth, basta.targetSize[1]];
        basta._searchTabFinalOffset = [finalOffsetX, finalOffsetY];
        basta._derpAwakeFrames = Math.max(basta._derpAwakeFrames || 0, 12);
        basta._forceSync = true;
    } else {
        basta.offset = [finalOffsetX, finalOffsetY];
        basta._searchTabFinalOffset = null;
    }

    basta.requestDerpSync?.();
    requestAnimationFrame(() => {
        const el = basta._derpDomElements?.editorSearch;
        if (el) {
            basta._glyphMeasuredWidth = Math.ceil(measureSearchGlyphWidth(el));
        }
        trackSearchGlyphOverlay(basta);
    });
    requestAnimationFrame(() => focusSearchEditor(basta));
    return basta;
}
