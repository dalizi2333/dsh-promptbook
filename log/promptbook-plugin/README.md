// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# dsh-promptbook 插件 —— 按模型本地化系统提示词（吸收 persona，修复 R5）

> **名字**：仓库 `dsh-promptbook`，npm 包 `@mimo-codex/dsh-promptbook`（decisions D11）。
> **简介（GitHub 一句话）**：按模型本地化系统提示词与工具描述的提示词簿插件：资源包分层解析（模型→供应商→默认），装配层注入仅对 llm-mimo 托管模型生效，设置页逐键编辑。
> **简介（package.json）**：提示词簿 DSH 插件：资源包分层解析（模型→供应商→默认）、按模型改写系统提示词与工具描述（装配层注入 + dispatch 兜底，仅 llm-mimo 托管模型生效）、设置页逐键编辑卡与编译层覆盖接口。
>
> **本目录是本计划的唯一事实来源。** `progress.md` 记实时进度，`decisions.md` 记取舍理由。
> **接手方开工前必须先读 `handover.md`**（接手入口），收工后必须回写 `progress.md`。
> **状态：✅ S0 完成（可安装性骨架 + 根文档，core-headless 实装验证通过）；S1 未开工。未 commit。**
> **本仓将推送远程**（GitHub dalizi2333/dsh-promptbook）；已提交文档**不携带本机绝对路径**，本机路径统一在 `local-env.md`（git-ignore，不入库）。

## 0. 目录约定

```
dsh-promptbook/                 # 插件包本体（S0 已立骨架）
├── package.json                # @mimo-codex/dsh-promptbook v0.1.0（exports/peerDeps/dsh.bundle/dsh.client）
├── lib/index.js                # host 入口（S0 占位：provide("promptbook") 服务桩）
├── lib/client.js               # 浏览器模块桩（S3 填 plugins.item 卡）
├── cordis.patch.yml            # 自挂载条目（照 dsh-llm-mimo 模式）
├── README.md / AGENTS.md / LICENSE   # 公共说明 + 接口契约 + MIT
└── log/promptbook-plugin/      # 本计划唯一事实来源
    ├── README.md               # 本文件（设计权威）
    ├── handover.md             # 接手入口
    ├── progress.md             # 进度日志
    ├── decisions.md            # 决策记录（D1–D12）
    └── local-env.md            # 本机环境速查（git-ignore，不入库）
```

## 1. 一句话目标

在 **0.2.0-rc.1 基线**上新建单插件 **`@mimo-codex/dsh-promptbook`**：以资源包分层解析为数据面、以装配层为注入主通道，实现**按模型（仅 llm-mimo 托管面）本地化系统提示词与工具描述**，并以此修复 R5（人设跟随实际路由、首条即对、不串会话）。

## 2. 背景与证据基线（全部有实测证据；原文见 `local-env.md` 指路的旧 HANDOFF）

- R5 真相（2026-09-25 速度指纹检定，全库 106 会话三重证据=名义+adapter 自报+速度档）：**路由从未串台**；串的是人设文本——错配人设只挂会话第一步（mimo 模型收到 "Flash 专属人设" GUI 测试残留），第二步起人设插件整体退出跌回裸默认。用户感知"第一条错、（工具回合的）第二条对"= 插件退出后的裸模板行为，不是修好了。
- 日志欺骗性：`request/header` 只落盘每会话第一步；`system/message` 只在变化时记；旧 dbg 行读的是 `agent.options` 创建快照——三字段各测各的源，拼读必"三方不一致"。
- 旧基线（0.1.7-alpha.2）的已死方案与实证约束是历史教训（原地改写冻结的 options.system、瀑布内直发 yield* 崩溃、preset 全会话共享实例等），新基线装配 API 已换代，**一律不移植**。
- 新基线接口已由 llm-mimo 冒烟实证（llm-mimo 仓 HANDOFF 〇-附4）：`ctx.systemPrompt.section({complete:true, text})` 装配后 GUI 轨迹面板原样可见；`system-prompt/assemble` 瀑布返回值权威，可改 `assembly.tools[].description`。

## 3. 定稿设计（决策明细见 decisions.md D1–D10）

### 3.1 形态：单插件，persona 不再独立

`@mimo-codex/dsh-promptbook` 一个仓（`dsh-llm-mimo` 为模板，GitHub dalizi2333/dsh-llm-mimo），三张面孔：

| 面孔 | 内容 | 机制 |
| --- | --- | --- |
| 功能面·注入 | 按模型换系统提示词（原 persona 职能）+ 按模型换工具描述 | `ctx.on("system-prompt/assemble")` 瀑布（主通道，GUI 可见）；`ctx.llmMimo.registerPromptSource` 兜底 |
| 功能面·编辑 | GUI 设置卡（键列表 + 供应商/模型二级下拉 + 逐键文本框 + 清除断层） | `ctx.slots.inject("plugins.item", …)`（照官方 web-search 先例）+ `ConfigForm("settings.promptbook")` + `ctx.configForms.whileServed` |
| 服务面 | 分层 resolve（模型→供应商→默认）供未来消费方（R6 编译器等） | `ctx.provide("promptbook")` |

**插件级依赖 `@mimo-codex/dsh-llm-mimo`**（cordis 依赖保证先启动；`inject: ["llmMimo"]`）。

### 3.2 合法模型世界 = `llmMimo.listHostedModels()`（唯一来源）

- GUI 卡下拉、resolve 输入域、注入判定三处**只认这个名单**。
- 名单外（llm-deepseek 官方模型、llm-pi-ai 自定义供应商）**结构性不可达**：不列、不解析、不注入。
- 注入判定 = 装配瀑布内一次名单查表（合作式过滤），**不做**监听 model/selection 的注册/注销"检测"。

### 3.3 模型源 = pending route（R5 修复核心）

- 装配瀑布内取 `session.requestHeader()`（增量折叠 `model/selection`，"下一个请求将用的头"）。
- **禁止**读 `agent.options` 创建快照（R5 首条错根因；llm-mimo AGENTS.md 已写入契约）。
- 同模型内 resolve 必须确定性纯函数（防缓存无谓抖动）；**切模型时缓存必全量 miss**（in-history 前缀失效），harness 自行用新装配产物更新 in-history 系统消息——**历史重建零额外代码**，顺势发生。

### 3.4 数据面（从旧基线移植的已验证链，语义不变）

`registry.json`（键→label/fallback，注册时强制默认值）→ `default 层` → `models/<家族>.json` → `models/<模型>.json` → GUI `entriesJson` → 编译 `overrides`。
- volatile 字段物化坑（字符串默认值被写成对象、cordis config 对象形态）在 0.2.0-rc.1 上**必须重验**，读取兼容双形态的 workaround 能删则删。
- 不移植：llm/stream 瀑布内改写/直发的任何代码；GUI 层残留的 "Flash 专属人设 v2" 测试文本。

### 3.5 安装形态（两条路，均已实测）

**正道（Linux / 支持 symlink 的 FS，CI 与开发机）——官方安装命令一条龙**：
```sh
export DSH_HOME=<实例 dsh-home>
dsh <profile> --from-default-profile headless --dump-config   # 造 profile（组合树校验）
dsh plugin --profile <profile> add <本仓路径>                  # 自动接线：依赖 link + bundles 追加
dsh --profile <profile> --dump-config | grep -A2 promptbook    # 组合树断言
```
`plugin add` 会自动完成依赖 link、bundles 追加；自挂载条目由本仓 cordis.patch.yml 自带。
**前提**：仓库目录必须自带 node_modules（`npm ci --legacy-peer-deps`）——pnpm link 安装后 DSH 引导经**真实路径**解析插件依赖，此规则 CI 与本机一致（CI 已固化为第一道门）。

**ntfs3 替代（本机实例树无 symlink，pnpm 拷贝式）**：双副本（`packages/` + `node_modules/@mimo-codex/` 各一份真目录，含每包 node_modules 依赖闭包 schemastery+cosmokit）+ 手工改 profile 两文件。**注意 schemastery 是默认导出：`import z from "@deepseek-ai/schemastery"`**；0.2.0-rc.1 CLI **没有 `--port` 旗标**（旧版命令）。

**安装验证配方**：`--dump-config` 组合树含条目（无凭据需求）→ headless 一次性任务全通（装载层，需凭据，仅本机/S4 跑）。`dsh --help` 不能作为挂载级证据（可能在挂载前退出）。

### 3.6 程序化检验（插件自带的检验面——除纯渲染外全部可自动验证）

| 层 | 检验 | 方式 |
| --- | --- | --- |
| resolve 链 | 10 场景逻辑测试（分层命中/断层回溯/registry 兜底） | node 直跑单测（移植自旧基线，无 cordis 依赖） |
| 注入通道 | headless 冒烟：**mock llmMimo**（名单+registerPromptSource 记录）+ mock `session.requestHeader` → 真 dsh-system-prompt 事件基建（随 `@deepseek-ai/dsh` CLI 自带，CI 可得）触发 `system-prompt/assemble` → 断言 hosted 模型的 system 段被替换/tools 描述被改、非 hosted 原样透传 | node 直跑（**真 llm-mimo 不进 CI**——其安装需宿主补丁，干净 runner 装不出真身，D15；真身集成 = 本机 020 实例 S4） |
| 卡逻辑层 | 下拉数据源=托管名单、键列表=registry、ConfigForm set/unset 序列、断层清除 | **卡的数据/状态逻辑与 JSX 渲染分离**，逻辑层进单测 |
| 卡静态 | client bundle 含 `plugins.item` 注册、NS/键名拼写 | 构建后静态断言 |
| 配置往返 | settings.promptbook namespace 写→读回环、volatile 形态 | headless cordis + schemastery 校验 |
| 端到端 | 首条即对/家族正确/不串会话 | speedprint 三重指纹 + 会话轨迹 `system/message` 文件级对账（**不依赖看 GUI**） |
| **CI（第一道门）** | **可安装性**：push/PR 必跑 `.github/workflows/ci.yml`——模块级+静态检查（`npm run verify:install`）+ 干净 runner 上 `dsh plugin add` + `--dump-config` 组合断言；CLI 钉 `@deepseek-ai/dsh@0.2.0-rc.1`（npm 已有 rc.2，防漂移） | GitHub Actions（链路已本机彩排，见 progress S0.3） |
| 纯渲染 | 卡的外观、点击体验、面板视觉 | **视觉验收——移交有视觉的模型或 owner**（唯一不可程序化的残余） |

## 4. 阶梯与验收（DoD）

| 阶梯 | 内容 | 完成判据 |
| --- | --- | --- |
| S0 ✅ | 可安装性骨架：package.json / lib 入口（host 桩 + client 桩）/ cordis.patch.yml + 根 README / AGENTS.md / LICENSE；装入 core-headless 验证 | ✅ 模块级 apply() 提供 promptbook 服务桩；`--dump-config` 组合树含条目（exit 0）；headless 一次性任务全通（会话 1162af07，速度指纹名义=自报=mimo-v2.6-flash @ 48 tok/s ✓） |
| S1 ✅ | resolve 链移植 + Config 配置面 + 逻辑单测 | **13/13 场景全绿**（`npm test`，已并入 `npm run ci` 门）；实现 = createPromptbook 工厂（临时资源包注入式测试），asDoc $ 前缀过滤两路径统一 |
| S2 | 注入两通道（assemble 瀑布主 + registerPromptSource 兜底）+ `inject:["llmMimo"]` + pending route 模型源 | §3.6 headless 冒烟全绿（含非 hosted 透传） |
| S3 | client 卡（plugins.item + ConfigForm），逻辑/渲染分离 | 卡逻辑单测 + 静态断言全绿；**渲染层视觉验收移交**（截图：卡渲染、二级下拉=托管名单、逐键编辑、保存往返） |
| S4 | 装入 020 core-web + 端到端验收 | ①首条即对 ②不串会话 ③家族正确 ④基线不回归；对账 = speedprint 三重指纹 + 轨迹 system/message 程序化对账；卡的视觉残留同 S3 移交 |

speedprint（测速指纹工具，位于 dsh-tool-lab，本机路径见 local-env.md）：`node speedprint.mjs <会话目录或文件> [--summary|--json]`——逐请求 ttft/生成时长/tok/s/速度档/adapter 自报模型；名义≠自报或速度档错配即标 ✗。

## 5. 风险与边界

- **DSH 更新频繁**：基线钉死 0.2.0-rc.1（owner 决策）。
- **GUI 视觉检验**：纯渲染层移交有视觉的模型/owner；其余全部程序化（§3.6）。
- 旧仓（0.1.7-alpha.2 实例）降为历史参考，不再往里写。
- 红线：未经 owner 不 commit/push；不动 llm-mimo 仓；不移植死代码。
