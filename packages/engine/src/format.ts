/** Number formatting shared by the UI, narration and tutor. */

const PREFIXES: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
];

/** Engineering notation for electrical units (5 kΩ, 10 µF); plain significant digits otherwise. */
export function fmt(value: number, unit = "", digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  const engineering = ["Ω", "F", "H", "A", "V", "W", "Hz", "s"].includes(unit);
  if (engineering && value !== 0) {
    const a = Math.abs(value);
    for (const [k, p] of PREFIXES) {
      if (a >= k * 0.9999) {
        if (unit === "s" && k > 1) break;
        return `${trim((value / k).toPrecision(digits))} ${p}${unit}`.trim();
      }
    }
  }
  // floating-point noise (a block held by static friction: a = -7.7e-16 m/s²) reads as 0
  if (!engineering && Math.abs(value) < 1e-12) value = 0;
  const a = Math.abs(value);
  const s = a !== 0 && (a < 1e-3 || a >= 1e6) ? value.toExponential(digits - 1) : trim(value.toPrecision(digits));
  return unit ? `${s} ${unit}` : s;
}

function trim(s: string): string {
  if (s.includes("e")) return s;
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Percent error with a sensible number of digits ("0.0003%", "<1e-10%"). */
export function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p === 0) return "0%";
  if (p < 1e-10) return "<10⁻¹⁰ %";
  if (p < 0.001) return `${p.toExponential(1)}%`;
  return `${trim(p.toPrecision(2))}%`;
}
