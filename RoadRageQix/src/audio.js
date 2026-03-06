/** Procedural audio system using Web Audio API - no external files needed */

let audioCtx = null;
let masterGain = null;
let ambientNode = null;
let engineNode = null;
let engineGain = null;

function getCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(audioCtx.destination);
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function now() {
  const ctx = getCtx();
  return ctx ? ctx.currentTime : 0;
}

/** Short noise burst for spark ricochet */
export function playSpark() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = now();
  const bufLen = Math.floor(ctx.sampleRate * 0.04);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 4000 + Math.random() * 3000;
  src.connect(hp).connect(g).connect(masterGain);
  src.start(t);
  src.stop(t + 0.05);
}

/** Territory claim sound - rising tone */
export function playClaim(percent) {
  const ctx = getCtx();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const baseFreq = 220 + percent * 440;
  osc.type = "square";
  osc.frequency.setValueAtTime(baseFreq, t);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, t + 0.15);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.26);
}

/** Damage / life loss - harsh distorted drop */
export function playDamage() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const dist = ctx.createWaveShaperFunction
    ? null
    : ctx.createWaveShaper();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.35);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  if (dist) {
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 3) * x / (Math.PI + 3 * Math.abs(x));
    }
    dist.curve = curve;
    osc.connect(dist).connect(g).connect(masterGain);
  } else {
    osc.connect(g).connect(masterGain);
  }
  osc.start(t);
  osc.stop(t + 0.42);

  // Second voice - low thump
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(80, t);
  osc2.frequency.exponentialRampToValueAtTime(30, t + 0.3);
  g2.gain.setValueAtTime(0.2, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc2.connect(g2).connect(masterGain);
  osc2.start(t);
  osc2.stop(t + 0.36);
}

/** Level up fanfare - ascending arpeggio */
export function playLevelUp() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = now();
  const notes = [330, 415, 523, 660];
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = notes[i];
    const start = t + i * 0.1;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.1, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    osc.connect(g).connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.22);
  }
}

/** Nitro activation whoosh */
export function playNitro() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = now();
  const bufLen = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    const env = Math.pow(1 - i / bufLen, 1.5);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(800, t);
  bp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
  bp.Q.value = 1.5;
  src.connect(bp).connect(g).connect(masterGain);
  src.start(t);
  src.stop(t + 0.32);
}

/** Pickup collect chime */
export function playPickup() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = now();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  osc.connect(g).connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.16);
}

/** Start/stop ambient wind drone */
export function startAmbient() {
  const ctx = getCtx();
  if (!ctx || ambientNode) return;
  const bufLen = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  ambientNode = ctx.createBufferSource();
  ambientNode.buffer = buf;
  ambientNode.loop = true;
  const g = ctx.createGain();
  g.gain.value = 0.025;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 280;
  lp.Q.value = 0.7;
  ambientNode.connect(lp).connect(g).connect(masterGain);
  ambientNode.start();
}

export function stopAmbient() {
  if (ambientNode) {
    try { ambientNode.stop(); } catch {}
    ambientNode = null;
  }
}

/** Engine rumble - continuous, pitch controlled externally */
export function startEngine() {
  const ctx = getCtx();
  if (!ctx || engineNode) return;
  const bufLen = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1);
  }
  engineNode = ctx.createBufferSource();
  engineNode.buffer = buf;
  engineNode.loop = true;
  engineNode.playbackRate.value = 0.4;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 120;
  bp.Q.value = 2.5;
  engineNode.connect(bp).connect(engineGain).connect(masterGain);
  engineNode.start();
}

export function updateEngine(speed, nitroActive) {
  if (!engineNode || !engineGain) return;
  const vol = speed > 0.01 ? 0.06 + speed * 0.04 : 0;
  const rate = 0.35 + speed * 0.35 + (nitroActive ? 0.3 : 0);
  engineGain.gain.value = vol;
  engineNode.playbackRate.value = rate;
}

export function stopEngine() {
  if (engineNode) {
    try { engineNode.stop(); } catch {}
    engineNode = null;
    engineGain = null;
  }
}

/** Resume audio context on user gesture */
export function ensureAudioResumed() {
  getCtx();
}
