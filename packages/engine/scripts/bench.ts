/** Prints the Engine Accuracy table (markdown) — used to generate the README table. */
import { VALIDATION_CASES, runCase } from "../src/validation/cases";
import { fmtPct } from "../src/format";
const rows = VALIDATION_CASES.map(runCase);
console.log("| Case | Analytic | Simulated | Error | Tolerance | Result |\n|---|---|---|---|---|---|");
for (const r of rows) {
  const x = r.result;
  console.log(
    `| ${r.c.name} | ${x ? x.analytic.toPrecision(7) + " " + x.unit : "—"} | ${x ? x.simulated.toPrecision(7) : r.error} | ${x ? fmtPct(x.errorPct) : "—"} | ${fmtPct(r.c.tolerancePct)} | ${r.pass ? "✅" : "❌"} |`,
  );
}
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} passed`);
