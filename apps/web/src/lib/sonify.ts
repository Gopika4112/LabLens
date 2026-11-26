/**
 * Sonification: hear a graph.
 *   pitch  = value (log-mapped onto 220–880 Hz, two octaves)
 *   pan    = time (left → right, like reading the x-axis)
 *   click  = the value crosses zero (e.g. velocity changes direction)
 * A short low/high reference pair is played first so the listener knows the scale.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface SonifyHandle {
  stop: () => void;
  done: Promise<void>;
}

const FMIN = 220,
  FMAX = 880;

function pitch(v: number, lo: number, hi: number): number {
  const u = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  return FMIN * Math.pow(FMAX / FMIN, Math.min(1, Math.max(0, u)));
}

function blip(ac: AudioContext, t: number, f: number, dur: number, pan: number, type: OscillatorType = "sine", vol = 0.15) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  const p = ac.createStereoPanner();
  o.type = type;
  o.frequency.value = f;
  p.pan.value = pan;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(p).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sonify(values: number[], opts: { duration?: number; reference?: boolean; onProgress?: (u: number) => void } = {}): SonifyHandle {
  const ac = audio();
  const duration = opts.duration ?? 4;
  const finite = values.filter(Number.isFinite);
  const lo = Math.min(...finite),
    hi = Math.max(...finite);
  let t0 = ac.currentTime + 0.05;
  if (opts.reference !== false) {
    blip(ac, t0, FMIN, 0.25, -0.6, "sine", 0.12);
    blip(ac, t0 + 0.3, FMAX, 0.25, 0.6, "sine", 0.12);
    t0 += 0.8;
  }
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const pan = ac.createStereoPanner();
  osc.type = "triangle";
  const n = Math.min(values.length, 240);
  const step = (values.length - 1) / Math.max(1, n - 1);
  osc.frequency.setValueAtTime(pitch(values[0], lo, hi), t0);
  pan.pan.setValueAtTime(-1, t0);
  for (let i = 1; i < n; i++) {
    const v = values[Math.round(i * step)];
    const t = t0 + (duration * i) / (n - 1);
    osc.frequency.linearRampToValueAtTime(pitch(Number.isFinite(v) ? v : lo, lo, hi), t);
  }
  pan.pan.linearRampToValueAtTime(1, t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.18, t0 + 0.05);
  gain.gain.setValueAtTime(0.18, t0 + duration - 0.08);
  gain.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(gain).connect(pan).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
  // zero-crossing clicks
  if (lo < 0 && hi > 0)
    for (let i = 1; i < values.length; i++)
      if (Math.sign(values[i]) !== Math.sign(values[i - 1]) && values[i - 1] !== 0) {
        const u = i / (values.length - 1);
        blip(ac, t0 + u * duration, 1600, 0.05, -1 + 2 * u, "square", 0.06);
      }
  let raf = 0;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((r) => (resolveDone = r));
  const tick = () => {
    const u = (ac.currentTime - t0) / duration;
    opts.onProgress?.(Math.max(0, Math.min(1, u)));
    if (u < 1) raf = requestAnimationFrame(tick);
    else resolveDone();
  };
  raf = requestAnimationFrame(tick);
  return {
    stop: () => {
      cancelAnimationFrame(raf);
      try {
        gain.gain.cancelScheduledValues(ac.currentTime);
        gain.gain.setValueAtTime(0, ac.currentTime);
        osc.stop();
      } catch {
        /* already stopped */
      }
      opts.onProgress?.(-1);
      resolveDone();
    },
    done,
  };
}

/** Short earcon for simulation events (e.g. a bounce or the switch closing). */
export function earcon(kind: "event" | "success" | "warn" = "event") {
  try {
    const ac = audio();
    const t = ac.currentTime + 0.01;
    if (kind === "success") {
      blip(ac, t, 660, 0.12, 0);
      blip(ac, t + 0.1, 880, 0.18, 0);
    } else if (kind === "warn") blip(ac, t, 300, 0.25, 0, "sawtooth", 0.06);
    else blip(ac, t, 990, 0.08, 0, "sine", 0.08);
  } catch {
    /* audio unavailable */
  }
}
