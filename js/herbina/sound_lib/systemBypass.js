function clampVariantIndex(index, list) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    const n = Number.isInteger(index) ? index : 0;
    return Math.max(0, Math.min(list.length - 1, n));
}

function playSystemOnV0(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.22);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.36);
}

function playSystemOnV1(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "triangle";
    b.type = "sawtooth";
    a.frequency.setValueAtTime(120, t);
    a.frequency.exponentialRampToValueAtTime(420, t + 0.3);
    b.frequency.setValueAtTime(240, t);
    b.frequency.exponentialRampToValueAtTime(640, t + 0.26);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t);
    a.stop(t + 0.4);
    b.stop(t + 0.4);
}

function playSystemOnV2(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.42);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.5);
}

function playSystemOnV3(audioCtx, getNoiseBuffer) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const noiseGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.28);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    noise.buffer = getNoiseBuffer(audioCtx);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1100, t);
    noiseGain.gain.setValueAtTime(0.05, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.38);
    noise.stop(t + 0.2);
}

function playSystemOnV4(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.5);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.56);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.58);
}

function playSystemOffV0(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.32);
    gain.gain.setValueAtTime(0.13, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.38);
}

function playSystemOffV1(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "triangle";
    b.type = "square";
    a.frequency.setValueAtTime(360, t);
    a.frequency.exponentialRampToValueAtTime(90, t + 0.26);
    b.frequency.setValueAtTime(220, t);
    b.frequency.exponentialRampToValueAtTime(55, t + 0.34);
    gain.gain.setValueAtTime(0.11, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t);
    a.stop(t + 0.44);
    b.stop(t + 0.44);
}

function playSystemOffV2(audioCtx, getNoiseBuffer) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const noiseGain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.36);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    noise.buffer = getNoiseBuffer(audioCtx);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.34);
    noiseGain.gain.setValueAtTime(0.04, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.42);
    noise.stop(t + 0.26);
}

function playSystemOffV3(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.48);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.52);
}

function playSystemOffV4(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.52);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.54);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.56);
}

export const SYSTEM_ON_VARIANTS = [
    playSystemOnV0,
    playSystemOnV1,
    playSystemOnV2,
    playSystemOnV3,
    playSystemOnV4,
];

export const SYSTEM_OFF_VARIANTS = [
    playSystemOffV0,
    playSystemOffV1,
    playSystemOffV2,
    playSystemOffV3,
    playSystemOffV4,
];

export function playSystemOnVariant(index, audioCtx, getNoiseBuffer) {
    const i = clampVariantIndex(index, SYSTEM_ON_VARIANTS);
    return SYSTEM_ON_VARIANTS[i](audioCtx, getNoiseBuffer);
}

export function playSystemOffVariant(index, audioCtx, getNoiseBuffer) {
    const i = clampVariantIndex(index, SYSTEM_OFF_VARIANTS);
    return SYSTEM_OFF_VARIANTS[i](audioCtx, getNoiseBuffer);
}
