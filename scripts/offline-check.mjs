/** Verifies the PWA works offline: load once online, go offline, reload, simulate. */
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + "#/lab/atwood");
await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || false, null, { timeout: 15000 }).catch(() => {});
await page.reload();
await page.waitForTimeout(2000);
await ctx.setOffline(true);
await page.goto(BASE + "#/lab/rc-charge");
await page.reload();
await page.waitForSelector("text=Checked against theory", { timeout: 15000 });
await page.waitForSelector("#verify-h >> text=RC charging", { timeout: 5000 });
console.log("OFFLINE OK: lab loaded and simulated with the network disabled");
await browser.close();
