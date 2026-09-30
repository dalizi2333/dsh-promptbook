// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 交接文档：dsh-promptbook 插件（给接手的新会话）

> **本文件是接手入口。** 接手方请**先读完本文件**，再按 §1 指路读计划全文，然后从 §5 开工。
> 本文件不预设接手方已知任何背景。
> **当前状态：✅ S0–S4 全部完成（2026-09-30：渲染层视觉验收 7 条清单全过 + core-web 端到端注入链/透传/speedprint 全过；过程中修掉 3 个真 bug，见 progress 09-30 行）。仓库改动待 owner 审后 commit/push（`npm run ci` 本地全链已绿）。**

## §0 一句话任务

插件本体已完成并真机验证（R5 修复闭环：新会话首条消息即带正确人设，rc.2 双标记复测全过）。
**剩余任务两件已于 2026-09-30 由视觉会话完成**：
1. **渲染层视觉验收**：§4-1 七条清单在 core-web GUI 实测全过（含截图与磁盘落盘核验）；
2. **S4 core-web 端到端**：官方 plugin add 装入 core-web，注入链（轨迹 GUI + session.v4 文件 system/message 逐字节对账）+ speedprint 三证 + 非托管 DeepSeek 透传抽查全过。

**基线 = 0.2.0-rc.2 / 实例 mimo-codex-020rc2**（D19；llm-mimo v0.3.0 主路由已切 OpenAI Chat Completions）。

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

**本机才有（路径见 local-env.md）**：020rc2 实例（core-web 待装入 = S4；core-headless 已装且
**symlink 直链本仓**——packages/dsh-promptbook 就是仓库本体，改仓即改实例）、0.2.0-rc.2 运行时、
speedprint 工具、测速校准样本、GUI 卡官方先例（web-search client.js 的 plugins.item 样板）。

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

**已做（全部实证）**：S0 可安装性（CI 第一门 + pre-push 强制）；S1 resolve 数据面（13 场景）；S2 注入两通道（assemble 瀑布主 + registerPromptSource 兜底，模型源 = `assembly.variables.model`，**D18：requestHeader 首装配恒空勿用**；真机双标记：新会话首条 system/message 与 request/header tools[].description 均为 promptbook 层文本）；S3 逻辑层（卡全码：plugins.item 插槽 + ConfigForm 分阶段原子保存 + llm-mimo 命名空间派生二级下拉 + host mirrorSeedKeys；7+10+13 三套单测与 4 项静态断言全绿）；基线迁 rc.2（D19，双标记复测全过）。

**未做**：
1. **渲染层视觉验收**——清单：①设置→插件→出现"提示词簿"卡 ②供应商/模型二级下拉=llm-mimo 托管面（含 customProviders 显示名）③键下拉含种子键、选键+模型出文本域 ④"保存该模型的覆盖"往返成功 ⑤已覆盖徽标 + "清除该覆盖" ⑥systemKey/overrides 字段覆盖/重置 ⑦llm-mimo 停用时降级提示。
2. **S4 core-web 端到端**：core-web profile `dsh plugin add` 本仓 → web 会话验证 GUI 卡（视觉）+ 注入链（新会话首条 system/message 对账 + speedprint 三重指纹）+ 非 hosted 模型透传抽查。
3. **键行展开/收起动画修复（GUI 美化项）**：owner 指出的三缺陷（P1 键名展开先回缩后放宽、P2 寻址元素跳变/从 "prof" 裁点起步、P3 收起路径离散消失 + 右缘无过渡 + 下偏）已完整取证——现象 · 组件事实（F1–F10）· 帧级数据见 [`keyrow-anim-evidence.md`](keyrow-anim-evidence.md)，照其 §四 修复方向落码（与「裁剪-弹出统一封装」遗留记账合流，勿补丁式绕开；双态触发语义是既有设计勿动）。

## §5 开工顺序（S4 起）

1. `dsh plugin --profile core-web add <本仓>`（DSH_HOME 指 020rc2；symlink 直链，改仓即生效）。
2. 起 core-web（HDSL 或手动），浏览器截图过 §4-1 清单（视觉模型/owner 执行）。
3. 卡内编辑一条 mimo 覆盖 → 新会话首条消息 → 轨迹 system/message 对账（家族正确性 = 所编辑文本）；切非托管模型会话抽查透传。
4. speedprint（local-env 有路径）跑该会话：名义=自报=速度档三证一致。
5. 全绿后：handover 状态行 + progress 收官行，commit（`npm run ci` 门会先跑）。

## §6 红线

- 未经 owner 不 commit / 不 push；不动 llm-mimo 仓；不碰旧实例仓（历史参考）。
- 提交文档零本机绝对路径（新增内容只写进 local-env.md）。
- 不移植任何 llm/stream 瀑布内改写/直发代码（旧已死方案；yield* 崩溃曾炸 4 会话）。
- 模型源不许用 `agent.options` 创建快照；同模型内 resolve 保持逐字节确定性。
- 验收不许只看会话日志路由字段（欺骗史见 §2-4）；用 speedprint + 轨迹文件双证。
