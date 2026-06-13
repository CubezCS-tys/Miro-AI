import { chromium } from "@playwright/test";
const dir = new URL("./", import.meta.url).pathname;
const files = ["proto-a-paper", "proto-b-notebook", "proto-c-ink"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
for (const f of files) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto("file://" + dir + f + ".html", { waitUntil: "networkidle" });
  await sleep(1200);
  await page.screenshot({ path: dir + f + ".png" });
  console.log("shot", f);
  await ctx.close();
}
await browser.close();
console.log("done");
