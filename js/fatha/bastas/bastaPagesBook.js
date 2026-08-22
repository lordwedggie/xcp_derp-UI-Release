/**
 * Path: ./js/fatha/bastas/bastaPagesBook.js
 * ROLE: Pages manager overlay for derpPromptBook — lists every page in the book
 * (derpModelLoader deck style), hold-drag to reorder, double-click the title
 * EDITOR to rename. Commits straight into the host node's derpBook array.
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { startStackDrag, updateStackDrag, endStackDrag, clearStackDragState } from "../helpers/fathaDragDrop.js";

const BASTA_ID = "basta_pages_book_global_singleton";

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

const beginPageDrag = (basta, host, data, idx, rowKey) => {
    // Remember which page object is open so currentPageIndex can follow it after the reorder.
    basta._dragOpenPage = (host?.properties?.derpBook || [])[host?.properties?.currentPageIndex ?? 0] || null;
    startStackDrag(basta, data, idx, rowKey);
};

const commitPageDrag = (basta, host) => {
    // endStackDrag splices basta.properties.pages, which aliases the host's live
    // derpBook array (re-asserted on every map build) — the drop IS the commit.
    endStackDrag(basta, "pages");

    const book = host?.properties?.derpBook || [];
    const openPage = basta._dragOpenPage;
    basta._dragOpenPage = null;
    if (openPage && book.includes(openPage)) {
        host.properties.currentPageIndex = book.indexOf(openPage);
    } else {
        host.properties.currentPageIndex = Math.min(host.properties.currentPageIndex || 0, Math.max(book.length - 1, 0));
    }

    if (host.syncDerpOutputs) host.syncDerpOutputs();
    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
    if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
};

const onPageTitleInput = (basta, host, idx, v) => {
    const page = (host?.properties?.derpBook || [])[idx];
    if (!page) return;
    page.title = String(v ?? "");

    const regKey = `editorPageTitle_${idx}`;
    const reg = basta.layout?.regions?.[regKey];
    if (reg) { reg.text = page.title; reg.value = page.title; }
    if (basta._compDataCache) delete basta._compDataCache[regKey];
    basta._forceSync = true;
    if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
    else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);
};

const onPageTitleBlur = (basta, host, idx, v) => {
    const page = (host?.properties?.derpBook || [])[idx];
    if (!page) return;
    const trimmed = String(v ?? "").trim();
    page.title = trimmed || tLocale("$derp_prompt_book.page.untitled_title", "untitled");

    const regKey = `editorPageTitle_${idx}`;
    const reg = basta.layout?.regions?.[regKey];
    if (reg) { reg.text = page.title; reg.value = page.title; }
    if (basta._compDataCache) delete basta._compDataCache[regKey];
    basta._forceSync = true;
    basta._layoutDirty = true;
    if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
    else if (typeof basta.setDirtyCanvas === "function") basta.setDirtyCanvas(true, true);

    // Host dropdown labels hash page titles — rebuild so the page picker reflects the rename.
    if (host.refreshNodeLayoutMap) host.refreshNodeLayoutMap();
    if (host.setDirtyCanvas) host.setDirtyCanvas(true, true);
};

const buildPagesBookMap = (basta, vars) => {
    const host = basta._pagesHost;
    const { mW, mH, pW, pH, sW, sH } = vars;
    const book = host?.properties?.derpBook || [];
    // THE ORDER ALIAS: endStackDrag splices node.properties[arrayKey] in place —
    // alias the host's live array so drops mutate the real book directly.
    basta.properties.pages = book;

    const pageItems = book.map((page, idx) => ({ page, idx }));
    let floatingItem = null;

    if (basta._dragTrig && basta._dragThresholdMet && basta._dragTrig.index !== undefined) {
        const d = basta._dragTrig;
        const pIdx = (basta._dropPreviewIdx !== undefined) ? basta._dropPreviewIdx : d.index;
        [floatingItem] = pageItems.splice(d.index, 1);
        pageItems.splice(pIdx, 0, { ...floatingItem, isPreviewGhost: true });
    }

    const rows = {};
    pageItems.forEach((item, displayIdx) => {
        const { page, idx } = item;
        const rowKey = `pageRow_${idx}`;
        const rowMarginBottom = displayIdx < (pageItems.length - 1) ? sH : 0;
        const isGhost = !!item.isPreviewGhost;
        const isCurrent = idx === (host?.properties?.currentPageIndex ?? 0);
        const isPickedUp = !!(basta._dragTrig && basta._dragThresholdMet && basta._dragTrig.index === idx && !isGhost);

        rows[rowKey] = {
            type: UI_TYPES.REGION,
            dir: "row", width: "full", height: "auto",
            spacing: [0, sH],
            margin: [0, 0, 0, rowMarginBottom],
            regionOffset: [0, 0],
            // THE GHOST GAP: placeholder keeps its measured height but renders invisible.
            state: isGhost ? "DIS" : ((isPickedUp || isCurrent) ? "ON" : "OFF"),
            alpha: isGhost ? 0 : 1,
            onDragStart: (e, data) => beginPageDrag(basta, host, data, idx, rowKey),
            onDrag: (e, data) => {
                updateStackDrag(basta, data, "pageRow_", book.length);
                basta.refreshNodeLayoutMap(); // floater follows the pointer through map rebuilds
            },
            onDragEnd: () => commitPageDrag(basta, host),
            // CLEANUP FIX (loader pattern): purge live drag state if the pointer is
            // released somewhere the dragEnd dispatch cannot resolve.
            onPress: () => { if (basta._dragTrig) commitPageDrag(basta, host); },
            [`editorPageTitle_${idx}`]: {
                // THE DROP FIX (loader pattern): NEVER hide the pressed region in ghost rows.
                // Hidden regions are culled from layout.regions entirely, which orphans
                // _dragEndRegionKey — the drop never fires and the item stays "picked up".
                // derpModelLoader keeps its row widget alive with alpha: 0; the invisible
                // editor also reserves the ghost row's height, forming the drop gap.
                alpha: isGhost ? 0 : 1,
                type: UI_TYPES.EDITOR,
                canvasShield: true,
                activateOnDblClick: true,
                themeKey: "dialog, t_textSmall",
                mouseOver: false,
                width: "full", height: "auto", padding: [pW, pH],
                text: page.title || "",
                value: page.title || "",
                onInput: (v) => onPageTitleInput(basta, host, idx, v),
                onBlur: (v) => onPageTitleBlur(basta, host, idx, v),
                onDragStart: (e, data) => beginPageDrag(basta, host, data, idx, rowKey),
                onDrag: (e, data) => {
                    updateStackDrag(basta, data, "pageRow_", book.length);
                    basta.refreshNodeLayoutMap();
                },
                onDragEnd: () => commitPageDrag(basta, host)
            }
        };
    });

    // THE FLOATER: pointer-anchored preview of the picked-up page (modelLoader pattern).
    if (floatingItem && basta._dragThresholdMet && basta._dragMouse && basta._dragOffset) {
        const { page, idx } = floatingItem;
        const dragX = basta._dragMouse[0] - basta._dragOffset[0];
        const dragY = basta._dragMouse[1] - basta._dragOffset[1];
        const sourceRow = basta.layout?.regions?.[`pageRow_${idx}`];

        rows.floatingPageRow = {
            type: UI_TYPES.REGION,
            themeKey: "region",
            dir: "row",
            width: sourceRow?.w || 240,
            height: sourceRow?.h || "auto",
            ignoreLayout: true,
            x: dragX,
            y: dragY,
            zIndex: 100,
            state: "ON",
            pulseStates: true,
            pulseFromState: "_ON",
            pulseToState: "_DIS",
            spacing: [0, sH],
            ignoreNodeBoundsClamp: true,
            corners: sourceRow?.corners,
            regionOffset: [0, 0],
            floatingTitle: {
                type: UI_TYPES.TEXT, themeKey: "t_textSmall",
                text: page.title || "",
                width: "full", height: "auto", padding: [pW, pH],
                labelAlign: ["left", "middle"], displayMode: "cutoff"
            }
        };
    }

    return {
        contentRegion: {
            pagesRegion: {
                dir: "col", width: "full", height: "auto",
                spacing: [0, sH],
                margin: [mW, mH],
                ...rows,
                lblHint: {
                    type: UI_TYPES.TEXT, themeKey: "t_textSmall",
                    text: tLocale("$derp_prompt_book.dialogs.manage_pages.hint", "Drag to reorder - Double-click to rename"),
                    width: "full", height: "auto",
                    margin: [0, sH, 0, 0],
                    labelAlign: ["left", "top"], displayMode: "cutoff"
                }
            }
        }
    };
};

export function showBastaPagesBook(host, targetRegion = "btnPageRename") {
    if (!host) return null;

    // THE DESTROY-ON-REOPEN (bastaLoraDetail pattern): the singleton resurrection path
    // NEVER re-resolves the theme — it merges config.properties but never re-reads
    // properties.selectedTheme or re-runs handleThemeUpdate, so a panel that was first
    // spawned under a different theme keeps rendering it forever. The constructor is the
    // ONLY place the theme resolves (this.themeName = config.themeName ||
    // host.properties.selectedTheme), so the fix is to destroy the stale instance and let
    // a fresh one hydrate the host's CURRENT theme. The toggle-off still closes via
    // destroy; the saved bastaOffset_/bastaSize_ (persisted on host properties) are
    // restored by the fresh constructor.
    const existing = activeBastas.get(BASTA_ID);
    if (existing) {
        const sameHost = existing.hostNode === host;
        existing.destroy();
        if (sameHost) return existing; // toggle off
    }

    const basta = spawnBasta(BASTA_ID, {
        host,
        targetRegion,
        titleLabel: tLocale("$derp_prompt_book.dialogs.manage_pages.title", "Manage Pages"),
        initialSize: [300, 340],
        properties: {
            clickToClose: false,
            bastaMovalbe: true,
            bastaSingleton: true,
            autoWidth: false,
            autoHeight: true,
            snapHeight: false
        },
        layoutMap: (basta, vars) => buildPagesBookMap(basta, vars)
    });

    // THE DRAG-HOST SHIM: fathaDragDrop helpers call node.refreshNodeLayoutMap()
    // unguarded (updateStackDrag/endStackDrag); bastas rebuild via _layoutDirty.
    basta.refreshNodeLayoutMap = function() {
        this._layoutDirty = true;
        this._forceSync = true;
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
        else if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
    };

    clearStackDragState(basta);
    basta._dragOpenPage = null;
    basta._pagesHost = host;
    basta._layoutDirty = true;
    basta._forceSync = true;
    if (typeof basta.requestDerpSync === "function") basta.requestDerpSync();
    return basta;
}
