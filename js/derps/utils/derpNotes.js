/**
 * Path: ./js/derps/utils/derpNotes.js
 * ROLE: Markdown notes viewer.
 */
import { app } from "../../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";

const DERP_NOTES_DOC_NAV_VERSION = "doc-nav-window-capture-2026-06-14";

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

function decodeMarkdownPath(path) {
    try {
        return decodeURIComponent(String(path || ""));
    } catch {
        return String(path || "");
    }
}

function normalizeMarkdownPath(path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/");
    const stack = [];
    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            if (!stack.length) return "";
            stack.pop();
            continue;
        }
        stack.push(part);
    }
    return stack.join("/");
}

function resolveDocPathFromHref(rawHref, basePath = "") {
    let value = String(rawHref || "").trim();
    if (!value || value.startsWith("#")) return "";

    if (value.includes("/xcp/markdown_media")) {
        try {
            const parsed = new URL(value, window.location.href);
            const mediaPath = decodeMarkdownPath(parsed.searchParams.get("path") || "");
            return /\.(md|markdown)$/i.test(mediaPath) ? normalizeMarkdownPath(mediaPath) : "";
        } catch {
            return "";
        }
    }

    try {
        const parsed = new URL(value, window.location.href);
        if (/^https?:/i.test(parsed.protocol) && parsed.origin !== window.location.origin) return "";
        if (/^https?:/i.test(parsed.protocol)) value = parsed.pathname.replace(/^\/+/, "");
    } catch {}

    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";

    const decoded = decodeMarkdownPath(value).split("#")[0].split("?")[0];
    if (!/\.(md|markdown)$/i.test(decoded)) return "";

    const normalizedBase = String(basePath || "").replace(/\\/g, "/");
    const baseDir = normalizedBase.includes("/") ? normalizedBase.replace(/\/[^/]*$/, "") : "";
    return normalizeMarkdownPath(baseDir ? `${baseDir}/${decoded}` : decoded);
}

function findDerpNotesNodeForMarkdownElement(markdownEl) {
    const nodes = app.graph?._nodes || [];
    return nodes.find((node) => {
        if (!String(node?.type || "").toLowerCase().includes("derpnotes")) return false;
        return Object.values(node._derpDomElements || {}).some((el) => el === markdownEl || el?.contains?.(markdownEl));
    }) || null;
}

function ensureDerpNotesDocNavListener() {
    if (window.__derpNotesDocNavVersion === DERP_NOTES_DOC_NAV_VERSION) return;
    if (window.__derpNotesDocNavHandler) {
        window.removeEventListener("click", window.__derpNotesDocNavHandler, true);
    }

    window.__derpNotesDocNavHandler = (event) => {
        const anchor = event.target?.closest?.("a");
        const markdownEl = anchor?.closest?.(".derp-markdown-html");
        if (!anchor || !markdownEl) return;

        const node = findDerpNotesNodeForMarkdownElement(markdownEl);
        if (!node) return;

        const taggedPath = anchor.getAttribute("data-markdown-doc");
        const docPath = taggedPath
            ? normalizeMarkdownPath(decodeMarkdownPath(taggedPath))
            : resolveDocPathFromHref(anchor.getAttribute("href") || "", node.properties?.notePath || "");
        if (!docPath) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        loadMarkdownFile(node, docPath);
    };

    window.addEventListener("click", window.__derpNotesDocNavHandler, true);
    window.__derpNotesDocNavVersion = DERP_NOTES_DOC_NAV_VERSION;
}

function buildNotesLayoutHash(node, vars) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const height = (Number(node?.size?.[1]) || 0).toFixed(2);
    const notePath = String(node?.properties?.notePath || "");
    const contentHash = String(node?.properties?.noteContent || "").length;
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    return `${notePath}_${contentHash}_${window._xcpDerpSession}_${width}_${height}_${mW}_${mH}_${oY}_${node.properties?.drawHeader !== false}`;
}

async function fetchMarkdownList(node) {
    try {
        const response = await fetch("/xcp/list_markdown");
        const data = await response.json();
        node._derpNotesItems = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
        console.error("[derpNotes] Failed to list markdown files:", error);
        node._derpNotesItems = [];
    }
}

async function loadMarkdownFile(node, path) {
    const safePath = String(path || "");
    if (!safePath) return;
    node.properties.notePath = safePath;
    node.properties.noteContent = tLocale("$derp_notes.loading", "Loading...");
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap?.();
    node.requestDerpSync?.();

    try {
        const response = await fetch(`/xcp/load_markdown?path=${encodeURIComponent(safePath)}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || response.statusText);
        node.properties.noteContent = String(data.content || "");
        node.properties.notePath = String(data.path || safePath);
    } catch (error) {
        console.error("[derpNotes] Failed to load markdown file:", error);
        node.properties.noteContent = `${tLocale("$derp_notes.load_failed", "Failed to load note.")}\n\n${String(error?.message || error)}`;
    }

    node._layoutMapHash = null;
    node.refreshNodeLayoutMap?.();
    node.requestDerpSync?.();
    node.setDirtyCanvas?.(true, true);
}

async function refreshMarkdownFiles(node, reloadCurrent = false) {
    await fetchMarkdownList(node);
    if (!node.properties.notePath && node._derpNotesItems.length > 0) {
        await loadMarkdownFile(node, node._derpNotesItems[0]);
        return;
    }
    if (reloadCurrent && node.properties.notePath) {
        await loadMarkdownFile(node, node.properties.notePath);
        return;
    }
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap?.();
    node.requestDerpSync?.();
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "xcp.derpNotes_Extension",
    async setup() {
        initDerpGlobalListener();
        ensureDerpNotesDocNavListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpNotes") return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        fatha(nodeType, nodeData, 260);

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpNotesSysMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpNotesSysMap();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            const structureHash = buildNotesLayoutHash(this, { mW, mH, oY });
            this.properties.footerHeight = 6 + mH;

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            const noteItems = this._derpNotesItems || [];
            const notePath = this.properties.notePath || "";
            const noteContent = this.properties.noteContent || tLocale("$derp_notes.empty", "Select a Markdown file.");

            this.layoutMap = {
                notesRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "fill",
                    dir: "col",
                    margin: this.properties?.drawHeader === true ? [mW, mH, mW, 0] : [mW, 0, mW, 0],
                    spacing: [0, mH],
                    viewer: {
                        type: this.UI_TYPES.MARKDOWN_HTML,
                        themeKey: "dialog, t_textNormal",
                        markdown: noteContent,
                        markdownPath: notePath,
                        onNavigate: (value) => loadMarkdownFile(this, value),
                        width: "full", height: "fill",
                        padding: [pW, pH],
                    },
                },
                pickerRegion: {
                    width: "full", height: "auto",
                    dir: "row",
                    margin: [mW, 0, mW, 0],
                    spacing: [sW, 0],
                    dropdownNotes: {
                        type: this.UI_TYPES.FILEBROWSER,
                        themeKey: "panel, t_textNormal",
                        canvasShield: true,
                        indicator: true,
                        searchTab: true,
                        displayMode: "cutoff",
                        icon: "file",
                        rootName: tLocale("$derp_notes.browser.root", "Notes"),
                        mode: "file",
                        fileType: "markdown",
                        items: noteItems,
                        value: notePath,
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        corners: [3, 0, 0, 3],
                        onChange: (value) => loadMarkdownFile(this, value),
                    },
                    btnRefresh: {
                        type: this.UI_TYPES.ICONBUTTON,
                        icon: "refresh",
                        toolTip: "$derp_notes.tooltips.refresh",
                        themeKey: "button, t_textNormal",
                        width: "match", height: "fill",
                        objectAlign: ["left", "middle"],
                        corners: [0, 3, 3, 0],
                        onPress: () => refreshMarkdownFiles(this, true),
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpNotesSysMap = function() {
            const { mW, mH, sH, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, sH, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "$derp_notes.system.properties",
                        width: "full", padding: [pW, pH],
                    },
                    layoutSpacer: {
                        anchor: { target: "mainRow", axis: "y", offset: oY },
                    }
                }
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.syncDerpOutputs = function() {
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
            }
            this.outputs = [];
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];

            this.titleLabel = tLocale("$derp_notes.title", "Derp Notes");
            this.properties.titleLabel = tLocale("$derp_notes.title", "Derp Notes");
            this.properties.notePath = "";
            this.properties.noteContent = tLocale("$derp_notes.empty", "Select a Markdown file.");
            this.properties.autoWidth = false;
            this.properties.autoHeight = false;
            this.properties.nodeSize = [420, 360];
            this.size = [420, 360];

            this.refreshNodeLayoutMap();
            this.refreshDerpNotesSysMap();
            refreshMarkdownFiles(this, false);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];

            if (!this.properties.noteContent) {
                this.properties.noteContent = tLocale("$derp_notes.empty", "Select a Markdown file.");
            }
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpNotesSysMap();
            refreshMarkdownFiles(this, !!this.properties.notePath);
            this.requestDerpSync();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;

            const currentW = Math.round(this.size[0]);
            const currentH = Math.round(this.size[1]);
            if (this._lastDerpW !== currentW || this._lastDerpH !== currentH) {
                this._lastDerpW = currentW;
                this._lastDerpH = currentH;
                this.refreshNodeLayoutMap();
            }
        };
    }
});
