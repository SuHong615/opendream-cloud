// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSkill, createVersion, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
const OTHER_ORG = { "x-oc-org-id": "00000000-0000-4000-8000-000000000099", "x-oc-user-id": "00000000-0000-4000-8000-000000000098" };

beforeAll(() => {
  harness = setupHarness();
});

afterAll(async () => {
  await harness.close();
});

async function createPublishableVersion(skillId: string, version: string): Promise<Record<string, unknown>> {
  return createVersion(harness.app, skillId, {
    version,
    scan_status: "passed",
    eval_run_id: crypto.randomUUID(),
    archive_sha256: "a".repeat(64),
    files: [
      { path: "SKILL.md", size: 20, sha256: "b".repeat(64) },
      { path: "references/guide.md", size: 10, sha256: "c".repeat(64) },
    ],
  });
}

describe("Skill 生命周期", () => {
  test("SKILL-01 创建 → 查询 → by-slug", async () => {
    const skill = await createSkill(harness.app, { slug: "pdf-report", name: "PDF Report" });
    expect(skill.visibility).toBe("org");
    expect(skill.status).toBe("draft");

    const byId = await harness.app.inject({ method: "GET", url: `/api/v1/skills/${skill.id}`, headers: TENANT_HEADERS });
    expect(byId.statusCode).toBe(200);

    const bySlug = await harness.app.inject({ method: "GET", url: "/api/v1/skills/by-slug/acme/pdf-report", headers: TENANT_HEADERS });
    expect(bySlug.statusCode).toBe(200);
    expect((bySlug.json() as { slug: string }).slug).toBe("pdf-report");
  });

  test("SKILL-02 创建版本 → 门禁拦截 → 发布成功 → 安装 → 卸载", async () => {
    const skill = await createSkill(harness.app);
    const draft = await createVersion(harness.app, String(skill.id));
    const blocked = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${draft.id}/publish`,
      headers: TENANT_HEADERS,
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: { reason: string } }).error.reason).toBe("gate_blocked");

    const version = await createPublishableVersion(String(skill.id), "1.2.0");
    const published = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/publish`,
      headers: TENANT_HEADERS,
    });
    expect(published.statusCode).toBe(200);
    expect((published.json() as { status: string }).status).toBe("published");

    const installed = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/install`,
      headers: TENANT_HEADERS,
      payload: { version_id: version.id },
    });
    expect(installed.statusCode).toBe(201);
    const installation = installed.json() as { id: string; enabled: boolean };
    expect(installation.enabled).toBe(true);

    const list = await harness.app.inject({ method: "GET", url: "/api/v1/skill-installations", headers: TENANT_HEADERS });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);

    const patched = await harness.app.inject({
      method: "PATCH",
      url: `/api/v1/skill-installations/${installation.id}`,
      headers: TENANT_HEADERS,
      payload: { enabled: false },
    });
    expect((patched.json() as { enabled: boolean }).enabled).toBe(false);

    const removed = await harness.app.inject({
      method: "DELETE",
      url: `/api/v1/skill-installations/${installation.id}`,
      headers: TENANT_HEADERS,
    });
    expect(removed.statusCode).toBe(204);
  });

  test("SKILL-03 审核：submit-review → approve → yank → rollback", async () => {
    const skill = await createSkill(harness.app);
    const version = await createPublishableVersion(String(skill.id), "2.0.0");
    const submitted = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/submit-review`,
      headers: TENANT_HEADERS,
    });
    expect(submitted.statusCode).toBe(200);

    const approved = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/review`,
      headers: TENANT_HEADERS,
      payload: { decision: "approve", comment: "lgtm" },
    });
    expect(approved.statusCode).toBe(200);

    await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/publish`,
      headers: TENANT_HEADERS,
    });
    const yanked = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/yank`,
      headers: TENANT_HEADERS,
      payload: { reason: "security" },
    });
    expect((yanked.json() as { status: string }).status).toBe("yanked");

    const rollback = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/rollback`,
      headers: TENANT_HEADERS,
    });
    expect(rollback.statusCode).toBe(400);
  });

  test("SKILL-04 统计与跨租户 404", async () => {
    const skill = await createSkill(harness.app);
    const version = await createPublishableVersion(String(skill.id), "3.0.0");
    await harness.app.inject({ method: "POST", url: `/api/v1/skills/${skill.id}/versions/${version.id}/publish`, headers: TENANT_HEADERS });
    await harness.app.inject({ method: "POST", url: `/api/v1/skills/${skill.id}/install`, headers: TENANT_HEADERS, payload: {} });

    const stats = await harness.app.inject({ method: "GET", url: `/api/v1/skills/${skill.id}/stats`, headers: TENANT_HEADERS });
    expect((stats.json() as { installs_total: number }).installs_total).toBe(1);

    const crossTenant = await harness.app.inject({ method: "GET", url: `/api/v1/skills/${skill.id}`, headers: OTHER_ORG });
    expect(crossTenant.statusCode).toBe(404);
  });

  test("SKILL-05 分发：内部 token → index.json → 文件（不泄露公开路由）", async () => {
    const skill = await createSkill(harness.app, { slug: `dist-${crypto.randomUUID().slice(0, 8)}` });
    const version = await createPublishableVersion(String(skill.id), "4.0.0");
    await harness.app.inject({ method: "POST", url: `/api/v1/skills/${skill.id}/versions/${version.id}/publish`, headers: TENANT_HEADERS });
    const installed = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/install`,
      headers: TENANT_HEADERS,
      payload: { version_id: version.id },
    });
    const installation = installed.json() as { id: string };

    const tokenResponse = await harness.app.inject({
      method: "POST",
      url: `/internal/skills/${skill.id}/source-token`,
      headers: TENANT_HEADERS,
      payload: { installation_id: installation.id },
    });
    expect(tokenResponse.statusCode).toBe(200);
    const token = tokenResponse.json() as { token: string };
    const base = `/s/acme/${String(skill.slug)}/${version.id}/${token.token}`;

    const index = await harness.app.inject({ method: "GET", url: `${base}/index.json` });
    expect(index.statusCode).toBe(200);
    const payload = index.json() as { skills: Array<{ name: string; files: string[] }> };
    expect(payload.skills[0]!.name).toBe(String(skill.slug));
    expect(payload.skills[0]!.files).toContain("SKILL.md");

    const file = await harness.app.inject({ method: "GET", url: `${base}/SKILL.md` });
    expect(file.statusCode).toBe(200);
    expect(file.body).toContain(String(skill.name));

    const badFile = await harness.app.inject({ method: "GET", url: `${base}/../../etc/passwd` });
    expect([404, 400]).toContain(badFile.statusCode);

    const badToken = await harness.app.inject({ method: "GET", url: `/s/acme/${String(skill.slug)}/${version.id}/not-a-token/index.json` });
    expect(badToken.statusCode).toBe(404);
  });
});
