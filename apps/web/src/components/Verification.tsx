import { fmt, fmtPct, type Verification } from "@lablens/engine";
import { Icon } from "./Icon";

const PASS_PCT = 0.5;

/** The instrument strip: simulated vs analytic, with % error — the textbook answer key, computed. */
export function VerificationPanel({ v, ms }: { v: Verification | null; ms?: number }) {
  if (!v)
    return (
      <div className="instrument p-4 scanning" aria-busy="true">
        <p className="num text-sm opacity-80">Simulating…</p>
      </div>
    );
  const primary = v.quantities[0];
  const allAudits = v.audits.every((a) => a.pass);
  const ok = primary ? primary.errorPct < PASS_PCT : allAudits;
  return (
    <section className="instrument p-4 settle" aria-labelledby="verify-h" key={v.summary + (primary?.simulated ?? "")}>
      <div className="flex items-start gap-3">
        <span className={`grid place-items-center w-9 h-9 rounded-full shrink-0 ${ok ? "bg-[#4ade80]/15 text-[#4ade80]" : "bg-[#f87171]/15 text-[#f87171]"}`}>
          <Icon name={ok ? "check" : "x"} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="verify-h" className="text-sm font-semibold">
            {v.archetype ? (ok ? "Checked against theory" : "Doesn't match theory") : "Self-checks"}
            {v.archetype && <span className="font-normal opacity-70"> · {v.archetype}</span>}
          </h2>
          {primary ? (
            <p className="num text-[15px] sm:text-base leading-relaxed mt-1" aria-live="polite">
              <span className="sr-only">{ok ? "Verified. " : "Mismatch. "}</span>
              <span className="whitespace-nowrap">
                Simulated <span className="text-phosphor font-medium">{primary.id}</span> ={" "}
                <span className="text-phosphor font-medium">{fmt(primary.simulated, primary.unit, 4)}</span>
              </span>
              <span className="opacity-50"> · </span>
              <span className="whitespace-nowrap">
                Analytic = <span className="font-medium">{fmt(primary.analytic, primary.unit, 4)}</span>
              </span>
              <span className="opacity-50"> · </span>
              <span className="whitespace-nowrap">
                error <span className={ok ? "text-[#4ade80]" : "text-[#f87171]"}>{fmtPct(primary.errorPct)}</span>
              </span>
            </p>
          ) : (
            <p className="num text-sm mt-1">{v.summary}</p>
          )}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer opacity-80 hover:opacity-100">
          How do we know? ({v.quantities.length} checks · {v.audits.length} audits{ms ? ` · ${ms.toFixed(0)} ms` : ""})
        </summary>
        <div className="mt-3 grid gap-2">
          {v.quantities.map((q) => (
            <div key={q.id} className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-white/10 pt-2">
              <span>{q.label}</span>
              <span className={`num ${q.errorPct < PASS_PCT ? "text-[#4ade80]" : "text-[#f87171]"}`}>{fmtPct(q.errorPct)}</span>
              <span className="num text-xs opacity-75 col-span-2">
                {q.formula} → {fmt(q.analytic, q.unit, 6)} (sim {fmt(q.simulated, q.unit, 6)})
              </span>
            </div>
          ))}
          {v.audits.map((a) => (
            <div key={a.label} className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-white/10 pt-2">
              <span className="flex items-center gap-1.5">
                <Icon name={a.pass ? "check" : "x"} size={14} className={a.pass ? "text-[#4ade80]" : "text-[#f87171]"} />
                <span className="sr-only">{a.pass ? "Pass: " : "Fail: "}</span>
                {a.label}
              </span>
              <span className="num">{a.unit === "%" ? fmtPct(a.value) : `${a.value.toExponential(1)} ${a.unit}`}</span>
              <span className="text-xs opacity-75 col-span-2">{a.detail}</span>
            </div>
          ))}
          {v.notes.map((n) => (
            <p key={n} className="text-xs opacity-80 border-t border-white/10 pt-2">
              {n}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
