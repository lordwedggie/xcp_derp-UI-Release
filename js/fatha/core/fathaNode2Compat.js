import { app } from "../../../../scripts/app.js";

const NODE2_SUPPRESSED_ATTR = "data-xcp-fatha-node2-suppressed";

function isDerpCustomNode(node) {
    return !!(node?.isFathaNode || node?.isUncleNode);
}

function hasDocument() {
    return typeof document !== "undefined" && typeof document.querySelector === "function";
}

function hasWindow() {
    return typeof window !== "undefined";
}

function escapeAttrValue(value) {
    const raw = String(value ?? "");
    if (hasWindow() && window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(raw);
    return raw.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

export function isComfyVueNodesMode() {
    if (typeof LiteGraph !== "undefined" && !!LiteGraph.vueNodesMode) return true;
    if (!hasDocument()) return false;
    return !!document.querySelector(".lg-node[data-node-id]");
}

export function shouldMutateLegacySelectionForDraw() {
    return !isComfyVueNodesMode();
}

export function getNativeVueNodeElement(node) {
    if (!node || node.id === null || node.id === undefined || !hasDocument()) return null;
    const id = escapeAttrValue(node.id);
    return document.querySelector(`.lg-node[data-node-id="${id}"]`)
        || document.querySelector(`[data-node-id="${id}"]`);
}

function getGraphNodeByDomId(id) {
    if (id === null || id === undefined) return null;
    const graph = app?.graph || app?.rootGraph || null;
    return graph?.getNodeById?.(id) || graph?.getNodeById?.(Number(id)) || null;
}

function hideElement(el) {
    if (!el?.style) return;
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
}

function makeShellWrapperTransparent(el) {
    if (!el?.style) return;
    el.style.background = "transparent";
    el.style.backgroundColor = "transparent";
    el.style.borderColor = "transparent";
    el.style.boxShadow = "none";
}

function hideChildrenWithoutSlots(root) {
    if (!root?.children) return;
    Array.from(root.children).forEach((child) => {
        if (child.classList?.contains("lg-slot") || child.querySelector?.(".lg-slot")) return;
        hideElement(child);
    });
}

export function suppressNativeVueNodeShell(node) {
    if (!isDerpCustomNode(node) || !isComfyVueNodesMode()) return false;
    const el = getNativeVueNodeElement(node);
    if (!el) return false;

    if (!el.hasAttribute(NODE2_SUPPRESSED_ATTR)) {
        el.setAttribute(NODE2_SUPPRESSED_ATTR, "true");
        el.dataset.xcpFathaNodeId = String(node.id);
    }

    if (node.type === "xcpDerpSignalOut") {
        el.style.removeProperty("visibility");
        el.style.removeProperty("opacity");
        el.style.pointerEvents = "none";
        el.style.userSelect = "none";
        makeShellWrapperTransparent(el);

        hideChildrenWithoutSlots(el);

        el.querySelectorAll("[data-testid='node-state-outline-overlay'], [data-testid='node-inner-wrapper'] > :not([data-testid^='node-body-'])")
            .forEach(hideElement);

        el.querySelectorAll("[data-testid='node-inner-wrapper'], [data-testid^='node-body-']")
            .forEach((child) => {
                makeShellWrapperTransparent(child);
                hideChildrenWithoutSlots(child);
            });

        el.querySelectorAll(".lg-slot, .lg-slot *")
            .forEach((child) => {
                child.style.removeProperty("visibility");
                child.style.opacity = "0";
                child.style.pointerEvents = "none";
            });
        return true;
    }

    // Vue Nodes own a DOM shell that can retain stale outlines/position after
    // Derp custom nodes move directly through LiteGraph. Fatha/Uncle draw and handle their
    // own node UI, so the native shell must not render or receive events.
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    return true;
}

export function scheduleNativeVueNodeShellSuppression(node) {
    if (!isDerpCustomNode(node) || !hasWindow()) return;
    suppressNativeVueNodeShell(node);
    window.requestAnimationFrame?.(() => suppressNativeVueNodeShell(node));
}

export function markNode2LayoutDirty(node) {
    if (!node || !isComfyVueNodesMode()) return;
    node._forceSync = true;
    node.setDirtyCanvas?.(true, true);
    app?.canvas?.setDirty?.(true, true);
}
