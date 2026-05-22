/**
 * Path: ./Herbina/masterAnimator.js
 * ROLE: The big brain wiggle engine for derpNodes
 */

/**
 * Math juice to make boxes move real smooth like.
 * * WHAT IT DO: It's an ease-out thingy where it starts fast but gets lazy
 * as it gets close to the target. Good for not scaring the user.
 * * @param {number} current - Where we at now.
 * @param {number} target - Where we wanna be.
 * @param {number} factor - How fast we go (0.1 is turtle, 0.8 is zoomies).
 * @param {boolean} useAnim - If off, we just teleport.
 */
export function lerpTo(current, target, factor = 0.50, useAnim = true) {
    if (!useAnim) return { value: target, isAnimating: false };
    const delta = target - current;
    // Gating: If the gap is teeny-tiny, just stop so the CPU can take a nap.
    if (Math.abs(delta) < 0.1) return { value: target, isAnimating: false };
    return { value: current + delta * factor, isAnimating: true };
}
// --- TUNABLE RECOIL SETTINGS ---
export const RECOIL_SPEED = 0.45;  // Interpolation speed (0.1 slow to 0.8 zoomies)
export const RECOIL_SHRINK = 0.08; // How much the button squishes (0.05 - 0.15)
export const RECOIL_SHIFT = 0.04;  // How much the button moves (0.02 - 0.08)

/**
 * THE FIX: Tunable Recoil (Click) Animation.
 */
export function animateRecoil(current, target, factor = RECOIL_SPEED, useAnim = true) {
    return lerpTo(current, target, factor, useAnim);
}
/**
 * Spooky ghost settings for making stuff see-through.
 * * WHAT IT DO: Makes stuff go poof or appear without the flickering uglies.
 * Hard-clamped so it doesn't break the internet by going past 100% or below 0%.
 */
export function animateAlpha(current, target, factor = 0.25, useAnim = true) {
    if (!useAnim) return { value: target, isAnimating: false };
    const delta = target - current;
    // Stop updating if we're basically already ghosty enough.
    if (Math.abs(delta) < 0.01) return { value: target, isAnimating: false };
    const next = current + delta * factor;
    // Safety first! Stay between 0 and 1 or the GPU gets angry.
    return { value: Math.max(0, Math.min(1, next)), isAnimating: true };
}

function extendPassiveCanvasCacheSuspension(node, durationMs = 34) {
    const typeName = String(node?.type || "").toLowerCase();
    if (!typeName) return;
    if (typeName.includes("triggerwall")) {
        node._triggerWallCacheSuspendUntil = Math.max(Number(node._triggerWallCacheSuspendUntil || 0), performance.now() + durationMs);
        return;
    }
    if (typeName.includes("derplorastack")) {
        node._passiveWholeWallCacheSuspendUntil = Math.max(Number(node._passiveWholeWallCacheSuspendUntil || 0), performance.now() + durationMs);
    }
}

/**
 * Absolute boing boing physics (Hooke's Law but with more wiggle).
 * * WHAT IT DO: Unlike the lazy lerp, this has weight. It overshoots
 * the target and bounces back like a proper springy boy.
 * * @param {number} current - Current wiggle spot.
 * @param {number} target - The home base where it wants to rest.
 * @param {number} velocity - The zoomy speed (keep track of this or it won't bounce!).
 * @param {number} stiffness - How hard the spring pulls back.
 * @param {number} damping - How much the wiggle is slowed by "air friction."
 */
export function animateSpring(current, target, velocity, stiffness = 0.1, damping = 0.8) {
    // 1. Math pull: The further away, the harder it yanks.
    const force = (target - current) * stiffness;
    // 2. Speed check: Apply the yank and then some friction so it doesn't bounce forever.
    velocity = (velocity + force) * damping;
    // 3. Wiggle it.
    const nextValue = current + velocity;

    // If it's barely moving, call it a day.
    const isAnimating = Math.abs(target - nextValue) > 0.1 || Math.abs(velocity) > 0.1;
    return { value: nextValue, velocity, isAnimating };
}

/**
 * Official Fatha-grade floor dropper.
 * * WHAT IT DO: Just a fancy name for the sliding math used
 * to drop the system panel background.
 */
export function animatePanelSlide(current, target, factor = 0.50, useAnim = true) {
    return lerpTo(current, target, factor, useAnim);
}

/**
 * Party mode: Rainbow breathing engaged.
 * * WHAT IT DO: Uses a wavy sine wave to breathe between two colors.
 * Makes the UI look like it's alive and maybe a little out of breath.
 */
export function colorPulse2(colorA, colorB, speed) {
    const time = Date.now() * speed;
    // The wave goes 0 to 1 and back again.
    const mix = (Math.sin(time) + 1) / 2;

    const r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * mix);
    const g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * mix);
    const b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * mix);
    const a = (colorA[3] + (colorB[3] - colorA[3]) * mix).toFixed(3);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const PULSE_FRAME_BUCKET_MS = 50;
const _pulseColorCache = new Map();

export function getPulseMix(speed = 0.005, bucketMs = PULSE_FRAME_BUCKET_MS) {
    const quantizedTime = Math.floor(Date.now() / bucketMs) * bucketMs;
    return (Math.sin(quantizedTime * speed) + 1) / 2;
}

export function getPulseAlpha(speed = 0.005, bucketMs = PULSE_FRAME_BUCKET_MS) {
    return getPulseMix(speed, bucketMs);
}

export function getPulsedColor(colorA, colorB, speed = 0.005, bucketMs = PULSE_FRAME_BUCKET_MS) {
    const quantizedTime = Math.floor(Date.now() / bucketMs) * bucketMs;
    const key = `${quantizedTime}|${speed}|${bucketMs}|${colorA.join(",")}|${colorB.join(",")}`;
    const cached = _pulseColorCache.get(key);
    if (cached) return cached;

    const mix = (Math.sin(quantizedTime * speed) + 1) / 2;
    const r = Math.round(colorA[0] + (colorB[0] - colorA[0]) * mix);
    const g = Math.round(colorA[1] + (colorB[1] - colorA[1]) * mix);
    const b = Math.round(colorA[2] + (colorB[2] - colorA[2]) * mix);
    const a = (colorA[3] + (colorB[3] - colorA[3]) * mix).toFixed(3);
    const value = `rgba(${r}, ${g}, ${b}, ${a})`;

    _pulseColorCache.set(key, value);
    if (_pulseColorCache.size > 256) {
        const firstKey = _pulseColorCache.keys().next().value;
        if (firstKey !== undefined) _pulseColorCache.delete(firstKey);
    }
    return value;
}

/**
 * Universal Color Decoder for lerp-friendly arrays
 */
export function parseColor(c) {
    if (Array.isArray(c)) return [c[0] || 0, c[1] || 0, c[2] || 0, c[3] !== undefined ? c[3] : 1];
    // THE FALLBACK FIX: Never return null; always return Pure Red if input is invalid or missing
    if (typeof c !== "string") return [255, 0, 0, 1];
    const str = c.trim().toLowerCase();
    if (str === "transparent" || str === "none") return [0, 0, 0, 0];
    const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), match[4] !== undefined ? parseFloat(match[4]) : 1];
    if (str.startsWith("#")) {
        let h = str.slice(1);
        if (h.length === 3) h = h.split("").map(x => x + x).join("");
        return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0, h.length === 8 ? (parseInt(h.slice(6, 8), 16) / 255) : 1];
    }
    return [255, 0, 0, 1]; // Fallback Red
}

/**
 * THE FIX: Centralized Widget Color Animation
 * Replaces redundant 20-line loops across btnSimple, btnIcon, derpEditor, and derpDropdown.
 */
export function animateWidgetColors(node, animKey, targetBg, targetIc, sysAlpha = 1, useAnim = true, speed = 0.45) {
    // THE OPTIMIZATION FIX: Use cached parsed arrays to avoid redundant regex parsing every frame.
    if (!node[animKey]) {
        const tBgArr = parseColor(targetBg) || [100, 100, 100, 1];
        const tIcArr = parseColor(targetIc) || [255, 60, 60, 1];
        node[animKey] = {
            bg: [...tBgArr], ic: [...tIcArr],
            lastBg: targetBg, lastIc: targetIc,
            tBgArr, tIcArr
        };
    }
    const cur = node[animKey];

    if (cur.lastBg !== targetBg) {
        cur.lastBg = targetBg;
        cur.tBgArr = parseColor(targetBg) || [100, 100, 100, 1];
    }
    if (cur.lastIc !== targetIc) {
        cur.lastIc = targetIc;
        cur.tIcArr = parseColor(targetIc) || [255, 60, 60, 1];
    }
    const tBgArr = cur.tBgArr;
    const tIcArr = cur.tIcArr;

    let isAnimating = false;
    for (let i = 0; i < 4; i++) {
        const lerpFn = (i === 3) ? animateAlpha : lerpTo;
        const bgRes = lerpFn(cur.bg[i], tBgArr[i], speed, useAnim);
        const icRes = lerpFn(cur.ic[i], tIcArr[i], speed, useAnim);
        cur.bg[i] = bgRes.value;
        cur.ic[i] = icRes.value;
        if (bgRes.isAnimating || icRes.isAnimating) isAnimating = true;
    }

    if (isAnimating && useAnim) {
        extendPassiveCanvasCacheSuspension(node);
        node._derpAwakeFrames = 5;

        // THE PERFORMANCE FIX: Color animations do not alter geometry.
        // Removing `_forceSync` and `requestDerpSync()` prevents the master layout engine
        // from thrashing the CPU with full reflows 60 times a second during a simple fade.

        // THE UNSELECTED AWAKE FIX: Safely queue the canvas redraw outside the current
        // render pass. This bypasses Fatha's `isTrueSelected` sleep gate without recursion.
        if (!node._derpAnimPending && window.app && window.app.canvas) {
            node._derpAnimPending = true;
            requestAnimationFrame(() => {
                node._derpAnimPending = false;
                if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
                window.app.canvas.setDirty(true, true);
            });
        }
    }

    const finalBgAlpha = Math.max(0, Math.min(1, cur.bg[3] * sysAlpha));
    const finalIcAlpha = Math.max(0, Math.min(1, cur.ic[3] * sysAlpha));

    return {
        fillColor: `rgba(${Math.round(cur.bg[0])}, ${Math.round(cur.bg[1])}, ${Math.round(cur.bg[2])}, ${finalBgAlpha})`,
        iconColor: `rgba(${Math.round(cur.ic[0])}, ${Math.round(cur.ic[1])}, ${Math.round(cur.ic[2])}, ${finalIcAlpha})`,
        isAnimating
    };
}

/**
 * THE FIX: Full Paint Data Animation
 */
export function animatePaintData(node, animKey, targetPaint, useAnim = true, speed = 0.45) {
    if (!targetPaint) return null;

    if (!node[animKey]) {
        const tFill = parseColor(targetPaint.fill || targetPaint.textColor || "white");
        const tStroke = parseColor(targetPaint.stroke?.color || "transparent");
        const tShadow = parseColor(targetPaint.shadow?.color || "transparent");
        const tGlow = parseColor(targetPaint.glow?.color || "transparent");
        node[animKey] = {
            fill: [...tFill], stroke: [...tStroke],
            shadow: [...tShadow], glow: [...tGlow],
            lastPaint: targetPaint, tFill, tStroke, tShadow, tGlow
        };
    }
    const cur = node[animKey];

    // THE OPTIMIZATION FIX: Skip parsing if the target paint object reference hasn't changed.
    if (cur.lastPaint !== targetPaint) {
        cur.lastPaint = targetPaint;
        cur.tFill = parseColor(targetPaint.fill || targetPaint.textColor || "white");
        cur.tStroke = parseColor(targetPaint.stroke?.color || "transparent");
        cur.tShadow = parseColor(targetPaint.shadow?.color || "transparent");
        cur.tGlow = parseColor(targetPaint.glow?.color || "transparent");
    }
    const { tFill, tStroke, tShadow, tGlow } = cur;

    let isAnimating = false;
    const lerpBlock = (curArr, targetArr) => {
        for (let i = 0; i < 4; i++) {
            const lerpFn = (i === 3) ? animateAlpha : lerpTo;
            const res = lerpFn(curArr[i], targetArr[i], speed, useAnim);
            curArr[i] = res.value;
            if (res.isAnimating) isAnimating = true;
        }
    };

    lerpBlock(cur.fill, tFill);
    lerpBlock(cur.stroke, tStroke);
    lerpBlock(cur.shadow, tShadow);
    lerpBlock(cur.glow, tGlow);

    if (isAnimating && useAnim) {
        extendPassiveCanvasCacheSuspension(node);
        node._derpAwakeFrames = 5;

        // THE PERFORMANCE FIX: Color animations do not alter geometry.
        // Removing `_forceSync` and `requestDerpSync()` prevents the master layout engine
        // from thrashing the CPU with full reflows 60 times a second during a simple fade.

        // THE UNSELECTED AWAKE FIX: Safely queue the canvas redraw outside the current
        // render pass. This bypasses Fatha's `isTrueSelected` sleep gate without recursion.
        if (!node._derpAnimPending && window.app && window.app.canvas) {
            node._derpAnimPending = true;
            requestAnimationFrame(() => {
                node._derpAnimPending = false;
                if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
                window.app.canvas.setDirty(true, true);
            });
        }
    }

    const toRGBA = (arr) => `rgba(${Math.round(arr[0])}, ${Math.round(arr[1])}, ${Math.round(arr[2])}, ${arr[3]})`;
    const colStr = toRGBA(cur.fill);

    const animated = { ...targetPaint, fill: colStr, textColor: colStr };
    if (targetPaint.stroke) animated.stroke = { ...targetPaint.stroke, color: toRGBA(cur.stroke) };
    if (targetPaint.shadow) animated.shadow = { ...targetPaint.shadow, color: toRGBA(cur.shadow) };
    if (targetPaint.glow) animated.glow = { ...targetPaint.glow, color: toRGBA(cur.glow) };

    return animated;
}

const _ANIMATOR_CHANNELS = new Map();

export function stopAnimatorChannel(channelId) {
    const key = String(channelId || "");
    if (!key) return false;
    const channel = _ANIMATOR_CHANNELS.get(key);
    if (!channel) return false;
    channel.cancelled = true;
    if (channel.rafId) cancelAnimationFrame(channel.rafId);
    _ANIMATOR_CHANNELS.delete(key);
    return true;
}

export function startAnimatorChannel(channelId, frameFn) {
    const key = String(channelId || "");
    if (!key || typeof frameFn !== "function") return null;

    stopAnimatorChannel(key);

    const channel = {
        id: key,
        rafId: 0,
        cancelled: false,
        startedAt: (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(),
    };
    _ANIMATOR_CHANNELS.set(key, channel);

    const tick = (ts) => {
        const cur = _ANIMATOR_CHANNELS.get(key);
        if (!cur || cur !== channel || channel.cancelled) return;

        const keepRunning = frameFn(ts, channel) !== false;
        if (!keepRunning) {
            _ANIMATOR_CHANNELS.delete(key);
            return;
        }
        channel.rafId = requestAnimationFrame(tick);
    };

    channel.rafId = requestAnimationFrame(tick);
    return channel;
}

export function isAnimatorChannelActive(channelId) {
    const key = String(channelId || "");
    if (!key) return false;
    return _ANIMATOR_CHANNELS.has(key);
}
