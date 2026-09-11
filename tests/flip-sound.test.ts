import test from "node:test";
import assert from "node:assert/strict";

test("page audio plays once per turn, never queues suspended sounds, and stops on mute", async () => {
  const sources: Array<{ onended: null | (() => void); stop: () => void; disconnect: () => void }> = [];
  let stops = 0;
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    state: "running", currentTime: 0, sampleRate: 1000, destination: {},
    resume: async () => {},
    createBuffer: () => ({ getChannelData: () => new Float32Array(1500) }),
    createBufferSource: () => {
      const source = { buffer: null, connect() {}, start() {}, stop() { stops++; }, disconnect() {}, onended: null as null | (() => void) };
      sources.push(source); return source;
    },
    createBiquadFilter: () => ({ type: "", Q: param(), frequency: param(), connect() {}, disconnect() {} }),
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
  };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "AudioContext", { value: function () { return ctx; }, configurable: true });
  try {
    const { playFlipSound, stopFlipSound } = await import("../lib/flip-sound");
    playFlipSound();
    for (let i = 0; i < 30; i++) { ctx.currentTime += 0.01; playFlipSound(); }
    assert.equal(sources.length, 1, "rapid input must not layer sounds");
    sources[0].onended?.();
    ctx.currentTime = 0.5; playFlipSound();
    assert.equal(sources.length, 1, "duplicate state transitions stay silent");
    ctx.currentTime = 0.7; playFlipSound();
    assert.equal(sources.length, 2, "the next turn can play");
    const before = stops; stopFlipSound();
    assert.equal(stops, before + 1, "mute immediately stops the active sound");
    ctx.state = "suspended"; ctx.currentTime = 2; playFlipSound(); playFlipSound();
    assert.equal(sources.length, 2, "suspended audio must not accumulate a playback queue");
    ctx.state = "running"; playFlipSound();
    assert.equal(sources.length, 3);
    stopFlipSound();
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow); else Reflect.deleteProperty(globalThis, "window");
    if (oldAudio) Object.defineProperty(globalThis, "AudioContext", oldAudio); else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
