// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.CONSOLE_URL || "http://localhost:3201";
const PORT = Number(process.env.CDP_PORT || 9226);
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || "scripts/evidence-models";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = require("node:fs");

const userDir = `${process.env.TEMP}\\oc-models-${Date.now()}`;
const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    "--window-size=1440,900",
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
  return new Promise((resolve) => {
    pending.set(id, resolve);
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
        (res.exceptionDetails.exception?.description || res.exceptionDetails.text),
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
  const body = await evalJs("document.body.innerText.slice(0,1200)");
  throw new Error(`timeout: ${label}\nBODY:\n${body}`);
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(`${EVIDENCE_DIR}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`SHOT ${EVIDENCE_DIR}/${name}.png`);
}
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}
const setter = (selector, value, tag = "input") => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const proto = ${tag === "textarea" ? "HTMLTextAreaElement" : tag === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc.set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

try {
  await sleep(1800);
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");

  // login
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(4500);
  await evalJs(setter('[data-testid="login-email"]', "lilei@xingyun.example"));
  await evalJs(`document.querySelector('[data-testid="login-submit"]').click()`);
  await waitFor(`location.pathname === '/workspaces'`, 15000, "login redirect");
  check("login succeeds", true);

  // endpoints availability (informational)
  const endpoints = await evalJs(`(async () => {
    const out = {};
    for (const p of ['/api/v1/model-provider-presets','/api/v1/model-providers']) {
      const r = await fetch(p, { credentials: 'include' });
      out[p] = r.status;
    }
    return out;
  })()`);
  console.log("ENDPOINTS", JSON.stringify(endpoints));

  // models page
  await send("Page.navigate", { url: `${BASE}/models` });
  await waitFor(`!!document.querySelector('[data-testid="models-page"]')`, 15000, "models page");
  await sleep(1500);
  const initial = await evalJs(`({
    cards: document.querySelectorAll('[data-testid="provider-card"]').length,
    demo: !!document.querySelector('[data-testid="demo-banner"]'),
    add: !!document.querySelector('[data-testid="provider-add"]'),
    presetOptions: document.querySelectorAll('[data-testid="provider-preset"] option').length,
    title: document.querySelector('.oc-title')?.textContent
  })`);
  check("models page renders", initial.cards >= 0 && initial.add === true);
  check("opencode 不自带模型文案", String(initial.title || "").includes("模型中心"));
  check("provider cards present", initial.cards >= 1, `cards=${initial.cards}`);
  await shot("01-models");

  // open add drawer
  await evalJs(`document.querySelector('[data-testid="provider-add"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="provider-form"]')`, 5000, "drawer");
  const fields = await evalJs(`({
    preset: !!document.querySelector('[data-testid="provider-preset"]'),
    name: !!document.querySelector('[data-testid="provider-name"]'),
    kind: !!document.querySelector('[data-testid="provider-kind"]'),
    base: !!document.querySelector('[data-testid="provider-base-url"]'),
    key: !!document.querySelector('[data-testid="provider-api-key"]'),
    models: !!document.querySelector('[data-testid="provider-models"]'),
    test: !!document.querySelector('[data-testid="provider-test"]'),
    save: !!document.querySelector('[data-testid="provider-save"]'),
    options: document.querySelectorAll('[data-testid="provider-preset"] option').length
  })`);
  check("provider-form fields complete", Object.values(fields).slice(0, 8).every(Boolean), JSON.stringify(fields));
  check("preset list loaded (fallback ok)", fields.options > 5, `options=${fields.options}`);
  await shot("02-drawer");

  // fill form
  await evalJs(setter('[data-testid="provider-preset"]', "custom", "select"));
  await sleep(300);
  await evalJs(setter('[data-testid="provider-name"]', "UI 验收临时供应商"));
  await evalJs(setter('[data-testid="provider-base-url"]', "http://127.0.0.1:9101/v1"));
  await evalJs(setter('[data-testid="provider-api-key"]', "sk-mock-key"));
  await evalJs(setter('[data-testid="provider-models"]', "gpt-4o-mini\nqwen2.5-coder-32b", "textarea"));
  await sleep(300);
  await shot("03-form-filled");

  // test connectivity (create-then-test for new provider)
  await evalJs(`document.querySelector('[data-testid="provider-test"]').click()`);
  await sleep(3500);
  const afterTest = await evalJs(`({
    result: document.querySelector('[data-testid="provider-test-result"]')?.innerText || null,
    formError: document.querySelector('[data-testid="provider-form-error"]')?.innerText || null,
    saveVisible: !!document.querySelector('[data-testid="provider-save"]')
  })`);
  check("connectivity test returns a result", !!afterTest.result || !!afterTest.formError, JSON.stringify(afterTest.result || afterTest.formError));
  await shot("04-test-result");

  // save
  await evalJs(`document.querySelector('[data-testid="provider-save"]').click()`);
  await sleep(2500);
  const afterSave = await evalJs(`({
    drawer: !!document.querySelector('[data-testid="provider-form"]'),
    cards: [...document.querySelectorAll('[data-testid="provider-card"]')].map(c => c.innerText.split('\\n')[0]),
    toast: document.querySelector('[data-testid="toast"]')?.innerText || null
  })`);
  check("save closes drawer", afterSave.drawer === false);
  check("new provider card appears", afterSave.cards.some((t) => t.includes("UI 验收临时供应商")), JSON.stringify(afterSave.cards));
  await shot("05-saved-list");

  // activate
  const cardSelector = `(() => {
    const card = [...document.querySelectorAll('[data-testid="provider-card"]')].find(c => c.innerText.includes('UI 验收临时供应商'));
    if (!card) return false;
    card.querySelector('[data-testid="provider-activate"]')?.click();
    return true;
  })()`;
  await evalJs(cardSelector);
  await sleep(2500);
  const active = await evalJs(`(() => {
    const card = [...document.querySelectorAll('[data-testid="provider-card"]')].find(c => c.innerText.includes('UI 验收临时供应商'));
    return card ? { active: card.getAttribute('data-active'), badge: !!card.querySelector('[data-testid="provider-active-badge"]'), toast: document.querySelector('[data-testid="toast"]')?.innerText || null } : null;
  })()`);
  check("activate marks card active", active?.active === "true" && active?.badge === true, JSON.stringify(active));
  await shot("06-activated");

  // edit
  const editClick = `(() => {
    const card = [...document.querySelectorAll('[data-testid="provider-card"]')].find(c => c.innerText.includes('UI 验收临时供应商'));
    card?.querySelector('[data-testid="provider-edit"]')?.click();
    return !!card;
  })()`;
  await evalJs(editClick);
  await waitFor(`!!document.querySelector('[data-testid="provider-form"]')`, 5000, "edit drawer");
  await evalJs(setter('[data-testid="provider-name"]', "UI 验收临时供应商-改"));
  await sleep(200);
  await evalJs(`document.querySelector('[data-testid="provider-save"]').click()`);
  await sleep(2500);
  const edited = await evalJs(`[...document.querySelectorAll('[data-testid="provider-card"]')].some(c => c.innerText.includes('UI 验收临时供应商-改'))`);
  check("edit updates card", edited === true);
  await shot("07-edited");

  // switch default back to a seeded provider so the temporary one is deletable
  await evalJs(`(() => {
    const card = [...document.querySelectorAll('[data-testid="provider-card"]')].find(c => c.innerText.includes('企业模型（Mock）'));
    card?.querySelector('[data-testid="provider-activate"]')?.click();
    return !!card;
  })()`);
  await sleep(2500);

  // delete + confirm
  const deleteClick = `(() => {
    const card = [...document.querySelectorAll('[data-testid="provider-card"]')].find(c => c.innerText.includes('UI 验收临时供应商-改'));
    card?.querySelector('[data-testid="provider-delete"]')?.click();
    return !!card;
  })()`;
  await evalJs(deleteClick);
  await waitFor(`!!document.querySelector('[data-testid="provider-delete-dialog"]')`, 5000, "delete dialog");
  await shot("08-delete-confirm");
  await evalJs(`document.querySelector('[data-testid="provider-delete-confirm"]').click()`);
  await sleep(2500);
  const removed = await evalJs(`![...document.querySelectorAll('[data-testid="provider-card"]')].some(c => c.innerText.includes('UI 验收临时供应商'))`);
  check("delete removes card", removed === true);
  await shot("09-deleted");

  const failed = results.filter((r) => !r.ok);
  console.log(`\nMODELS SMOKE ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  console.error("MODELS SMOKE ERROR", err);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  await sleep(300);
}
