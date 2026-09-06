// Synthesized paper page-flip sound via Web Audio — no audio asset needed.
// Two layered noise swishes (slide + settle) approximate a real page turn.

export const FLIP_DURATION_MS = 650;

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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
  src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
}

export function prepareFlipSound() {
  const ctx = getContext();
  if (ctx) getNoise(ctx);
}

export function playFlipSound() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Main swish: the page sliding through the air.
  const duration = FLIP_DURATION_MS / 1000;
  swish(ctx, now, duration * 0.8, 650, 2400, 0.16);
  // Softer, lower tail: the page settling down.
  swish(ctx, now + duration * 0.65, duration * 0.35, 1800, 450, 0.06);
}

/** A short rustle while the reader physically pulls a page. */
export function playDragSound() {
  const ctx = getContext();
  if (ctx) swish(ctx, ctx.currentTime, 0.18, 600, 1500, 0.075);
}
