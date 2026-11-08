// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * Real-control-plane smoke test (Chrome DevTools Protocol, no Playwright).
 *
 * Prereq:
 *   - control plane on http://127.0.0.1:4001
 *   - console dev server: cd apps/console && bun x next dev -p 3101
 *   - open the console via http://localhost:3101 (Secure __Host- cookies
 *     are not sent on 127.0.0.1 over plain HTTP).
 *
 * Run: bun scripts/smoke-real.mjs
 * Env: CONSOLE_URL, CHROME_PATH, CDP_PORT, EVIDENCE_DIR
 */
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.CONSOLE_URL || "http://localhost:3101";
const PORT = Number(process.env.CDP_PORT || 9224);
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || "scripts/evidence";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDir = `${process.env.TEMP}\\oc-real-${Date.now()}`;
const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",`n    "--window-size=1440,900",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDir}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "ignore"] },
);

let ws;
const pending = new Map();
let nextId = 1;

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(
      "eval failed: " +
        (res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text),
    );
  }
  return res.result?.value;
}

async function waitFor(expression, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evalJs(expression)) return true;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${label} (${timeoutMs}ms)`);
}

async function screenshot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = `${EVIDENCE_DIR}/${name}.png`;
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`SHOT ${file}`);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

function textIncludes(needle) {
  return `document.body.innerText.includes(${JSON.stringify(needle)})`;
}

try {
  await sleep(1800);
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) =>
    r.json(),
  );
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");

  // 1) login page
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(4500);
  check(
    "login page renders",
    await evalJs(`!!document.querySelector('[data-testid="login-form"]')`),
  );
  await screenshot("01-login");

  // 2) dev-login -> /workspaces
  await evalJs(`(() => {
    const el = document.querySelector('[data-testid="login-email"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'lilei@xingyun.example');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-testid="login-submit"]').click();
    return true;
  })()`);
  await waitFor(`location.pathname === '/workspaces'`, 15000, "redirect to /workspaces").catch(
    async (err) => {
      const body = await evalJs(`document.body.innerText.slice(0, 600)`);
      throw new Error(`${err.message}\nBODY:\n${body}`);
    },
  );
  check("login success redirects to /workspaces", true);
  check(
    "no login error",
    !(await evalJs(`!!document.querySelector('[data-testid="login-error"]')`)),
  );

  // 3) workspace list (create if empty)
  await sleep(1500);
  let cards = await evalJs(
    `document.querySelectorAll('[data-testid="workspace-card"]').length`,
  );
  if (cards === 0) {
    const create =
      (await evalJs(`!!document.querySelector('[data-testid="empty-create"]')`))
        ? '[data-testid="empty-create"]'
        : '[data-testid="workspace-create"]';
    await evalJs(`document.querySelector('${create}').click()`);
    await sleep(1500);
    cards = await evalJs(
      `document.querySelectorAll('[data-testid="workspace-card"]').length`,
    );
  }
  await waitFor(
    `document.querySelectorAll('[data-testid="workspace-card"]').length > 0`,
    120000,
    "workspace card",
  );
  await waitFor(
    `['ready','idle'].includes(document.querySelector('[data-testid="workspace-status"]')?.getAttribute('data-state'))`,
    120000,
    "workspace ready",
  );
  check("workspace list shows real workspace", true);
  check(
    "demo banner absent (real API)",
    !(await evalJs(`!!document.querySelector('[data-testid="demo-banner"]')`)),
  );
  await screenshot("02-workspaces");

  // 4) detail
  await evalJs(
    `document.querySelector('[data-testid="workspace-detail-link"]').click()`,
  );
  await waitFor(
    `!!document.querySelector('[data-testid="workspace-detail"]')`,
    15000,
    "workspace detail",
  );
  const detail = await evalJs(`({
    path: location.pathname,
    name: document.querySelector('h1')?.innerText,
    state: document.querySelector('[data-testid="workspace-status"]')?.getAttribute('data-state')
  })`);
  check("workspace detail renders", detail.path.startsWith("/workspaces/"), detail.path);
  check("workspace state ready/idle", ["ready", "idle"].includes(detail.state), String(detail.state));
  await screenshot("03-detail");

  // 5) access-ticket -> new tab
  await evalJs(
    `document.querySelector('[data-testid="workspace-open"]').click()`,
  );
  await sleep(2500);
  const openText = await evalJs(`document.body.innerText`);
  const ticketOk =
    openText.includes("已在新标签页打开") ||
    openText.includes("浏览器拦截了新标签页");
  check(
    "access-ticket issued (new-tab flow)",
    ticketOk,
    openText.includes("已在新标签页打开") ? "opened" : "popup-blocked fallback",
  );
  check(
    "no error card after ticket",
    !(await evalJs(`!!document.querySelector('[data-testid="error-state"]')`)),
  );

  // 6) destroy confirm + cancel (safety: cancel within cooldown)
  await evalJs(`document.querySelector('[data-testid="destroy-open"]').click()`);
  await waitFor(
    `!!document.querySelector('[data-testid="destroy-dialog"]')`,
    5000,
    "destroy dialog",
  );
  const before = await evalJs(
    `document.querySelector('[data-testid="destroy-submit"]').disabled`,
  );
  check("destroy submit disabled before confirm", before === true);

  await evalJs(`(() => {
    const el = document.querySelector('[data-testid="destroy-confirm-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(detail.name || "")});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-testid="destroy-ack"]').click();
    return true;
  })()`);
  await sleep(500);
  check(
    "destroy submit enabled after name+ack",
    !(await evalJs(
      `document.querySelector('[data-testid="destroy-submit"]').disabled`,
    )),
  );
  await screenshot("04-destroy-dialog");
  await evalJs(
    `document.querySelector('[data-testid="destroy-submit"]').click()`,
  );
  await sleep(2000);
  const destroyText = await evalJs(`document.body.innerText`);
  check(
    "destroy enters cooldown (real API)",
    destroyText.includes("冷却期") || destroyText.includes("撤销销毁"),
  );
  await screenshot("05-destroy-pending");
  if (
    await evalJs(`!!document.querySelector('[data-testid="destroy-cancel"]')`)
  ) {
    await evalJs(
      `document.querySelector('[data-testid="destroy-cancel"]').click()`,
    );
    await sleep(2000);
    const cancelText = await evalJs(`document.body.innerText`);
    check(
      "destroy cancelled (workspace kept)",
      cancelText.includes("已撤销销毁"),
    );
  } else {
    check("destroy cancelled (workspace kept)", false, "cancel button missing");
  }
  await screenshot("06-after-cancel");

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nREAL SMOKE ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`,
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  console.error("REAL SMOKE ERROR", err);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  await sleep(300);
}
