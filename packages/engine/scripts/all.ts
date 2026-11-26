import { EXAMPLES, exampleScene } from "../src/examples";
import { runScene } from "../src/run";
for (const ex of EXAMPLES) {
  try {
    const s = exampleScene(ex.id);
    const out = runScene(s);
    const v = out.verification;
    const qs = v.quantities.map((q) => `${q.id}: ${q.analytic.toPrecision(6)} vs ${q.simulated.toPrecision(6)} (${q.errorPct.toExponential(2)}%)`).join(" | ");
    const au = v.audits.map((a) => `${a.label}=${a.value.toExponential(1)}${a.pass ? "" : " FAIL"}`).join(", ");
    const ms = (out.result as { stats: { wallMs: number } }).stats.wallMs.toFixed(0);
    console.log(`${ex.id.padEnd(15)} [${v.archetype}] ${qs} || ${au} ${ms}ms`);
  } catch (e) {
    console.log(ex.id, "ERROR", (e as Error).message);
  }
}
