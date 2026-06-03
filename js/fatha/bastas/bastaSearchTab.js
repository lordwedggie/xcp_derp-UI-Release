/**
 * Path: ./js/fatha/bastas/bastaSearchTab.js
 * ROLE: Minimal editor-only Basta for FileBrowser search.
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";

const SEARCH_TAB_HEIGHT = 20;
const SEARCH_TAB_WIDTH = 180;
const SEARCH_GLYPH = "⌕";
const SEARCH_THEME_KEY = "dialog, t_textSmall";
const SEARCH_GLYPH_MARGIN_PX = 4;
const SEARCH_TEXT_MARGIN_PX = 1;
const SEARCH_GLYPH_SCALE = 1.5;

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
    if (el._nodeRef?.requestDerpSync) el._nodeRef.requestDerpSync();
    el.focus();
}

export function getBastaSearchTabId(host, targetRegion = null) {
    return `basta_search_tab_${host?.id || "host"}_${targetRegion || "node"}`;
}

export function closeBastaSearchTab(host, targetRegion = null, reason = "implicit") {
    const basta = activeBastas.get(getBastaSearchTabId(host, targetRegion));
    if (!basta) return false;
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
            const { mW, mH, pW, pH, sW } = vars;
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
                        prefixGlyph: SEARCH_GLYPH,
                        prefixGlyphScale: SEARCH_GLYPH_SCALE,
                        prefixGlyphMargin: SEARCH_GLYPH_MARGIN_PX,
                        prefixGlyphSpacing: SEARCH_TEXT_MARGIN_PX + (Number(sW) || 0),
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
    requestAnimationFrame(() => focusSearchEditor(basta));
    return basta;
}
