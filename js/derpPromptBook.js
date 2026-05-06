/**
 * PROJECT: derpNodes | NODE: derpPromptBook
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "./fatha/fatha.js";
import {
    createDefaultDerpBook,
    bindPromptBookHooks,
    getPageLabel,
    handleBookChange,
    handlePageChange,
    handlePageAdd,
    handlePageRename,
    handleSaveBook,
    handleNewBook,
    handleRenameBook,
    handleCopyBook
} from "./controldeck/core/derpPromptBook_core.js";

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
        fatha(nodeType, nodeData, 300);

        if (typeof bindPromptBookHooks === "function") {
            bindPromptBookHooks(nodeType);
        }

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
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
            this.properties.footerHeight = oY + pH;

            const book = this.properties.derpBook || (typeof createDefaultDerpBook === "function" ? createDefaultDerpBook() : []);
            const currentIndex = this.properties.currentPageIndex || 0;
            const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(0, book.length - 1)));

            const structureHash = `${book.length}_${this.properties.bookName}_${this.properties.coverPage}_${this.properties.showTotalPage}_${this.properties.drawHeader}_${(this._availableBooks || []).length}_${window._xcpDerpSession}`;
            this._layoutMapHash = structureHash;

            const activePage = book[safeIndex] || { title: "Empty", content: "" };
            if (activePage.content) {
                activePage.content = activePage.content.replace(/\[\[IMG:(?:.*_IMG\/)([^\]]+)\]\]/g, "[[IMG:$1]]");
            }

            if (this._lastBookStructure === structureHash && this.layoutMap) {
                // RE-HYDRATE VISUALS: Update page selection and editor content in-place without rebuilding the map
                const pReg = this.layoutMap.pageRegion;
                if (pReg && pReg.dropdownPages) {
                    pReg.dropdownPages.value = getPageLabel(this, safeIndex, activePage.title);
                    pReg.dropdownPages.items = book.map((page, idx) => getPageLabel(this, idx, page.title));
                }

                const bReg = this.layoutMap.bookRegion;
                if (bReg && bReg.dropdownBooks) {
                    bReg.dropdownBooks.items = this._availableBooks || [];
                    bReg.dropdownBooks.value = this.properties.bookName || "Untitled Book";
                }

                const cReg = this.layoutMap.contentRegion;
                if (cReg && cReg.editorMain) {
                    const bName = this.properties.bookName || "Untitled Book";
                    // THE ASSET RESOLUTION FIX: Category must match the server-side registry (derpPromptBook)
                    cReg.editorMain.value = (activePage.content || "").replace(/\[\[IMG:(?!data:|http|\/|.*_IMG\/)([^\]]+)\]\]/g, (m, file) => {
                        return `[[IMG:/xcp/get_asset/derpPromptBook?name=${encodeURIComponent(file)}&bookName=${encodeURIComponent(bName)}]]`;
                    });
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
                            type: this.UI_TYPES.ICONBUTTON, icon: "add", themeKey: "button, t_textBig",
                            width: "match", height: "fill", padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleNewBook(this)
                        },
                        btnRenameBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textBig",
                            width: "match", height: "fill", padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleRenameBook(this)
                        },
                        btnCopyBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "copy", themeKey: "button, t_textBig",
                            width: "match", height: "fill", padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"],
                            onPress: () => handleCopyBook(this)
                        },
                        btnSaveBook: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "save", themeKey: "button, t_textBig",
                            width: "match", height: "fill", padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"],
                            labelAlign: ["center", "middle"],
                            onPress: () => handleSaveBook(this)
                        },
                        dropdownBooks: {
                            type: this.UI_TYPES.DROPDOWN_DERP, canvasShield: true, skipBackground: false, themeKey: "button, t_textBig",
                            indicator: "on",
                            items: this._availableBooks || [], value: this.properties.bookName || "Untitled Book",
                            minWidth: 200, width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            onChange: (val) => handleBookChange(this, val)
                        },
                    } : {})
                },
                pageRegion: {
                    anchor: { target: "bookRegion", axis: "y", },
                    dir: "row", width: "full", height: "auto", margin: [mW, 0], padding: [0, 0],
                    btnPageLeft: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "leftarrow", themeKey: "button, t_textBig",
                        width: "match", height: "fill", spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageChange(this, -1)
                    },
                    dropdownPages: {
                        type: this.UI_TYPES.DROPDOWN_DERP, canvasShield: true, multiline: false, themeKey: "dialog, t_textBig",
                        items: book.map((page, idx) => getPageLabel(this, idx, page.title)),
                        indicator: "on",
                        width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                        value: getPageLabel(this, safeIndex, activePage.title),
                        onChange: (val) => handlePageChange(this, val)
                    },
                    btnPageAdd: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "add", themeKey: "button, t_textBig",
                        width: "match", height: "fill", padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"],
                        onPress: () => handlePageAdd(this)
                    },
                    btnPageRename: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textBig",
                        width: "match", height: "fill", padding: [pW, pH], spacing: [sW, 0], objectAlign: ["left", "middle"],
                        labelAlign: ["center", "middle"],
                        onPress: () => handlePageRename(this)
                    },
                    btnPageRight: {
                        type: this.UI_TYPES.ICONBUTTON, icon: "rightarrow", themeKey: "button, t_textBig",
                        width: "match", height: "fill", padding: [pW, pH], objectAlign: ["left", "middle"],
                        onPress: () => handlePageChange(this, 1)
                    }
                },
                contentRegion: {
                    anchor: { target: "pageRegion", axis: "y", offset: oY},
                    dir: "col", width: "full", height: "fill",
                    minHeight: 100, // THE FIX: Prevents shrinking the editor into non-existence
                    margin: [mW, mH], padding: [0,0],
                    editorMain: {
                        type: this.UI_TYPES.EDITOR, multiline: true, noHover: true, canvasShield: true, switchOnEditing: true,
                        themeKey: "dialog, t_textNormal",
                        labelAlign: ["left", "top"], measureText: "MEASURE_RESERVE_FLOOR",
                        width: "full", height: "fill", padding: [pW, pH],
                        value: (activePage.content || "").replace(/\[\[IMG:(?!data:|http|\/|.*_IMG\/)([^\]]+)\]\]/g, (m, file) => {
                            const book = this.properties.bookName || "Untitled Book";
                            // THE ASSET RESOLUTION FIX: Sync category with server-side PROMPT_BOOK_DIR
                            return `[[IMG:/xcp/get_asset/derpPromptBook?name=${encodeURIComponent(file)}&bookName=${encodeURIComponent(book)}]]`;
                        }),
                        onInput: (val) => {
                            const pIndex = this.properties.currentPageIndex || 0;
                            if (book[pIndex]) {
                                const cleanVal = val.replace(/\[\[IMG:\/xcp\/get_asset\/derpPromptBook\?name=([^&\]]+)(?:&bookName=[^\]]*)?\]\]/g, (m, encFile) => {
                                    return `[[IMG:${decodeURIComponent(encFile)}]]`;
                                });
                                if (book[pIndex].content === cleanVal) return;
                                book[pIndex].content = cleanVal;
                                this.properties.prompt = cleanVal;
                                const w = this.widgets?.find(x => x.name === "prompt");
                                if (w) w.value = cleanVal;
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                            }
                        },
                    }
                }
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
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    dir: "col", width: "full", height: "auto", margin: [mW, mH], spacing: [0, sH],
                    lblSysMapTitle: {
                        type: this.UI_TYPES.TEXT_HTML, themeKey: "t_textSystem",
                        text: "Prompt Book Settings",
                        width: "auto", height: "auto", padding: [pW, pH],
                        objectAlign: ["left", "middle"]
                    },
                    togglesRow: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                        btnCover: {
                            type: this.UI_TYPES.BUTTON_HTML, text: "Cover Page", themeKey: "systemButton, t_textSystem",
                            state: this.properties.coverPage !== false,
                            width: "auto", height: "auto", padding: [pW, pH],
                            onPress: () => {
                                this.properties.coverPage = this.properties.coverPage === false;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpPromptBookSysMap();
                            }
                        },
                        btnTotal: {
                            type: this.UI_TYPES.BUTTON_HTML, text: "Show Total", themeKey: "systemButton, t_textSystem",
                            state: this.properties.showTotalPage !== false,
                            width: "auto", height: "auto", padding: [pW, pH],
                            onPress: () => {
                                this.properties.showTotalPage = this.properties.showTotalPage === false;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpPromptBookSysMap();
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

            // THE ANTI-PRUNING FIX: Forces the engine to run this node even with 0 outputs.
            this.properties.isWirelessTransmitter = true;

            // THE OUTPUT FIX: Explicitly remove Fatha's auto-injected virtual output
            // to prevent graph execution validators from crashing on hidden wires.
            this.outputs = [];

            this.titleLabel = "Derp Prompt Book";
            this.properties.titleLabel = "Derp Prompt Book"; // THE TITLE FIX

            Object.assign(this.properties, {
                nodeSize: [400, 400],
                derpBook: typeof createDefaultDerpBook === "function" ? createDefaultDerpBook() : [{title: "Cover", content: ""}],
                currentPageIndex: 0,
                bookName: "Untitled Book",
                autoWidth: false,
                autoHeight: false,
                coverPage: true,
                showTotalPage: true
            });
            this.size = [400, 400]; // THE FIX: Sync physical size with properties
            this._lastSavedBookName = "Untitled Book";

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
                // Looks for individual .json files in the derpPromptBook folder
                panel.showProfiles("derpPromptBook", "nodeSettings");
            }
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };
    }
});