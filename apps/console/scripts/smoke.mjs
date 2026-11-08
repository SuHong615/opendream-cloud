// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.CONSOLE_URL || "http://127.0.0.1:3101";
const PORT = Number(process.env.CDP_PORT || 9223);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDir = `${process.env.TEMP}\\oc-cdp-${Date.now()}`;
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

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " 鈥?" + detail : ""}`);
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

  // 1) login page
  await send("Page.navigate", { url: `${BASE}/login` });
  await sleep(4000);
  check(
    "login page renders",
    await evalJs(`!!document.querySelector('[data-testid="login-form"]')`),
  );

  // 2) submit dev-login (control plane placeholder -> 503 + offline hint)
  await evalJs(`(() => {
    const el = document.querySelector('[data-testid="login-email"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, 'lilei@xingyun.example');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-testid="login-form"]').requestSubmit();
    return true;
  })()`);
  await sleep(3000);
  check(
    "login error state (control plane placeholder)",
    await evalJs(`!!document.querySelector('[data-testid="login-error"]')`),
  );
  check(
    "login offline/demo entry",
    await evalJs(`!!document.querySelector('[data-testid="login-demo-link"]')`),
  );

  // 3) demo console
  await evalJs(
    `document.querySelector('[data-testid="login-demo-link"]').click()`,
  );
  await sleep(1800);
  const list = await evalJs(`({
    path: location.pathname,
    cards: document.querySelectorAll('[data-testid="workspace-card"]').length,
    demo: !!document.querySelector('[data-testid="demo-banner"]'),
    create: !!document.querySelector('[data-testid="workspace-create"]'),
    text: document.body.innerText.slice(0, 120)
  })`);
  check("navigated to /workspaces", list.path === "/workspaces", list.path);
  check("workspace cards rendered (demo)", list.cards >= 1, `cards=${list.cards}`);
  check("demo banner shown", list.demo === true);
  check("create CTA present", list.create === true);

  // 4) detail
  await evalJs(
    `document.querySelector('[data-testid="workspace-detail-link"]').click()`,
  );
  await sleep(1800);
  const detail = await evalJs(`({
    path: location.pathname,
    detail: !!document.querySelector('[data-testid="workspace-detail"]'),
    open: !!document.querySelector('[data-testid="workspace-open"]'),
    destroy: !!document.querySelector('[data-testid="destroy-open"]'),
    status: document.querySelector('[data-testid="workspace-status"]')?.getAttribute('data-state')
  })`);
  check("navigated to workspace detail", detail.detail && detail.path.startsWith("/workspaces/"), detail.path);
  check("open workspace CTA", detail.open === true);
  check("status badge present", !!detail.status, String(detail.status));

  // 5) destroy dialog (typed confirm + ack enablement)
  await evalJs(`document.querySelector('[data-testid="destroy-open"]').click()`);
  await sleep(600);
  const dialog = await evalJs(`({
    dialog: !!document.querySelector('[data-testid="destroy-dialog"]'),
    input: !!document.querySelector('[data-testid="destroy-confirm-input"]'),
    disabled: document.querySelector('[data-testid="destroy-submit"]')?.disabled
  })`);
  check("destroy dialog opens", dialog.dialog === true);
  check("destroy confirm input present", dialog.input === true);
  check("destroy submit disabled before confirm", dialog.disabled === true);

  await evalJs(`(() => {
    const el = document.querySelector('[data-testid="destroy-confirm-input"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '支付重构');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-testid="destroy-ack"]').click();
    return true;
  })()`);
  await sleep(500);
  const enabled = await evalJs(
    `!document.querySelector('[data-testid="destroy-submit"]').disabled`,
  );
  check("destroy submit enabled after name+ack", enabled === true);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSMOKE ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  console.error("SMOKE ERROR", err);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  await sleep(300);
}

