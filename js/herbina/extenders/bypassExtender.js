/**
 * Path: ./js/bypassExtender.js
 * ROLE: Adds remote BOOL-driven bypass control to default ComfyUI nodes.
 */
import { app } from "../../../../../scripts/app.js";
import { showBypassSignalPicker } from "./helpers/bypassSignalPicker.js";

const REMOTE_BYPASS_MENU = "\uD83D\uDD1E Apply Derp Remote Bypass \u21C4";
const REMOTE_BYPASS_CLEAR = "\u21C4 Clear Derp Remote Bypass";
const REMOTE_BYPASS_META = "derpRemoteBypass";
const REMOTE_BYPASS_TITLE_SUFFIX = " \u21C4";
const remoteBypassGroups = new Set();

function isVueNodesMode() {
    return !!(typeof LiteGraph !== "undefined" && LiteGraph.vueNodesMode);
}

function isGraphGroup(entity) {
    return !!(entity && !Array.isArray(entity.inputs) && !Array.isArray(entity.outputs) && getGroupBounds(entity));
}

function rectToBounds(rect) {
    if (!rect) return null;
    if (Array.isArray(rect) || ArrayBuffer.isView(rect)) return [rect[0], rect[1], rect[2], rect[3]].map(Number);
    if (typeof rect.x === "number" && typeof rect.y === "number") {
        return [rect.x, rect.y, Number(rect.width ?? rect.w ?? 0), Number(rect.height ?? rect.h ?? 0)];
    }
    if (Array.isArray(rect.pos) && Array.isArray(rect.size)) return [rect.pos[0], rect.pos[1], rect.size[0], rect.size[1]].map(Number);
    return null;
}

function isArrayLikeVec(value) {
    return Array.isArray(value) || ArrayBuffer.isView(value);
}

function getVec2(value) {
    return isArrayLikeVec(value) ? [Number(value[0]), Number(value[1])] : null;
}

function getGroupBounds(group) {
    if (!group) return null;
    if (isArrayLikeVec(group.pos) && isArrayLikeVec(group.size)) return [group.pos[0], group.pos[1], group.size[0], group.size[1]].map(Number);
    return rectToBounds(group.boundingRect) || rectToBounds(group._boundingRect) || rectToBounds(group.bounding) || null;
}

function getActiveGraph() {
    return app?.graph || window.app?.graph || app?.canvas?.graph || window.app?.canvas?.graph || window.LiteGraph?.LGraphCanvas?.active_canvas?.graph || null;
}

function getGraphGroups() {
    const graph = getActiveGraph();
    const groups = [];
    const seen = new Set();
    const addGroup = (group) => {
        if (!isGraphGroup(group) || seen.has(group)) return;
        seen.add(group);
        groups.push(group);
    };

    if (Array.isArray(graph?.groups)) graph.groups.forEach(addGroup);
    if (Array.isArray(graph?._groups)) graph._groups.forEach(addGroup);
    if (isGraphGroup(app?.canvas?.selected_group)) addGroup(app.canvas.selected_group);
    if (isGraphGroup(window.app?.canvas?.selected_group)) addGroup(window.app.canvas.selected_group);
    remoteBypassGroups.forEach(addGroup);
    return groups;
}

function getNodeCenter(node) {
    const bounds = getNodeBounds(node);
    if (!bounds) return null;
    return [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2];
}

function getNodeBounds(node) {
    const bounds = rectToBounds(node?.boundingRect) || rectToBounds(node?._boundingRect) || rectToBounds(node?.bounding);
    if (bounds) return bounds;
    const pos = getVec2(node?.pos);
    const size = getVec2(node?.size);
    if (!pos || !size) return null;
    return [pos[0], pos[1], size[0], size[1]];
}

function getGraphNodes() {
    const graph = getActiveGraph();
    return graph?._nodes || graph?.nodes || [];
}

function isLiteGraphNode(entity) {
    return !!(entity && getNodeBounds(entity) && (Array.isArray(entity.inputs) || Array.isArray(entity.outputs) || entity.id !== undefined));
}

function isPointInGroup(group, point) {
    if (!group || !point) return false;
    if (typeof group.isPointInside === "function") return group.isPointInside(point[0], point[1]);

    const bounds = getGroupBounds(group);
    if (!bounds) return false;
    const [x, y, w, h] = bounds;
    return point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h;
}

function isNodeInGroupBounds(group, node) {
    if (isPointInGroup(group, getNodeCenter(node))) return true;

    const groupBounds = getGroupBounds(group);
    const nodeBounds = getNodeBounds(node);
    if (!groupBounds || !nodeBounds) return false;

    const [gx, gy, gw, gh] = groupBounds;
    const [nx, ny, nw, nh] = nodeBounds;
    return nx < gx + gw && nx + nw > gx && ny < gy + gh && ny + nh > gy;
}

function getSignalRegistry() {
    return window.xcpDerpSignals || {};
}

function normalizeSignalType(rawType) {
    if (Array.isArray(rawType)) return String(rawType[0] || "unknown").toLowerCase();
    if (typeof rawType === "string") return rawType.toLowerCase();
    if (rawType && typeof rawType.name === "string") return rawType.name.toLowerCase();
    return String(rawType || "unknown").toLowerCase();
}

function isBoolSignal(sig) {
    if (!sig) return false;
    const type = normalizeSignalType(sig.type);
    if (type === "bool" || type === "boolean") return true;
    return typeof sig.value === "boolean";
}

function getBoolSignals() {
    return Object.values(getSignalRegistry())
        .filter((sig) => sig && isBoolSignal(sig))
        .sort((a, b) => String(a.nodeName || "").localeCompare(String(b.nodeName || ""), undefined, { numeric: true, sensitivity: "base" }));
}

function formatBypassSignalLabel(sig) {
    const rawName = String(sig?.nodeName || sig?.nodeId || "");
    const match = rawName.match(/^(.*)\s\[([^\]]+)\]$/);
    if (!match) return rawName;

    const nodeName = match[1].trim();
    const signalName = match[2].trim();
    if (!signalName || signalName === "BOOL_OUT") return nodeName;
    return `${nodeName}: ${signalName}`;
}

function getRemoteBypassState(entity) {
    if (isGraphGroup(entity)) return entity.flags?.[REMOTE_BYPASS_META] || null;
    return entity?.properties?.[REMOTE_BYPASS_META] || null;
}

function stripRemoteBypassTitleSuffix(title) {
    let cleanTitle = String(title || "");
    while (cleanTitle.endsWith(REMOTE_BYPASS_TITLE_SUFFIX)) {
        cleanTitle = cleanTitle.slice(0, -REMOTE_BYPASS_TITLE_SUFFIX.length);
    }
    return cleanTitle;
}

function getEntityTitleKey(entity) {
    if (!entity) return null;
    if (typeof entity.title === "string") return "title";
    if (typeof entity.titleLabel === "string") return "titleLabel";
    if (typeof entity._title === "string") return "_title";
    if (typeof entity.name === "string") return "name";
    return null;
}

function setRemoteBypassTitleSuffix(entity, enabled) {
    const key = getEntityTitleKey(entity);
    if (!key) return;
    const baseTitle = stripRemoteBypassTitleSuffix(entity[key]);
    entity[key] = enabled ? `${baseTitle}${REMOTE_BYPASS_TITLE_SUFFIX}` : baseTitle;

    if (!isGraphGroup(entity) && entity.properties?.titleLabel && key === "titleLabel") {
        entity.properties.titleLabel = entity[key];
    }
}

function notifyRemoteBypassSource(signalId) {
    if (!signalId) return;
    const baseId = parseInt(String(signalId).split(":")[0], 10);
    const sourceNode = app?.graph?.getNodeById?.(baseId);
    if (sourceNode && typeof sourceNode.refreshNodeLayoutMap === "function") {
        sourceNode.refreshNodeLayoutMap();
    }
}

function setRemoteBypassState(entity, nextState) {
    if (isGraphGroup(entity)) {
        remoteBypassGroups.add(entity);
        entity.flags = entity.flags || {};
        if (nextState) entity.flags[REMOTE_BYPASS_META] = nextState;
        else delete entity.flags[REMOTE_BYPASS_META];
        setRemoteBypassTitleSuffix(entity, !!nextState);
        return;
    }

    const prevSignalId = entity.properties?.[REMOTE_BYPASS_META]?.signalId;
    const nextSignalId = nextState?.signalId;

    entity.properties = entity.properties || {};
    if (nextState) entity.properties[REMOTE_BYPASS_META] = nextState;
    else delete entity.properties[REMOTE_BYPASS_META];
    setRemoteBypassTitleSuffix(entity, !!nextState);

    if (prevSignalId && prevSignalId !== nextSignalId) notifyRemoteBypassSource(prevSignalId);
    if (nextSignalId) notifyRemoteBypassSource(nextSignalId);
}

function getSignalById(signalId) {
    if (!signalId) return null;
    return getSignalRegistry()[String(signalId)] || null;
}

function markNodeDirty(node) {
    if (node?.setDirtyCanvas) node.setDirtyCanvas(true, true);
    if (app?.graph?.change) app.graph.change();
}

function markEntityDirty(entity) {
    if (entity?.setDirtyCanvas) entity.setDirtyCanvas(true, true);
    if (app?.graph?.change) app.graph.change();
}

function getGroupNodes(group) {
    if (!group) return [];
    try {
        if (typeof group.recomputeInsideNodes === "function") group.recomputeInsideNodes();
    } catch (e) {}

    const found = new Set();
    const addNode = (node) => {
        if (isLiteGraphNode(node)) found.add(node);
    };

    if (Array.isArray(group.nodes)) group.nodes.forEach(addNode);
    if (Array.isArray(group._nodes)) group._nodes.forEach(addNode);
    if (group.children && typeof group.children.forEach === "function") group.children.forEach(addNode);
    if (group._children && typeof group._children.forEach === "function") group._children.forEach(addNode);

    getGraphNodes().forEach((node) => {
        if (isLiteGraphNode(node) && isNodeInGroupBounds(group, node)) found.add(node);
    });

    return [...found];
}

function setEntityMode(entity, desiredMode) {
    if (isGraphGroup(entity)) {
        let changed = false;
        getGroupNodes(entity).forEach((node) => {
            if (node.mode !== desiredMode) {
                const changedByApi = typeof node.changeMode === "function" ? node.changeMode(desiredMode) : false;
                if (!changedByApi) node.mode = desiredMode;
                changed = true;
                if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
            }
        });
        return changed;
    }

    if (entity.mode === desiredMode) return false;
    entity.mode = desiredMode;
    return true;
}

function applyRemoteBypass(entity) {
    const state = getRemoteBypassState(entity);
    if (!state?.signalId) return;
    const sig = getSignalById(state.signalId);

    if (!sig || !isBoolSignal(sig)) {
        const sourceBaseId = String(state.signalId).split(":")[0];
        const sourceNodeExists = !!app?.graph?.getNodeById?.(parseInt(sourceBaseId, 10));
        if (sig && sourceNodeExists && sig.value == null) {
            setEntityMode(entity, 4);
            setRemoteBypassState(entity, { ...state, missing: false });
            markEntityDirty(entity);
            return;
        }

        if (state.missing !== true) {
            setRemoteBypassState(entity, { ...state, missing: true });
            markEntityDirty(entity);
            return;
        }

        if (sourceNodeExists) return;

        setEntityMode(entity, 0);
        setRemoteBypassState(entity, null);
        markEntityDirty(entity);
        return;
    }

    const desiredMode = sig.value === true ? 0 : 4;
    const missing = false;
    const nextLabel = formatBypassSignalLabel(sig) || state.signalLabel || state.signalId;
    const nextState = {
        signalId: String(sig.nodeId),
        signalLabel: nextLabel,
        missing,
    };

    const didMetaChange = state.signalLabel !== nextState.signalLabel || state.missing !== nextState.missing;
    if (didMetaChange) setRemoteBypassState(entity, nextState);

    if (setEntityMode(entity, desiredMode)) {
        markEntityDirty(entity);
        return;
    }

    if (didMetaChange) markEntityDirty(entity);
}

function getBypassSignalGroups() {
    const boolSignals = getBoolSignals();
    const groups = new Map();
    boolSignals.forEach((sig) => {
        const baseId = String(sig.nodeId).split(":")[0];
        if (!groups.has(baseId)) groups.set(baseId, { nodeName: null, baseId, signals: [] });
        const group = groups.get(baseId);
        if (!group.nodeName) {
            const nodeLabel = formatBypassSignalLabel(sig);
            const match = nodeLabel.match(/^(.+?)(?:\s*\[(\d+)\]|\s*:.*)?$/);
            group.nodeName = match ? match[1].trim() : (sig.nodeName || `Node ${baseId}`);
        }
        const label = formatBypassSignalLabel(sig) || `${sig.nodeName || sig.nodeId}`;
        group.signals.push({ ...sig, _label: label });
    });
    return [...groups.values()];
}

function buildSignalOptions(entity, _current) {
    const boolSignals = getBoolSignals();
    const current = _current || getRemoteBypassState(entity);

    // Group signals by their source node (base ID before ":")
    const groups = new Map();
    boolSignals.forEach((sig) => {
        const baseId = String(sig.nodeId).split(":")[0];
        if (!groups.has(baseId)) groups.set(baseId, { nodeName: null, signals: [] });
        const group = groups.get(baseId);
        if (!group.nodeName) {
            const nodeLabel = formatBypassSignalLabel(sig);
            const match = nodeLabel.match(/^(.+?)(?:\s*\[(\d+)\]|\s*:.*)?$/);
            group.nodeName = match ? match[1].trim() : (sig.nodeName || `Node ${baseId}`);
        }
        group.signals.push(sig);
    });

    const nodeOptions = [];
    groups.forEach((group, baseId) => {
        const signalEntries = group.signals.map((sig) => {
            const label = formatBypassSignalLabel(sig) || `${sig.nodeName || sig.nodeId}`;
            const shortLabel = label.replace(new RegExp(`^${group.nodeName}\\s*[:-]?\\s*`), "") || label;
            return { content: shortLabel, callback: () => {
                setRemoteBypassState(entity, {
                    signalId: String(sig.nodeId),
                    signalLabel: label,
                    missing: false,
                });
                applyRemoteBypass(entity);
                markEntityDirty(entity);
            } };
        });
        nodeOptions.push({
            content: `${group.nodeName} [${baseId}]`,
            has_submenu: true,
            submenu: { options: signalEntries }
        });
    });

    if (nodeOptions.length === 0) {
        nodeOptions.push({ content: "(No BOOL wireless signals found)", disabled: true });
    }

    if (current?.signalId && current?.missing) {
        nodeOptions.unshift({ content: `Current: ${current.signalLabel || current.signalId} (missing)`, disabled: true });
    } else if (current?.signalId) {
        nodeOptions.unshift({ content: `Current: ${current.signalLabel || current.signalId}`, disabled: true });
    }

    if (current?.signalId) {
        nodeOptions.push(null);
        nodeOptions.push({ content: REMOTE_BYPASS_CLEAR, callback: () => {
            setRemoteBypassState(entity, null);
            markEntityDirty(entity);
        } });
    }

    return nodeOptions;
}

function appendRemoteBypassMenuOptions(entity, options) {
    if (!entity || !Array.isArray(options)) return options;
    if (isGraphGroup(entity)) remoteBypassGroups.add(entity);
    if (options.some((item) => item?.content === REMOTE_BYPASS_MENU)) return options;

    const current = getRemoteBypassState(entity);
    if (isVueNodesMode()) {
        const sigCurrent = current?.signalId ? (current.signalLabel || current.signalId) : null;
        const groups = getBypassSignalGroups();
        options.push({
            content: REMOTE_BYPASS_MENU,
            callback: () => showBypassSignalPicker({
                groups, currentSignal: sigCurrent,
                onSelect: (sig, label) => {
                    setRemoteBypassState(entity, { signalId: String(sig.nodeId), signalLabel: label, missing: false });
                    applyRemoteBypass(entity); markEntityDirty(entity);
                },
                onClear: () => { setRemoteBypassState(entity, null); markEntityDirty(entity); }
            })
        });
    } else {
        options.push(null);
        options.push({
            content: REMOTE_BYPASS_MENU,
            has_submenu: true,
            submenu: {
                options: buildSignalOptions(entity, current)
            }
        });
    }

    return options;
}

function getGraphPointFromEvent(canvas, event) {
    if (!canvas || !event) return null;
    if (typeof canvas.convertEventToCanvasOffset === "function") return canvas.convertEventToCanvasOffset(event);

    const canvasEl = canvas.canvas;
    const rect = canvasEl?.getBoundingClientRect?.();
    const ds = canvas.ds;
    if (!rect || !ds) return null;
    return [
        (event.clientX - rect.left) / (ds.scale || 1) - (ds.offset?.[0] || 0),
        (event.clientY - rect.top) / (ds.scale || 1) - (ds.offset?.[1] || 0),
    ];
}

function getContextMenuGroup(options = {}) {
    const canvas = options.canvas || window?.LiteGraph?.LGraphCanvas?.active_canvas || app?.canvas;
    const graph = canvas?.graph || getActiveGraph();
    const event = options.event;

    if (isGraphGroup(options.node)) return options.node;
    if (isGraphGroup(options.group)) return options.group;
    if (isGraphGroup(canvas?.selected_group)) return canvas.selected_group;

    const graphPoint = getGraphPointFromEvent(canvas, event);
    if (graphPoint && typeof graph?.getGroupOnPos === "function") {
        const group = graph.getGroupOnPos(graphPoint[0], graphPoint[1]);
        if (isGraphGroup(group)) return group;
    }

    const groups = getGraphGroups();
    if (graphPoint) {
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            if (typeof group?.isPointInside === "function" && group.isPointInside(graphPoint[0], graphPoint[1])) return group;
        }
    }

    return null;
}

function looksLikeGroupMenu(values) {
    if (!Array.isArray(values)) return false;
    const labels = new Set(values.filter(Boolean).map((item) => String(item?.content || item)));
    return (labels.has("Pin") || labels.has("Unpin")) && labels.has("Title") && labels.has("Color") && labels.has("Remove");
}

function looksLikeCanvasGroupMenu(values) {
    if (!Array.isArray(values)) return false;
    const labels = new Set(values.filter(Boolean).map((item) => String(item?.content || item)));
    return labels.has("Add Node") && labels.has("Add Group") && labels.has("Edit Group");
}

function applyRemoteBypassGroups() {
    const groups = getGraphGroups();
    groups.forEach((group) => {
        if (getRemoteBypassState(group)?.signalId) applyRemoteBypass(group);
    });
}

function patchGroupMenu() {
    const groupProto = window?.LiteGraph?.LGraphGroup?.prototype;
    if (!groupProto || groupProto._xcpRemoteBypassPatched) return;
    groupProto._xcpRemoteBypassPatched = true;

    const getMenuOptions = groupProto.getMenuOptions;
    groupProto.getMenuOptions = function() {
        remoteBypassGroups.add(this);
        const options = getMenuOptions ? getMenuOptions.apply(this, arguments) : [];
        return appendRemoteBypassMenuOptions(this, options);
    };
}

function patchGroupInstanceMenu(group) {
    if (!isGraphGroup(group) || group._xcpRemoteBypassPatched) return;
    group._xcpRemoteBypassPatched = true;

    const getMenuOptions = group.getMenuOptions;
    group.getMenuOptions = function() {
        remoteBypassGroups.add(this);
        const options = getMenuOptions ? getMenuOptions.apply(this, arguments) : [];
        return appendRemoteBypassMenuOptions(this, options);
    };
}

function patchCanvasGroupContextMenu() {
    const canvasProto = window?.LiteGraph?.LGraphCanvas?.prototype;
    if (!canvasProto || canvasProto._xcpRemoteBypassGroupContextPatched) return;
    const processContextMenu = canvasProto.processContextMenu;
    if (typeof processContextMenu !== "function") return;

    canvasProto._xcpRemoteBypassGroupContextPatched = true;
    canvasProto.processContextMenu = function(node, event) {
        const graph = this.graph || app?.graph;
        const x = event?.canvasX ?? event?.canvas?.[0];
        const y = event?.canvasY ?? event?.canvas?.[1];
        const group = !node && graph && Number.isFinite(x) && Number.isFinite(y) && typeof graph.getGroupOnPos === "function"
            ? graph.getGroupOnPos(x, y)
            : null;
        if (group) {
            remoteBypassGroups.add(group);
            patchGroupInstanceMenu(group);
            event._xcpRemoteBypassGroup = group;
        }
        return processContextMenu.apply(this, arguments);
    };
}

function patchContextMenuFallback() {
    const liteGraph = window?.LiteGraph;
    const ContextMenu = liteGraph?.ContextMenu;
    if (!liteGraph || !ContextMenu || ContextMenu._xcpRemoteBypassPatched) return;

    function PatchedContextMenu(values, options = {}) {
        let nextValues = values;
        const group = options?.event?._xcpRemoteBypassGroup || getContextMenuGroup(options);
        if (group && (looksLikeGroupMenu(values) || looksLikeCanvasGroupMenu(values))) {
            remoteBypassGroups.add(group);
            nextValues = [...values];
            appendRemoteBypassMenuOptions(group, nextValues);
        }

        return Reflect.construct(ContextMenu, [nextValues, options], new.target || ContextMenu);
    }

    Object.setPrototypeOf(PatchedContextMenu, ContextMenu);
    PatchedContextMenu.prototype = ContextMenu.prototype;
    PatchedContextMenu._xcpRemoteBypassPatched = true;
    PatchedContextMenu._xcpRemoteBypassOriginal = ContextMenu;
    liteGraph.ContextMenu = PatchedContextMenu;
}

function patchRemoteBypassMenus() {
    patchGroupMenu();
    patchCanvasGroupContextMenu();
    patchContextMenuFallback();
}

// ===== Vue/Node 2.0 GROUP MENU AUGMENTER =====
// In Vue mode ComfyUI renders the group context menu via its Vue component and never
// calls the legacy LGraphGroup.getMenuOptions / processContextMenu / ContextMenu paths
// that patchGroupMenu / patchCanvasGroupContextMenu / patchContextMenuFallback hook. So
// we add a passive capture-phase contextmenu listener that detects group right-clicks,
// a MutationObserver that finds ComfyUI's rendered Vue menu DOM, and we append the
// bypass row by cloning an existing menu item (style parity regardless of menu lib).
let _pendingGroupRightClick = null;
let _groupMenuObserver = null;
let _xcpVueGroupAugmenterInstalled = false;

function isPointInBounds(bounds, point) {
    if (!bounds || !point) return false;
    const [x, y, w, h] = bounds;
    return point[0] >= x && point[0] <= x + w && point[1] >= y && point[1] <= y + h;
}

function onCanvasContext(event) {
    const canvas = window.app?.canvas;
    const graphPoint = getGraphPointFromEvent(canvas, event);
    if (!graphPoint) return;

    const graph = getActiveGraph();

    // Node-target short-circuit: if a node is under the cursor, ComfyUI shows the node
    // menu which already carries the bypass entry via getExtraMenuOptions (patched in
    // beforeRegisterNodeDef). Skipping here prevents a duplicate row on node right-clicks
    // that happen to fall inside a group.
    let nodeUnder = null;
    if (graph && typeof graph.getNodeOnPos === "function") {
        nodeUnder = graph.getNodeOnPos(graphPoint[0], graphPoint[1]);
    }
    if (!nodeUnder && Array.isArray(graph?._nodes)) {
        for (const n of graph._nodes) {
            if (isLiteGraphNode(n) && isPointInBounds(getNodeBounds(n), graphPoint)) { nodeUnder = n; break; }
        }
    }
    if (nodeUnder) return;

    const group = getContextMenuGroup({ canvas, event });
    if (!isGraphGroup(group)) return;

    _pendingGroupRightClick = {
        group,
        ts: Date.now(),
        clientX: event.clientX,
        clientY: event.clientY,
    };
    ensureGroupMenuObserver();
}

function findVueContextMenu(clientX, clientY) {
    const candidates = document.querySelectorAll(".comfy-context-menu, .p-contextmenu, [class*='context-menu']");
    if (!candidates || candidates.length === 0) return null;
    // Prefer the menu whose rect contains the right-click coordinates; fall back to the
    // first match (a menu that just opened at the cursor is usually the first candidate).
    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            return el;
        }
    }
    return candidates[0];
}

function stopGroupMenuObserver() {
    if (_groupMenuObserver) {
        _groupMenuObserver.disconnect();
        _groupMenuObserver = null;
    }
}

function ensureGroupMenuObserver() {
    if (_groupMenuObserver) return;
    _groupMenuObserver = new MutationObserver(() => {
        if (!_pendingGroupRightClick) return;
        if (Date.now() - _pendingGroupRightClick.ts > 1200) {
            _pendingGroupRightClick = null;
            stopGroupMenuObserver();
            return;
        }
        const menu = findVueContextMenu(_pendingGroupRightClick.clientX, _pendingGroupRightClick.clientY);
        if (!menu) return;
        injectBypassRow(menu, _pendingGroupRightClick.group);
        _pendingGroupRightClick = null;
        stopGroupMenuObserver();
    });
    _groupMenuObserver.observe(document.body, { childList: true, subtree: true });
}

function injectBypassRow(menu, group) {
    if (!menu || !group) return;
    if (menu.querySelector("[data-xcp-bypass-group]")) return;

    // Reuse the existing Vue-mode entry builder: returns [{content, callback}] in Vue
    // mode, where callback opens showBypassSignalPicker with onSelect/onClear already
    // wired to setRemoteBypassState + applyRemoteBypass + markEntityDirty.
    const entries = appendRemoteBypassMenuOptions(group, []) || [];
    const entry = entries.find((item) => item && item.content === REMOTE_BYPASS_MENU);
    if (!entry || typeof entry.callback !== "function") return;

    // Clone an existing menu item for style parity. Preserve the INNER clickable
    // structure (PrimeVue puts pointer-events on the <a class="p-menuitem-link">, not
    // the <li> — stripping the inner element left the row visible but non-clickable,
    // so the entry showed but "could not be selected"). Replace only the text and
    // wire our callback on every clickable level.
    const sample = menu.querySelector("li, .p-menuitem, [class*='menu-item'], .comfy-menu-item") || menu.lastElementChild;
    if (!sample) return;
    const row = sample.cloneNode(true);
    row.dataset.xcpBypassGroup = "1";
    if (row.removeAttribute) row.removeAttribute("id");
    else row.id = "";

    // Drop any icon children (we have no glyph to show) but keep the link wrapper.
    row.querySelectorAll(".p-menuitem-icon, [class*='menu-icon'], [class*='icon']").forEach((el) => el.remove());

    // Find the text-bearing element. Try common PrimeVue/comfy classes first, then
    // fall back to the innermost link/span, then the row itself.
    const textEl =
        row.querySelector(".p-menuitem-text") ||
        row.querySelector("[class*='menuitem-text']") ||
        row.querySelector("[class*='menu-item-text']") ||
        row.querySelector(".p-menuitem-link, [class*='menuitem-link']") ||
        row.querySelector("a, span, div") ||
        row;
    while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
    textEl.textContent = entry.content;

    // Strip href/role that could trigger navigation or focus stealing on the cloned link.
    row.querySelectorAll("a[href]").forEach((a) => a.removeAttribute("href"));

    // Wire the click on EVERY clickable level (the inner link AND the row) so
    // regardless of which element receives the pointerdown, our callback fires.
    const handler = (e) => {
        e.stopPropagation();
        e.preventDefault();
        try { entry.callback(); } catch (_err) { /* keep menu stable on error */ }
    };
    row.addEventListener("click", handler);
    row.querySelectorAll("a, .p-menuitem-link, [class*='menuitem-link'], [role='menuitem']").forEach((el) => {
        el.addEventListener("click", handler);
        el.addEventListener("mouseup", (e) => { e.stopPropagation(); });
    });

    // Defeat any CSS that disables pointer events on dynamically-added children.
    row.style.pointerEvents = "auto";
    row.style.cursor = "pointer";
    row.querySelectorAll("*").forEach((el) => { el.style.pointerEvents = "auto"; });

    const parent = sample.parentNode || menu;
    parent.appendChild(row);
}

function installVueGroupMenuAugmenter() {
    if (_xcpVueGroupAugmenterInstalled) return;
    if (typeof document === "undefined") return;
    _xcpVueGroupAugmenterInstalled = true;
    document.addEventListener("contextmenu", onCanvasContext, true);
}

window.xcpApplyRemoteBypassGroups = applyRemoteBypassGroups;

app.registerExtension({
    name: "xcp.RemoteBypassExtender",
    async setup() {
        patchRemoteBypassMenus();
        [0, 250, 1000].forEach((delay) => setTimeout(patchRemoteBypassMenus, delay));
        // Vue/Node 2.0 group menu augmenter: the legacy LiteGraph patches above don't
        // fire for groups in Vue mode. Install a DOM-level contextmenu listener that
        // appends the bypass row to ComfyUI's rendered Vue menu. Retry once at 1500ms
        // to cover late Vue boot (LiteGraph.vueNodesMode may not be set yet at setup).
        const tryInstallVueGroupAugmenter = () => { if (isVueNodesMode()) installVueGroupMenuAugmenter(); };
        tryInstallVueGroupAugmenter();
        setTimeout(tryInstallVueGroupAugmenter, 1500);
        if (!app?.graph) return;

        const originalOnNodeAdded = app.graph.onNodeAdded;
        app.graph.onNodeAdded = function(node) {
            if (originalOnNodeAdded) originalOnNodeAdded.apply(this, arguments);
            if (node?.properties?.[REMOTE_BYPASS_META]?.signalId && typeof node.applyRemoteBypassSignal === "function") {
                node.applyRemoteBypassSignal();
            }
        };

        applyRemoteBypassGroups();
    },
    async beforeRegisterNodeDef(nodeType) {
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);
            if (this.isFathaNode || this.isUncleNode) return options;

            const node = this;
            const current = getRemoteBypassState(node);

            if (isVueNodesMode()) {
                const sigCurrent = current?.signalId ? (current.signalLabel || current.signalId) : null;
                const groups = getBypassSignalGroups();
                options.push({
                    content: REMOTE_BYPASS_MENU,
                    callback: () => showBypassSignalPicker({
                        groups, currentSignal: sigCurrent,
                        onSelect: (sig, label) => {
                            setRemoteBypassState(node, { signalId: String(sig.nodeId), signalLabel: label, missing: false });
                            applyRemoteBypass(node); markEntityDirty(node);
                        },
                        onClear: () => { setRemoteBypassState(node, null); markNodeDirty(node); }
                    })
                });
            } else {
                options.push({
                    content: REMOTE_BYPASS_MENU,
                    has_submenu: true,
                    submenu: {
                        options: buildSignalOptions(node, current)
                    }
                });
            }

            return options;
        };

        nodeType.prototype.applyRemoteBypassSignal = function() {
            applyRemoteBypass(this);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            if (getRemoteBypassState(this)?.signalId) {
                applyRemoteBypass(this);
            }
        };

        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function() {
            if (onAdded) onAdded.apply(this, arguments);
            if (getRemoteBypassState(this)?.signalId) {
                applyRemoteBypass(this);
            }
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            if (onRemoved) onRemoved.apply(this, arguments);
            setRemoteBypassState(this, null);
        };
    }
});