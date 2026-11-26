/**
 * Offline, rule-based problem parser: typed textbook text → template + arguments.
 * It is deliberately transparent (regexes + keyword rules) so it works with no network
 * and no API key, and it reports which values it read and which it had to assume.
 */
import { TEMPLATES } from "../templates";

export interface OfflineParse {
  template: string;
  args: Record<string, number>;
  /** Arg names whose value came from the text. */
  found: string[];
  /** Human-readable assumptions for values not in the text. */
  assumed: string[];
  confidence: number;
}

interface Qty {
  value: number;
  unit: string;
  index: number;
}

const NUM = String.raw`(-?\d+(?:[.,]\d+)?(?:\s*(?:[x×]\s*10\^?\s*(-?\d+)|e(-?\d+)))?)`;

function num(s: string, exp1?: string, exp2?: string): number {
  const base = parseFloat(
    s
      .replace(",", ".")
      .replace(/\s*[x×].*$/, "")
      .replace(/e-?\d+$/, ""),
  );
  const e = exp1 ?? exp2;
  return e ? base * 10 ** Number(e) : base;
}

/** Extract numbers with units, normalised to SI. */
export function quantities(text: string): Qty[] {
  const t = text.replace(/\u2009|\u00a0/g, " ").replace(/\u00b5|\u03bc(?=[FH])/g, "u");
  const units: [RegExp, string, number][] = [
    [/^(kg|kilograms?)\b/i, "kg", 1],
    [/^(g|grams?)\b/, "kg", 1e-3],
    [/^(°|º|deg(rees?)?\b)/i, "deg", 1],
    [/^(m\/s²|m\/s\^2|m\/s2)/i, "m/s2", 1],
    [/^(m\/s|metres? per second|meters? per second)/i, "m/s", 1],
    [/^(km\/h)/i, "m/s", 1 / 3.6],
    [/^(N\/m)/i, "N/m", 1],
    [/^(N·s\/m|Ns\/m|kg\/s)/i, "Ns/m", 1],
    [/^(kg\/m)/i, "kg/m", 1],
    [/^(MΩ|Mohms?|megaohms?)/i, "ohm", 1e6],
    [/^(kΩ|kohms?|kiloohms?|k ohms?)/i, "ohm", 1e3],
    [/^(Ω|ohms?)/i, "ohm", 1],
    [/^(uF|microfarads?)/i, "F", 1e-6],
    [/^(nF|nanofarads?)/i, "F", 1e-9],
    [/^(mF|millifarads?)/i, "F", 1e-3],
    [/^(F|farads?)\b/, "F", 1],
    [/^(mH|millihenr(y|ies))/i, "H", 1e-3],
    [/^(uH|microhenr(y|ies))/i, "H", 1e-6],
    [/^(H|henr(y|ies))\b/, "H", 1],
    [/^(kV)/, "V", 1e3],
    [/^(mV)/, "V", 1e-3],
    [/^(V|volts?)\b/, "V", 1],
    [/^(mA)/, "A", 1e-3],
    [/^(A|amps?|amperes?)\b/, "A", 1],
    [/^(cm|centimet(er|re)s?)\b/i, "m", 1e-2],
    [/^(mm|millimet(er|re)s?)\b/i, "m", 1e-3],
    [/^(km)\b/, "m", 1e3],
    [/^(m|met(er|re)s?)\b/, "m", 1],
    [/^(s|sec|seconds?)\b/, "s", 1],
    [/^(Hz)/, "Hz", 1],
    [/^(N|newtons?)\b/, "N", 1],
  ];
  const out: Qty[] = [];
  const re = new RegExp(NUM + String.raw`\s*`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const rest = t.slice(m.index + m[0].length);
    const v = num(m[1], m[2], m[3]);
    let matched = false;
    for (const [ure, unit, k] of units) {
      const u = ure.exec(rest);
      if (u) {
        out.push({ value: v * k, unit, index: m.index });
        matched = true;
        break;
      }
    }
    if (!matched) out.push({ value: v, unit: "", index: m.index });
  }
  return out;
}

const has = (t: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === "string" ? t.includes(w) : w.test(t)));

/** Find a dimensionless coefficient named near a keyword (μk = 0.2, "coefficient of friction 0.3"). */
function coefficient(text: string, kind: "static" | "kinetic" | "any"): number | undefined {
  const t = text.toLowerCase();
  const pats: RegExp[] = [];
  if (kind === "static") pats.push(/(μ|mu|u)\s*_?s\s*[=:]?\s*(\d*\.?\d+)/i, /static[^.\d]{0,40}?(\d*\.\d+)/i);
  if (kind === "kinetic") pats.push(/(μ|mu|u)\s*_?k\s*[=:]?\s*(\d*\.?\d+)/i, /kinetic[^.\d]{0,40}?(\d*\.\d+)/i);
  if (kind === "any") pats.push(/(μ|mu)\s*[=:]?\s*(\d*\.?\d+)/i, /friction[^.\d]{0,40}?(\d*\.\d+)/i);
  for (const p of pats) {
    const m = p.exec(t);
    if (m) return parseFloat(m[m.length - 1]);
  }
  return undefined;
}

function indexOfRefraction(text: string): number | undefined {
  const m = /\b(?:n|index(?: of refraction)?|refractive index)\s*(?:=|of|is)?\s*(\d\.\d+)/i.exec(text);
  if (m) return parseFloat(m[1]);
  if (/water/i.test(text)) return 1.33;
  if (/diamond/i.test(text)) return 2.42;
  if (/glass|perspex|acrylic/i.test(text)) return 1.5;
  return undefined;
}

export function parseOffline(text: string): OfflineParse | null {
  const t = text.toLowerCase();
  const q = quantities(text);
  const of = (u: string) => q.filter((x) => x.unit === u).map((x) => x.value);
  const masses = of("kg"),
    angles = of("deg"),
    speeds = of("m/s"),
    lengths = of("m"),
    ohms = of("ohm"),
    farads = of("F"),
    henries = of("H"),
    volts = of("V"),
    ks = of("N/m");

  let template: string | null = null;
  const args: Record<string, number> = {};

  const isCircuit = ohms.length || farads.length || henries.length || has(t, "resistor", "capacitor", "battery", "circuit", "inductor");
  const isOptics = has(t, "lens", "mirror", "refract", "prism", "critical angle", "total internal", "snell", "ray of light", "light ");

  if (isCircuit) {
    if (has(t, "bridge", "wheatstone")) {
      template = "bridge";
      ["R1", "R2", "R3", "Rx"].forEach((k, i) => ohms[i] !== undefined && (args[k] = ohms[i]));
    } else if (farads.length && henries.length) {
      template = "rlc";
      if (ohms[0]) args.R = ohms[0];
      args.L = henries[0];
      args.C = farads[0];
    } else if (farads.length) {
      template = has(t, "discharg") ? "rcDischarge" : "rcCharge";
      if (ohms[0]) args.R = ohms[0];
      args.C = farads[0];
      if (volts[0] !== undefined) args[template === "rcDischarge" ? "V0" : "V"] = volts[0];
    } else if (henries.length) {
      template = "rl";
      if (ohms[0]) args.R = ohms[0];
      args.L = henries[0];
    } else if (has(t, "parallel") && ohms.length >= 2) {
      template = "parallel";
      ["R1", "R2", "R3"].forEach((k, i) => ohms[i] !== undefined && (args[k] = ohms[i]));
      if (ohms.length === 2) args.R3 = 1e9; // only two branches: the third lamp is effectively absent
    } else if (ohms.length >= 1) {
      template = "divider";
      args.R1 = ohms[0];
      if (ohms[1] !== undefined) args.R2 = ohms[1];
    }
    if (template && volts[0] !== undefined && !("V0" in args) && "V" in TEMPLATES[template].defaults) args.V = volts[0];
  } else if (isOptics) {
    const n = indexOfRefraction(text);
    if (has(t, "critical angle", "total internal", "totally internally")) {
      template = "tir";
      if (n) args.n = n;
      if (angles[0] !== undefined) args.angle = angles[0];
    } else if (has(t, "prism")) {
      template = "prism";
      if (n) args.n = n;
    } else if (has(t, "mirror")) {
      template = "concaveMirror";
      const fm = /focal length[^\d]{0,20}(\d*\.?\d+)\s*(cm|m)/i.exec(text);
      const rm = /radius[^\d]{0,30}(\d*\.?\d+)\s*(cm|m)/i.exec(text);
      if (rm) args.R = parseFloat(rm[1]) * (rm[2].toLowerCase() === "cm" ? 0.01 : 1);
      else if (fm) args.R = 2 * parseFloat(fm[1]) * (fm[2].toLowerCase() === "cm" ? 0.01 : 1);
    } else if (has(t, "lens")) {
      if (has(t, "radii", "radius", "lensmaker", "thickness")) {
        template = "thickLens";
        if (n) args.n = n;
      } else {
        template = "thinLens";
        const fm = /focal length[^\d-]{0,20}(-?\d*\.?\d+)\s*(cm|m)\b/i.exec(text);
        const dm = /(\d*\.?\d+)\s*(cm|m)\b[^.]{0,40}(from|in front of)[^.]{0,20}lens/i.exec(text) ?? /object[^.\d]{0,40}?(\d*\.?\d+)\s*(cm|m)\b/i.exec(text);
        const hm = /(\d*\.?\d+)\s*(cm|m)\s*(tall|high)/i.exec(text);
        const k = (u: string) => (u.toLowerCase() === "cm" ? 0.01 : 1);
        if (fm) args.f = parseFloat(fm[1]) * k(fm[2]);
        if (dm) args.do = parseFloat(dm[1]) * k(dm[2]);
        if (hm) args.h = parseFloat(hm[1]) * k(hm[2]);
        if (args.f !== undefined && has(t, "diverging", "concave lens")) args.f = -Math.abs(args.f);
        // fit cm-scale problems onto the 4 m bench by uniform scaling (ratios are what matter)
        const scale = Math.max(Math.abs(args.f ?? 0), args.do ?? 0) > 3.5 ? 3.5 / Math.max(Math.abs(args.f ?? 0), args.do ?? 0) : 1;
        if (scale !== 1) for (const key of ["f", "do", "h"]) if (args[key] !== undefined) args[key] *= scale;
      }
    } else {
      template = "snell";
      if (n) args.n = n;
      if (angles[0] !== undefined) args.angle = angles[0];
    }
  } else {
    const pulley = has(t, "pulley");
    if (pulley && masses.length >= 2) {
      if (has(t, "incline", "ramp", "slope", "table", "horizontal surface", "plane") || angles.length) {
        template = "inclinePulley";
        // the mass on the surface is mentioned first; the hanging one has "hang"
        const kgQ = q.filter((x) => x.unit === "kg");
        const hanging = kgQ.findIndex((x) => /hang|suspend|dangl/i.test(text.slice(x.index, x.index + 40)));
        const hangIdx = hanging >= 0 ? hanging : 1;
        args.m2 = masses[hangIdx];
        args.m1 = masses[hangIdx === 0 ? 1 : 0];
        args.angle = has(t, "table", "horizontal") && !angles.length ? 0 : (angles[0] ?? 30);
        const ms = coefficient(text, "static"),
          mk = coefficient(text, "kinetic"),
          ma = coefficient(text, "any");
        if (mk !== undefined) args.muK = mk;
        else if (ma !== undefined) args.muK = ma;
        if (ms !== undefined) args.muS = ms;
        else if (args.muK !== undefined) args.muS = args.muK;
        if (has(t, "frictionless", "smooth")) {
          args.muK = 0;
          args.muS = 0;
        }
      } else {
        template = "atwood";
        args.m1 = masses[0];
        args.m2 = masses[1];
      }
    } else if (has(t, "pendulum", "bob")) {
      template = "pendulum";
      if (lengths[0] !== undefined) args.L = lengths[0];
      if (angles[0] !== undefined) args.angle = angles[0];
      if (masses[0] !== undefined) args.m = masses[0];
    } else if (has(t, "spring")) {
      template = has(t, "hang", "vertical", "ceiling", "suspended") ? "verticalSpring" : "springMass";
      if (ks[0] !== undefined) args.k = ks[0];
      if (masses[0] !== undefined) args.m = masses[0];
      if (template === "springMass" && lengths[0] !== undefined) args.amplitude = lengths[0];
    } else if (has(t, "collid", "collision", "collides")) {
      template = "collision";
      if (masses[0] !== undefined) args.m1 = masses[0];
      if (masses[1] !== undefined) args.m2 = masses[1];
      if (speeds[0] !== undefined) args.u1 = speeds[0];
      args.u2 = speeds[1] ?? 0;
    } else if (has(t, "terminal", "air resistance", "drag")) {
      template = "dragFall";
      if (masses[0] !== undefined) args.m = masses[0];
      const c = /(\d*\.?\d+)\s*(?:·|\*)?\s*v\s*(?:²|\^2)/i.exec(text) ?? /c\s*=\s*(\d*\.?\d+)/i.exec(text);
      if (c) args.c = parseFloat(c[1]);
    } else if (has(t, "thrown", "launched", "projectile", "kicked", "fired", "throws", "launches")) {
      template = "projectile";
      if (speeds[0] !== undefined) args.v0 = speeds[0];
      args.angle = angles[0] ?? (has(t, "horizontally") ? 0.0001 : 45);
      const h =
        /(\d*\.?\d+)\s*m(?![/\w])[^.\d]{0,25}(above|high|tall|cliff|height)/i.exec(text) ??
        /(?:height|cliff|building)[^.\d]{0,25}(\d*\.?\d+)\s*m(?![/\w])/i.exec(text);
      if (h) args.h0 = parseFloat(h[1]);
    } else if ((has(t, "slides", "sliding", "skid", "puck") && speeds.length) || has(t, "stopping distance")) {
      template = "slidingStop";
      if (speeds[0] !== undefined) args.v0 = speeds[0];
      const mu = coefficient(text, "kinetic") ?? coefficient(text, "any");
      if (mu !== undefined) args.mu = mu;
      if (masses[0] !== undefined) args.m = masses[0];
    } else if (has(t, "incline", "ramp", "slope", "inclined plane")) {
      template = "inclineBlock";
      if (masses[0] !== undefined) args.m = masses[0];
      if (angles[0] !== undefined) args.angle = angles[0];
      const ms = coefficient(text, "static"),
        mk = coefficient(text, "kinetic") ?? coefficient(text, "any");
      if (mk !== undefined) args.muK = mk;
      if (ms !== undefined) args.muS = ms;
      else if (mk !== undefined) args.muS = mk;
      if (has(t, "frictionless", "smooth")) {
        args.muK = 0;
        args.muS = 0;
      }
    } else if (has(t, "dropped", "falls", "free fall", "free-fall")) {
      template = "projectile";
      args.v0 = 0.0001;
      args.angle = 90;
      const h = lengths[0];
      if (h !== undefined) args.h0 = h;
    }
  }
  if (!template) return null;
  const def = TEMPLATES[template];
  const clean: Record<string, number> = {};
  const found: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (k in def.defaults && Number.isFinite(v)) {
      clean[k] = v;
      found.push(k);
    }
  }
  const assumed = Object.keys(def.defaults)
    .filter((k) => !(k in clean))
    .map((k) => `${def.argDocs[k]?.[0] ?? k} = ${def.defaults[k]}${def.argDocs[k]?.[1] ? " " + def.argDocs[k][1] : ""}`);
  const total = Object.keys(def.defaults).length;
  return { template, args: clean, found, assumed, confidence: Math.round(100 * (0.4 + (0.6 * found.length) / total)) / 100 };
}
