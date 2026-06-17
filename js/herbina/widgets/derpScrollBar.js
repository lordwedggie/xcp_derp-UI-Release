/**
 * Path: ./herbina/utils/derpScrollBar.js
 * ROLE: Centralized custom scrollbar logic for HTML-in-Canvas widgets.
 */

export function setupDerpScrollBar(container, contentWrapper, scale, activePaint) {
    container._scrollTop = container._scrollTop || 0;

    // Scrollbar Track
    const track = document.createElement("div");
    track.style.position = "absolute";
    track.style.right = `${2 * scale}px`;
    track.style.top = "2px";
    track.style.bottom = "2px";
    track.style.width = `${4 * scale}px`;
    track.style.backgroundColor = "rgba(0,0,0,0.2)";
    track.style.borderRadius = "2px";
    track.style.zIndex = "10";
    container.appendChild(track);
    container._scrollTrack = track;

    // Scrollbar Handle
    const handle = document.createElement("div");
    handle.style.position = "absolute";
    handle.style.width = "100%";
    handle.style.backgroundColor = activePaint?.fill || "rgba(255,255,255,0.4)";
    handle.style.borderRadius = "2px";
    handle.style.cursor = "pointer";
    track.appendChild(handle);
    container._scrollHandle = handle;

    // THE SCALE SYNC FIX: Allow the scale to be updated dynamically via arguments
    // to ensure the scroll logic matches the current zoom level.
    const updateScroll = (newScale) => {
        if (newScale) scale = newScale;
        const totalH = contentWrapper.scrollHeight / scale;
        const visibleH = container.clientHeight / scale;
        const maxScroll = Math.max(0, totalH - visibleH);
        container._scrollTop = Math.max(0, Math.min(container._scrollTop, maxScroll));

        const scrollRatio = container._scrollTop / Math.max(1, maxScroll);
        const handleH = Math.max(10, (visibleH / Math.max(1, totalH)) * container.clientHeight);

        contentWrapper.style.transform = `translateY(${-container._scrollTop * scale}px)`;

        if (maxScroll > 0) {
            track.style.display = "block";
            handle.style.height = `${handleH}px`;
            handle.style.top = `${scrollRatio * (container.clientHeight - handleH - 4)}px`;
        } else {
            track.style.display = "none";
        }
    };
    container._updateScroll = updateScroll;

    container.addEventListener("wheel", (e) => {
        e.stopPropagation();
        e.preventDefault();
        container._scrollTop += e.deltaY * 0.4; // Sensitivity adjustment
        updateScroll();
    }, { passive: false });

    // Handle Dragging Logic
    let isDragging = false, startY = 0, startScroll = 0;
    handle.onmousedown = (e) => {
        isDragging = true;
        startY = e.clientY;
        startScroll = container._scrollTop;
        e.stopPropagation();
        e.preventDefault();
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const delta = (e.clientY - startY) / scale;
        const maxScroll = Math.max(0, (contentWrapper.scrollHeight / scale) - (container.clientHeight / scale));
        const trackH = container.clientHeight;
        const hH = handle.clientHeight;
        const scrollDelta = (delta / Math.max(1, trackH - hH)) * maxScroll;
        container._scrollTop = startScroll + scrollDelta;
        updateScroll();
    };

    const onMouseUp = () => {
        isDragging = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    // Attach cleanup function to the container to prevent memory leaks when widget is destroyed
    container._cleanupScrollEvents = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
    };
}

export function updateDerpScrollBar(container, contentWrapper, scale) {
    if (!container || !contentWrapper) return;

    // THE FAST-HASH GATING: Prevent redundant DOM updates and coordinate math unless
    // dimensions, scale, or scroll position have changed
    const stateHash = `${scale}_${container.clientHeight}_${contentWrapper.scrollHeight}_${container._scrollTop}_${window._xcpDerpSession}`;
    if (container._lastScrollHash === stateHash) return;
    container._lastScrollHash = stateHash;

    if (container._scrollTrack) {
        container._scrollTrack.style.width = `${4 * scale}px`;
        container._scrollTrack.style.right = `${2 * scale}px`;
    }

    if (container._updateScroll) {
        // THE SCALE PROPAGATION FIX: Pass the current scale into the logic closure
        container._updateScroll(scale);
    }

    // Apply padding to the wrapper to keep rows and highlights clear of the scrollbar track
    const hasScroll = container._scrollTrack && container._scrollTrack.style.display !== "none";
    contentWrapper.style.paddingRight = hasScroll ? `${8 * scale}px` : "0px";
}