/**
 * Path: ./js/fatha/bastas/bastaSearchTab.js
 * ROLE: Minimal editor-only Basta for FileBrowser search.
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";

const SEARCH_TAB_HEIGHT = 20;
const SEARCH_TAB_WIDTH = 180;

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
            bastaBackgroundKey: params.backgroundThemeKey || "dialog",
            searchThemeKey: params.themeKey || "dialog, t_textSystem",
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
    return basta;
}
