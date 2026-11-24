// Synthesised sound: no audio files, just oscillators through a gain node. Everything
// is guarded: in a headless run (or a browser without audio) there is no AudioContext
// and every call is a no-op, so the game never depends on sound existing.
let context = null;
let master = null;
let engineNodes = null;

function ensure() {
  if (context !== null) return context;
  try {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (AudioContext === undefined) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.16;
    master.connect(context.destination);
  } catch {
    return null;
  }
  return context;
}

function blip(frequency, duration, type = 'sine', volume = 1) {
  const ctx = ensure();
  if (ctx === null) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Sound must never break the game.
  }
}

/** A short two-note pickup chime. */
export function playPickup() {
  blip(660, 0.09);
  window.setTimeout(() => blip(880, 0.12), 70);
}

/** The mission-complete jingle: three rising notes. */
export function playMissionDone() {
  blip(523, 0.12);
  window.setTimeout(() => blip(659, 0.12), 110);
  window.setTimeout(() => blip(784, 0.22), 220);
}

/** A dull thud for a punch landing. */
export function playPunch() {
  blip(140, 0.08, 'square', 0.7);
}

/** A metallic crunch for a ram. */
export function playCrash() {
  blip(90, 0.18, 'sawtooth', 0.8);
}

/** The police siren: two alternating tones while the heat is on. */
export function playSiren() {
  blip(700, 0.35, 'triangle', 0.5);
  window.setTimeout(() => blip(520, 0.35, 'triangle', 0.5), 380);
}

/** The engine hum while driving: a low oscillator whose pitch follows speed. */
export function setEngine(running, speedRatio) {
  const ctx = ensure();
  if (ctx === null) return;
  try {
    if (running && engineNodes === null) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 60;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      engineNodes = { osc, gain };
    }
    if (engineNodes !== null) {
      engineNodes.osc.frequency.value = 55 + 90 * Math.max(0, Math.min(1, speedRatio));
      engineNodes.gain.gain.value = running ? 0.05 : 0;
      if (!running) {
        engineNodes.osc.stop();
        engineNodes = null;
      }
    }
  } catch {
    // Sound must never break the game.
  }
}
