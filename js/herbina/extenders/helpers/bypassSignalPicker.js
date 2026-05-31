let _lastMouseX = 100, _lastMouseY = 100;
document.addEventListener("mousemove", (e) => { _lastMouseX = e.clientX; _lastMouseY = e.clientY; }, { passive: true });

export function showBypassSignalPicker({ groups, onSelect, onClear, currentSignal }) {
    removeBypassSignalPicker();
    if (!groups || groups.length === 0) return;

    const ctxMenu = document.querySelector(".comfy-context-menu, .p-contextmenu, [class*='context-menu']");
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

    const header = document.createElement("div");
    header.style.cssText = "padding:6px 12px;color:#888;font-size:11px;border-bottom:1px solid #333;";
    header.textContent = currentSignal ? `Current: ${currentSignal}` : "Select signal source:";
    container.appendChild(header);

    groups.forEach((group) => {
        const grpHeader = document.createElement("div");
        grpHeader.style.cssText = "padding:4px 12px;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #2a2a2a;";
        grpHeader.textContent = `${group.nodeName} [${group.baseId}]`;
        container.appendChild(grpHeader);

        group.signals.forEach((sig) => {
            const label = sig._label || `${sig.nodeName || sig.nodeId}`;
            const item = document.createElement("div");
            item.style.cssText = "padding:6px 24px;cursor:pointer;color:#ccc;";
            item.textContent = `  ${label}`;
            item.onmouseenter = () => { item.style.background = "#333"; };
            item.onmouseleave = () => { item.style.background = ""; };
            item.onclick = (e) => {
                e.stopPropagation();
                onSelect(sig, label);
                removeBypassSignalPicker();
            };
            container.appendChild(item);
        });
    });

    if (currentSignal) {
        const clearDiv = document.createElement("div");
        clearDiv.style.cssText = "padding:6px 24px;cursor:pointer;color:#d44;border-top:1px solid #333;";
        clearDiv.textContent = "Clear Remote Bypass";
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
    if (top + contRect.height > window.innerHeight) top = window.innerHeight - contRect.height - 8;
    if (left < 4) left = 4;
    if (top < 4) top = 4;
    container.style.left = left + "px";
    container.style.top = top + "px";

    const closeOnOutside = (e) => {
        if (!container.contains(e.target)) {
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
    });
}

function removeBypassSignalPicker() {
    const el = document.getElementById("_xcpBypassPicker");
    if (el) el.remove();
    const clone = document.getElementById("_xcpBypassCtxClone");
    if (clone) clone.remove();
}
