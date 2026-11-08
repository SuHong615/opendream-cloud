import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".mmd")).sort();
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 2000, height: 1600 }, deviceScaleFactor: 2 });
await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div id="out"></div></body></html>`);

for (const file of files) {
  const source = readFileSync(resolve(dir, file), "utf8");
  const name = basename(file, ".mmd");
  await page.evaluate(async (src) => {
    const mod = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
    const mermaid = mod.default ?? mod;
    mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { fontFamily: "Segoe UI, Microsoft YaHei, Arial", fontSize: "15px" } });
    const { svg } = await mermaid.render("d" + Math.random().toString(36).slice(2), src);
    document.getElementById("out").innerHTML = svg;
  }, source);
  await page.waitForTimeout(400);
  const outSvg = resolve(dir, `${name}.svg`);
  const outPng = resolve(dir, `${name}.png`);
  const svg = await page.locator("#out svg").innerHTML();
  writeFileSync(outSvg, svg, "utf8");
  await page.locator("#out svg").screenshot({ path: outPng });
  console.log("rendered", name);
}
await browser.close();
