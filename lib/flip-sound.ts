// Synthesized paper page-flip sound via Web Audio — no audio asset needed.
// Two layered noise swishes (slide + settle) approximate a real page turn.

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
    const length = Math.floor(ctx.sampleRate * 0.5);
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
}

export function playFlipSound() {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  // Main swish: the page sliding through the air.
  swish(ctx, now, 0.22, 700, 2800, 0.28);
  // Softer, lower tail: the page settling down.
  swish(ctx, now + 0.16, 0.14, 2200, 500, 0.12);
}
