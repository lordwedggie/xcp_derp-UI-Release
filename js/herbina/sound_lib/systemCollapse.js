function clampVariantIndex(index, list) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    const n = Number.isInteger(index) ? index : 0;
    return Math.max(0, Math.min(list.length - 1, n));
}

function playCollapseOnV0(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.22);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
}

function playCollapseOnV1(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(130, t + 0.32);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.36);
}

function playCollapseOnV2(audioCtx, getNoiseBuffer) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const noiseGain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.24);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    noise.buffer = getNoiseBuffer(audioCtx);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(250, t + 0.2);
    noiseGain.gain.setValueAtTime(0.03, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.3);
    noise.stop(t + 0.18);
}

function playCollapseOnV3(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "triangle";
    b.type = "triangle";
    a.frequency.setValueAtTime(470, t);
    b.frequency.setValueAtTime(390, t + 0.04);
    a.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    b.frequency.exponentialRampToValueAtTime(140, t + 0.24);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t + 0.04);
    a.stop(t + 0.34);
    b.stop(t + 0.34);
}

function playCollapseOnV4(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    gain.gain.setValueAtTime(0.065, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.44);
}

function playCollapseOffV0(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.24);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
}

function playCollapseOffV1(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.2);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.36);
}

function playCollapseOffV2(audioCtx, getNoiseBuffer) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const noiseGain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.26);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    noise.buffer = getNoiseBuffer(audioCtx);
    filter.type = "highpass";
    filter.frequency.setValueAtTime(700, t);
    noiseGain.gain.setValueAtTime(0.02, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.3);
    noise.stop(t + 0.14);
}

function playCollapseOffV3(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "sine";
    b.type = "sine";
    a.frequency.setValueAtTime(170, t);
    b.frequency.setValueAtTime(250, t + 0.04);
    a.frequency.exponentialRampToValueAtTime(580, t + 0.22);
    b.frequency.exponentialRampToValueAtTime(760, t + 0.22);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.075, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t + 0.04);
    a.stop(t + 0.34);
    b.stop(t + 0.34);
}

function playCollapseOffV4(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(820, t + 0.36);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.44);
}

export const COLLAPSE_ON_VARIANTS = [
    playCollapseOnV0,
    playCollapseOnV1,
    playCollapseOnV2,
    playCollapseOnV3,
    playCollapseOnV4,
];

export const COLLAPSE_OFF_VARIANTS = [
    playCollapseOffV0,
    playCollapseOffV1,
    playCollapseOffV2,
    playCollapseOffV3,
    playCollapseOffV4,
];

export function playCollapseOnVariant(index, audioCtx, getNoiseBuffer) {
    const i = clampVariantIndex(index, COLLAPSE_ON_VARIANTS);
    return COLLAPSE_ON_VARIANTS[i](audioCtx, getNoiseBuffer);
}

export function playCollapseOffVariant(index, audioCtx, getNoiseBuffer) {
    const i = clampVariantIndex(index, COLLAPSE_OFF_VARIANTS);
    return COLLAPSE_OFF_VARIANTS[i](audioCtx, getNoiseBuffer);
}
