let _lastMouseX = 100, _lastMouseY = 100;
let _positionWatcher = null;
document.addEventListener("mousemove", (e) => { _lastMouseX = e.clientX; _lastMouseY = e.clientY; }, { passive: true });

function clientToGraph(clientX, clientY) {
    const canvas = window.app?.canvas;
    const rect = canvas?.canvas?.getBoundingClientRect?.();
    const ds = canvas?.ds;
    if (!rect || !ds) return null;
    const scale = ds.scale || 1;
    return [
        (clientX - rect.left) / scale - (ds.offset?.[0] || 0),
        (clientY - rect.top) / scale - (ds.offset?.[1] || 0),
    ];
}

function graphToClient(graphX, graphY) {
    const canvas = window.app?.canvas;
    const rect = canvas?.canvas?.getBoundingClientRect?.();
    const ds = canvas?.ds;
    if (!rect || !ds) return null;
    const scale = ds.scale || 1;
    return [
        rect.left + (graphX + (ds.offset?.[0] || 0)) * scale,
        rect.top + (graphY + (ds.offset?.[1] || 0)) * scale,
    ];
}

function clampMenuPosition(el, left, top) {
    const rect = el.getBoundingClientRect();
    let nextLeft = left;
    let nextTop = top;
    if (nextLeft + rect.width > window.innerWidth) nextLeft = window.innerWidth - rect.width - 8;
    if (nextTop + rect.height > window.innerHeight) nextTop = window.innerHeight - rect.height - 8;
    if (nextLeft < 4) nextLeft = 4;
    if (nextTop < 4) nextTop = 4;
    el.style.left = nextLeft + "px";
    el.style.top = nextTop + "px";
}

export function showFakeNestedMenu({ groups, headerText = "Select item:", currentText = null, clearText = null, onClear = null }) {
    removeBypassSignalPicker();
    if (!groups || groups.length === 0) return;

    const ctxMenu = document.querySelector(".comfy-context-menu, .p-contextmenu, [class*='context-menu']");
    const ctxMenuRect = ctxMenu?.getBoundingClientRect?.();
    const ctxClone = ctxMenu ? ctxMenu.cloneNode(true) : null;
    if (ctxClone) {
        ctxClone.id = "_xcpBypassCtxClone";
        ctxClone.style.pointerEvents = "none";
        ctxClone.style.opacity = "0.6";
        document.body.appendChild(ctxClone);
    }

    const container = document.createElement("div");
    container.id = "_xcpBypassPicker";
    container.style.cssText = "position:fixed;z-index:99999;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:4px 0;min-width:220px;max-height:70vh;overflow-y:auto;font:12px/1.4 sans-serif;color:#ccc;box-shadow:0 4px 16px rgba(0,0,0,0.5);";
    const anchorGraph = clientToGraph(_lastMouseX + 8, _lastMouseY) || null;
    let activeSourceItem = null;
    let ctxCloneOffset = null;

    const positionSignalMenu = () => {
        const signalMenu = document.getElementById("_xcpBypassSignalMenu");
        if (!signalMenu || !activeSourceItem) return;
        const anchorRect = activeSourceItem.getBoundingClientRect();
        const menuRect = signalMenu.getBoundingClientRect();
        let left = anchorRect.right + 4;
        let top = anchorRect.top;
        if (left + menuRect.width > window.innerWidth) left = anchorRect.left - menuRect.width - 4;
        clampMenuPosition(signalMenu, left, top);
    };

    const positionContextClone = () => {
        if (!ctxClone || !ctxCloneOffset) return;
        const containerRect = container.getBoundingClientRect();
        clampMenuPosition(ctxClone, containerRect.left + ctxCloneOffset.left, containerRect.top + ctxCloneOffset.top);
    };

    const positionMenus = () => {
        positionContextClone();
        if (anchorGraph) {
            const anchorClient = graphToClient(anchorGraph[0], anchorGraph[1]);
            if (anchorClient) clampMenuPosition(container, anchorClient[0], anchorClient[1]);
        }
        positionSignalMenu();
    };

    if (_positionWatcher) cancelAnimationFrame(_positionWatcher);
    const watchPositions = () => {
        if (!document.getElementById("_xcpBypassPicker")) {
            _positionWatcher = null;
            return;
        }
        positionMenus();
        _positionWatcher = requestAnimationFrame(watchPositions);
    };

    const header = document.createElement("div");
    header.style.cssText = "padding:6px 12px;color:#888;font-size:11px;border-bottom:1px solid #333;";
    header.textContent = currentText ? `Current: ${currentText}` : headerText;
    container.appendChild(header);

    const openSignalMenu = (group, anchorEl) => {
        const existing = document.getElementById("_xcpBypassSignalMenu");
        if (existing) existing.remove();
        container.querySelectorAll("[data-xcp-bypass-source]").forEach((el) => { el.style.background = ""; });
        activeSourceItem = anchorEl;
        anchorEl.style.background = "#333";

        const signalMenu = document.createElement("div");
        signalMenu.id = "_xcpBypassSignalMenu";
        signalMenu.style.cssText = "position:fixed;z-index:100000;background:#1a1a1a;border:1px solid #444;border-radius:6px;padding:4px 0;min-width:220px;max-height:70vh;overflow-y:auto;font:12px/1.4 sans-serif;color:#ccc;box-shadow:0 4px 16px rgba(0,0,0,0.5);";

        const title = document.createElement("div");
        title.style.cssText = "padding:6px 12px;color:#888;font-size:11px;border-bottom:1px solid #333;";
        title.textContent = group.label || "Items";
        signalMenu.appendChild(title);

        (group.items || []).forEach((entry) => {
            const item = document.createElement("div");
            item.style.cssText = "padding:6px 24px;cursor:pointer;color:#ccc;white-space:nowrap;";
            item.textContent = entry.label || "Item";
            item.onmouseenter = () => { item.style.background = "#333"; };
            item.onmouseleave = () => { item.style.background = ""; };
            item.onclick = (e) => {
                e.stopPropagation();
                if (typeof entry.callback === "function") entry.callback();
                removeBypassSignalPicker();
            };
            signalMenu.appendChild(item);
        });

        document.body.appendChild(signalMenu);

        positionSignalMenu();
    };

    groups.forEach((group) => {
        const item = document.createElement("div");
        item.dataset.xcpBypassSource = "1";
        item.style.cssText = "padding:6px 24px 6px 12px;cursor:pointer;color:#ccc;white-space:nowrap;display:flex;align-items:center;justify-content:space-between;gap:16px;";
        const label = document.createElement("span");
        label.textContent = group.label || "Group";
        const arrow = document.createElement("span");
        arrow.style.cssText = "color:#888;";
        arrow.textContent = ">";
        item.appendChild(label);
        item.appendChild(arrow);
        item.onmouseenter = () => { item.style.background = "#333"; };
        item.onmouseleave = () => {
            if (!document.getElementById("_xcpBypassSignalMenu")) item.style.background = "";
        };
        item.onclick = (e) => {
            e.stopPropagation();
            openSignalMenu(group, item);
        };
        container.appendChild(item);
    });

    if (clearText && typeof onClear === "function") {
        const clearDiv = document.createElement("div");
        clearDiv.style.cssText = "padding:6px 24px;cursor:pointer;color:#d44;border-top:1px solid #333;";
        clearDiv.textContent = clearText;
        clearDiv.onmouseenter = () => { clearDiv.style.background = "#422"; };
        clearDiv.onmouseleave = () => { clearDiv.style.background = ""; };
        clearDiv.onclick = (e) => {
            e.stopPropagation();
            onClear();
            removeBypassSignalPicker();
        };
        container.appendChild(clearDiv);
    }

    const closeDiv = document.createElement("div");
    closeDiv.style.cssText = "padding:6px 24px;cursor:pointer;color:#888;border-top:1px solid #333;text-align:center;";
    closeDiv.textContent = "Close";
    closeDiv.onmouseenter = () => { closeDiv.style.background = "#333"; closeDiv.style.color = "#ccc"; };
    closeDiv.onmouseleave = () => { closeDiv.style.background = ""; closeDiv.style.color = "#888"; };
    closeDiv.onclick = (e) => { e.stopPropagation(); removeBypassSignalPicker(); };
    container.appendChild(closeDiv);

    document.body.appendChild(container);

    let left = _lastMouseX + 8;
    let top = _lastMouseY;
    const contRect = container.getBoundingClientRect();
    if (left + contRect.width > window.innerWidth) left = _lastMouseX - contRect.width - 8;
    clampMenuPosition(container, left, top);
    if (ctxClone && ctxMenuRect) {
        const containerRect = container.getBoundingClientRect();
        ctxCloneOffset = {
            left: ctxMenuRect.left - containerRect.left,
            top: ctxMenuRect.top - containerRect.top,
        };
        positionContextClone();
    }

    const closeOnOutside = (e) => {
        const signalMenu = document.getElementById("_xcpBypassSignalMenu");
        if (!container.contains(e.target) && !signalMenu?.contains(e.target)) {
            removeBypassSignalPicker();
            document.removeEventListener("mousedown", closeOnOutside);
        }
    };
    const closeOnEsc = (e) => {
        if (e.key === "Escape") { removeBypassSignalPicker(); document.removeEventListener("keydown", closeOnEsc); }
    };
    requestAnimationFrame(() => {
        document.addEventListener("mousedown", closeOnOutside);
        document.addEventListener("keydown", closeOnEsc);
        watchPositions();
    });
}

export function showBypassSignalPicker({ groups, onSelect, onClear, currentSignal }) {
    showFakeNestedMenu({
        groups: (groups || []).map((group) => ({
            label: `${group.nodeName} [${group.baseId}]`,
            items: (group.signals || []).map((sig) => {
                const label = sig._label || `${sig.nodeName || sig.nodeId}`;
                return {
                    label,
                    callback: () => onSelect(sig, label),
                };
            }),
        })),
        headerText: "Select signal source:",
        currentText: currentSignal,
        clearText: currentSignal ? "Clear Remote Bypass" : null,
        onClear,
    });
}

function removeBypassSignalPicker() {
    if (_positionWatcher) {
        cancelAnimationFrame(_positionWatcher);
        _positionWatcher = null;
    }
    const el = document.getElementById("_xcpBypassPicker");
    if (el) el.remove();
    const signalMenu = document.getElementById("_xcpBypassSignalMenu");
    if (signalMenu) signalMenu.remove();
    const clone = document.getElementById("_xcpBypassCtxClone");
    if (clone) clone.remove();
}
