import { playSystemOnVariant, playSystemOffVariant } from "./sound_lib/systemBypass.js";
import { playCollapseOnVariant, playCollapseOffVariant } from "./sound_lib/systemCollapse.js";
import { playDockedVariant, playUndockedVariant } from "./sound_lib/nodeDock.js";

// THE SINGLETON FIX: Shared AudioContext and pre-generated noise buffer to prevent memory leaks and latency
let sharedAudioCtx = null;
let sharedNoiseBuffer = null;

const DEFAULT_SYSTEM_BYPASS_SOUND_INDEX = 0;
const DEFAULT_SYSTEM_COLLAPSE_SOUND_INDEX = 0;
const DEFAULT_SYSTEM_DOCK_SOUND_INDEX = 0;

function getVariantIndex(settingKey, fallback = 0) {
    const v = window?.DERP_GLOBAL_SETTINGS?.[settingKey];
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.floor(v));
}

function ensureAudioReady() {
    const ctx = getAudioContext();
    if (ctx.state === "running") {
        return Promise.resolve(ctx);
    }
    return ctx.resume().then(() => ctx);
}

// THE FIRST-SOUND FIX: Eagerly unlock the AudioContext on the very first interaction with the document.
// This catches the true browser-trusted event long before LiteGraph's synthetic canvas events trigger a sound.
const earlyUnlock = () => {
    if (!sharedAudioCtx) sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // THE GESTURE LOCK FIX: Ensure resume happens inside the trusted stack
    if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
    }

    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start(0);
    osc.stop(sharedAudioCtx.currentTime + 0.001);

    ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach(evt => window.removeEventListener(evt, earlyUnlock, true));
};

if (typeof window !== 'undefined') {
    ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach(evt => window.addEventListener(evt, earlyUnlock, true));
}

function getAudioContext() {
    if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // THE FIRST-PLAY FIX: Aggressively attempt to resume on every access
    if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(e => {});
    }
    return sharedAudioCtx;
}

function getNoiseBuffer(ctx) {
    if (!sharedNoiseBuffer) {
        const bufferSize = ctx.sampleRate * 2.0; // 2 seconds of reusable noise
        sharedNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = sharedNoiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    }
    return sharedNoiseBuffer;
}

/**
 * Synthesizes a 'microwave ding' sound using Web Audio API.
 * High-pitched sine wave with a quick attack and long exponential decay.
 */
export function playMicrowaveDing() {
    const audioCtx = getAudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // A softer, more pleasant notification bell (800Hz - 1200Hz)
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(750, audioCtx.currentTime);

    // Volume Envelope: Start at 0, pop to 0.3 instantly, fade out slowly
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.5);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 1.5);
}

/**
 * Synthesizes a 'ka-ching' cash register sound using Web Audio API.
 * Two metallic pulses in quick succession to indicate a successful transaction or save.
 */
export function playKaChing() {
    const audioCtx = getAudioContext();

    const clink = (freq, delay, vol) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);

        gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.6);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + 0.6);
    };

    clink(850, 0, 0.2);     // Mechanical register "clink"
    clink(1700, 0.08, 0.15); // Higher bell "clink"
}
/**
 * Synthesizes a mechanical 'keyboard stroke' click using Web Audio API.
 * Uses a noise burst and a sharp sine pulse to mimic a tactile switch.
 */
export function playKeyStroke(volume = 1.0) {
    const audioCtx = getAudioContext();

    // 1. The 'Click' (Transient) - A sharp high-pitched sine pulse
    const clickOsc = audioCtx.createOscillator();
    const clickGain = audioCtx.createGain();
    clickOsc.type = "sine";
    clickOsc.frequency.setValueAtTime(1200, audioCtx.currentTime);

    clickGain.gain.setValueAtTime(0, audioCtx.currentTime);
    // THE VOLUME DECAY FIX: Multiply the hardcoded peak (0.15) by the passed volume parameter
    clickGain.gain.linearRampToValueAtTime(0.15 * volume, audioCtx.currentTime + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);

    clickOsc.connect(clickGain);
    clickGain.connect(audioCtx.destination);

    // 2. The 'Thump' (Mechanical Body) - A brief burst of filtered white noise
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer(audioCtx);

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(800, audioCtx.currentTime);
    noiseFilter.Q.setValueAtTime(1, audioCtx.currentTime);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
    // THE VOLUME DECAY FIX: Multiply the hardcoded noise peak (0.1) by the passed volume parameter
    noiseGain.gain.linearRampToValueAtTime(0.1 * volume, audioCtx.currentTime + 0.005);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.04);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    clickOsc.start(audioCtx.currentTime);
    noise.start(audioCtx.currentTime);

    clickOsc.stop(audioCtx.currentTime + 0.1);
    noise.stop(audioCtx.currentTime + 0.1);
}

/**
 * Synthesizes a 'kaboom' explosion sound using Web Audio API.
 * Combines a low-frequency triangle wave sweep with filtered white noise.
 */
export function playKaboom() {
    const audioCtx = getAudioContext();

    // 1. Low Thump (Shockwave)
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.4);

    oscGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    // 2. Noise Burst (Debris/Impact)
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer(audioCtx);

    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.4);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime);
    noise.start(audioCtx.currentTime);

    osc.stop(audioCtx.currentTime + 0.8);
    noise.stop(audioCtx.currentTime + 0.8);
}

/**
 * Synthesizes a 'power up' rising pitch sound.
 * A synthesized sine wave that sweeps upward in frequency.
 */
export function playPowerUp() {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
}

/**
 * Synthesizes a 'power down' falling pitch sound.
 * An inverted version of the power-up sound.
 */
export function playPowerDown() {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
}

// Sound for reordering, filtering, randomizing lists.
export function playShuffle() {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.25);
}

export function playPickup() {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, audioCtx.currentTime + 0.12);

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.2);
}

export function playDropdown() {
    const audioCtx = getAudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.15);

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.25);
}

export function playSystemOn() {
    const audioCtx = getAudioContext();
    const idx = getVariantIndex("systemBypassSoundIndex", DEFAULT_SYSTEM_BYPASS_SOUND_INDEX);
    playSystemOnVariant(idx, audioCtx, getNoiseBuffer);
}

export function playSystemOff() {
    const audioCtx = getAudioContext();
    const idx = getVariantIndex("systemBypassSoundIndex", DEFAULT_SYSTEM_BYPASS_SOUND_INDEX);
    playSystemOffVariant(idx, audioCtx, getNoiseBuffer);
}

export function playCollapseOn() {
    const audioCtx = getAudioContext();
    const idx = getVariantIndex("systemCollapseSoundIndex", DEFAULT_SYSTEM_COLLAPSE_SOUND_INDEX);
    playCollapseOnVariant(idx, audioCtx, getNoiseBuffer);
}

export function playCollapseOff() {
    const audioCtx = getAudioContext();
    const idx = getVariantIndex("systemCollapseSoundIndex", DEFAULT_SYSTEM_COLLAPSE_SOUND_INDEX);
    playCollapseOffVariant(idx, audioCtx, getNoiseBuffer);
}

export function playDocked() {
    const audioCtx = getAudioContext();
    const idx = getVariantIndex("systemDockSoundIndex", DEFAULT_SYSTEM_DOCK_SOUND_INDEX);
    playDockedVariant(idx, audioCtx, getNoiseBuffer);
}

export function playUndocked() {
    const audioCtx = getAudioContext();
    const idx = getVariantIndex("systemDockSoundIndex", DEFAULT_SYSTEM_DOCK_SOUND_INDEX);
    playUndockedVariant(idx, audioCtx, getNoiseBuffer);
}

/**
 * THE SOUND INDEX: Maps string keys to synthesis functions for centralized calling
 */
const _SOUND_LIBRARY = {
    "microwave": playMicrowaveDing,
    "success": playKaChing,
    "warning": playKaChing,
    "error": playKaboom,
    "critical": playKaboom,
    "delete": playKaboom,
    "powerup": playPowerUp,
    "powerdown": playPowerDown,
    "shuffle": playShuffle,
    "pickup": playPickup,
    "dropdown": playDropdown,
    "systemon": playSystemOn,
    "systemoff": playSystemOff,
    "collapseon": playCollapseOn,
    "collapseoff": playCollapseOff,
    "docked": playDocked,
    "undocked": playUndocked
};

export const SOUND_INDEX = new Proxy(_SOUND_LIBRARY, {
    get: (target, prop) => {
        if (typeof prop === 'string') {
            const fn = target[prop.toLowerCase()];
            if (!fn) return undefined;
            return (...args) => {
                ensureAudioReady().then(() => fn(...args));
            };
        }
        return undefined;
    }
});