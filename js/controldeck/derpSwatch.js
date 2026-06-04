/**
 * Path: ./js/controldeck/derpSwatch.js
 * ROLE: Minimal Fatha utility node for dragging palette swatches onto standard ComfyUI nodes.
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";

const SWATCH_REGION_PREFIX = "swatchColor_";

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

function normalizePaletteFileName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return raw.endsWith(".json") ? raw : `${raw}.json`;
}

function getPaletteDisplayName(value) {
    return String(value || "").replace(/\.json$/i, "");
}

function toRgba(value, fallback = "rgba(0,0,0,0)") {
    if (!Array.isArray(value)) return fallback;
    const r = Number(value[0]);
    const g = Number(value[1]);
    const b = Number(value[2]);
    const a = value[3] === undefined ? 1 : Number(value[3]);
    if (![r, g, b, a].every(Number.isFinite)) return fallback;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function findDefaultNodeAtPointer(sourceNode, pointer) {
    const nodes = app.graph?._nodes || [];
    if (!pointer || !nodes.length) return null;
    const [px, py] = pointer;

    if (typeof app.graph?.getNodeOnPos === "function") {
        try {
            const picked = app.graph.getNodeOnPos(px, py, nodes, 0);
            if (picked && picked !== sourceNode && !picked.isFathaNode && !picked.isUncleNode) return picked;
        } catch (err) {
            console.warn("[derpSwatch] graph.getNodeOnPos failed", err);
        }
    }

    for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        if (!node || node === sourceNode) continue;
        if (node.isFathaNode || node.isUncleNode) continue;
        if (!Array.isArray(node.pos) || !Array.isArray(node.size)) continue;

        const [x, y] = node.pos;
        const [w, h] = node.size;
        const hit = px >= x && px <= x + w && py >= y && py <= y + h;
        if (hit) return node;
    }

    return null;
}

function getPaletteEntries(node) {
    return Array.isArray(node?._derpSwatchPalettes) ? node._derpSwatchPalettes : [];
}

function buildEntryList(node) {
    const entries = [];
    for (const palette of getPaletteEntries(node)) {
        const main = palette?.entries?.main;
        if (!main || (!Array.isArray(main._ON) && !Array.isArray(main._OFF))) continue;
        entries.push({
            name: String(palette.name || tLocale("$derp_swatch.entry", "Entry")),
            key: "main",
            on: Array.isArray(main._ON) ? main._ON : main._OFF,
            off: Array.isArray(main._OFF) ? main._OFF : main._ON,
            dis: Array.isArray(main._DIS) ? main._DIS : null,
        });
    }
    return entries;
}

function cloneColor(value, fallback = [0, 0, 0, 1]) {
    return Array.isArray(value) ? [...value] : [...fallback];
}

function getSwatchTheme(node) {
    node._derpSwatchTheme = node._derpSwatchTheme || {};
    return node._derpSwatchTheme;
}

function getEntryFromSourceRegion(sourceNodeId, sourceRegionKey) {
    if (!sourceRegionKey || !sourceRegionKey.startsWith(SWATCH_REGION_PREFIX)) return null;
    const node = (app.graph?._nodes || []).find((candidate) => candidate?.id === sourceNodeId);
    if (!node) return null;
    const index = Number(sourceRegionKey.substring(SWATCH_REGION_PREFIX.length));
    const entry = buildEntryList(node)[index];
    return entry ? { node, entry } : null;
}

function syncSwatchTheme(node, entries) {
    const theme = getSwatchTheme(node);
    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        theme[`entry_${i}`] = {
            _ON: cloneColor(entry.on),
            _OFF: cloneColor(entry.off, entry.on),
            _DIS: cloneColor(entry.dis || entry.off || entry.on),
            _lockL: false,
            _lockR: false,
        };
    }
    for (const key of Object.keys(theme)) {
        const index = Number(key.replace(/^entry_/, ""));
        if (!Number.isInteger(index) || index < 0 || index >= entries.length) delete theme[key];
    }
    return theme;
}

function applySwatchToNode(targetNode, node, entry) {
    if (!targetNode || !entry) return false;
    targetNode.color = toRgba(entry.on);
    targetNode.bgcolor = toRgba(entry.off, targetNode.color);
    targetNode.properties = targetNode.properties || {};
    targetNode.properties._lastDerpPalette = {
        fileName: node.properties?.paletteFile || "",
        name: entry.name,
        key: entry.key || "main",
    };
    targetNode.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
    return true;
}

async function refreshPaletteFileList(node) {
    try {
        const res = await fetch("/xcp/list/palettes");
        if (!res.ok) return;
        const data = await res.json();
        node._derpSwatchPaletteFiles = (data.items || [])
            .filter((item) => typeof item === "string" && !item.endsWith("/"))
            .map(normalizePaletteFileName)
            .sort((a, b) => a.localeCompare(b));
        if (!node.properties.paletteFile && node._derpSwatchPaletteFiles.length) {
            node.properties.paletteFile = node._derpSwatchPaletteFiles[0];
            await loadPaletteFile(node, node.properties.paletteFile);
        }
        node._layoutMapHash = null;
        node.refreshNodeLayoutMap?.();
        node.requestDerpSync?.();
    } catch (err) {
        console.warn("[derpSwatch] Failed to list palettes", err);
    }
}

async function loadPaletteFile(node, value) {
    const fileName = normalizePaletteFileName(value);
    if (!fileName) return;
    node.properties.paletteFile = fileName;
    try {
        const res = await fetch(`/xcp/load/palettes?name=${encodeURIComponent(fileName)}`);
        if (!res.ok) return;
        const data = await res.json();
        const payload = data.data ? data.data : data;
        node._derpSwatchPalettes = Array.isArray(payload?.palettes) ? payload.palettes : [];
        node._layoutMapHash = null;
        node.refreshNodeLayoutMap?.();
        node.requestDerpSync?.();
        node.setDirtyCanvas?.(true, true);
    } catch (err) {
        console.warn("[derpSwatch] Failed to load palette", err);
    }
}

function handleSwatchFallbackDrop(payload) {
    const source = getEntryFromSourceRegion(payload?.sourceNodeId, payload?.sourceRegionKey);
    if (!source) return false;
    const targetNode = findDefaultNodeAtPointer(source.node, [payload.canvasX, payload.canvasY]);
    if (applySwatchToNode(targetNode, source.node, source.entry)) {
        source.node._derpSwatchLastDrop = `${source.entry.name} -> ${targetNode.title || targetNode.type || targetNode.id}`;
    } else {
        source.node._derpSwatchLastDrop = tLocale("$derp_swatch.no_target", "No default node target");
    }
    source.node._layoutMapHash = null;
    source.node.refreshNodeLayoutMap?.();
    source.node.requestDerpSync?.();
    source.node.setDirtyCanvas?.(true, true);
    return true;
}

app.registerExtension({
    name: "xcp.derpSwatch_Extension",
    async setup() {
        initDerpGlobalListener();
        window._derpColorDragFallbacks = window._derpColorDragFallbacks || new Set();
        window._derpColorDragFallbacks.add(handleSwatchFallbackDrop);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("swatchnode")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        fatha(nodeType, nodeData, 180);

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSwatchSysMap();
            this.requestDerpSync();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSwatchSysMap();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;

            const { mW, mH, sW, oY, pW, pH } = this.getDerpVars(this);
            const entries = buildEntryList(this).slice(0, 24);
            const swatchTheme = syncSwatchTheme(this, entries);
            const fileItems = this._derpSwatchPaletteFiles || [];
            const hash = [
                this.properties.paletteFile || "",
                fileItems.join("|"),
                entries.map((entry) => `${entry.name}:${toRgba(entry.on)}:${toRgba(entry.off)}:${toRgba(entry.dis)}`).join("|"),
                this._derpSwatchLastDrop || "",
                this.size?.[0] || 0,
                window._xcpDerpSession,
            ].join(";");

            if (this._layoutMapHash === hash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = hash;

            const swatchRows = entries.reduce((acc, entry, index) => {
                const rowKey = `swatchRow_${index}`;
                acc[rowKey] = {
                    type: this.UI_TYPES.REGION,
                    themeKey: "panel",
                    dir: "row",
                    width: "full",
                    height: "auto",
                    spacing: [sW, 0],
                    margin: [0, 0, 0, mH],
                    hoverEffect: true,
                    regionOffset: [0, 0],
                    [`label_${index}`]: {
                        type: this.UI_TYPES.TEXT,
                        mouseOver: false,
                        skipBackground: true,
                        cutoff: true,
                        text: entry.name,
                        themeKey: "button, t_textSmall",
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                    },
                    [`${SWATCH_REGION_PREFIX}${index}`]: {
                        type: this.UI_TYPES.COLORKEYEDIT,
                        key: `${SWATCH_REGION_PREFIX}${index}`,
                        themeKey: "button, t_textSmall",
                        themeToEdit: swatchTheme,
                        _selectedKeyName: `entry_${index}`,
                        mode: "comfySwatch",
                        width: 64,
                        height: 18,
                        onColorClick: () => {},
                    },
                };
                return acc;
            }, {});

            this.layoutMap = {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full",
                    height: "auto",
                    dir: "col",
                    margin: [mW, mH, mW, 0],
                    regionPaletteLoader: {
                        //type: this.UI_TYPES.REGION,
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        paletteBrowser: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "palette",
                            themeKey: "panel, t_textSmall",
                            canvasShield: true,
                            width: "full",
                            height: "auto",
                            padding: [pW, pH],
                            mouseOver: false,
                            mode: "file",
                            spacing: [sW, 0],
                            rootName: tLocale("$derp_swatch.browser.root", "Palettes"),
                            value: getPaletteDisplayName(this.properties.paletteFile) || tLocale("$derp_swatch.browser.select", "Select palette"),
                            items: fileItems.map(getPaletteDisplayName),
                            onChange: (value) => loadPaletteFile(this, value),
                        },
                        btnRefresh: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "refresh",
                            width: "match",
                            height: "fill",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            themeKey: "button, t_textNormal",
                            onPress: () => {
                                const currentFile = this.properties.paletteFile;
                                if (currentFile) loadPaletteFile(this, currentFile);
                            },
                        },
                    },
                    hintText: {
                        type: this.UI_TYPES.TEXT,
                        text: entries.length ? "$derp_swatch.hint" : "$derp_swatch.empty",
                        themeKey: "t_textSystem",
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        margin: [0, mH, 0, mH],
                    },
                    ...swatchRows,
                    lastDropText: {
                        hidden: !this._derpSwatchLastDrop,
                        type: this.UI_TYPES.TEXT,
                        text: this._derpSwatchLastDrop || "",
                        themeKey: "t_textSmall",
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        margin: [mH, 0, 0, 0],
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpSwatchSysMap = function() {
            const { mW, mH, sH, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    margin: [mW, sH, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" },
                    width: "full",
                    height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT,
                        mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "$derp_swatch.system.properties",
                        width: "full",
                        padding: [pW, pH],
                    },
                    layoutSpacer: {
                        anchor: { target: "mainRow", axis: "y", offset: mH },
                    },
                },
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.isWirelessTransmitter = false;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];

            this.titleLabel = tLocale("$derp_swatch.title", "Derp Swatch");
            this.properties.titleLabel = this.titleLabel;
            this.properties.paletteFile = this.properties.paletteFile || "";
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [220, 80];
            this.size = [220, 80];

            refreshPaletteFileList(this);
            this.refreshNodeLayoutMap();
            this.refreshDerpSwatchSysMap();
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];

            this._layoutMapHash = null;
            refreshPaletteFileList(this).then(() => {
                if (this.properties.paletteFile) loadPaletteFile(this, this.properties.paletteFile);
            });
            this.refreshNodeLayoutMap();
            this.refreshDerpSwatchSysMap();
            this.requestDerpSync();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;

            const currentW = Math.round(this.size[0]);
            if (this._lastDerpSwatchW !== currentW) {
                this._lastDerpSwatchW = currentW;
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
            }
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };
    },
});