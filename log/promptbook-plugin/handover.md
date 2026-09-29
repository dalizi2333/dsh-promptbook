// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 交接文档：dsh-promptbook 插件（给接手的新会话）

> **本文件是接手入口。** 接手方请**先读完本文件**，再按 §1 指路读计划全文，然后从 §5 开工。
> 本文件不预设接手方已知任何背景。
> **当前状态：✅ S0 + S1 + S2 完成（注入两通道真机双标记实证，R5 修复闭环）；S3 client 卡未开工。仓库已推 `dalizi2333/dsh-promptbook`（CI 全绿，pre-push 门已启用）。**

## §0 一句话任务

在 **0.2.0-rc.1 基线**（实例 mimo-codex-020）上新建单插件 **`@mimo-codex/dsh-promptbook`**：
按模型本地化系统提示词与工具描述（**只对 llm-mimo 托管的模型生效**），GUI 卡可编辑，
以此修复 R5——人设必须从**会话第一条消息起**跟随**实际路由的模型**，不串会话、无滞后窗口。

**与旧实现的关键差别**（为什么是重写不是搬运）：旧双插件（promptbook=服务+卡、
persona=消费方）的人设在装配期冻结、模型源用了 `agent.options` 创建快照，导致
**首条错配人设、第二步起人设整体消失**（实测证据：旧 HANDOFF §0.1，见 local-env.md 指路）。
新设计：单插件、模型源 = pending route、注入挂在每次装配都重估的瀑布上——旧 bug 类结构性消除。

## §1 路径指路

**仓库内（相对路径，随仓库走）**：

| 项 | 值 |
| --- | --- |
| 计划全文（设计权威） | [`README.md`](README.md)（含 §3.6 程序化检验面） |
| 实时进度 | [`progress.md`](progress.md) |
| 决策记录 | [`decisions.md`](decisions.md)（D1–D10，含被否决方案） |
| 本机环境速查 | `local-env.md`（**git-ignore 不入库**：实例/运行时/旧仓/工具/样本的本机路径都在这里；克隆者按自己布局重建） |

**远程可得（不依赖本机）**：

| 项 | 值 |
| --- | --- |
| 模板仓（插件形态照抄） | GitHub `dalizi2333/dsh-llm-mimo`（npm 包名 `@mimo-codex/dsh-llm-mimo`） |
| llm-mimo 接口契约（**必读**） | 该仓 `AGENTS.md`（llmMimo 服务、registerPromptSource、装配层关系、R5 契约条款） |
| llm-mimo 冒烟实证 | 该仓 `HANDOFF.md` 〇-附4（systemPrompt.section GUI 可见性 + assemble 瀑布） |

**本机才有（路径见 local-env.md）**：020 实例 core-web profile（安装目标）、0.2.0-rc.1 运行时
（`dsh-system-prompt`/`dsh-session`/`dsh-client-ui-*` 类型源）、待移植的旧 resolve 链与卡源码、
旧排障 HANDOFF、speedprint 工具、测速校准样本、GUI 卡官方先例（web-search client.js 的
`plugins.item` + `configForms.whileServed` 样板）。

## §2 必须带走的实测结论（全部有证据，别重推导）

1. **路由从未串台**：全库 106 会话，名义模型 + finish 块 `replayState.response.model`（adapter 自报）+ 速度档三者一致；mimo 系实测 10~60 tok/s，deepseek-flash 100~264 tok/s，**mimo 不可能 ≥140**。
2. **串的只是人设文本**：铁证 `session-a5f719d3`（09-25 13:23）——路由/自报/速度三证均 mimo-v2.6-pro，system 却是 "Flash 专属人设 v2"（GUI 覆盖层测试残留，属 deepseek-flash 键）。
3. **旧人设只挂第一步**：三个 sys=2 会话一致——step1 覆盖文本 → step2 起跌回裸默认英文句。
4. **日志三源不一致的构成**：`request/header` 只记 step1；`system/message` 只记变化；旧 dbg 行读 `agent.options` 快照。**对账权威 = speedprint 三重指纹 + 轨迹 system/message 文件级对账**（不需要看 GUI）。
5. 0.2.0-rc.1 的系统提示词为 **in-history 形态**（`request/context` 记 `systemPromptUpdate:"in-history"`）；llm-mimo 声明 MiMo 无 in-history system 支持并把头部 system 折叠进首槽。切模型 → 缓存必 miss → harness 自行重建历史，**插件零额外代码**。

## §3 设计要点（浓缩版，全文见 README §3）

- 单插件三面孔：注入（assemble 瀑布主通道 + `registerPromptSource` 兜底）／编辑（`plugins.item` 卡 + ConfigForm）／服务（`provide("promptbook")`）。
- 插件级依赖 dsh-llm-mimo；**合法模型世界 = `llmMimo.listHostedModels()`**（下拉/resolve/注入判定三处同源；名单外结构性不可达；无事件监听、无动态注册/注销）。
- 模型源 = **`assembly.variables.model`**（装配输入携带的 pending route，D18；requestHeader 首装配恒空已实证）——**禁止** `agent.options` 快照，也别照抄 llm-mimo AGENTS 里的 requestHeader 建议（该建议在装配场景不成立）。
- resolve 链语义不变：registry → default → 家族 → 模型 → GUI entriesJson → overrides；volatile 物化坑在新基线重验。
- GUI 插槽用 **`plugins.item`**（设置→插件→本插件卡）；llm-mimo 用的 `settings.models.*` 是模型页专属，**用不了**。
- **程序化检验优先**（README §3.6）：除卡的纯渲染层外全部可自动验证——resolve 单测、headless cordis 注入冒烟、卡逻辑层单测（逻辑/渲染分离）、配置往返、端到端轨迹对账；视觉验收只覆盖渲染残余。

## §4 已做 / 未做

**已做（S0 ✅，2026-09-29）**：可安装性骨架全落——根六件（package.json @0.1.0、lib/index.js 服务桩、lib/client.js 桩、cordis.patch.yml 自挂载条目、README、AGENTS、LICENSE）；已装入 020 **core-headless**（双副本 + 依赖闭包 + profile 接线）并验证：模块级 apply() ✓、`--dump-config` 组合树含条目 ✓、headless 一次性任务全通（会话 1162af07，指纹三证 ✓）。仓库尚**未 commit**（待 owner；远程仓未建）。

**未做**：S1 resolve 链移植 + Config + 单测 → S2 注入两通道（`inject:["llmMimo"]` 在此加）→ S3 client 卡（逻辑单测自动验，渲染层视觉移交）→ S4 装入 core-web 端到端验收。

## §5 开工顺序（S1 起）

1. S1：Config 配置面（资源包分层字段）+ 从旧基线移植 resolve 链 + 10 场景逻辑测试（node 直跑）；volatile 双形态兼容先保留、重验后删。
2. S2：`inject: ["llmMimo"]`；`ctx.on("system-prompt/assemble", …)` 内查名单 + 读 pending route + resolve → 替换 system 段/改 tools 描述；同逻辑挂 `registerPromptSource` 兜底；**headless cordis 冒烟**（mock llmMimo/session，断言 hosted 替换、非 hosted 透传）。
3. S3 卡：照 web-search 样板 `plugins.item` + `configForms.whileServed([NS])`；**数据/状态逻辑与 JSX 分离进单测**；渲染层截图验收交有视觉的模型/owner。
4. S4 装入 core-web（README §3.5 配方；评估 `dsh plugin add` 官方命令）+ 端到端对账（speedprint + 轨迹 system/message）。

## §6 红线

- 未经 owner 不 commit / 不 push；不动 llm-mimo 仓；不碰旧实例仓（历史参考）。
- 提交文档零本机绝对路径（新增内容只写进 local-env.md）。
- 不移植任何 llm/stream 瀑布内改写/直发代码（旧已死方案；yield* 崩溃曾炸 4 会话）。
- 模型源不许用 `agent.options` 创建快照；同模型内 resolve 保持逐字节确定性。
- 验收不许只看会话日志路由字段（欺骗史见 §2-4）；用 speedprint + 轨迹文件双证。
