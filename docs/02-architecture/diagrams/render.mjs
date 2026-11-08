import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const source = readFileSync(resolve(import.meta.dir, "arch-v3-simple.mmd"), "utf8");
const outPng = resolve(root, "docs/02-architecture/diagrams/arch-v3-simple.png");
const outSvg = resolve(root, "docs/02-architecture/diagrams/arch-v3-simple.svg");

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
const page = await browser.newPage({ viewport: { width: 1900, height: 1400 }, deviceScaleFactor: 2 });
await page.setContent(
  `<!doctype html><html><body style="margin:0;background:#fff">
   <div id="out"></div>
   <script type="module">
     import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
     mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: { fontFamily: "Segoe UI, Microsoft YaHei, Arial" } });
     const { svg } = await mermaid.render("arch", ${JSON.stringify(source)});
     document.getElementById("out").innerHTML = svg;
     window.__done = true;
   </script></body></html>`,
  { waitUntil: "networkidle" },
);
await page.waitForFunction(() => window.__done === true, null, { timeout: 60_000 });
const svg = await page.locator("#out svg").innerHTML();
const viewBox = await page.locator("#out svg").getAttribute("viewBox");
writeFileSync(outSvg, svg, "utf8");
await page.locator("#out svg").screenshot({ path: outPng });
console.log("rendered", outPng, viewBox);
await browser.close();
