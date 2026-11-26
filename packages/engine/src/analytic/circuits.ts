/** Analytic layer for circuits: archetype recognition, closed forms, and measured values. */
import type { CircuitScene, Component } from "../schema/scene";
import { findResonance, type CircuitResult } from "../circuits/mna";
import { firstReach, percentError, zeroCrossPeriod } from "../math/numeric";
import type { AuditCheck, CheckedQuantity, Verification } from "./types";

const q = (id: string, label: string, unit: string, analytic: number, simulated: number, formula: string): CheckedQuantity => ({
  id,
  label,
  unit,
  analytic,
  simulated,
  errorPct: percentError(simulated, analytic),
  formula,
});

type Of<T extends Component["type"]> = Extract<Component, { type: T }>;

export function circuitAudits(r: CircuitResult): AuditCheck[] {
  return [
    {
      label: "Kirchhoff current law",
      value: r.stats.maxKclResidual,
      unit: "A",
      pass: r.stats.maxKclResidual <= 1e-9 * r.stats.maxCurrent + 1e-15,
      detail: "max |Σ currents| at any node, any time (pass: < 10⁻⁹ of the largest current)",
    },
    {
      label: "Tellegen power balance",
      value: r.stats.maxTellegen * 100,
      unit: "%",
      pass: r.stats.maxTellegen < 1e-6,
      detail: "|Σ v·i| / Σ|v·i| — power delivered equals power absorbed at every instant",
    },
    {
      label: "Energy audit",
      value: r.stats.energyResidualPct,
      unit: "%",
      pass: r.stats.energyResidualPct < 0.5,
      detail: "|∫P_sources − ∫P_resistors − ΔE_stored| over the run",
    },
  ];
}

/** True when the components form one simple loop (every node has degree 2). */
function isSingleLoop(c: CircuitScene): boolean {
  const deg = new Map<string, number>();
  for (const k of c.components) {
    deg.set(k.a, (deg.get(k.a) ?? 0) + 1);
    deg.set(k.b, (deg.get(k.b) ?? 0) + 1);
  }
  return [...deg.values()].every((d) => d === 2);
}

export function analyzeCircuit(c: CircuitScene, r: CircuitResult): Verification {
  const audits = circuitAudits(r);
  const notes: string[] = [];
  const by = <T extends Component["type"]>(t: T) => c.components.filter((k) => k.type === t) as Of<T>[];
  const Vs = by("voltageSource"),
    Is = by("currentSource"),
    Rs = [...by("resistor"), ...by("lamp")],
    Cs = by("capacitor"),
    Ls = by("inductor"),
    Sw = by("switch");
  const idxOf = (id: string) => c.components.findIndex((k) => k.id === id);
  const ts = r.frames.map((f) => f.t);
  const loop = isSingleLoop(c);
  const closeAt = Sw.length ? Math.max(...Sw.map((s) => s.closeAt)) : 0;

  /* ── Series RLC (resonance / ringing) ── */
  if (loop && Rs.length === 1 && Cs.length === 1 && Ls.length === 1 && Vs.length === 1 && Is.length === 0) {
    const R = Rs[0].resistance,
      L = Ls[0].inductance,
      C = Cs[0].capacitance;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const alpha = R / (2 * L);
    const w0 = 1 / Math.sqrt(L * C);
    const quantities: CheckedQuantity[] = [];
    if (c.acSweep) quantities.push(q("f0", "Resonant frequency", "Hz", f0, findResonance(c), "f₀ = 1 / (2π·√(L·C))"));
    if (alpha < w0 && Vs[0].acAmplitude === 0) {
      const wd = Math.sqrt(w0 * w0 - alpha * alpha);
      const Td = (2 * Math.PI) / wd;
      // loop current ∝ dV_C/dt: its zeros are exactly half a damped period apart
      const k = idxOf(Cs[0].id);
      const after = r.frames.filter((f) => f.t > closeAt);
      const Tsim = zeroCrossPeriod(
        after.map((f) => f.t),
        after.map((f) => f.compI[k]),
      );
      if (Number.isFinite(Tsim)) quantities.push(q("Td", "Ringing period", "s", Td, Tsim, "T = 2π / √(1/LC − (R/2L)²)"));
    }
    notes.push(`Quality factor Q = ${((1 / R) * Math.sqrt(L / C)).toFixed(2)}; ${alpha < w0 ? "underdamped" : "overdamped"}.`);
    return { archetype: "Series RLC circuit", summary: `R = ${R} Ω, L = ${L} H, C = ${C} F in series.`, quantities, audits, notes };
  }

  /* ── RC charging / discharging ── */
  if (loop && Rs.length === 1 && Cs.length === 1 && Ls.length === 0 && Vs.length <= 1 && Is.length === 0 && (Vs.length === 0 || Vs[0].acAmplitude === 0)) {
    const R = Rs[0].resistance,
      C = Cs[0].capacitance;
    const tau = R * C;
    const k = idxOf(Cs[0].id);
    const V0 = Cs[0].initialVoltage;
    // Orientation-independent: the capacitor relaxes from V0 to its final value Vf
    const Vf = r.frames[r.frames.length - 1].compV[k];
    const Vsrc = Vs.length ? Vs[0].voltage : 0;
    const vFinal = Vs.length ? Math.sign(Vf || 1) * Math.abs(Vsrc) : 0;
    const target = vFinal + (V0 - vFinal) * Math.exp(-1);
    const after = r.frames.filter((f) => f.t >= closeAt);
    const tSim =
      firstReach(
        after.map((f) => f.t),
        after.map((f) => f.compV[k]),
        target,
      ) - closeAt;
    const kR = idxOf(Rs[0].id);
    const i0 = Math.abs(vFinal - V0) / R;
    const first = r.frames.find((f) => f.t >= closeAt && Math.abs(f.compI[kR]) > 0) ?? r.frames[0];
    void ts;
    const charging = Math.abs(vFinal) > Math.abs(V0);
    return {
      archetype: charging ? "RC charging" : "RC discharging",
      summary: `R = ${R} Ω, C = ${C} F${Vs.length ? `, ${Vsrc} V source` : `, starting at ${V0} V`}.`,
      quantities: [
        q("tau", "Time constant τ (time to 63.2%)", "s", tau, tSim, "τ = R·C"),
        q("i0", "Initial current", "A", i0, Math.abs(first.compI[kR]), "I₀ = |ΔV| / R"),
      ],
      audits,
      notes: [`V_C(t) = V_f + (V₀ − V_f)·e^(−t/τ). After 5τ = ${(5 * tau).toPrecision(3)} s the capacitor is >99% of the way there.`],
    };
  }

  /* ── RL ── */
  if (loop && Rs.length === 1 && Ls.length === 1 && Cs.length === 0 && Vs.length === 1 && Is.length === 0 && Vs[0].acAmplitude === 0) {
    const R = Rs[0].resistance,
      L = Ls[0].inductance;
    const tau = L / R;
    const k = idxOf(Ls[0].id);
    const If = Vs[0].voltage / R;
    const I0 = Ls[0].initialCurrent;
    const sgn = Math.sign(r.frames[r.frames.length - 1].compI[k] || 1);
    const after = r.frames.filter((f) => f.t >= closeAt);
    const target = Math.abs(I0) + (Math.abs(If) - Math.abs(I0)) * (1 - Math.exp(-1));
    const tSim =
      firstReach(
        after.map((f) => f.t),
        after.map((f) => sgn * f.compI[k]),
        target,
      ) - closeAt;
    const Iend = Math.abs(r.frames[r.frames.length - 1].compI[k]);
    return {
      archetype: "RL circuit",
      summary: `R = ${R} Ω, L = ${L} H, ${Vs[0].voltage} V source.`,
      quantities: [q("tau", "Time constant τ", "s", tau, tSim, "τ = L / R"), q("If", "Final current", "A", Math.abs(If), Iend, "I = V / R")],
      audits,
      notes,
    };
  }

  /* ── Purely resistive DC with one voltage source ── */
  if (Cs.length === 0 && Ls.length === 0 && Vs.length === 1 && Is.length === 0 && Rs.length >= 1 && Vs[0].acAmplitude === 0) {
    const V = Math.abs(Vs[0].voltage);
    const kV = idxOf(Vs[0].id);
    const last = r.frames[r.frames.length - 1];
    const Isim = Math.abs(last.compI[kV]);
    if (loop) {
      const Req = Rs.reduce((s, k) => s + k.resistance, 0);
      const k1 = idxOf(Rs[0].id);
      return {
        archetype: Rs.length > 1 ? "Series resistors (voltage divider)" : "Ohm's law",
        summary: `${Rs.length} resistor${Rs.length > 1 ? "s" : ""} in series with a ${V} V source.`,
        quantities: [
          q("I", "Current", "A", V / Req, Isim, "I = V / ΣR"),
          ...(Rs.length > 1
            ? [q("V1", `Voltage across ${Rs[0].label ?? Rs[0].id}`, "V", (V * Rs[0].resistance) / Req, Math.abs(last.compV[k1]), "V₁ = V·R₁ / ΣR")]
            : []),
        ],
        audits,
        notes,
      };
    }
    const src = Vs[0];
    const parallel = Rs.every((k) => (k.a === src.a && k.b === src.b) || (k.a === src.b && k.b === src.a));
    if (parallel && Sw.length === 0) {
      const Req = 1 / Rs.reduce((s, k) => s + 1 / k.resistance, 0);
      return {
        archetype: "Parallel resistors",
        summary: `${Rs.length} resistors in parallel across a ${V} V source.`,
        quantities: [q("Req", "Equivalent resistance", "Ω", Req, V / Isim, "1/R_eq = Σ 1/Rᵢ"), q("I", "Total current", "A", V / Req, Isim, "I = V / R_eq")],
        audits,
        notes,
      };
    }
  }

  /* ── Wheatstone bridge (Thevenin analysis of the galvanometer branch) ── */
  if (Cs.length === 0 && Ls.length === 0 && Vs.length === 1 && Is.length === 0 && Sw.length === 0 && Rs.length === 5 && c.nodes.length === 4) {
    const src = Vs[0];
    const top = src.a,
      bot = src.b;
    const galv = Rs.find((k) => ![top, bot].includes(k.a) && ![top, bot].includes(k.b));
    if (galv) {
      const between = (p: string, q2: string) => Rs.find((k) => k !== galv && ((k.a === p && k.b === q2) || (k.a === q2 && k.b === p)));
      const L = galv.a,
        Rn = galv.b;
      const R1 = between(top, L),
        R2 = between(L, bot),
        R3 = between(top, Rn),
        Rx = between(Rn, bot);
      if (R1 && R2 && R3 && Rx) {
        const V = src.voltage;
        const Vth = V * (R2.resistance / (R1.resistance + R2.resistance) - Rx.resistance / (R3.resistance + Rx.resistance));
        const par = (a: number, b: number) => (a * b) / (a + b);
        const Rth = par(R1.resistance, R2.resistance) + par(R3.resistance, Rx.resistance);
        const Ig = Vth / (Rth + galv.resistance);
        const kg = idxOf(galv.id);
        const last = r.frames[r.frames.length - 1];
        const balance = (R2.resistance * R3.resistance) / R1.resistance;
        notes.push(`The bridge balances (no galvanometer current) when Rₓ = R₂·R₃/R₁ = ${balance.toFixed(1)} Ω.`);
        return {
          archetype: "Wheatstone bridge",
          summary: `Bridge with R₁ = ${R1.resistance} Ω, R₂ = ${R2.resistance} Ω, R₃ = ${R3.resistance} Ω, Rₓ = ${Rx.resistance} Ω.`,
          quantities: [q("Ig", "Galvanometer current", "A", Ig, last.compI[kg], "I_g = V_th / (R_th + R_g)  (Thevenin)")],
          audits,
          notes,
        };
      }
    }
  }

  return {
    archetype: null,
    summary: "A general network — verified by Kirchhoff, Tellegen and energy audits.",
    quantities: [],
    audits,
    notes,
  };
}
