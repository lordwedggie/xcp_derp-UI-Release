/**
 * PROJECT: derpNodes | CORE: derpPromptBook_core
 * STATUS: FATHA VIRTUAL COMPLIANT
 */
import { setupPromptBookImageSupport, stripImageBase64FromContent } from "../helpers/derpPromptBook_imageHandler.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { playKaChing, playKaboom } from "../../herbina/masterSoundEffects.js";

const defaultDerpBookPages = 3;

function normalizePromptBookName(name) {
    return String(name || "Untitled Book").replace(/\.json$/i, "").trim() || "Untitled Book";
}

function showPromptBookSystemSaveMessage(node, prefix, bookName, targetRegion = null) {
    const cleanName = normalizePromptBookName(bookName);
    showBastaSystemMessage(node, prefix, 3000, { fade: true, grow: true }, targetRegion, "success", null, cleanName);
}

function showPromptBookMissingBookMessage(node, bookName, targetRegion = null) {
    const cleanName = normalizePromptBookName(bookName);
    showBastaSystemMessage(node, "Book File Missing: ", 3200, { fade: true, grow: true }, targetRegion, "error", null, cleanName);
}

function cleanPromptBookText(text) {
    if (!text) return "";
    return text.split('\n').map(segment => {
        if (!segment.trim()) return "";
        return segment.split(',').map(t => t.trim()).filter(t => t !== "").join(', ') + ", ";
    }).join('\n');
}

async function savePromptBookFile(node, fileName, bookData) {
    const cleanName = normalizePromptBookName(fileName);
    const response = await fetch("/xcp/save/derpPromptBook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, data: bookData })
    });
    if (!response.ok) throw new Error(`Save failed (${response.status})`);
    return cleanName;
}

async function refreshPromptBookState(node, bookName, bookData = null) {
    const cleanName = normalizePromptBookName(bookName);
    node.properties.bookName = cleanName;
    node._lastSavedBookName = cleanName;
    if (Array.isArray(bookData)) {
        node.properties.derpBook = JSON.parse(JSON.stringify(bookData));
    }
    if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
    if (node.refreshDerpPromptBookSysMap) node.refreshDerpPromptBookSysMap();
    if (node.updateDerpPromptBookUI) node.updateDerpPromptBookUI();
    if (node.syncDerpOutputs) node.syncDerpOutputs();
}

async function validateActivePromptBook(node) {
    const activeBookName = normalizePromptBookName(node?.properties?.bookName);
    if (!node || !activeBookName) return;
    if (node._promptBookValidationPending === activeBookName) return;
    node._promptBookValidationPending = activeBookName;
    try {
        if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
        const availableBooks = Array.isArray(node._availableBooks) ? node._availableBooks : [];
        if (availableBooks.includes(activeBookName)) return;

        showPromptBookMissingBookMessage(node, activeBookName);
        node.properties.bookName = availableBooks[0] || "Untitled Book";
        node._lastSavedBookName = node.properties.bookName;
        node.properties.currentPageIndex = 0;
        node.properties.derpBook = createDefaultDerpBook();
        node.properties.prompt = node.properties.derpBook[0]?.content || "";

        const w = node.widgets?.find(x => x.name === "prompt");
        if (w) w.value = node.properties.prompt;

        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
        if (node.refreshDerpPromptBookSysMap) node.refreshDerpPromptBookSysMap();
        if (node.updateDerpPromptBookUI) node.updateDerpPromptBookUI();
        if (node.syncDerpOutputs) node.syncDerpOutputs();
        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    } catch (e) {
        console.error("Prompt Book Validation Error:", e);
    } finally {
        if (node._promptBookValidationPending === activeBookName) node._promptBookValidationPending = "";
    }
}

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
            this.properties.skipGenericWirelessHeartbeat = true;
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;

            const baseId = String(this.id);
            const nodeName = this.titleLabel || this.title || "Derp Prompt Book";
            const activePage = this.properties.derpBook?.[this.properties.currentPageIndex || 0];

            const rawContent = (activePage?.content || "").replace(/\[\[IMG:[\s\S]*?\]\]/g, "");
            // Preserve editor formatting so content edits always propagate to signal sync.
            const outContent = isBypassed ? "" : rawContent;
            const syncFingerprint = `${isBypassed ? "bypass" : "live"}__${nodeName}__${outContent}`;

            if (this._lastSyncedContent === syncFingerprint) return;
            this._lastSyncedContent = syncFingerprint;

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
                upstreamIds: [],
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
            .then(res => {
                if (!res.ok) {
                    showPromptBookMissingBookMessage(this, profileName);
                    throw new Error(`Prompt book ${profileName} not found.`);
                }
                return res.json();
            })
            .then(res => {
                const p = res.data || {};
                if (p.derpBook) this.properties.derpBook = JSON.parse(JSON.stringify(p.derpBook));
                if (p.bookName) this.properties.bookName = p.bookName;

                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                if (this.updateDerpPromptBookUI) this.updateDerpPromptBookUI();
                this.setDirtyCanvas(true, true);
            })
            .catch((e) => {
                console.error("[Prompt Book Profile Load Error]:", e);
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
                try {
                    const res = await fetch("/xcp/save/derpPromptBook", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: filename, data: this.properties.derpBook })
                    });

                    if (res.ok) {
                        this.properties.bookName = filename;
                        this._lastSavedBookName = filename;
                        showPromptBookSystemSaveMessage(this, "Book Saved: ", filename, "btnSave");
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
                w.computeSize = () => [0, -4];

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
        this.properties.skipGenericWirelessHeartbeat = true;
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
            this._lastSyncedContent = null;
            if (this.syncDerpOutputs) this.syncDerpOutputs();

            setTimeout(() => {
                if (this.id === -1 || !this.syncDerpOutputs) return;
                this._lastSyncedContent = null;
                this.syncDerpOutputs();
            }, 64);

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
                this._availableBooks = result.items || [];
                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                this.updateDerpPromptBookUI();
            }
        } catch (e) { console.error("Prompt Book List Error:", e); }
    };

    const onDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function(ctx) {
        if (onDrawForeground) onDrawForeground.apply(this, arguments);

        if (!this._promptBookValidationDone) {
            this._promptBookValidationDone = true;
            validateActivePromptBook(this);
        }

        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
        if (this._lastBypassState !== isBypassed) {
            this._lastSyncedContent = null;
            this._lastBypassState = isBypassed;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
        }

        const el = this._derpDomElements?.editorMain;
        if (el) {
            setupPromptBookImageSupport(el, this);

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

export async function handleBookChange(node, val) {
    try {
        if (node._availableBooks && !node._availableBooks.includes(val)) {
            showPromptBookMissingBookMessage(node, val, "dropdownBooks");
            throw new Error(`Prompt book ${val} missing from remote list.`);
        }
        const response = await fetch(`/xcp/load/derpPromptBook?name=${encodeURIComponent(val)}`);
        if (!response.ok) {
            showPromptBookMissingBookMessage(node, val, "dropdownBooks");
            throw new Error(`Prompt book ${val} not found.`);
        }
        const result = await response.json();
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

    node.properties.prompt = "";
    const w = node.widgets?.find(x => x.name === "prompt");
    if (w) w.value = "";

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

export function handlePageClean(node) {
    const book = node.properties.derpBook || [];
    const currentIdx = node.properties.currentPageIndex || 0;
    const page = book[currentIdx];
    if (!page) return;

    const cleaned = cleanPromptBookText(page.content || "");
    page.content = cleaned;
    node.properties.prompt = cleaned;

    const w = node.widgets?.find(x => x.name === "prompt");
    if (w) w.value = cleaned;

    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
    if (node.updateDerpPromptBookUI) node.updateDerpPromptBookUI();
    if (node.syncDerpOutputs) node.syncDerpOutputs();
    if (node.requestDerpSync) node.requestDerpSync();
    if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
}

export function handlePageDelete(node) {
    const book = node.properties.derpBook || [];
    const currentIdx = node.properties.currentPageIndex || 0;
    const page = book[currentIdx];
    if (!page || book.length === 0) return;

    showBastaFileHandler(node, "derpPromptBook", "btnPageDelete", {
        title: "Delete Page",
        message: `Delete page \"${page.title || "untitled"}\"?`,
        confirm: "Delete",
        mode: "delete",
        originalName: page.title || "untitled",
        initialSize: [250, 110],
        onConfirm: () => {
            book.splice(currentIdx, 1);

            if (book.length === 0) {
                node.properties.derpBook = [{ title: "untitled", content: "", images: [] }];
                node.properties.currentPageIndex = 0;
            } else {
                node.properties.currentPageIndex = Math.min(currentIdx, book.length - 1);
            }

            const nextContent = node.properties.derpBook[node.properties.currentPageIndex]?.content || "";
            node.properties.prompt = nextContent;
            const w = node.widgets?.find(x => x.name === "prompt");
            if (w) w.value = nextContent;

            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.updateDerpPromptBookUI) node.updateDerpPromptBookUI();
            if (node.syncDerpOutputs) node.syncDerpOutputs();
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
                    node.properties.bookName = cleanName;
                    node._lastSavedBookName = cleanName;
                    const reloadResp = await fetch(`/xcp/load/derpPromptBook?name=${encodeURIComponent(cleanName)}`);
                    if (reloadResp.ok) {
                        const reloadJson = await reloadResp.json();
                        node.properties.derpBook = reloadJson.data || node.properties.derpBook;
                    }
                    if (node.fetchRemoteBooks) await node.fetchRemoteBooks();
                    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                    if (node.refreshDerpPromptBookSysMap) node.refreshDerpPromptBookSysMap();
                    node.updateDerpPromptBookUI();
                    showPromptBookSystemSaveMessage(node, "Book Saved: ", cleanName, "btnSaveBook");
                }
            } catch (e) {
                console.error("[Save Error]:", e);
            }
        }
    });
}

export function handleNewBook(node) {
    showBastaFileHandler(node, "derpPromptBook", "btnNewBook", {
        title: "New Book",
        message: "Enter filename for new prompt book:",
        confirm: "Create",
        mode: "create",
        originalName: "Untitled Book",
        initialSize: [250, 130],
        onConfirm: async (filename) => {
            try {
                const nextBook = createDefaultDerpBook();
                const cleanName = await savePromptBookFile(node, filename, nextBook);
                node.properties.currentPageIndex = 0;
                node.properties.prompt = "";
                await refreshPromptBookState(node, cleanName, nextBook);
                showPromptBookSystemSaveMessage(node, "Book Created: ", cleanName, "btnNewBook");
            } catch (e) {
                console.error("[New Book Error]:", e);
                showBastaMessage(node, "Book create failed", 2400, { fade: true }, "btnNewBook", false, "error");
            }
        }
    });
}

export function handleRenameBook(node) {
    const currentName = node.properties.bookName || "Untitled Book";
    showBastaFileHandler(node, "derpPromptBook", "btnRenameBook", {
        title: "Rename Book",
        message: "Enter new name for this book:",
        confirm: "Rename",
        mode: "rename",
        originalName: currentName,
        initialSize: [250, 130],
        onConfirm: async (newName) => {
            const oldName = normalizePromptBookName(currentName);
            const cleanName = normalizePromptBookName(newName);
            if (!cleanName) return;
            try {
                const renameRes = await fetch("/xcp/rename/derpPromptBook", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ oldName, newName: cleanName })
                });

                if (!renameRes.ok) {
                    await savePromptBookFile(node, cleanName, node.properties.derpBook || createDefaultDerpBook());
                } else {
                    await savePromptBookFile(node, cleanName, node.properties.derpBook || createDefaultDerpBook());
                }

                await refreshPromptBookState(node, cleanName, node.properties.derpBook || createDefaultDerpBook());
                showPromptBookSystemSaveMessage(node, "Book Renamed: ", cleanName, "btnRenameBook");
            } catch (e) {
                console.error("[Rename Book Error]:", e);
                showBastaMessage(node, "Book rename failed", 2400, { fade: true }, "btnRenameBook", false, "error");
            }
        }
    });
}

export function handleCopyBook(node) {
    const currentName = node.properties.bookName || "Untitled Book";
    showBastaFileHandler(node, "derpPromptBook", "btnCopyBook", {
        title: "Duplicate Book",
        message: "Enter filename for duplicated prompt book:",
        confirm: "Duplicate",
        mode: "duplicate",
        originalName: `${normalizePromptBookName(currentName)} Copy`,
        initialSize: [250, 130],
        onConfirm: async (newName) => {
            try {
                const currentBook = JSON.parse(JSON.stringify(node.properties.derpBook || createDefaultDerpBook()));
                const cleanName = await savePromptBookFile(node, newName, currentBook);
                await refreshPromptBookState(node, cleanName, currentBook);
                showPromptBookSystemSaveMessage(node, "Book Duplicated: ", cleanName, "btnCopyBook");
            } catch (e) {
                console.error("[Duplicate Book Error]:", e);
                showBastaMessage(node, "Book duplicate failed", 2400, { fade: true }, "btnCopyBook", false, "error");
            }
        }
    });
}

export function getPageLabel(node, idx, title) {
    const isCover = idx === 0 && node.properties.coverPage !== false;
    if (isCover) return `Cover: ${title}`;
    const pageNumber = node.properties.coverPage !== false ? idx : idx + 1;
    if (node.properties.showTotalPage !== false) {
        const totalPages = (node.properties.derpBook || []).length - (node.properties.coverPage !== false ? 1 : 0);
        return `Page ${pageNumber}/${Math.max(totalPages, 1)}: ${title}`;
    }
    return `Page ${pageNumber}: ${title}`;
}
