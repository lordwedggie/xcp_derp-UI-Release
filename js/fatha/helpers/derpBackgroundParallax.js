export const DERP_BACKGROUND_PARALLAX_CONFIG = {
    initialScale: 1.4,
    panStrengthX: 0.1,
    panStrengthY: 0.1,
    zoomStrength: 0.11,
    zoomMin: 0.88,
    zoomMax: 1.2,
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getLayerState(layer) {
    if (!layer) return null;
    if (layer._xcpDerpParallaxState) return layer._xcpDerpParallaxState;

    const visual = document.createElement("img");
    visual.alt = "";
    visual.draggable = false;
    visual.decoding = "async";
    visual.style.position = "absolute";
    visual.style.pointerEvents = "none";
    visual.style.userSelect = "none";
    visual.style.left = "0";
    visual.style.top = "0";
    visual.style.maxWidth = "none";
    visual.style.maxHeight = "none";
    visual.style.transformOrigin = "center center";
    visual.style.willChange = "transform, width, height";
    visual.style.opacity = "1";
    visual.style.transition = "opacity 120ms ease";
    layer.appendChild(visual);

    const state = {
        visual,
        rafId: 0,
        imageUrl: "",
        naturalWidth: 0,
        naturalHeight: 0,
        getCanvasState: null,
    };

    visual.addEventListener("load", () => {
        state.naturalWidth = visual.naturalWidth || 0;
        state.naturalHeight = visual.naturalHeight || 0;
        syncDerpBackgroundParallax(layer);
    });

    layer._xcpDerpParallaxState = state;
    return state;
}

export function ensureDerpBackgroundParallax(layer, getCanvasState) {
    const state = getLayerState(layer);
    if (!state) return null;
    if (getCanvasState) state.getCanvasState = getCanvasState;
    if (state.rafId) return state;

    const tick = () => {
        state.rafId = window.requestAnimationFrame(tick);
        if (!document.body?.contains(layer)) return;
        syncDerpBackgroundParallax(layer);
    };

    state.rafId = window.requestAnimationFrame(tick);
    return state;
}

export function setDerpBackgroundParallaxImage(layer, imageUrl = "") {
    const state = getLayerState(layer);
    if (!state) return;

    const normalized = String(imageUrl || "").trim();
    state.imageUrl = normalized;

    if (!normalized) {
        state.naturalWidth = 0;
        state.naturalHeight = 0;
        state.visual.removeAttribute("src");
        state.visual.style.display = "none";
        return;
    }

    state.visual.style.display = "block";
    if (state.visual.src !== normalized) {
        state.visual.src = normalized;
    }
    syncDerpBackgroundParallax(layer);
}

export function syncDerpBackgroundParallax(layer) {
    const state = getLayerState(layer);
    if (!state?.visual || layer.style.display === "none" || !state.imageUrl) return;

    const viewportWidth = Math.max(window.innerWidth || 0, 1);
    const viewportHeight = Math.max(window.innerHeight || 0, 1);
    const naturalWidth = Math.max(state.naturalWidth || viewportWidth, 1);
    const naturalHeight = Math.max(state.naturalHeight || viewportHeight, 1);
    const coverScale = Math.max(viewportWidth / naturalWidth, viewportHeight / naturalHeight);

    const canvasState = state.getCanvasState?.() || {};
    const ds = canvasState.ds || {};
    const offset = Array.isArray(ds.offset) ? ds.offset : [0, 0];
    const canvasScale = Number.isFinite(ds.scale) ? ds.scale : 1;
    const zoomMultiplier = clamp(
        1 + ((canvasScale - 1) * DERP_BACKGROUND_PARALLAX_CONFIG.zoomStrength),
        DERP_BACKGROUND_PARALLAX_CONFIG.zoomMin,
        DERP_BACKGROUND_PARALLAX_CONFIG.zoomMax
    );
    const renderScale = coverScale * DERP_BACKGROUND_PARALLAX_CONFIG.initialScale * zoomMultiplier;

    const renderWidth = naturalWidth * renderScale;
    const renderHeight = naturalHeight * renderScale;
    const extraX = Math.max(0, (renderWidth - viewportWidth) / 2);
    const extraY = Math.max(0, (renderHeight - viewportHeight) / 2);
    const screenPanX = (Number(offset[0]) || 0) * canvasScale;
    const screenPanY = (Number(offset[1]) || 0) * canvasScale;
    const translateX = clamp(screenPanX * DERP_BACKGROUND_PARALLAX_CONFIG.panStrengthX, -extraX, extraX);
    const translateY = clamp(screenPanY * DERP_BACKGROUND_PARALLAX_CONFIG.panStrengthY, -extraY, extraY);

    state.visual.style.width = `${renderWidth}px`;
    state.visual.style.height = `${renderHeight}px`;
    state.visual.style.left = `${((viewportWidth - renderWidth) / 2) + translateX}px`;
    state.visual.style.top = `${((viewportHeight - renderHeight) / 2) + translateY}px`;
}
