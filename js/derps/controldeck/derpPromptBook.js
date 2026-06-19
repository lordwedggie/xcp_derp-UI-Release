/**
 * PROJECT: derpNodes | NODE: derpPromptBook
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import {
    createDefaultDerpBook,
    bindPromptBookHooks,
    getPageLabel,
    syncDerpPromptBookLocaleLabels,
    normalizePromptBookEditorStoredValue,
    syncDerpPromptBookEditorDisplay,
    handleBookChange,
    handlePageChange,
    handlePageAdd,
    handlePageDelete,
    handlePageClean,
    handlePageRename,
    handleSaveBook,
    handleNewBook,
    handleRenameBook,
    handleCopyBook,
    handleDeleteBook
} from "./core/derpPromptBook_core.js";

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

function parseEditorPaddingValue(value, fallback) {
    const parts = String(value ?? "")
        .split(/[,\s]+/)
        .map(part => parseFloat(part.trim()))
        .filter(num => !Number.isNaN(num));
    if (parts.length <= 0) return fallback;
    const clamp = (num) => Math.max(0, Math.min(9, num));
    const x = clamp(parts[0]);
    const y = clamp(parts.length > 1 ? parts[1] : parts[0]);
    return [x, y];
}

function resolveEditorPaddingValue(value, themePadding) {
    const parsed = parseEditorPaddingValue(value, [0, 0]);
    return [
        parsed[0] === 0 ? themePadding[0] : parsed[0],
        parsed[1] === 0 ? themePadding[1] : parsed[1]
    ];
}

function formatEditorPaddingValue(value, fallback) {
    const [x, y] = parseEditorPaddingValue(value, fallback);
    return `${x}, ${y}`;
}

app.registerExtension({
    name: "xcp.derpPromptBook_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        // FLEXIBLE TARGETING: Match Python class name
        if (!nodeData.name.toLowerCase().includes("promptbook")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        // Initialize Virtual Fatha framework hijacking
        fatha(nodeType, nodeData, 200);

        if (typeof bindPromptBookHooks === "function") {
            bindPromptBookHooks(nodeType);
        }

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            if (typeof syncDerpPromptBookLocaleLabels === "function") syncDerpPromptBookLocaleLabels(this);
            this._lastBookStructure = null; // THE STRUCTURAL RESET: Force full map rebuild on theme change
            this.refreshNodeLayoutMap();
            this.refreshDerpPromptBookSysMap();
            this.requestDerpSync();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));
            const editorPadding = resolveEditorPaddingValue(this.properties.editorPadding, [pW, pH]);
            const editorPaddingHash = editorPadding.join(",");
            this.properties.footerHeight = 6 + mH;

            const book = this.properties.derpBook || (typeof createDefaultDerpBook === "function" ? createDefaultDerpBook() : []);
            const currentIndex = this.properties.currentPageIndex || 0;
            const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(0, book.length - 1)));

            const structureHash = `${book.length}_${safeIndex}_${this.properties.bookName}_${this.properties.coverPage}_${this.properties.showTotalPage}_${this.properties.drawHeader}_${(this._availableBooks || []).length}_${editorPaddingHash}_${window._xcpDerpSession}`;
            this._layoutMapHash = structureHash;

            const activePage = book[safeIndex] || { title: tLocale("$derp_prompt_book.page.empty", "Empty"), content: "" };
            if (activePage.content) {
                activePage.content = activePage.content.replace(/\[\[IMG:(?:.*_IMG\/)([^\]]+)\]\]/g, "[[IMG:$1]]");
            }

            if (this._lastBookStructure === structureHash && this.layoutMap) {
                // RE-HYDRATE VISUALS: Update page selection and editor content in-place without rebuilding the map
                const pReg = this.layoutMap.pageRegion;
                if (pReg && pReg.dropdownPages) {
                    pReg.dropdownPages.value = String(safeIndex);
                }

                const bReg = this.layoutMap.bookRegion;
                if (bReg && bReg.dropdownBooks) {
                    bReg.dropdownBooks.value = this.properties.bookName || tLocale("$derp_prompt_book.book.untitled_name", "Untitled Book");
                }

                const cReg = this.layoutMap.contentRegion;
                if (cReg && cReg.editorMain) {
                    cReg.editorMain.padding = editorPadding;
                    const bName = this.properties.bookName || tLocale("$derp_prompt_book.book.untitled_name", "Untitled Book");
                    const editorValue = (activePage.content || "").replace(/\[\[IMG:(?!data:|http|\/|.*_IMG\/)([^\]]+)\]\]/g, (m, file) => {
                        return `[[IMG:/xcp/get_asset/derpPromptBook?name=${encodeURIComponent(file)}&bookName=${encodeURIComponent(bName)}]]`;
                    });
                    // THE ASSET RESOLUTION FIX: Category must match the server-side registry (derpPromptBook)
                    syncDerpPromptBookEditorDisplay(this, activePage.content || "", { displayValue: editorValue, padding: editorPadding });
                }
                this.requestDerpSync();
                return;
            }
            this._lastBookStructure = structureHash;

            this.layoutMap = {
                bookRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    dir: "row", width: "full", height: "auto",
                    margin: [mW, mH], padding: [0, 0],
                    ...(this.properties.drawHeader !== false ? {
                        btnNewBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "add", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleNewBook(this)
                        },
                        btnRenameBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleRenameBook(this)
                        },
                        btnCopyBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "copy", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleCopyBook(this)
                        },
                        btnCleanBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "clean", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handlePageClean(this)
                        },
                        btnSaveBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "save", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleSaveBook(this)
                        },
                        dropdownBooks: {
                            type: this.UI_TYPES.FILEBROWSER, canvasShield: true, skipBackground: true, themeKey: "panel, t_textNormal",
                            indicator: "on", mouseOver: false, searchTab: true,
                            items: (this._availableBooks || []).map(name => ({ value: name, _triggerDisplay: `{{t_text_accent::${name}}}` })),
                            triggerIconColorKey: "t_text_warning",
                            value: this.properties.bookName || tLocale("$derp_prompt_book.book.untitled_name", "Untitled Book"),
                            mode: "file", fileType: "promptBook", displayText: tLocale("$derp_prompt_book.browser.select", "Select Book..."),
                            width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0], displayMode: "ellipsis",
                            onChange: (val) => handleBookChange(this, val)
                        },
                        btnOpenBookFolder: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "folder", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: async () => {
                                try {
                                    await fetch("/xcp/open_prompt_book_folder");
                                } catch (e) {
                                    console.error("Prompt Book folder open failed:", e);
                                }
                            }
                        },
                        btnDeleteBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "trash", themeKey: "button, t_textNormal",
                            width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleDeleteBook(this)
                        },
                    } : {})
                },
                contentRegion: {
                    anchor: { target: "bookRegion", axis: "y", },
                    dir: "col", width: "full", height: "fill", margin: [mW, sH, mW, sH], padding: [0,0],
                    minHeight: 100,
                    editorMain: {
                        type: this.UI_TYPES.EDITOR, multiline: true, noHover: true, canvasShield: true, switchOnEditing: true,
                        richImageContent: true,
                        themeKey: "dialog, t_textNormal", mouseOver: false, 
                        labelAlign: ["left", "top"], measureText: "MEASURE_RESERVE_FLOOR",
                        width: "full", height: "fill", padding: editorPadding,
                        onBlur: () => {
                            const pIndex = this.properties.currentPageIndex || 0;
                            if (book[pIndex]) {
                                const content = normalizePromptBookEditorStoredValue(this._derpDomElements?.editorMain?.innerText ?? book[pIndex].content);
                                book[pIndex].content = content;
                                this.properties.prompt = content;
                                this._lastSyncedContent = null;
                                syncDerpPromptBookEditorDisplay(this, content);
                                this.refreshNodeLayoutMap();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                            }
                        },
                        value: (activePage.content || "").replace(/\[\[IMG:(?!data:|http|\/|.*_IMG\/)([^\]]+)\]\]/g, (m, file) => {
                            const bookName = this.properties.bookName || tLocale("$derp_prompt_book.book.untitled_name", "Untitled Book");
                            return `[[IMG:/xcp/get_asset/derpPromptBook?name=${encodeURIComponent(file)}&bookName=${encodeURIComponent(bookName)}]]`;
                        }),
                        onInput: (val) => {
                            const pIndex = this.properties.currentPageIndex || 0;
                            if (book[pIndex]) {
                                const cleanVal = normalizePromptBookEditorStoredValue(val);
                                if (book[pIndex].content === cleanVal) return;
                                book[pIndex].content = cleanVal;
                                this.properties.prompt = cleanVal;
                                this._lastSyncedContent = null;
                                syncDerpPromptBookEditorDisplay(this, cleanVal);
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                            }
                        },
                    }
                },
                pageRegion: {
                    anchor: { target: "contentRegion", axis: "y", },
                    dir: "row", width: "full", height: "auto", margin: [mW, mH, mW, mH], padding: [0, 0],
                    btnPageLeft: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "leftarrow", themeKey: "button, t_textNormal",
                        width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageChange(this, -1)
                    },
                    btnPageAdd: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "add", themeKey: "button, t_textNormal",
                        width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageAdd(this)
                    },
                    btnPageRename: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textNormal",
                        width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageRename(this)
                    },
                    dropdownPages: {
                        type: this.UI_TYPES.FILEBROWSER, searchTab: true,
                        icon: "dropdown", skipBackground: true,
                        canvasShield: true, themeKey: "panel, t_textNormal",
                        items: book.map((page, idx) => ({
                            value: String(idx),
                            display: getPageLabel(this, idx, page.title),
                            _triggerDisplay: `{{t_text_highlight::${getPageLabel(this, idx, page.title)}}}`
                        })),
                        triggerIconColorKey: "t_text_warning",
                        mouseOver: false,
                        width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0], displayMode: "ellipsis",
                        mode: "file",
                        rootName: "pages",
                        value: String(safeIndex),
                        onChange: (val) => handlePageChange(this, val)
                    },
                    btnPageDelete: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "trash", themeKey: "button, t_textNormal",
                        width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageDelete(this)
                    },
                    btnPageRight: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "rightarrow", themeKey: "button, t_textNormal",
                        width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageChange(this, 1)
                    }
                },
            };

            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpPromptBookSysMap = function() {
            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            this.sysLayoutMap = {
                sysCustomRegion: {
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" },
                    dir: "col", width: "full", height: "auto", margin: [mW, sH], spacing: [0, sH],
                    lblSysMapTitle: {
                        type: this.UI_TYPES.TEXT, themeKey: "t_textSystem", mouseOver: false,
                        text: tLocale("$derp_prompt_book.system.properties", "Prompt Book Settings"),
                        width: "auto", height: "auto", padding: [pW, pH],
                        objectAlign: ["left", "middle"]
                    },
                    togglesRow: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        btnCover: {
                            type: this.UI_TYPES.BUTTON, text: tLocale("$derp_prompt_book.system.cover_page", "Cover Page"), themeKey: "systemButton, t_textSystem",
                            state: this.properties.coverPage !== false,
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            onPress: () => {
                                this.properties.coverPage = this.properties.coverPage === false;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpPromptBookSysMap();
                            }
                        },
                        btnTotal: {
                            type: this.UI_TYPES.BUTTON, text: tLocale("$derp_prompt_book.system.show_total", "Show Total"), themeKey: "systemButton, t_textSystem",
                            state: this.properties.showTotalPage !== false,
                            width: "auto", height: "auto", padding: [pW, pH],
                            onPress: () => {
                                this.properties.showTotalPage = this.properties.showTotalPage === false;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpPromptBookSysMap();
                            }
                        },
                        lblEditorPadding: {
                            type: this.UI_TYPES.TEXT, themeKey: "t_textSystem", mouseOver: false,
                            text: "Editor padding:", width: "auto", height: "auto",
                            padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"]
                        },
                        editorPadding: {
                            type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textSystem",
                            value: formatEditorPaddingValue(this.properties.editorPadding, [0, 0]),
                            measureText: " 9, 9 ", labelAlign: ["center", "middle"],
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            onInput: (val) => {
                                this.properties.editorPadding = val;
                                this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            },
                            onBlur: (val) => {
                                this.properties.editorPadding = formatEditorPaddingValue(val, [0, 0]);
                                this.refreshNodeLayoutMap();
                                this.refreshDerpPromptBookSysMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        }
                    }
                }
            };

            if (this._derpPanel && typeof this._derpPanel.setLayoutMap === "function") {
                this._derpPanel.setLayoutMap(this.sysLayoutMap);
            }
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.outputs = [];

            this.titleLabel = tLocale("$derp_prompt_book.title", "Derp Prompt Book");
            this.properties.titleLabel = tLocale("$derp_prompt_book.title", "Derp Prompt Book");

            Object.assign(this.properties, {
                minWidth: 200,
                nodeSize: [400, 400],
                derpBook: typeof createDefaultDerpBook === "function" ? createDefaultDerpBook() : [{title: tLocale("$derp_prompt_book.page.cover", "Cover"), content: ""}],
                currentPageIndex: 0,
                bookName: tLocale("$derp_prompt_book.book.untitled_name", "Untitled Book"),
                autoWidth: false,
                autoHeight: false,
                coverPage: true,
                showTotalPage: true,
                editorPadding: formatEditorPaddingValue(this.properties.editorPadding, [0, 0])
            });
            this.size = [400, 400];
            this._lastSavedBookName = tLocale("$derp_prompt_book.book.untitled_name", "Untitled Book");

            if (typeof syncDerpPromptBookLocaleLabels === "function") syncDerpPromptBookLocaleLabels(this);

            if (typeof this.fetchRemoteBooks === "function") this.fetchRemoteBooks();
            this.refreshNodeLayoutMap();
            if (typeof this.updateDerpPromptBookUI === "function") this.updateDerpPromptBookUI();
            this.refreshDerpPromptBookSysMap();

            setTimeout(() => {
                if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                    this.syncDerpOutputs();
                }
            }, 1);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (panel.showProfiles) {
                panel.showProfiles("derpPromptBook", "nodeSettings");
            }
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };
    }
});
