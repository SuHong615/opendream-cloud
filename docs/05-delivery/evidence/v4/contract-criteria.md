# G-V4 契约验收口径（architect 草案，QA 引用）

- 来源：`docs/02-architecture/G-V4-CONTRACT.md` + `ARCH-V3 §25`；状态：门面已实现，upstream（task-37/39）实现中 → 契约验证待落盘
- 口径（§7）：① openapi 1.1.0 无改动；② canonical 路由覆盖（missing 仅 known-gaps open）；③ 别名等价（workflows/workflow-runs/DH messages/end）；④ 门面 401/403/404/**502 upstream_error**；⑤ 错误层 code∈16 + reason∈58 + request_id；⑥ 写操作 100% audit；⑦ SSE Last-Event-ID 不丢不重；⑧ `/advance`、`/dh/webhooks` 不公网裸奔、上游仅内网
- known-gaps：56 项（in_progress/open），architect 用 `tools/known-gaps-status.py` 回填；**P0/P1 不得入台账**
- 预期：上游满足 §7 后 **PASS-WITH-ACTIONS**（MVP extensions/M2-backlog 非阻塞）

> QA 在 `V4-TEST-PLAN §9` 与 `G-V4-gate` 检查项 #9-#13 引用；上游落盘后执行并归档 raw 输出。
