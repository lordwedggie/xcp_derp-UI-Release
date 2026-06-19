function clampVariantIndex(index, list) {
    if (!Array.isArray(list) || list.length === 0) return 0;
    const n = Number.isInteger(index) ? index : 0;
    return Math.max(0, Math.min(list.length - 1, n));
}

function playDockedV0(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "triangle";
    b.type = "sine";
    a.frequency.setValueAtTime(210, t);
    b.frequency.setValueAtTime(320, t + 0.03);
    a.frequency.exponentialRampToValueAtTime(280, t + 0.09);
    b.frequency.exponentialRampToValueAtTime(420, t + 0.11);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t + 0.03);
    a.stop(t + 0.22);
    b.stop(t + 0.22);
}

function playDockedV1(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(360, t + 0.14);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
}

function playDockedV2(audioCtx, getNoiseBuffer) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const noiseGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(340, t + 0.1);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    noise.buffer = getNoiseBuffer(audioCtx);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, t);
    noiseGain.gain.setValueAtTime(0.02, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.18);
    noise.stop(t + 0.08);
}

function playDockedV3(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "sine";
    b.type = "sine";
    a.frequency.setValueAtTime(260, t);
    b.frequency.setValueAtTime(390, t + 0.02);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.085, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t + 0.02);
    a.stop(t + 0.24);
    b.stop(t + 0.24);
}

function playDockedV4(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(430, t + 0.15);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
}

function playUndockedV0(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.2);
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
}

function playUndockedV1(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "sine";
    b.type = "triangle";
    a.frequency.setValueAtTime(300, t);
    b.frequency.setValueAtTime(220, t + 0.03);
    a.frequency.exponentialRampToValueAtTime(140, t + 0.2);
    b.frequency.exponentialRampToValueAtTime(90, t + 0.22);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t + 0.03);
    a.stop(t + 0.3);
    b.stop(t + 0.3);
}

function playUndockedV2(audioCtx, getNoiseBuffer) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const noise = audioCtx.createBufferSource();
    const filter = audioCtx.createBiquadFilter();
    const noiseGain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    noise.buffer = getNoiseBuffer(audioCtx);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(700, t);
    noiseGain.gain.setValueAtTime(0.02, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.24);
    noise.stop(t + 0.1);
}

function playUndockedV3(audioCtx) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.28);
    gain.gain.setValueAtTime(0.065, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.34);
}

function playUndockedV4(audioCtx) {
    const t = audioCtx.currentTime;
    const a = audioCtx.createOscillator();
    const b = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    a.type = "triangle";
    b.type = "triangle";
    a.frequency.setValueAtTime(260, t);
    b.frequency.setValueAtTime(180, t + 0.02);
    a.frequency.exponentialRampToValueAtTime(130, t + 0.24);
    b.frequency.exponentialRampToValueAtTime(70, t + 0.26);
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    a.connect(gain);
    b.connect(gain);
    gain.connect(audioCtx.destination);
    a.start(t);
    b.start(t + 0.02);
    a.stop(t + 0.32);
    b.stop(t + 0.32);
}

export const DOCKED_VARIANTS = [
    playDockedV0,
    playDockedV1,
    playDockedV2,
    playDockedV3,
    playDockedV4,
];

export const UNDOCKED_VARIANTS = [
    playUndockedV0,
    playUndockedV1,
    playUndockedV2,
    playUndockedV3,
    playUndockedV4,
];

export function playDockedVariant(index, audioCtx, getNoiseBuffer) {
    const i = clampVariantIndex(index, DOCKED_VARIANTS);
    return DOCKED_VARIANTS[i](audioCtx, getNoiseBuffer);
}

export function playUndockedVariant(index, audioCtx, getNoiseBuffer) {
    const i = clampVariantIndex(index, UNDOCKED_VARIANTS);
    return UNDOCKED_VARIANTS[i](audioCtx, getNoiseBuffer);
}
