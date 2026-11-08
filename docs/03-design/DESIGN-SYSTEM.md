# OpenDream Cloud 设计系统（Design System v1）

- 版本：v1.0
- Owner：`web-console`
- 状态：**待 G3 评审**
- 技术基座：Next.js 15 + React 19 + Tailwind CSS v4 + shadcn/ui（Radix Primitives）+ lucide-react
- 配套文档：[IA.md](IA.md) · [SCREENS.md](SCREENS.md) · [prototype/index.html](prototype/index.html)

> 目标：**一套 token、两类主题（明/暗）、五种密度一致的界面、WCAG 2.1 AA 达标、中英双语对等。**
> 本文的 token 是唯一事实来源；`apps/console` 实现时不得出现硬编码颜色/字号/间距（CI 用 stylelint 规则拦截）。

---

## 1. Token 架构

三层，禁止跨层引用：

```
① Primitive（原始值）     --oc-blue-600: #2563EB;  --oc-space-4: 16px;
        ↓ 只允许 semantic 层引用
② Semantic（语义）        --oc-color-primary; --oc-color-bg; --oc-color-text-secondary;
        ↓ 组件/页面只使用 semantic 层
③ Component（组件级）     --oc-button-primary-bg; --oc-table-row-hover-bg;
```

- 命名：`--oc-{category}-{role}[-{variant}]`，kebab-case。
- 主题：`<html data-theme="light|dark">`；`prefers-color-scheme` 仅用于首次默认值，用户选择持久化到 `localStorage.oc.theme` 与服务端偏好。
- 语言：`<html lang="zh-CN|en-US">`；数字/日期用 `Intl` 而非手写格式。
- 暗色不是反色：每个语义色都有独立的暗色值（见 §2），并做对比度校验。

---

## 2. 颜色

### 2.1 Primitive 色板（节选，完整见 `apps/console/src/styles/tokens.css` 规划）

| 组 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| Neutral（冷灰） | `#F1F5F9` | `#E2E8F0` | `#CBD5E1` | `#94A3B8` | `#64748B` | `#475569` | `#334155` | `#1E293B` | `#0F172A` |
| Brand（工程蓝） | `#EFF4FF` | `#DBE7FF` | `#BFD3FF` | `#8AB4FF` | `#5B8CFF` | `#2563EB` | `#1D4ED8` | `#1E40AF` | `#172554` |
| Success | `#ECFDF3` | `#D1FADF` | `#A6F4C5` | `#6CE9A6` | `#32D583` | `#12B76A` | `#039855` | `#027A48` | `#054F31` |
| Warning | `#FFFAEB` | `#FEF0C7` | `#FEDF89` | `#FEC84B` | `#FDB022` | `#F79009` | `#DC6803` | `#B54708` | `#93370D` |
| Danger | `#FEF3F2` | `#FEE4E2` | `#FECDCA` | `#FDA29B` | `#F97066` | `#F04438` | `#D92D20` | `#B42318` | `#912018` |
| Info | `#EFF8FF` | `#D1E9FF` | `#B2DDFF` | `#84CAFF` | `#53B1FD` | `#2E90FA` | `#1570EF` | `#175CD3` | `#194185` |
| Violet（能力/评测） | `#F4F3FF` | `#EBE9FE` | `#D9D6FE` | `#BDB4FE` | `#9B8AFB` | `#7A5AF8` | `#6938EF` | `#5925DC` | `#3E1C96` |
| Teal（MCP/集成） | `#F0FDF9` | `#CCFBEF` | `#99F6E0` | `#5FE9D0` | `#2ED3B7` | `#15B79E` | `#0E9384` | `#107569` | `#134E48` |

### 2.2 Semantic 色 token

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--oc-color-bg` | `#F8FAFC` | `#0B1220` | 页面底色 |
| `--oc-color-surface` | `#FFFFFF` | `#111A2B` | 卡片/表格/侧栏 |
| `--oc-color-surface-raised` | `#FFFFFF` | `#16213A` | 对话框/下拉/抽屉 |
| `--oc-color-surface-hover` | `#F1F5F9` | `#1B2740` | 行/项 hover |
| `--oc-color-surface-active` | `#E2E8F0` | `#22304C` | 选中/按下的中性底 |
| `--oc-color-border` | `#E2E8F0` | `#263449` | 常规边框/分割线 |
| `--oc-color-border-strong` | `#CBD5E1` | `#34465F` | 输入框/聚焦前 |
| `--oc-color-text` | `#0F172A` | `#E6EDF7` | 主文本 |
| `--oc-color-text-secondary` | `#475569` | `#A9B7CC` | 次要文本/说明 |
| `--oc-color-text-tertiary` | `#64748B` | `#7E8DA6` | 占位/元信息 |
| `--oc-color-text-disabled` | `#94A3B8` | `#55637A` | 禁用（AA 豁免，仅禁用态） |
| `--oc-color-text-inverse` | `#FFFFFF` | `#0B1220` | 反色文本 |
| `--oc-color-primary` | `#2563EB` | `#3B82F6` | 主操作（按钮底色） |
| `--oc-color-primary-hover` | `#1D4ED8` | `#2563EB` | 主操作 hover |
| `--oc-color-primary-active` | `#1E40AF` | `#1D4ED8` | 主操作按下 |
| `--oc-color-primary-text` | `#1D4ED8` | `#8AB4FF` | 链接/强调文本（暗色下更亮） |
| `--oc-color-primary-subtle` | `#EFF4FF` | `#16213A` | 选中背景/信息底 |
| `--oc-color-success` | `#12B76A` | `#32D583` | 成功图标/徽标 |
| `--oc-color-success-text` | `#027A48` | `#75E0A7` | 成功文本 |
| `--oc-color-success-subtle` | `#ECFDF3` | `#0C2A1E` | 成功底 |
| `--oc-color-warning` | `#F79009` | `#FDB022` | 警告 |
| `--oc-color-warning-text` | `#B54708` | `#FEC84B` | 警告文本 |
| `--oc-color-warning-subtle` | `#FFFAEB` | `#2A1F0A` | 警告底 |
| `--oc-color-danger` | `#F04438` | `#F97066` | 危险/错误 |
| `--oc-color-danger-text` | `#B42318` | `#FDA29B` | 错误文本 |
| `--oc-color-danger-subtle` | `#FEF3F2` | `#2D1210` | 错误底 |
| `--oc-color-info` | `#2E90FA` | `#53B1FD` | 信息 |
| `--oc-color-info-text` | `#175CD3` | `#84CAFF` | 信息文本 |
| `--oc-color-focus-ring` | `#2563EB` | `#8AB4FF` | 焦点环（3:1 对 adjacent） |
| `--oc-color-overlay` | `rgba(15,23,42,.45)` | `rgba(2,6,23,.65)` | 遮罩 |

### 2.3 对比度校验（WCAG 2.1 AA）

| 组合 | 比值 | 要求 | 结论 |
|------|------|------|------|
| `#0F172A` on `#FFFFFF` | 17.9:1 | ≥4.5 | ✅ |
| `#475569` on `#FFFFFF` | 7.5:1 | ≥4.5 | ✅ |
| `#64748B` on `#FFFFFF` | 4.8:1 | ≥4.5 | ✅ |
| `#FFFFFF` on `#2563EB`（主按钮） | 5.2:1 | ≥4.5 | ✅ |
| `#FFFFFF` on `#1D4ED8`（hover） | 6.6:1 | ≥4.5 | ✅ |
| `#B42318` on `#FEF3F2`（错误底） | 6.4:1 | ≥4.5 | ✅ |
| `#027A48` on `#ECFDF3`（成功底） | 5.9:1 | ≥4.5 | ✅ |
| `#B54708` on `#FFFAEB`（警告底） | 5.6:1 | ≥4.5 | ✅ |
| `#E6EDF7` on `#111A2B`（暗主文本） | 14.9:1 | ≥4.5 | ✅ |
| `#A9B7CC` on `#111A2B`（暗次要） | 8.6:1 | ≥4.5 | ✅ |
| `#8AB4FF` on `#16213A`（暗链接） | 7.4:1 | ≥4.5 | ✅ |
| `#2563EB` on `#FFFFFF`（焦点环） | 5.2:1 | ≥3 | ✅ |
| `#94A3B8` on `#FFFFFF`（禁用） | 2.9:1 | 豁免 | 仅禁用态 |
| 边框 `#CBD5E1` on `#FFFFFF`（输入框） | 1.6:1 | ≥3（若为唯一视觉标识） | ⚠ 输入框需同时有 label 与内部填充差异；焦点态边框用 primary（5.2:1） |

> CI 校验：`@axe-core/playwright` + `color-contrast` 规则；token 变更需跑 `pnpm test:a11y`。

### 2.4 数据可视化色板（8 色，色盲友好）

`#2563EB` `#15B79E` `#7A5AF8` `#F79009` `#D92D20` `#0E9384` `#9B8AFB` `#64748B`
规则：同一图表最多 6 个系列；超过时"其他"聚合；不只靠颜色区分（加形状/直接标注）；暗色模式提高明度 10–15%。

### 2.5 使用规则

- `primary` 每屏最多 1 个（主 CTA）；破坏性操作用 `danger`，且不与 `primary` 相邻。
- 状态色只表达状态，不用于装饰；成功/警告/错误必须有图标 + 文本，不能仅靠颜色（WCAG 1.4.1）。
- 表格斑马纹禁用；用行 hover + 分割线；选中行用 `primary-subtle` + 左侧 3px 主色条。
- 图表在不同主题下重新取色，不透明度 100%，网格线用 `border`（≤30% 视觉权重）。

---

## 3. 字体与排版

### 3.1 字族

| 用途 | 字族 | 回退 |
|------|------|------|
| UI（中） | `"HarmonyOS Sans SC"`（优先，随镜像分发） | `"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif` |
| UI（英） | `Inter` | `-apple-system, "Segoe UI", Roboto, sans-serif` |
| 代码/ID | `JetBrains Mono` | `"SFMono-Regular", Consolas, monospace` |
| 数字（表格） | `Inter` + `font-variant-numeric: tabular-nums` | — |

字体通过 `next/font` 自托管，禁止运行时请求 Google Fonts（数据不出境 + 稳定性）。`font-display: swap`。

### 3.2 字号阶梯（Desktop）

| Token | Size / Line-height | 字重 | 用途 |
|-------|-------------------|------|------|
| `text-2xs` | 11/16 | 500 | 徽标、极小元信息（仅辅助文本，避免正文） |
| `text-xs` | 12/20 | 400/500 | 表格辅助列、时间戳、帮助文本 |
| `text-sm` | 13/20 | 400/500 | 表格正文、表单标签、次要按钮 |
| `text-base` | 14/22 | 400/500 | **控制台正文默认**、导航 |
| `text-md` | 16/24 | 400/500 | 卡片标题、阅读型内容 |
| `text-lg` | 18/28 | 600 | 页面小标题、对话框标题 |
| `text-xl` | 20/30 | 600 | 区块标题 |
| `text-2xl` | 24/32 | 600 | 页面标题（H1） |
| `text-3xl` | 30/38 | 600 | 登录页/门户大标题 |
| `text-4xl` | 36/44 | 600 | 营销/门户 Hero（仅 P1 门户） |

规则：控制台正文 14px（信息密度）；行高 ≥1.4（中文 ≥1.55）；标题不超过 2 行；段落最大宽度 75ch；中文与英文/数字之间自动加 0.25em 间隙（CSS `text-autospace: normal` 或构建时处理）；句末标点跟随语言。

### 3.3 字重与强调

- 可用字重 400/500/600；**禁止 700+**（中文过粗）。
- 强调：优先 `font-weight: 600` + 颜色层级，不用斜体（中文斜体失真）。
- 代码内联：`text-sm mono` + `surface-hover` 底 + 2px 圆角。

---

## 4. 间距、布局与密度

### 4.1 间距刻度（4px 基）

| Token | 值 | 典型用途 |
|-------|-----|----------|
| `space-0` | 0 | — |
| `space-1` | 4px | 图标与文本、徽标内边距 |
| `space-2` | 8px | 表单项内部、按钮内边距（sm） |
| `space-3` | 12px | 卡片内元素间距、表格单元格垂直 |
| `space-4` | 16px | 卡片内边距（紧凑）、按钮 md 水平 |
| `space-5` | 20px | 卡片内边距 |
| `space-6` | 24px | 页面边距（lg）、区块间距 |
| `space-8` | 32px | 页面边距（xl）、大区块 |
| `space-10` | 40px | 空态上下留白 |
| `space-12` | 48px | 登录页间距 |
| `space-16` | 64px | 门户 Hero |

### 4.2 栅格与容器

- 12 列栅格，`gap: 24px`；内容 `max-width: 1440px`；页面水平内边距：≥1280 为 32px，1024–1279 为 24px，<1024 为 16px。
- 列表页：筛选区 12 列；表格全宽。
- 详情页：主内容 8 列 + 右侧信息栏 4 列（≥1280）；<1280 右栏折叠到主内容下方。
- 表单页：单列最大 640px；双列最大 960px（字段间 gap 24px）。
- 对话框：S 400 / M 520 / L 720 / XL 960（最大 90vw）。

### 4.3 密度

| 密度 | 行高 | 表格 cell padding | 适用 |
|------|------|------------------|------|
| 舒适（默认） | 44px | 12px 16px | 大多数页面 |
| 紧凑 | 36px | 8px 12px | 审计/用量等大数据表 |
| 宽松 | 56px | 16px 20px | 门户/引导 |

密度选择持久化；`/audit`、`/usage` 默认紧凑。

### 4.4 高程与 z-index

| Token | 值 | 用途 |
|-------|-----|------|
| `--oc-z-base` | 0 | 内容 |
| `--oc-z-sticky` | 10 | 表头/吸顶操作条 |
| `--oc-z-dropdown` | 1000 | 下拉/弹出 |
| `--oc-z-drawer` | 1100 | 抽屉 |
| `--oc-z-modal` | 1200 | 对话框 |
| `--oc-z-toast` | 1300 | Toast |
| `--oc-z-tooltip` | 1400 | Tooltip |

---

## 5. 圆角、边框、阴影

| Token | 值 | 用途 |
|-------|-----|------|
| `radius-xs` | 4px | 徽标、代码内联、复选框 |
| `radius-sm` | 6px | 输入框、按钮（sm）、标签 |
| `radius-md` | 8px | 按钮（md）、卡片、下拉 |
| `radius-lg` | 12px | 对话框、抽屉、大卡片 |
| `radius-xl` | 16px | 门户卡片、引导卡 |
| `radius-full` | 9999px | 头像、胶囊徽标、开关 |

| 阴影 | Light | Dark |
|------|-------|------|
| `shadow-xs` | `0 1px 2px rgba(15,23,42,.06)` | `0 1px 2px rgba(0,0,0,.4)` |
| `shadow-sm` | `0 1px 3px rgba(15,23,42,.10), 0 1px 2px rgba(15,23,42,.06)` | `0 2px 6px rgba(0,0,0,.45)` |
| `shadow-md` | `0 4px 12px rgba(15,23,42,.10)` | `0 8px 20px rgba(0,0,0,.5)` |
| `shadow-lg` | `0 12px 32px rgba(15,23,42,.14)` | `0 16px 40px rgba(0,0,0,.55)` |
| `shadow-focus` | `0 0 0 3px rgba(37,99,235,.28)` | `0 0 0 3px rgba(138,180,255,.35)` |

规则：卡片默认 `border + shadow-xs`，不用大阴影堆叠；对话框 `shadow-lg` + `overlay`；暗色阴影更黑更散、不使用彩色阴影。

---

## 6. 动效

| Token | 值 | 用途 |
|-------|-----|------|
| `duration-instant` | 100ms | hover/按下反馈 |
| `duration-fast` | 150ms | 下拉、Tooltip、按钮状态 |
| `duration-normal` | 200ms | 抽屉/对话框进出、Tab 切换 |
| `duration-slow` | 300ms | 页面级过渡、Toast 进入 |
| `duration-slower` | 500ms | 骨架淡出、进度条推进 |
| `ease-standard` | `cubic-bezier(.2,0,0,1)` | 通用 |
| `ease-decelerate` | `cubic-bezier(0,0,0,1)` | 进入 |
| `ease-accelerate` | `cubic-bezier(.3,0,1,1)` | 退出 |
| `ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | 成功勾选等小奖励（仅 1 处） |

规则：
- 只动 `transform`/`opacity`/`color`/`box-shadow`，不动 `width/height/top/left`（避免掉帧）；布局变化用 FLIP 或直接切换。
- `prefers-reduced-motion: reduce` 时所有时长 → 0ms，保留状态变化（不用动画表达必要信息）。
- 进度反馈：不确定进度用 2s 循环的条纹/脉冲；确定进度用线性推进，禁止"假进度"跳回。
- 长任务不阻塞界面：动效只做"进行中"提示，不弹全屏阻塞 loading >1s（除首屏与登录）。

---

## 7. 图标与插画

- 图标库：`lucide-react`，默认 `size=16`（表格/按钮）、`20`（导航）、`24`（空态）；`stroke-width=1.75`。
- 图标必须配文本或 `aria-label`；纯装饰 `aria-hidden="true"`。
- 空态插画：线性风格 1.5px 描边 + 品牌色 10% 填充，尺寸 120/160/200；不引入位图，用内联 SVG 组件；暗色下用 `currentColor` 自适应。
- 状态图标：成功 `CheckCircle2`、警告 `AlertTriangle`、错误 `XCircle`、信息 `Info`、进行中 `Loader2`（`animate-spin`）。

---

## 8. 组件清单与规格

### 8.1 组件总表（含状态要求）

| # | 组件 | 变体 | 必须覆盖的状态 | 无障碍要点 |
|---|------|------|----------------|------------|
| 1 | Button | primary / secondary / ghost / danger / link；sm/md/lg；icon-only | default/hover/active/focus-visible/disabled/loading | 原生 `button`；loading 时 `aria-busy` + 禁用重复提交；icon-only 必须有 `aria-label` |
| 2 | Input / Textarea | 默认/带前后缀/密码/搜索 | default/focus/error/disabled/readonly/filled | `label` 关联；错误 `aria-describedby` + `aria-invalid` |
| 3 | Select / Combobox | 单选/多选/可搜索 | default/open/focus/error/disabled/loading/empty | `role=combobox` + `listbox`；键盘上下/Enter/Esc |
| 4 | Checkbox / Radio / Switch | — | default/checked/indeterminate/focus/disabled/error | 原生控件或 Radix；`label` 点击区域 ≥44px |
| 5 | Form Field | label/help/error/required | — | 错误用文本 + 图标；必填 `*` 有 `aria-required` |
| 6 | Table | 基础/可选行/排序/固定列/分组/紧凑 | loading/empty/error/partial/selected/sorted | `<table>` 语义；`scope`；排序按钮 `aria-sort`；空态 `colspan` 单元格 |
| 7 | Pagination | 页码/游标/加载更多 | default/loading/disabled | `nav aria-label="分页"`；当前页 `aria-current="page"` |
| 8 | Tabs | underline/segmented | default/active/focus/disabled | `role=tablist/tab/tabpanel`；方向键切换 |
| 9 | Dialog | S/M/L/XL；alertdialog | open/loading/error | 焦点陷阱 + 初始焦点 + Esc + 返回焦点；`aria-modal` |
| 10 | Drawer | 右侧/底部；可拖宽 | open/loading/error | 同 Dialog；关闭按钮常驻 |
| 11 | Toast | success/warning/error/info；带 action | enter/exit/stack | `role=status`（info/success）`role=alert`（error）；不自动关闭 error |
| 12 | Inline Alert / Banner | info/success/warning/danger；可关闭 | default/dismissed | `role=alert` 仅关键；不靠颜色 |
| 13 | Empty State | 页面级/卡片级/表格内 | — | 标题 + 描述 + CTA；插画 `aria-hidden` |
| 14 | Error State | 可重试/不可重试/403/404 | — | 标题 + 原因 + 出路 + request_id |
| 15 | Skeleton | 文本/卡片/表格/图表 | — | `aria-hidden`；容器 `aria-busy="true"` |
| 16 | Badge / Status Dot | neutral/success/warning/danger/info/violet + 圆点 | 静态/脉冲（进行中） | 文本必须存在；脉冲在 reduced-motion 下静止 |
| 17 | Permission Badge | view/use/edit + role | — | 文本 + tooltip 解释权限含义 |
| 18 | Quota Meter | 线性/环形 | normal/warning(≥80%)/danger(100%)/loading | `role=progressbar` + `aria-valuenow/min/max` + 文本 |
| 19 | Avatar | 图片/首字母/组 | default/fallback | 图片 `alt`；组显示 "+N" |
| 20 | Tooltip | top/right/bottom/left | open | 不承载唯一关键信息；hover + focus 均可触发 |
| 21 | Popover / Dropdown Menu | — | open/disabled/checked | `role=menu`；方向键；Esc 关闭 |
| 22 | Command Palette | — | open/loading/empty | `role=dialog` + `combobox`；`aria-activedescendant` |
| 23 | Breadcrumb | — | — | `nav aria-label="面包屑"`；末级 `aria-current=page` |
| 24 | Stepper（向导） | 水平/垂直 | current/done/upcoming/error | 当前步 `aria-current=step` |
| 25 | Upload | 拖拽/点击；单/多文件 | idle/dragging/uploading/success/error/limit | 键盘可触发；进度文本 |
| 26 | Code Block | 只读/可复制/可折叠 | default/copied | 换行开关；复制按钮 `aria-live` 反馈 |
| 27 | Progress Bar | 确定/不确定 | — | `role=progressbar` |
| 28 | Timeline（事件） | — | — | 时间用 `<time datetime>` |
| 29 | Tag / Chip | 可移除/可选 | default/selected/removable/disabled | 移除按钮有 `aria-label="移除 X"` |
| 30 | Kbd | — | — | `<kbd>` 语义 |

### 8.2 Button 规格

| 变体 | 背景 | 文本 | 边框 | 使用场景 |
|------|------|------|------|----------|
| primary | `primary` | white | 无 | 每屏唯一主 CTA |
| secondary | `surface` | `text` | `border-strong` | 次要操作 |
| ghost | 透明 | `text-secondary` | 无 | 表格行内、工具栏 |
| danger | `danger` | white | 无 | 删除/销毁（需确认） |
| link | 透明 | `primary-text` | 无 | 内联跳转 |

尺寸：sm `h-8 px-3 text-sm`、md `h-9 px-4 text-base`、lg `h-11 px-5 text-md`；icon-only 正方形；最小点击区 44×44（用 padding 扩展，视觉可 36）。
Loading：左侧 `Loader2` 旋转 + 文案保持宽度（`min-width` 防跳动）+ 禁用重复点击；异步完成前不关闭对话框。

### 8.3 Input / Form 规格

- 高度：32（sm，表格内）/ 36（md，默认）/ 40（lg，登录页）；圆角 `radius-sm`；水平 padding 12。
- 状态：默认边框 `border-strong`；hover 加深；focus `primary` 边框 + `shadow-focus`；error `danger` 边框 + 下方红色文本（含图标）；disabled `surface-hover` 底 + `text-disabled`；readonly 保留正常文本。
- 校验时机：失焦校验格式；提交校验全部；错误就近显示；首个错误自动聚焦并滚动到可见；`aria-live="polite"` 汇总。
- 帮助文本与错误文本互斥（错误优先）；字符计数在接近上限时显示。

### 8.4 Table 规格

- 表头：`surface` + `border-b`，`text-xs` 500 `text-secondary`，吸顶（`z-sticky`）。
- 行：高度按密度；hover `surface-hover`；点击整行进入详情（行内交互按钮 `stopPropagation`）；选中行左侧 3px 主色条 + `primary-subtle`。
- 列：文本左对齐、数字右对齐、状态居中；列宽可配置并持久化；最小列宽 80，主列 flex。
- 排序：点击表头循环 升/降/无；`aria-sort`；服务端排序参数 `?sort=field:asc`。
- 批量：选中后底部浮出批量栏（已选 N 项 + 操作 + 取消）。
- 空/加载/错误：`<tbody>` 内统一占位（加载 5 行骨架、空态插画 120、错误卡带重试），禁止整表替换成 spinner。
- 移动：<768 转卡片列表（标题 + 2–3 关键字段 + 操作菜单）。

### 8.5 Dialog / Drawer 规格

- Dialog：M 默认 520；标题 `text-lg 600`；描述 `text-sm secondary`；底部右对齐「取消 / 主操作」；破坏性主操作用 danger 且文案动词化（"销毁工作区"而非"确定"）。
- 危险确认：必须输入资源名（精确匹配）+ 展示影响范围 + 冷却/恢复说明；不提供"不再提示"。
- 焦点：打开时聚焦首个可交互元素（破坏性对话框聚焦「取消」）；Esc 关闭（除非 `preventClose` 且说明原因）；关闭后焦点回到触发元素。
- Drawer：宽 480（默认）/ 640（大）/ 100%（移动）；用于低频编辑与详情，不用于主流程分步。
- 嵌套：Dialog 内不再开 Dialog（改 Drawer 或内联展开）。

### 8.6 Toast 规格

| 类型 | 图标 | 自动关闭 | 示例 |
|------|------|----------|------|
| success | CheckCircle | 4s | 已保存，权限 5s 内生效 |
| info | Info | 4s | 已复制链接 |
| warning | AlertTriangle | 6s | 配额已用 85% |
| error | XCircle | 不自动关闭 | 保存失败：权限冲突（重试） |

位置：右下角堆叠（最多 3 条，超出折叠"+N"）；移动端底部。不遮挡主 CTA；`role=status/alert`；提供 `aria-live` 但不能重复播报。

### 8.7 Empty State 规格

结构：插画（120，`aria-hidden`）→ 标题（`text-md 600`）→ 描述（`text-sm secondary`，≤2 行）→ 主 CTA → 次 CTA（文字链接）。
卡片内空态：无插画，仅图标 + 一行说明 + 链接。表格内空态：单行居中，高 240。
禁止：只显示"暂无数据"；空态必须告诉用户**下一步做什么**。

### 8.8 Status Badge 规格

`inline-flex items-center gap-1 rounded-full px-2 h-5 text-xs 500` + 6px 圆点。
进行中（provisioning/building/deploying/running）用脉冲圆点（reduced-motion 静止）；error 用 danger 底 + danger 文本；idle/stopped 用 neutral。状态同时提供文本，不靠颜色。

### 8.9 Permission Badge 规格

| 值 | 文案 zh/en | 颜色 | Tooltip |
|----|-----------|------|---------|
| view | 可查看 / View | neutral | 可打开与查看，不能提交或修改 |
| use | 可使用 / Use | info | 可提交输入与触发运行，不能改配置 |
| edit | 可编辑 / Edit | violet | 可改配置、构建部署、管理分享 |
| owner | 所有者 / Owner | brand | 全部权限（含删除） |
| inherit | 继承 / Inherited | neutral 描边 | 来自团队/组织，不可单独移除 |

### 8.10 Quota Meter 规格

线性条高 8、圆角 full；`<80%` primary、`80–99%` warning、`100%` danger；右侧文本 `已用 / 上限（百分比）`；超限时条满 + 图标 + "申请提升"链接。必须提供文本数值（屏幕阅读器）。

### 8.11 命令面板规格

触发 ⌘K / Ctrl+K / 点击搜索框；宽度 640；顶部输入；分组结果（页面/工作区/Skill/应用/MCP/操作）；底部快捷键提示；空输入显示最近访问（≤5）与推荐操作；无结果给创建/搜索文档出口；`Esc` 关闭并恢复焦点；结果 ≤50 条。

---

## 9. 响应式断点

| Token | 宽度 | 行为 |
|-------|------|------|
| `xs` | <640 | 单列；底部 Tab（工作区/Skill/应用/我的）；表格→卡片；对话框全屏 Sheet |
| `sm` | 640–767 | 单列；侧栏抽屉；表格→卡片 |
| `md` | 768–1023 | 双列卡片；侧栏抽屉；简单表格可用（横向滚动） |
| `lg` | 1024–1279 | 侧栏折叠图标；12 列栅格；new-tab 打开工作区可用；嵌入为 P2 实验、默认关闭 |
| `xl` | 1280–1535 | 完整侧栏 240；详情页 8+4 栏；new-tab 打开工作区最佳 |
| `2xl` | ≥1536 | 内容 max 1440 居中；列表可加右侧信息栏 |

实现：Tailwind 断点 + `@container` 用于卡片/表格容器自适应（例如 Skill 卡片在 360 容器宽时单列）。测试矩阵：360 / 768 / 1024 / 1280 / 1440 / 1920，浏览器缩放 100%/200%。

---

## 10. 无障碍（WCAG 2.1 AA）

### 10.1 验收要求（G3/G6 检查）

| WCAG | 要求 | 本项目落地 | 验证 |
|------|------|------------|------|
| 1.1.1 非文本内容 | 图片有替代文本 | 图标 `aria-hidden` 或 `aria-label`；头像 `alt`；图表提供数据表/文字摘要 | axe |
| 1.4.1 颜色使用 | 不只靠颜色传达 | 状态 = 图标 + 文本；必填 `*` + `aria-required`；错误文本 | 人工 |
| 1.4.3 对比度（文本） | ≥4.5:1 | §2.3 校验表 | axe/contrast checker |
| 1.4.4 文本缩放 | 200% 不丢失 | rem 布局；无固定高度文本容器；测试 200% 缩放 | 人工/Playwright |
| 1.4.10 重排 | 320px 宽无双向滚动 | 响应式 + 表格卡片化 | Playwright |
| 1.4.11 非文本对比度 | UI 组件/图形 ≥3:1 | 输入框焦点态、开关、复选框、图表线 | axe |
| 1.4.12 文本间距 | 可调行高/字距不截断 | 不设固定 line-height 裁切 | 人工 |
| 2.1.1 键盘 | 全部功能键盘可达 | 见 §10.2 键盘映射 | Playwright 键盘遍历 |
| 2.1.2 无键盘陷阱 | 对话框可 Esc 退出 | 焦点陷阱有出口 | 人工 |
| 2.4.3 焦点顺序 | 逻辑顺序 | DOM 顺序 = 视觉顺序；侧栏在内容前 | 人工 |
| 2.4.7 焦点可见 | 明显焦点指示 | `:focus-visible` 3px ring + 2px offset，暗色同 | 人工 |
| 2.5.8 目标尺寸 | ≥24×24（AA） | 实际 ≥44×44；表格行内图标按钮 32 视觉 + padding | axe |
| 3.1.1 语言 | `lang` 正确 | `<html lang>` + 局部 `lang` 属性（中英混排） | axe |
| 3.2.1 获焦不触发变化 | 无自动跳转 | 选择项不即时提交；路由变化需显式操作 | 人工 |
| 3.3.1 错误识别 | 文本描述错误 | 字段级错误 + 汇总 + 图标 | 人工 |
| 3.3.2 标签/说明 | 输入有 label | 所有输入有可见 label（占位符不作为唯一 label） | axe |
| 3.3.3 错误建议 | 提供修正建议 | 错误文案含"怎么改" | 文案审查 |
| 4.1.2 名称/角色/值 | 语义正确 | 原生元素优先；ARIA 仅在必要时 | axe |
| 4.1.3 状态消息 | 动态状态可感知 | Toast/保存结果用 `role=status`；错误用 `alert` | 人工 + SR |

### 10.2 键盘映射

| 按键 | 行为 |
|------|------|
| `Tab` / `Shift+Tab` | 顺序聚焦；进入对话框后限制在内部 |
| `Enter` / `Space` | 激活按钮/链接/开关 |
| `Esc` | 关闭对话框/抽屉/下拉/命令面板；不丢失表单（提示确认） |
| `↑` `↓` | 下拉/菜单/表格行/命令面板选择 |
| `←` `→` | Tabs 切换；分页 |
| `⌘K` / `Ctrl+K` | 打开命令面板 |
| `/` | 聚焦当前页搜索框（列表页） |
| `g` + `w/s/e/a/m/u` | 跳转工作区/Skill/评测/应用/MCP/用量 |
| `?` | 快捷键帮助 |
| `F6` | 在侧栏/内容/辅助区之间切换（浏览器默认增强） |

### 10.3 焦点管理

- 路由切换后焦点移到 `<h1>`（`tabIndex=-1`）并播报页面名。
- 对话框：记录触发元素，关闭后返回；初始焦点规则见 §8.5。
- 删除/保存后：焦点移到列表首个可操作项或状态提示。
- 错误提交：焦点移到错误汇总，屏幕阅读器读出"N 个错误"。
- 跳过链接：`跳到主内容`（首个 Tab 可见）。

### 10.4 屏幕阅读器文案

- 状态徽标读法："工作区状态：就绪"，而非只读"就绪"。
- 图标按钮必须有可读名称（"更多操作：oc-7f3a"）。
- 进度："工作区创建中，68%，预计还需 40 秒"。
- 表格：caption 或 `aria-label`；排序读法"按名称升序排列"。
- 图表：提供 `aria-label` 摘要 + 可展开数据表。

### 10.5 测试方法

1. `@axe-core/playwright` 扫描全部 P0 路由（明/暗 × zh/en），critical/serious = 0。
2. Playwright 键盘脚本：Tab 遍历无焦点丢失、对话框 Esc 可退、命令面板全键盘操作。
3. 手动：NVDA（Windows）+ VoiceOver（macOS）各走 F1/F3/F6 主流程。
4. 200% 缩放 + 320px 宽度截图对比。
5. CI gate：`pnpm test:a11y` 失败阻断合并。

---

## 11. 国际化（zh-CN / en-US）

### 11.1 语言策略

- 默认 `zh-CN`；`en-US` 完整可用；语言来源优先级：URL `?lang=` > 用户设置 > 浏览器 Accept-Language > 组织默认 > zh-CN。
- 切换语言不刷新页面（`next-intl` 客户端切换）；切换后 `<html lang>` 更新；日期/数字立即重排。
- 用户生成内容（Skill 描述、应用名、审计详情）**不强制翻译**，按原文显示；缺失翻译回退中文并在详情页标注"原文"。系统 UI 文案 100% 走 i18n key，CI 校验 key 齐全（`i18n-check`）。

### 11.2 文案规范

- 中文：简洁、动词开头、不用感叹号、不堆术语；按钮 2–6 字（"保存"“去评测”“申请提升”）。
- 英文：Sentence case；按钮 1–3 词（Save / Run eval / Request quota）；不使用全大写（除缩写）。
- 错误文案模板：**发生了什么 + 下一步**。例：`工作区创建失败：集群资源不足。请重试，或联系管理员。`
- 危险操作：说明后果 + 可恢复性 + 所需输入；不使用"确定吗？"空泛问法。
- 数字：`12,480`（千分位）；百分比 `78%`；时间 `2 分钟前` / `2 min ago`（>7 天显示日期）；金额：接口返回 `cost_usd`（decimal string），界面默认显示 USD（`$86.20`，不做浮点累加）；如组织配置本地币种，仅在明确标注汇率与换算时间时显示折算值。
- 相对时间用 `Intl.RelativeTimeFormat`；绝对时间 `YYYY-MM-DD HH:mm`（zh）/ `MMM D, YYYY HH:mm`（en），均带时区说明。

### 11.3 术语表（UI 强制一致）

| zh-CN | en-US | 说明 |
|-------|-------|------|
| 工作区 | Workspace | 4C8G 云端 opencode 实例 |
| 模型中心 | Model Hub | 模型目录与策略 |
| 模型策略 | Model Policy | 可用集合/默认模型 |
| Skill 中心 | Skill Hub | 不翻译 Skill |
| 评测中心 | Eval Hub | — |
| 评测运行 | Eval Run | — |
| 应用中心 | App Hub | — |
| 应用 | App | 1C2G 部署单元 |
| 分享 | Share | 应用访问授权 |
| 访问范围 | Audience | 仅自己/组织/指定对象 |
| 权限 | Permission | 查看/使用/编辑 |
| MCP 中心 | MCP Hub | 不翻译 MCP |
| 用量 | Usage | — |
| 配额 | Quota | — |
| 审计日志 | Audit Log | — |
| 审批中心 | Approvals | — |
| 拉起 / 创建 | Provision | 工作区创建过程 |
| 休眠 | Sleep | 保留 PVC，停止计算 |
| 销毁 | Destroy | 删除工作区 |
| 快照 | Snapshot | — |
| 就绪 / 空闲 / 异常 | Ready / Idle / Error | 状态枚举 |
| API Key | API Key | 不翻译 |
| 组织 / 团队 / 成员 | Org / Team / Member | — |

### 11.4 布局适配

- 英文长度平均 +25%，按钮/导航预留 1.4× 宽度；禁止固定宽度文本容器（用 `min-width` + 换行）。
- 中文标点：使用全角标点；中英混排自动间距；英文界面不出现中文标点。
- 复数：英文用 ICU MessageFormat（`{count, plural, one {# app} other {# apps}}`）；中文无复数变化。
- 排序/搜索：中文按拼音（`Intl.Collator('zh')`），英文按字母；搜索支持中英混合与拼音首字母（P2）。

---

## 12. 文案与微交互标准

| 场景 | 规范 |
|------|------|
| 按钮文案 | 动词 + 对象，≤6 字；破坏性用具体动词（销毁/移除/驳回） |
| 空态 | 标题（是什么）+ 描述（为什么）+ CTA（下一步） |
| 加载 | 首屏骨架；局部加载保留旧数据 + 顶部进度；>3s 出现取消 |
| 保存 | Toast"已保存"；权限类变更需说明生效时间（"5 秒内生效"） |
| 复制 | Toast"已复制"；按钮图标短暂变 Check（1.5s） |
| 危险操作 | 输入资源名 + 影响说明 + 冷却/恢复；主按钮 danger |
| 失败 | 错误卡 = 原因（人话）+ request_id + 重试 + 联系管理员 |
| 成功但无内容 | 空态而非空白页 |
| 权限不足 | 说明缺什么、谁能给、去哪申请（不暴露他人资源） |

---

## 13. 实施约定（约束 `apps/console`）

1. **Token 唯一来源**：`styles/tokens.css` 定义 CSS 变量；Tailwind theme 映射到变量；组件禁止硬编码 hex/px（除 0/1px 边框）。
2. **主题**：`data-theme` 切换；SSR 首屏内联脚本读 `localStorage` 防闪烁；`color-scheme` 同步设置。
3. **组件来源**：shadcn/ui 生成到 `components/ui/` 后按本文改写 token 与状态；业务组件在 `components/domain/`；禁止直接改 Radix 内部样式。
4. **图标**：lucide-react，统一 `size/color`；禁止 emoji 当图标。
5. **表单**：React Hook Form + Zod；错误映射服务端 `error.details[].field`；提交按钮 loading 防重复。
6. **数据**：TanStack Query（缓存/重试/乐观更新）；长任务用 SSE + 轮询降级；所有 mutation 带 `Idempotency-Key`（写操作）。
7. **测试**：Vitest（组件状态矩阵）+ Playwright（关键流程 + 键盘 + axe）；视觉回归覆盖明/暗 × zh/en 关键页。
8. **性能**：首屏 LCP <2.5s；路由级代码分割；表格虚拟滚动 >100 行；字体子集化；iframe 懒加载。
9. **安全**：所有用户内容转义；外链 `rel="noopener noreferrer"`；iframe `sandbox` 最小化；CSP 禁止内联脚本（除主题引导）。

---

## 14. 验收清单（G3 / G6）

- [x] token 覆盖颜色/字体/间距/圆角/阴影/动效/层级，明暗双主题对等
- [x] 30 个组件均有状态矩阵与无障碍要点
- [x] 6 档响应式断点 + 容器查询策略
- [x] WCAG 2.1 AA 逐条落地项 + 键盘映射 + 焦点管理 + 测试方法
- [x] 中英双语：策略、文案、术语、布局、格式
- [x] 实施约束（token 唯一来源、CI 检查、性能/安全）
- [ ] 与 openapi 字段/状态/错误码最终对齐（依赖 A1–A5，见 IA §9）
- [ ] 视觉回归基线与 axe 报告（G4 实现阶段产出）

---

## 15. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| v1.0 | 2026-11-04 | 初版：三层 token、明暗色板与对比度、排版/间距/动效、30 组件、响应式、WCAG AA、i18n | web-console |
