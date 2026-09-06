// Synthesized paper page-flip sound via Web Audio — no audio asset needed.
// One short swish per turn; never layer repeated drag or touch events.

export const FLIP_DURATION_MS = 650;

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let activeSource: AudioBufferSourceNode | null = null;
let lastPlayedAt = -Infinity;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.floor(ctx.sampleRate * 1.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function swish(
  ctx: AudioContext,
  when: number,
  duration: number,
  fromHz: number,
  toHz: number,
  peakGain: number
) {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  activeSource = src;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(fromHz, when);
  filter.frequency.exponentialRampToValueAtTime(toHz, when + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peakGain, when + duration * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(when, Math.random() * 0.2, duration + 0.05);
  src.stop(when + duration + 0.05);
  src.onended = () => {
    if (activeSource === src) activeSource = null;
    src.disconnect(); filter.disconnect(); gain.disconnect();
  };
}

export function prepareFlipSound() {
  const ctx = getContext();
  if (ctx) getNoise(ctx);
}

export function playFlipSound() {
  const ctx = getContext();
  // Never queue sounds while browser audio is suspended.
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  if (activeSource || now - lastPlayedAt < FLIP_DURATION_MS / 1000) return;
  lastPlayedAt = now;
  swish(ctx, now, 0.38, 650, 2200, 0.32);
}

export function stopFlipSound() {
  const source = activeSource;
  activeSource = null;
  if (source) {
    try { source.stop(); } catch { /* Already ended. */ }
    source.disconnect();
  }
}
