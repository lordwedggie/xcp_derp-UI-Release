// THE SINGLETON FIX: Shared AudioContext and pre-generated noise buffer to prevent memory leaks and latency
let sharedAudioCtx = null;
let sharedNoiseBuffer = null;

// THE FIRST-SOUND FIX: Eagerly unlock the AudioContext on the very first interaction with the document.
// This catches the true browser-trusted event long before LiteGraph's synthetic canvas events trigger a sound.
const earlyUnlock = () => {
    if (!sharedAudioCtx) sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // THE GESTURE LOCK FIX: Ensure resume happens inside the trusted stack
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();

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
    noiseGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime);
    noise.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.6);
    noise.stop(audioCtx.currentTime + 0.6);
}

/**
 * Synthesizes a 'power up' rising frequency sound.
 */
export function playPowerUp() {
    const audioCtx = getAudioContext();
    // THE SYNCHRONOUS TIME FIX: Cache currentTime to prevent ticks mid-scheduling which silently breaks audio ramps
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
    gain.gain.setValueAtTime(0, t);
    // THE VOLUME FIX: Match the microwave notification's 0.3 baseline for consistent audibility
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
}

/**
 * Synthesizes a 'power down' falling frequency sound.
 */
export function playPowerDown() {
    const audioCtx = getAudioContext();
    // THE SYNCHRONOUS TIME FIX: Cache currentTime to prevent ticks mid-scheduling which silently breaks audio ramps
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.2);
    gain.gain.setValueAtTime(0, t);
    // THE VOLUME FIX: Match the microwave notification's 0.3 baseline for consistent audibility
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
}

/**
 * Synthesizes a 'shuffle' sound using quick bursts of filtered noise.
 */
export function playShuffle() {
    const audioCtx = getAudioContext();
    const t = audioCtx.currentTime;
    const noise = (delay) => {
        const source = audioCtx.createBufferSource();
        source.buffer = getNoiseBuffer(audioCtx);
        const filter = audioCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1200, t + delay);
        filter.Q.setValueAtTime(0.5, t + delay);
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(0.15, t + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.08);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(t + delay);
        source.stop(t + delay + 0.1);
    };
    for(let i = 0; i < 4; i++) noise(i * 0.06);
}

export function playPickup() {
    const audioCtx = getAudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
}

export function playDropdown() {
    const audioCtx = getAudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer(audioCtx);
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(250, t);
    const nGain = audioCtx.createGain();
    nGain.gain.setValueAtTime(0.12, t);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(audioCtx.destination);

    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.2);
    noise.stop(t + 0.2);
}

/**
 * THE SOUND INDEX: Maps string keys to synthesis functions for centralized calling
 */
const _SOUND_LIBRARY = {
    "microwave": playMicrowaveDing,
    "success": playKaChing,
    "delete": playKaboom,
    "powerup": playPowerUp,
    "powerdown": playPowerDown,
    "shuffle": playShuffle,
    "pickup": playPickup,
    "dropdown": playDropdown
};

export const SOUND_INDEX = new Proxy(_SOUND_LIBRARY, {
    get: (target, prop) => {
        if (typeof prop === 'string') {
            return target[prop.toLowerCase()];
        }
        return target[prop];
    }
});