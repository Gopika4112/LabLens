/**
 * Accessibility audit (axe-core, WCAG 2.2 A/AA) of every page of the built app.
 * Usage: npm run preview (port 4173) in another terminal, then `node scripts/audit.mjs`.
 * Uses the system Chrome via playwright-core (CHROME_PATH to override).
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const pages = ["#/lab/incline-pulley", "#/lab/rlc", "#/lab/tir", "#/examples", "#/build", "#/accuracy", "#/about"];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });
const results = [];
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => localStorage.setItem("lablens:settings", JSON.stringify({ theme: t })), theme);
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(BASE + p);
    await page.waitForTimeout(p.includes("accuracy") ? 4000 : 1500);
    await page.addScriptTag({ content: axeSource });
    const r = await page.evaluate(async () => {
      // @ts-expect-error injected
      const res = await window.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      });
      return {
        violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target })),
        passes: res.passes.length,
      };
    });
    results.push({ page: p, theme, ...r });
    console.log(
      `${theme.padEnd(5)} ${p.padEnd(22)} passes=${r.passes} violations=${r.violations.length}${r.violations.map((v) => `\n      - ${v.id} (${v.impact}) ×${v.nodes}: ${v.help} ${JSON.stringify(v.sample)}`).join("")}`,
    );
  }
  await ctx.close();
}
await browser.close();
mkdirSync("docs/audits", { recursive: true });
writeFileSync("docs/audits/axe.json", JSON.stringify({ date: new Date().toISOString(), axe: require("axe-core/package.json").version, results }, null, 2));
const total = results.reduce((s, r) => s + r.violations.length, 0);
console.log(`\nTotal violations: ${total}`);
process.exit(total ? 1 : 0);
