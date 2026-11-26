/**
 * Captures the README/Devpost screenshots and the hero GIF frames from the BUILT app.
 * Usage: npm run build && npm run preview, then `node scripts/screenshots.mjs`.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = "docs/screenshots";
mkdirSync(`${OUT}/gif`, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });

async function ctx(opts = {}, settings = { theme: "light" }) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25, ...opts });
  await c.addInitScript((s) => {
    localStorage.setItem("lablens:settings", JSON.stringify(s));
    sessionStorage.clear();
  }, settings);
  return c;
}
const pause = (p) => p.keyboard.press("Space");

// 1. the lab, mid-motion, forces on
{
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/incline-pulley");
  await p.waitForTimeout(900);
  await pause(p);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/01-lab-incline-pulley.png` });
  // 3. the verification panel opened
  await p.getByText("How do we know?").click();
  await p.waitForTimeout(200);
  await p.locator("section[aria-labelledby=verify-h]").screenshot({ path: `${OUT}/03-verification.png` });
  await c.close();
}
// 2. typed problem → offline parse → "did I understand"
{
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/atwood");
  await p.getByLabel("Problem text").fill("A ball is thrown at 18 m/s at 40° from the top of a 12 m cliff. How far from the base does it land?");
  await p.getByRole("button", { name: "Build the lab" }).click();
  await p.waitForTimeout(2600);
  await pause(p);
  await p.screenshot({ path: `${OUT}/02-typed-problem-understood.png` });
  await c.close();
}
// 4. circuits with frequency response
{
  const c = await ctx({ viewport: { width: 1440, height: 1250 } });
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/rlc");
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/04-circuit-rlc.png` });
  await c.close();
}
// 5. optics: total internal reflection
{
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/tir");
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/05-optics-tir.png` });
  await c.close();
}
// 6. engine accuracy page (runs live)
{
  const c = await ctx({ viewport: { width: 1440, height: 1100 } });
  const p = await c.newPage();
  await p.goto(BASE + "#/accuracy");
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${OUT}/06-engine-accuracy.png` });
  await c.close();
}
// 7. builder
{
  const c = await ctx();
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/table-pulley");
  await p.waitForTimeout(800);
  await p.goto(BASE + "#/build");
  await p.waitForTimeout(800);
  const canvas = p.locator("canvas").first();
  const box = await canvas.boundingBox();
  await p.mouse.click(box.x + box.width * 0.36, box.y + box.height * 0.5); // select whatever handle is near
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/07-builder.png` });
  await c.close();
}
// 8. tutor: predict → test → explain
{
  const c = await ctx({ viewport: { width: 1440, height: 1000 } });
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/pendulum");
  await p.waitForTimeout(1200);
  await p.getByText("Stays about the same").click();
  await p.getByRole("button", { name: /Lock it in/ }).click();
  await p.waitForTimeout(1500);
  await p.locator("section[aria-labelledby=tutor-h]").screenshot({ path: `${OUT}/08-tutor.png` });
  await c.close();
}
// 9. phone
{
  const c = await ctx({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/incline-pulley");
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/09-phone.png` });
  await c.close();
}
// 10. accessibility: dark theme, dyslexia font, settings open
{
  const c = await ctx({}, { theme: "dark", font: "dyslexic" });
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/spring");
  await p.waitForTimeout(900);
  await pause(p);
  await p.getByRole("button", { name: "Accessibility" }).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/10-accessibility-dark-dyslexia.png` });
  await c.close();
}
// hero GIF frames: sketch → lab → drag the mass slider
{
  const c = await ctx({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  await p.goto(BASE + "#/lab/incline-pulley");
  await p.waitForTimeout(150);
  let n = 0;
  const shot = async () => p.screenshot({ path: `${OUT}/gif/f${String(n++).padStart(3, "0")}.png` });
  for (let i = 0; i < 16; i++) {
    await shot();
    await p.waitForTimeout(60);
  }
  const slider = p.getByLabel("Hanging mass m₂");
  for (const v of [3, 4, 5, 6, 7, 8]) {
    await slider.fill(String(v));
    await p.keyboard.press("Home");
    await p.waitForTimeout(160);
    await shot();
    await shot();
  }
  await p.locator("main").click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 16; i++) {
    await shot();
    await p.waitForTimeout(60);
  }
  await c.close();
}
await browser.close();
console.log("screenshots written to", OUT);
