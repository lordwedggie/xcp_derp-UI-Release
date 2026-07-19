/**
 * Path: ./js/derps/controldeck/derpTutorial.js
 * ROLE: First-run tutorial launcher and bundled workflow opener.
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { settleDerpSizeBeforeDraw } from "../../fatha/core/fathaHandler.js";

const DERP_TUTORIAL_MAJOR_VERSION = 1;
const TUTORIAL_SEEN_SETTING = "Derp.Tutorial.SeenMajorVersion";
const TUTORIAL_SUPPRESS_SETTING = "Derp.Tutorial.SuppressMajorVersion";
const TUTORIAL_QUERY_PARAM = "xcpDerpTutorialWorkflow";
const TUTORIAL_WORKFLOW_PREFIX = "tutorials/";
const TUTORIAL_INITIAL_SIZE = [360, 50];
const TUTORIAL_SIZING_VERSION = 2;

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

function readNumericSetting(id, fallback = 0) {
    const value = app.ui?.settings?.getSettingValue?.(id);
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

function writeSetting(id, value) {
    app.ui?.settings?.setSettingValue?.(id, value);
}

function normalizeWorkflowName(name) {
    const cleaned = String(name || "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
    if (!cleaned || cleaned.includes("..")) return "";
    return cleaned.startsWith(TUTORIAL_WORKFLOW_PREFIX) ? cleaned : "";
}

function formatWorkflowLabel(name) {
    const clean = normalizeWorkflowName(name);
    const leaf = clean.split("/").pop()?.replace(/\.json$/i, "") || "";
    const words = leaf.replace(/[_-]+/g, " ").trim();
    return words ? words.replace(/\b\w/g, (ch) => ch.toUpperCase()) : tLocale("$derp_tutorial.buttons.workflow_fallback", "Tutorial workflow");
}

function getTutorialWorkflowParam() {
    try {
        const url = new URL(window.location.href);
        return normalizeWorkflowName(url.searchParams.get(TUTORIAL_QUERY_PARAM));
    } catch {
        return "";
    }
}

function clearTutorialWorkflowParam() {
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete(TUTORIAL_QUERY_PARAM);
        window.history.replaceState(window.history.state, document.title, url.toString());
    } catch {}
}

async function fetchTutorialWorkflowItems(node = null) {
    try {
        const response = await fetch(`/xcp/list/workflows?t=${Date.now()}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || response.statusText);
        const items = (Array.isArray(data.items) ? data.items : [])
            .map(normalizeWorkflowName)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
        if (node) {
            node._derpTutorialWorkflows = items;
            node._derpTutorialStatus = "";
        }
        return items;
    } catch (error) {
        console.warn("[derpTutorial] Failed to list tutorial workflows:", error);
        if (node) {
            node._derpTutorialWorkflows = [];
            node._derpTutorialStatus = tLocale("$derp_tutorial.messages.list_failed", "Could not list tutorial workflows.");
        }
        return [];
    }
}

function waitForLoadGraphData(attempt = 0) {
    if (typeof app.loadGraphData === "function") return Promise.resolve(true);
    if (attempt >= 40) return Promise.resolve(false);
    return new Promise((resolve) => {
        setTimeout(() => resolve(waitForLoadGraphData(attempt + 1)), 250);
    });
}

async function loadTutorialWorkflowFromQuery() {
    const workflowName = getTutorialWorkflowParam();
    if (!workflowName || window.__derpTutorialQueryLoadStarted) return false;
    window.__derpTutorialQueryLoadStarted = true;

    try {
        const hasLoader = await waitForLoadGraphData();
        if (!hasLoader) throw new Error(tLocale("$derp_tutorial.messages.loader_missing", "ComfyUI workflow loader was not ready."));
        const response = await fetch(`/xcp/load/workflows?name=${encodeURIComponent(workflowName)}&t=${Date.now()}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || response.statusText);
        if (!data.data) throw new Error(tLocale("$derp_tutorial.messages.load_empty", "Tutorial workflow file was empty."));
        await app.loadGraphData(data.data);
        clearTutorialWorkflowParam();
        return true;
    } catch (error) {
        console.error("[derpTutorial] Failed to load tutorial workflow:", error);
        window.__derpTutorialQueryLoadError = String(error?.message || error);
        return false;
    }
}

function buildTutorialWorkflowUrl(workflowName) {
    const url = new URL(window.location.href);
    url.searchParams.set(TUTORIAL_QUERY_PARAM, workflowName);
    return url.toString();
}

function launchTutorialWorkflow(node, workflowName) {
    const cleanName = normalizeWorkflowName(workflowName);
    if (!cleanName) return;
    const opened = window.open(buildTutorialWorkflowUrl(cleanName), "_blank", "noopener,noreferrer");
    if (!opened) {
        node._derpTutorialStatus = tLocale("$derp_tutorial.messages.popup_blocked", "Browser blocked the new tab. Allow popups for ComfyUI, then try again.");
        node._layoutMapHash = null;
        node.refreshNodeLayoutMap?.();
        node.requestDerpSync?.();
    }
}

function settleTutorialAutoHeight(node) {
    if (!node || node.properties?.autoHeight === false || node.properties?.contentCollapsed === true) return;
    settleDerpSizeBeforeDraw(node, {
        forceAutoHeight: true,
        suppressRequestSync: true,
    });
    node.requestDerpSync?.();
    node.setDirtyCanvas?.(true, true);
}

function normalizeTutorialSizing(node, options = {}) {
    if (!node?.properties) return;
    const width = Number(node.size?.[0] || node.properties.nodeSize?.[0]) || TUTORIAL_INITIAL_SIZE[0];
    const existingSizingVersion = Number(node.properties._derpTutorialSizingVersion) || 0;
    const hasSavedAutoHeight = Object.prototype.hasOwnProperty.call(node.properties, "deckSavedAutoHeight");
    const migrateBrokenInitialSizing = existingSizingVersion < TUTORIAL_SIZING_VERSION;
    const autoHeight = options.forceAutoHeight === true
        || migrateBrokenInitialSizing
        || (hasSavedAutoHeight ? node.properties.deckSavedAutoHeight === true : node.properties.autoHeight !== false);
    const height = autoHeight
        ? TUTORIAL_INITIAL_SIZE[1]
        : (Number(node.size?.[1] || node.properties.nodeSize?.[1]) || TUTORIAL_INITIAL_SIZE[1]);
    node.properties.autoWidth = false;
    node.properties.autoHeight = autoHeight;
    node.properties.nodeSize = [width, height];
    node.size = [width, height];
    delete node.properties.deckSavedAutoHeight;
    delete node.properties.deckForceAutoHeight;
    delete node.properties._derpPreferredAutoHeight;
    delete node.properties._derpMeasuredMinExpandedHeight;
    delete node.properties._minExpandedHeight;
    delete node.properties._savedExpandedHeight;
    node.properties._derpTutorialSizingVersion = TUTORIAL_SIZING_VERSION;
    node._preCollapseHeight = 0;
}

function hasTutorialNode() {
    return (app.graph?._nodes || []).some((node) => node?.type === "DerpTutorialNode" || node?.comfyClass === "DerpTutorialNode");
}

function placeTutorialNode(node) {
    const canvas = app.canvas;
    const scale = Number(canvas?.ds?.scale) || 1;
    const offset = canvas?.ds?.offset || [0, 0];
    const centerX = ((canvas?.canvas?.width || 800) / (2 * scale)) - (offset[0] || 0);
    const centerY = ((canvas?.canvas?.height || 600) / (2 * scale)) - (offset[1] || 0);
    node.pos = [Math.round(centerX - 180), Math.round(centerY - 130)];
}

function getTutorialLiteGraphType(liteGraph) {
    const registered = liteGraph?.registered_node_types || {};
    if (registered.DerpTutorialNode) return "DerpTutorialNode";
    for (const [typeName, nodeType] of Object.entries(registered)) {
        if (nodeType?.comfyClass === "DerpTutorialNode" || nodeType?.prototype?.comfyClass === "DerpTutorialNode") return typeName;
    }
    return window.__derpTutorialLiteGraphType || "";
}

function maybeAutoAddTutorialNode(attempt = 0) {
    if (window.__derpTutorialQueryLoadStarted) return;
    if (getTutorialWorkflowParam()) return;
    const graph = app.graph;
    const liteGraph = globalThis.LiteGraph;
    if (!graph || !liteGraph?.createNode) {
        if (attempt < 40) setTimeout(() => maybeAutoAddTutorialNode(attempt + 1), 250);
        return;
    }
    if (hasTutorialNode()) return;
    if (readNumericSetting(TUTORIAL_SUPPRESS_SETTING, 0) === DERP_TUTORIAL_MAJOR_VERSION) return;

    const nodeType = getTutorialLiteGraphType(liteGraph);
    if (!nodeType) {
        if (attempt < 40) setTimeout(() => maybeAutoAddTutorialNode(attempt + 1), 250);
        return;
    }

    const node = liteGraph.createNode(nodeType);
    if (!node) {
        if (attempt < 40) setTimeout(() => maybeAutoAddTutorialNode(attempt + 1), 250);
        return;
    }
    placeTutorialNode(node);
    graph.add(node);
    writeSetting(TUTORIAL_SEEN_SETTING, DERP_TUTORIAL_MAJOR_VERSION);
    settleTutorialAutoHeight(node);
    app.canvas?.setDirty?.(true, true);
}

function scheduleTutorialAutoAdd(delay = 500) {
    if (window.__derpTutorialAutoAddTimer) clearTimeout(window.__derpTutorialAutoAddTimer);
    window.__derpTutorialAutoAddTimer = setTimeout(() => {
        window.__derpTutorialAutoAddTimer = null;
        maybeAutoAddTutorialNode();
    }, delay);
}

function buildTutorialLayoutHash(node, vars) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const workflows = (node?._derpTutorialWorkflows || []).join("|");
    const status = String(node?._derpTutorialStatus || "");
    const suppress = node?.properties?.suppressAutoShow === true ? 1 : 0;
    const drawHeader = node?.properties?.drawHeader !== false ? 1 : 0;
    return [
        width,
        Number(vars.mW || 0).toFixed(2),
        Number(vars.mH || 0).toFixed(2),
        Number(vars.sH || 0).toFixed(2),
        Number(vars.pW || 0).toFixed(2),
        Number(vars.pH || 0).toFixed(2),
        workflows,
        status,
        suppress,
        drawHeader,
        window._xcpDerpSession,
    ].join("#");
}

app.registerExtension({
    name: "xcp.derpTutorial_Extension",
    async setup() {
        initDerpGlobalListener();
        const loadedFromQuery = await loadTutorialWorkflowFromQuery();
        if (!loadedFromQuery) scheduleTutorialAutoAdd();
    },

    async afterConfigureGraph() {
        if (window.__derpTutorialAfterStartupGraphConfigured) return;
        window.__derpTutorialAfterStartupGraphConfigured = true;
        scheduleTutorialAutoAdd(250);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DerpTutorialNode") return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        fatha(nodeType, nodeData, 260);
        nodeType.comfyClass = nodeData.name;
        nodeType.prototype.comfyClass = nodeData.name;
        window.__derpTutorialLiteGraphType = nodeType.type || nodeData.name;

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oY, pW, pH } = this.getDerpVars(this);
            const structureHash = buildTutorialLayoutHash(this, { mW, mH, sH, pW, pH });

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            const workflows = this._derpTutorialWorkflows || [];
            const workflowRows = workflows.length > 0
                ? Object.fromEntries(workflows.map((workflowName, index) => [`workflow_${index}`, {
                    type: this.UI_TYPES.BUTTON,
                    themeKey: "button, t_textNormal",
                    text: formatWorkflowLabel(workflowName),
                    toolTip: tLocale("$derp_tutorial.tooltips.launch_workflow", "Open this tutorial workflow in a new ComfyUI tab."),
                    width: "full",
                    height: "auto",
                    padding: [pW, pH],
                    mouseOver: true,
                    onPress: () => launchTutorialWorkflow(this, workflowName),
                }]))
                : {
                    workflowEmpty: {
                        type: this.UI_TYPES.BUTTON,
                        themeKey: "button, t_textSmall",
                        text: tLocale("$derp_tutorial.buttons.no_workflows", "No tutorial workflows found"),
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        state: "DIS",
                    }
                };

            this.layoutMap = {
                tutorialRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full",
                    height: "auto",
                    dir: "col",
                    margin: this.properties?.drawHeader !== false ? [mW, mH, mW, mH] : [mW, 0, mW, mH],
                    spacing: [0, sH],
                    introText: {
                        type: this.UI_TYPES.TEXT,
                        themeKey: "panel, t_textNormal",
                        text: tLocale("$derp_tutorial.intro", "Welcome to derp-UI. Pick a tutorial workflow below to open it in a fresh ComfyUI tab."),
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        wrap: true,
                        mouseOver: false,
                    },
                    workflowRegion: {
                        width: "full",
                        height: "auto",
                        dir: "col",
                        spacing: [0, sH],
                        ...workflowRows,
                    },
                    statusText: {
                        hidden: !this._derpTutorialStatus,
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textNormal",
                        text: this._derpTutorialStatus ? `{{t_text_error::${this._derpTutorialStatus}}}` : "",
                        width: "full",
                        height: "auto",
                        wrap: true,
                        mouseOver: false,
                    },
                    toggleBreak: {
                        type: this.UI_TYPES.LINEBREAK,
                        themeKey: "line",
                        width: "full",
                        height: 1,
                        margin: [-mW, 0],
                    },
                    suppressRow: {
                        width: "full",
                        height: "auto",
                        dir: "row",
                        suppressAutoShow: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSmall",
                            text: tLocale("$derp_tutorial.toggle.never_auto_show", "Do not auto show this tutorial again"),
                            toolTip: tLocale("$derp_tutorial.tooltips.never_auto_show", "Suppresses the tutorial auto-show for this major tutorial version."),
                            value: this.properties.suppressAutoShow === true,
                            state: this.properties.suppressAutoShow === true ? "ON" : "OFF",
                            isTextOnly: true,
                            mouseOver: false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                const next = this.properties.suppressAutoShow !== true;
                                this.properties.suppressAutoShow = next;
                                writeSetting(TUTORIAL_SUPPRESS_SETTING, next ? DERP_TUTORIAL_MAJOR_VERSION : 0);
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
            settleTutorialAutoHeight(this);
        };

        nodeType.prototype.syncDerpOutputs = function() {
            this.outputs = [];
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.properties.isWirelessTransmitter = false;
            this.outputs = [];

            this.titleLabel = tLocale("$derp_tutorial.title", "Derp Tutorial");
            this.properties.titleLabel = this.titleLabel;
            this.properties.suppressAutoShow = readNumericSetting(TUTORIAL_SUPPRESS_SETTING, 0) === DERP_TUTORIAL_MAJOR_VERSION;
            normalizeTutorialSizing(this, { forceAutoHeight: true });

            this.refreshNodeLayoutMap();
            settleTutorialAutoHeight(this);
            fetchTutorialWorkflowItems(this).then(() => {
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                settleTutorialAutoHeight(this);
                this.requestDerpSync?.();
            });
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];
            this.titleLabel = this.properties.titleLabel || tLocale("$derp_tutorial.title", "Derp Tutorial");
            this.properties.suppressAutoShow = readNumericSetting(TUTORIAL_SUPPRESS_SETTING, 0) === DERP_TUTORIAL_MAJOR_VERSION;
            normalizeTutorialSizing(this, { forceAutoHeight: true });

            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            settleTutorialAutoHeight(this);
            fetchTutorialWorkflowItems(this).then(() => {
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                settleTutorialAutoHeight(this);
                this.requestDerpSync?.();
            });
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;
        };
    }
});
