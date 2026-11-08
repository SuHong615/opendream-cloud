// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { redirect } from "next/navigation";

/**
 * Legacy RTC / 虚拟形象页面已下线。
 * 产品中的"数字人"指 Agent 数字员工 / 专家小队，统一入口为 /employees 与 /squads。
 */
export default function LegacyDigitalHumanPage() {
  redirect("/employees");
}
