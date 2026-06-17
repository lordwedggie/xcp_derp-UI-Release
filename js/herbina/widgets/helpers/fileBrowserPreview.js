const PREVIEW_NODE_GAP = 0;

export function loadPreviewImageForRow(state, row, deps = {}) {
    const { markNodeDirty = () => {} } = deps;
    if (!state || !row) return;

    let imgUrl = row?.item?.imageUrl;
    if ((!imgUrl || typeof imgUrl !== "string") && row?.type === "file" && state?.config?.fileType === "lora" && state?.config?.previewList && row?.path) {
        const normPath = String(row.path).replace(/\\/g, "/");
        const inPreview = state.config.previewList.some((p) => String(p).replace(/\\/g, "/") === normPath);
        if (inPreview) {
            imgUrl = `/xcp/get_lora_preview?name=${encodeURIComponent(row.path)}&v=${window._xcpDerpSession || Date.now()}`;
        }
    }

    if (!imgUrl || typeof imgUrl !== "string") {
        if (state._activePreviewRowId !== null) {
            state._activePreviewRowId = null;
            state._activePreviewUrl = null;
            state._activePreviewAspect = null;
            state._previewToken = (state._previewToken || 0) + 1;
            markNodeDirty(state.node, 8);
        }
        return;
    }

    const cache = state._previewImageCache;
    const cached = cache[imgUrl];
    if (cached && cached.loaded) {
        state._activePreviewRowId = row.id;
        state._activePreviewUrl = imgUrl;
        state._activePreviewAspect = cached.aspectRatio;
        markNodeDirty(state.node, 8);
        return;
    }

    if (cached && cached.loading) return;

    cache[imgUrl] = { loading: true, loaded: false, image: null, aspectRatio: null };
    state._activePreviewRowId = row.id;
    state._activePreviewUrl = imgUrl;
    state._activePreviewAspect = null;
    state._previewToken = (state._previewToken || 0) + 1;
    const token = state._previewToken;
    markNodeDirty(state.node, 8);

    const img = new Image();
    img.onload = () => {
        if (state._previewToken !== token) return;
        const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
        cache[imgUrl] = { loading: false, loaded: true, image: img, aspectRatio: ratio };
        if (state._activePreviewRowId === row.id) {
            state._activePreviewAspect = ratio;
            markNodeDirty(state.node, 8);
        }
    };
    img.onerror = () => {
        if (state._previewToken !== token) return;
        cache[imgUrl] = { loading: false, loaded: false, image: null, aspectRatio: null };
        if (state._activePreviewRowId === row.id) {
            state._activePreviewRowId = null;
            state._activePreviewUrl = null;
            state._activePreviewAspect = null;
            markNodeDirty(state.node, 8);
        }
    };
    img.src = imgUrl;
}

export function drawPreviewImagePanel(ctx, state, panelGeometry, deps = {}) {
    const { masterPainter = () => {} } = deps;
    const previewAspect = state?._activePreviewAspect;
    const previewCache = state?._previewImageCache || {};
    const previewUrl = state?._activePreviewUrl;
    if (!previewAspect || !previewUrl || !previewCache[previewUrl]?.loaded) return false;

    const { panelX, panelY, panelW, panelH } = panelGeometry;
    const s = PREVIEW_NODE_GAP;
    const previewW = panelW;
    const previewH = Math.min(previewW / previewAspect, panelW);
    const previewX = panelX;

    const panelScreenTop = state.panelScreenRect?.top || 0;
    const previewScreenH = previewH * panelGeometry.scale;
    const gapScreen = s * panelGeometry.scale;
    const avoidRect = state.previewAvoidScreenRect || null;
    let previewAboveScreenTop = panelScreenTop - previewScreenH - gapScreen;
    const previewAboveScreenBottom = previewAboveScreenTop + previewScreenH;
    if (avoidRect && previewAboveScreenBottom > avoidRect.top && previewAboveScreenTop < avoidRect.top + avoidRect.height) {
        previewAboveScreenTop = avoidRect.top - previewScreenH - gapScreen;
    }
    const roomAbove = previewAboveScreenTop - 4;
    const previewBelowScreenTop = panelScreenTop + (panelH * panelGeometry.scale) + gapScreen;
    const roomBelow = window.innerHeight - previewBelowScreenTop - previewScreenH - 4;
    const placeBelow = roomAbove < 8 && roomBelow > roomAbove;
    const avoidOffsetUnits = avoidRect
        ? Math.max(0, ((panelScreenTop - previewScreenH - gapScreen) - previewAboveScreenTop) / Math.max(0.0001, panelGeometry.scale))
        : 0;
    const previewY = placeBelow ? (panelY + panelH + s) : (panelY - previewH - s - avoidOffsetUnits);

    ctx.save();
    ctx.globalAlpha = state.itemAlpha;
    masterPainter(ctx, {
        width: previewW,
        height: previewH,
        posX: previewX,
        posY: previewY,
        paintData: { corners: [4, 4, 4, 4], border: 1, borderFill: "rgba(0,0,0,0.5)" },
        color: "rgba(0,0,0,0.8)"
    });
    const img = previewCache[previewUrl].image;
    if (img) {
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;
        const fitScale = Math.min(previewW / imgW, previewH / imgH);
        const drawW = imgW * fitScale;
        const drawH = imgH * fitScale;
        const drawX = previewX + (previewW - drawW) / 2;
        const drawY = previewY + (previewH - drawH) / 2;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
    ctx.restore();
    return true;
}

export function isPreviewImagePending(state) {
    const previewCache = state?._previewImageCache || {};
    const previewUrl = state?._activePreviewUrl;
    return !!previewUrl && !previewCache[previewUrl]?.loaded;
}
