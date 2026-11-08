// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const CHROME =
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = process.env.CONSOLE_URL || "http://localhost:3204";
const PORT = Number(process.env.CDP_PORT || 9230);
const EVIDENCE = process.env.EVIDENCE_DIR || "scripts/evidence-app-collab";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = require("node:fs");

const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    "--window-size=1440,900",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\oc-appcollab-${Date.now()}`,
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
  if (res?.error) {
    throw new Error(`cdp error: ${res.error.message || JSON.stringify(res.error)}`);
  }
  if (res?.exceptionDetails) {
    throw new Error(
      res.exceptionDetails.exception?.description || res.exceptionDetails.text,
    );
  }
  const v = res?.result?.value; if (v === undefined) console.error("EVAL_DEBUG", JSON.stringify(res).slice(0,400)); return v;
}
async function waitFor(expr, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evalJs(expr)) return;
    await sleep(400);
  }
  const body = await evalJs("document.body.innerText.slice(0,1400)");
  throw new Error(`timeout ${label}\n${body}`);
}
async function shot(name) {
  const res = await send("Page.captureScreenshot", { format: "png" });
  const data = res?.data;
  if (!data) return;
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(`${EVIDENCE}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`SHOT ${EVIDENCE}/${name}.png`);
}
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}
const setInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

try {
  await sleep(1500);
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) =>
    r.json(),
  );
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const resolve = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.error ? { error: msg.error } : msg.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.clearBrowserCookies");

  await send("Page.navigate", { url: `${BASE}/login` });
  await waitFor(
    `!!document.querySelector('[data-testid="login-form"]')`,
    15000,
    "login page",
  );
  await sleep(800);
  await evalJs(setInput('[data-testid="login-email"]', "lilei@xingyun.example"));
  await evalJs(`document.querySelector('[data-testid="login-submit"]').click()`);
  await waitFor(`location.pathname === '/workspaces'`, 15000, "login");
  check("login succeeds", true);

  await send("Page.navigate", { url: `${BASE}/apps` });
  await waitFor(`!!document.querySelector('[data-testid="apps-page"]')`, 15000, "apps page");
  await waitFor(
    `document.querySelectorAll('[data-testid="app-card"]').length > 0`,
    15000,
    "app cards",
  );
  check("app cards render", true);
  check(
    "demo fallback banner",
    !!(await evalJs(`!!document.querySelector('[data-testid="demo-banner"]')`)),
  );
  await shot("01-apps");

  await evalJs(
    `document.querySelector('[data-testid="app-detail-link"]').click()`,
  );
  await waitFor(`!!document.querySelector('[data-testid="app-detail"]')`, 15000, "detail");
  await sleep(800);
  const sections = await evalJs(`({
    permission: !!document.querySelector('[data-testid="permission-panel"]'),
    share: !!document.querySelector('[data-testid="share-panel"]'),
    versions: !!document.querySelector('[data-testid="version-list"]'),
    collab: !!document.querySelector('[data-testid="app-collab-open"]'),
    role: document.querySelector('[data-testid="app-role-badge"]')?.innerText
  })`);
  check("detail sections render", sections.permission && sections.share && sections.versions && sections.collab, JSON.stringify(sections));
  await shot("02-detail");

  // add member
  const rowsBefore = await evalJs(
    `document.querySelectorAll('[data-testid="member-row"]').length`,
  );
  await evalJs(`document.querySelector('[data-testid="member-add"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="member-add-form"]')`, 5000, "member add");
  await waitFor(`document.querySelectorAll('[data-testid="member-option"]').length > 0`, 5000, "member options");
  await evalJs(`document.querySelector('[data-testid="member-option"]').click()`);
  await shot("03-member-add");
  await evalJs(`document.querySelector('[data-testid="member-submit"]').click()`);
  await waitFor(
    `document.querySelectorAll('[data-testid="member-row"]').length === ${rowsBefore + 1}`,
    5000,
    "member added",
  );
  check("add collaborator", true);

  // change role of last member
  await evalJs(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="member-row"]')];
    const row = rows[rows.length - 1];
    const select = row.querySelector('[data-testid="member-role"]');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'editor');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(600);
  const roleChanged = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="member-row"]')];
    return rows[rows.length - 1]?.getAttribute('data-role');
  })()`);
  check("change collaborator role", roleChanged === "editor", String(roleChanged));

  // remove member
  await evalJs(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="member-row"]')];
    rows[rows.length - 1].querySelector('[data-testid="member-remove"]').click();
  })()`);
  await sleep(300);
  await evalJs(`document.querySelector('[data-testid="member-remove-confirm"]').click()`);
  await waitFor(
    `document.querySelectorAll('[data-testid="member-row"]').length === ${rowsBefore}`,
    5000,
    "member removed",
  );
  check("remove collaborator", true);

  // share team
  const sharesBefore = await evalJs(
    `document.querySelectorAll('[data-testid="share-row"]').length`,
  );
  await evalJs(`document.querySelector('[data-testid="share-audience-team"]').click()`);
  await waitFor(`document.querySelectorAll('[data-testid="share-subject-option"]').length > 0`, 5000, "share options");
  await evalJs(`document.querySelector('[data-testid="share-subject-option"]').click()`);
  await evalJs(`document.querySelector('[data-testid="share-save"]').click()`);
  await waitFor(
    `document.querySelectorAll('[data-testid="share-row"]').length === ${sharesBefore + 1}`,
    5000,
    "share saved",
  );
  check("save team share", true);
  await shot("04-share");

  // collab
  await evalJs(`document.querySelector('[data-testid="app-collab-open"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="collab-drawer"]')`, 5000, "collab drawer");
  await shot("05-collab");
  await evalJs(setInput('[data-testid="collab-input"]', "把导出按钮改成 CSV，并加一行说明"));
  await evalJs(`document.querySelector('[data-testid="collab-send"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="collab-proposal"]')`, 8000, "proposal");
  check("proposal generated", true);
  await shot("06-proposal");
  await evalJs(`document.querySelector('[data-testid="collab-diff-open"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="diff-modal"]')`, 5000, "diff modal");
  const diffInfo = await evalJs(`({
    files: document.querySelectorAll('[data-testid="diff-file"]').length,
    add: document.querySelectorAll('[data-testid="diff-line-add"]').length,
    del: document.querySelectorAll('[data-testid="diff-line-del"]').length
  })`);
  check("diff preview renders", diffInfo.files >= 1 && diffInfo.add > 0, JSON.stringify(diffInfo));
  await shot("07-diff");
  await evalJs(`document.querySelector('[data-testid="diff-approve"]').click()`);
  await waitFor(`!document.querySelector('[data-testid="diff-modal"]')`, 8000, "approve done");
  const approvedText = await evalJs(
    `document.querySelector('[data-testid="collab-drawer"]')?.innerText || ""`,
  );
  check("proposal approved", approvedText.includes("已批准") || approvedText.includes("已生成新版本"), approvedText.slice(0, 80));
  await evalJs(`document.querySelector('[data-testid="collab-close"]').click()`);
  await sleep(600);
  const versionsAfter = await evalJs(
    `document.querySelectorAll('[data-testid="version-row"]').length`,
  );
  check("new version appended", versionsAfter >= 4, `versions=${versionsAfter}`);
  await shot("08-after-approve");

  // rollback
  await evalJs(`document.querySelector('[data-testid="version-rollback"]').click()`);
  await waitFor(`!!document.querySelector('[data-testid="version-confirm"]')`, 5000, "rollback confirm");
  await shot("09-rollback-confirm");
  await evalJs(`document.querySelector('[data-testid="version-rollback-confirm"]').click()`);
  await sleep(1200);
  const versionsFinal = await evalJs(
    `document.querySelectorAll('[data-testid="version-row"]').length`,
  );
  check("rollback creates version", versionsFinal >= versionsAfter + 1, `versions=${versionsFinal}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\nAPP-COLLAB SMOKE ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  console.error("APP-COLLAB SMOKE ERROR", err);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  await sleep(200);
}
