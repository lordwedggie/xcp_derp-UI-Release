/**
 * PROJECT: derpNodes | CORE: derpPromptBook_core
 * STATUS: FATHA VIRTUAL COMPLIANT
 */
import { setupPromptBookImageSupport, stripImageBase64FromContent } from "./derpPromptBook_imageHandler.js";
import { showBastaFileHandler } from "./fatha/bastas/bastaFileHandler.js";
import { showBastaMessage } from "./fatha/bastas/bastaMessage.js";
import { playKaChing, playKaboom } from "./herbina/masterSoundEffects.js";

const defaultDerpBookPages = 3;

export const createDefaultDerpBook = () => {
    return Array.from({ length: defaultDerpBookPages }, (_, i) => ({
        title: "untitled",
        content: "",
        images: []
    }));
};

// --- CORE PROTOCOL HOOKS BINDER ---
export function bindPromptBookHooks(nodeType) {
    nodeType.prototype.syncDerpOutputs = function() {
        if (this._signalSyncDebouncer) clearTimeout(this._signalSyncDebouncer);

        if (this.id !== -1) {
            this.properties.isWirelessTransmitter = true;

            const baseId = String(this.id);
            const nodeName = this.titleLabel || this.title || "Derp Prompt Book";
            const activePage = this.properties.derpBook?.[this.properties.currentPageIndex || 0];

            // THE PURE CONTENT EXTRACTION: Remove images AND strip linebreaks (no spacers) for the actual output
            const rawContent = (activePage?.content || "").replace(/\[\[IMG:[\s\S]*?\]\]/g, "");
            const outContent = rawContent.replace(/\r?\n|\r/g, "").trim();

            if (this._lastSyncedContent === outContent) return;
            this._lastSyncedContent = outContent;

            // Keep PromptBook wireless-only: Python node has zero RETURN_TYPES,
            // so creating a physical JS output can break SignalOut validation.
            if (Array.isArray(this.outputs) && this.outputs.length > 0) {
                this.outputs = [];
            }
            const signalId = `${baseId}:0`;

            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
                nodeName: `${nodeName} [BookContent]`,
                nodeType: this.type || "Node",
                type: "STRING",
                value: outContent,
                upstreamIds: [], // THE REGISTRY FIX: Required for receiver filtering logic
                timestamp: Date.now()
            };

            this._signalSyncDebouncer = setTimeout(() => {
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: signalId, value: outContent })
                });
            }, 150);

            if (window.app?.graph?._nodes) {
                window.app.graph._nodes.forEach(n => {
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
                });
                app.canvas.setDirty(true, true);
            }
        }
    };
    nodeType.prototype.applyDerpProfile = function(profileName) {
        if (profileName === "(No Profiles Found)") return;

        fetch(`/xcp/load/derpPromptBook?name=${profileName}`)
            .then(res => res.json())
            .then(res => {
                const p = res.data || {};
                if (p.derpBook) this.properties.derpBook = JSON.parse(JSON.stringify(p.derpBook));
                if (p.bookName) this.properties.bookName = p.bookName;

                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                if (this.updateDerpPromptBookUI) this.updateDerpPromptBookUI();
                this.setDirtyCanvas(true, true);
            });
    };

    nodeType.prototype.onDerpSavePress = function() {
        const currentName = this.properties.bookName || "Untitled Book";
        showBastaFileHandler(this, "derpPromptBook", "btnSave", {
            title: "Save Book As",
            message: "Enter filename for prompt book:",
            confirm: "Save",
            mode: "save",
            originalName: currentName,
            initialSize: [250, 130],
            onConfirm: async (filename) => {
                // THE DATA FIX: Prompt books should save the book array as the primary data
                try {
                    const res = await fetch("/xcp/save/derpPromptBook", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: filename, data: this.properties.derpBook })
                    });

                    if (res.ok) {
                        playKaChing();
                        this.properties.bookName = filename;
                        this._lastSavedBookName = filename;
                        showBastaMessage(this, "Book Saved!");
                        this._sysProfileCache = null;
                        if (this._derpPanel?.showProfiles) this._derpPanel.showProfiles("derpPromptBook", "nodeSettings");
                        if (this.fetchRemoteBooks) await this.fetchRemoteBooks();
                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    }
                } catch (e) { console.error("[Save Error]:", e); }
            }
        });
    };

    nodeType.prototype.onDerpDeletePress = function() {
        const profileName = this._currentProfileName;
        if (!profileName || profileName === "(No Profiles Found)") return;

        if (confirm(`Delete book file "${profileName}.json"?`)) {
            fetch(`/xcp/delete/derpPromptBook`, {
                method: "POST",
                body: JSON.stringify({ name: profileName })
            })
                .then(res => {
                    if (res.ok) {
                        playKaboom();
                        showBastaMessage(this, "Book Deleted!");
                        this._sysProfileCache = null;
                        if (this._derpPanel?.showProfiles) this._derpPanel.showProfiles("derpPromptBook", "nodeSettings");
                    }
                });
        }
    };

    nodeType.prototype.updateDerpPromptBookUI = function() {
        if (this.widgets) {
            this.widgets.forEach(w => {
                if (w.element) {
                    w.element.style.display = "none";
                    w.element.style.pointerEvents = "none";
                }
                w.hidden = true;
                w.computeSize = () => [0, -4]; // Shrink the ghost footprint

                // Explicitly ensure values are synced to properties
                if (w.name === "prompt" && this.properties.prompt) {
                    w.value = this.properties.prompt;
                }
            });
        }

        if (this.layout) this.layout._lastCacheKey = "";
        this.requestDerpSync();
        this.setDirtyCanvas(true, true);
    };

    nodeType.prototype.onConnectionsChange = function() {
        this._derpAwakeFrames = 10;
        this.updateDerpPromptBookUI();
    };

    nodeType.prototype.onSerialize = function(info) {
        const cleanBook = (this.properties.derpBook || []).map(page => {
            return {
                title: page.title,
                content: stripImageBase64FromContent(page.content)
            };
        });
        info.properties.derpBook = cleanBook;
        info.properties.currentPageIndex = this.properties.currentPageIndex;
        info.properties.bookName = this.properties.bookName;
    };

    const onConf = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
        if (onConf) onConf.apply(this, arguments);

        this.properties.isWirelessTransmitter = true;
        this.isPureVirtual = true;
        this.properties.isPureVirtual = true;
        if (!this.outputs) this.outputs = [];

        this.updateDerpPromptBookUI();

        if (info.properties) {
            if (info.properties.derpBook) this.properties.derpBook = info.properties.derpBook;
            if (info.properties.currentPageIndex !== undefined) this.properties.currentPageIndex = info.properties.currentPageIndex;

            if (info.properties.bookName !== undefined) {
                this.properties.bookName = info.properties.bookName;
                this._lastSavedBookName = info.properties.bookName;
            }

            if (info.properties.prompt !== undefined && !info.properties.derpBook) {
                this.properties.derpBook = createDefaultDerpBook();
                this.properties.derpBook[0].content = info.properties.prompt;
                this.properties.currentPageIndex = 0;
            }

            if (this.properties.derpBook) {
                this.properties.derpBook.forEach((p) => {
                    if (/^Page \d+$/.test(p.title)) p.title = "untitled";
                });
            }

            if (info.properties.nodeSize) {
                this.properties.nodeSize = info.properties.nodeSize;
                this.size = [...this.properties.nodeSize];
            }

            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.updateDerpPromptBookUI();
            if (this.refreshDerpPromptBookSysMap) this.refreshDerpPromptBookSysMap();
            if (this.fetchRemoteBooks) this.fetchRemoteBooks();
            if (this.syncDerpOutputs) this.syncDerpOutputs();

            this._derpAwakeFrames = 10;
            this.requestDerpSync();
        }
    };

    nodeType.prototype.fetchRemoteBooks = async function() {
        try {
            const session = window._xcpDerpSession || Date.now();
            const response = await fetch(`/xcp/list/derpPromptBook?v=${session}`);
            if (response.ok) {
                const result = await response.json();
                // THE DATA FIX: Unwrap the 'items' array from the generalized response
                this._availableBooks = result.items || [];
                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                this.updateDerpPromptBookUI();
            }
        } catch (e) { console.error("Prompt Book List Error:", e); }
    };

    // THE FIX: Inject Image Handler initialization safely into Fatha's continuous draw loop
    const onDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function(ctx) {
        if (onDrawForeground) onDrawForeground.apply(this, arguments);
        const el = this._derpDomElements?.editorMain;
        if (el) {
            setupPromptBookImageSupport(el, this);

            // THE LIVE SYNC FIX: Ensure the canvas rendering matches the HTML editor in real-time
            if (!el._derpSyncActive) {
                el._derpSyncActive = true;
                el.addEventListener("input", () => {
                    const book = this.properties.derpBook || [];
                    const idx = this.properties.currentPageIndex || 0;
                    if (book[idx]) {
                        const content = el.innerText;
                        if (book[idx].content === content) return;
                        book[idx].content = content;
                        this.properties.prompt = content;
                        this._derpAwakeFrames = 5;

                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                        this.setDirtyCanvas(true, true);
                    }
                });
            }
        }
    };
}

// --- UI EVENT HANDLERS ---
export async function handleBookChange(node, val) {
    try {
        // THE ENDPOINT FIX: Use the namespaced load route
        const response = await fetch(`/xcp/load/derpPromptBook?name=${encodeURIComponent(val)}`);
        if (response.ok) {
            const result = await response.json();
            // THE DATA FIX: Unwrap 'data' from the generalized response payload
            const data = result.data || [];
            node.properties.derpBook = data;
            node.properties.bookName = val;
            node._lastSavedBookName = val;
            node.properties.currentPageIndex = 0;
            node.properties.prompt = data[0]?.content || "";

            const w = node.widgets?.find(x => x.name === "prompt");
            if (w) w.value = node.properties.prompt;

            if (node.syncDerpOutputs) node.syncDerpOutputs();

            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.refreshDerpPromptBookSysMap) node.refreshDerpPromptBookSysMap();
            node.updateDerpPromptBookUI();
        }
    } catch (e) { console.error("Prompt Book Load Error:", e); }
}

export function handlePageChange(node, action) {
    if (document.activeElement) document.activeElement.blur();
    const book = node.properties.derpBook || [];
    if (book.length === 0) return;

    if (typeof action === "number") {
        node.properties.currentPageIndex = (node.properties.currentPageIndex + action + book.length) % book.length;
    } else if (typeof action === "string") {
        let newIndex = -1;
        if (action.startsWith("Cover:")) {
            newIndex = 0;
        } else {
            const match = action.match(/^Page (\d+)/);
            if (match) {
                const pNum = parseInt(match[1]);
                newIndex = (node.properties.coverPage !== false) ? pNum : pNum - 1;
            }
        }
        if (newIndex !== -1 && book[newIndex]) {
            node.properties.currentPageIndex = newIndex;
        } else return;
    }

    const newContent = book[node.properties.currentPageIndex]?.content || "";
    node.properties.prompt = newContent;
    const w = node.widgets?.find(x => x.name === "prompt");
    if (w) w.value = newContent;

    if (node.syncDerpOutputs) node.syncDerpOutputs();

    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
}

export function handlePageAdd(node) {
    if (document.activeElement) document.activeElement.blur();
    const book = node.properties.derpBook || [];
    book.push({ title: "untitled", content: "", images: [] });
    node.properties.currentPageIndex = book.length - 1;

    // THE WIRELESS SYNC FIX: Broadcast empty data for new page
    if (node.syncDerpOutputs) node.syncDerpOutputs();

    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
}

export function handlePageRename(node) {
    const book = node.properties.derpBook || [];
    const currentIdx = node.properties.currentPageIndex || 0;
    const page = book[currentIdx];
    if (!page) return;

    showBastaFileHandler(node, "derpPromptBook", "btnPageRename", {
        title: "Rename Page",
        message: "Enter new name for this page:",
        confirm: "Rename",
        mode: "rename",
        originalName: page.title,
        initialSize: [250, 130],
        onConfirm: (newName) => {
            if (newName) {
                page.title = newName;
                if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            }
        }
    });
}

export async function handleSaveBook(node) {
    const el = node._derpDomElements?.editorMain;
    if (el && document.activeElement === el) el.blur();

    const currentName = node.properties.bookName || "Untitled Book";

    showBastaFileHandler(node, "derpPromptBook", "btnSaveBook", {
        title: "Save Book",
        message: "Enter filename for prompt book:",
        confirm: "Save",
        mode: "save",
        originalName: currentName,
        initialSize: [250, 130],
        onConfirm: async (filename) => {
            try {
                const payload = {
                    name: filename,
                    data: node.properties.derpBook
                };

                const response = await fetch("/xcp/save/derpPromptBook", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const cleanName = filename.replace(".json", "").trim();
                    playKaChing();
                    node.properties.bookName = cleanName;
                    node._lastSavedBookName = cleanName;
                    const reloadResp = await fetch(`/xcp/load/derpPromptBook?name=${encodeURIComponent(cleanName)}`);
                    if (reloadResp.ok) {
                        const reloadResult = await reloadResp.json();
                        node.properties.derpBook = reloadResult.data || [];
                        if (el) {
                            el._lastDerpValue = null;
                            el.innerText = el.innerText;
                        }
                    }

                    if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
                    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();

                    showBastaMessage(node, `Book saved as '${filename}.json'`);
                } else {
                    throw new Error("Server Error");
                }
            } catch (e) {
                showBastaMessage(node, "Save Failed. Check console.");
                console.error("Prompt Book Save Error:", e);
            }
        }
    });
}

export async function handleNewBook(node) {
    showBastaFileHandler(node, "derpPromptBook", "btnNewBook", {
        title: "New Book",
        message: "Enter name for new prompt book:",
        confirm: "Create",
        mode: "save",
        originalName: "New Book",
        initialSize: [250, 130],
        onConfirm: async (filename) => {
            const data = createDefaultDerpBook();
            try {
                const res = await fetch("/xcp/save/derpPromptBook", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: filename, data: data })
                });
                if (res.ok) {
                    node.properties.bookName = filename;
                    node.properties.derpBook = data;
                    node.properties.currentPageIndex = 0;
                    if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
                    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                    showBastaMessage(node, `Book '${filename}' created!`, 3000, {}, "btnNewBook", false, "success");
                }
            } catch (e) { console.error("New Book Error:", e); }
        }
    });
}

export async function handleRenameBook(node) {
    const currentName = node.properties.bookName || "Untitled Book";
    showBastaFileHandler(node, "derpPromptBook", "btnRenameBook", {
        title: "Rename Book",
        message: "Enter new name for prompt book:",
        confirm: "Rename",
        mode: "rename",
        originalName: currentName,
        initialSize: [250, 130],
        onConfirm: async (newName) => {
            try {
                const res = await fetch("/xcp/rename_prompt_book", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ oldName: currentName, newName: newName })
                });
                if (res.ok) {
                    node.properties.bookName = newName;
                    node._lastSavedBookName = newName;
                    if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
                    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                    showBastaMessage(node, "Book renamed!", 3000, {}, "btnRenameBook", false, "success");
                }
            } catch (e) { console.error("Rename Book Error:", e); }
        }
    });
}

export async function handleCopyBook(node) {
    const currentName = node.properties.bookName || "Untitled Book";
    showBastaFileHandler(node, "derpPromptBook", "btnCopyBook", {
        title: "Copy Book",
        message: "Enter name for the copy:",
        confirm: "Copy",
        mode: "save",
        originalName: currentName + "_copy",
        initialSize: [250, 130],
        onConfirm: async (newName) => {
            try {
                const res = await fetch("/xcp/duplicate/derpPromptBook", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ oldName: currentName, newName: newName })
                });
                if (res.ok) {
                    node.properties.bookName = newName;
                    if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
                    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                    showBastaMessage(node, "Book copied!", 3000, {}, "btnCopyBook", false, "success");
                }
            } catch (e) { console.error("Copy Book Error:", e); }
        }
    });
}

export function getPageLabel(node, idx, title) {
    const book = node.properties.derpBook || [];
    const isCover = node.properties.coverPage !== false;
    const isTotal = node.properties.showTotalPage !== false;

    if (isCover && idx === 0) return `Cover: ${title}`;

    const pNum = isCover ? idx : idx + 1;
    const totalCount = isCover ? book.length - 1 : book.length;

    return `Page ${pNum}${isTotal ? `/${totalCount}` : ""}: ${title}`;
}
