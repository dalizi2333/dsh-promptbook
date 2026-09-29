# AGENTS.md — dsh-promptbook 接口契约与工程纪律

给 AI 代理/消费方看的接口契约与仓库纪律。修改本插件前先读
`log/promptbook-plugin/README.md`（设计权威）与 `log/promptbook-plugin/decisions.md`（D1–D11）。

**当前状态：S0（可安装性骨架）**——服务为占位实现，下列标注「S1 起」「S2 起」的接口尚未生效。

## 一、promptbook 服务（S1 起生效）

`ctx.provide("promptbook", api)`，消费方 `inject: ["promptbook"]` 后经 `ctx.promptbook` 访问。

### `listKeys(): Array<{ key, label, fallback }>`
枚举已注册键（键由插件注册方声明，**必须携带默认值**）。

### `resolve(key, model): string | undefined`
按「模型 → 供应商 → 默认」分层解析键文本；全链未命中返回 `undefined`（消费方自行决定兜底）。

**契约**：
1. `resolve` 必须是 `(key, model)` 的**确定性纯函数**（逐字节稳定）——系统提示词位于请求前缀，抖动即缓存全量 miss；切模型场景的缓存失效属预期，由 harness 的 in-history 重建机制顺势处理。
2. 解析结果只依赖资源包分层与配置，**不读会话状态、不读时钟**。

## 二、注入契约（S2 起生效）

- **合法模型世界 = `ctx.llmMimo.listHostedModels()`**（本插件硬依赖 dsh-llm-mimo）。名单外模型（llm-deepseek / llm-pi-ai 路由）**结构性不可达**：不列出、不解析、不注入。
- **模型源 = pending route**（`session.requestHeader()`，即 `model/selection` 之后、下一请求将用的头）。**禁止**读 `agent.options` 创建快照（R5 教训：首条错配人设的实测根因）。
- 主通道：`ctx.on("system-prompt/assemble", …)` 装配瀑布（返回值权威，GUI 轨迹面板可见）；工具描述改写同层。
- 兜底：`ctx.llmMimo.registerPromptSource({ resolveSystem, resolveToolDescription })`——只在 llm-mimo dispatch 内被问询。
- 只改文本，**不碰 tool 的 `name`/`parameters`**（历史 tool_use 块以名为关联键）。

## 三、配置面（S1 起定义）

cordis.patch.yml 顶层 `promptbook` 行承载资源包分层配置（registry / 默认层 / 家族层 / 模型层 / GUI entriesJson / 编译 overrides）。字段以 S1 实现为准，届时回填本节。

## 四、仓库纪律

- **CI 第一道门 = 可安装性**（`.github/workflows/ci.yml`，push/PR 必跑）：`npm run verify:install`（模块+静态检查）+ 干净 runner 上官方 `dsh plugin add` + `--dump-config` 断言；CLI 钉 `@deepseek-ai/dsh@0.2.0-rc.1`。改动 package.json/入口/patch 后本地先跑 `npm run verify:install`。**仅文档变更（README/AGENTS/LICENSE/log/**）已被 paths-ignore 跳过，不触发 CI；文档改动攒批随下次功能提交一起推。**
- **仓库必须自带 node_modules**（本机 `npm ci --legacy-peer-deps`）：pnpm link 安装后 DSH 引导经真实路径解析插件依赖——依赖装不全 = 别人的实例装不上你。
- `log/promptbook-plugin/` 是计划的唯一事实来源（README=设计权威、handover=接手入口、progress=进度、decisions=决策）；收工必须回写 `progress.md`。
- **提交文档零本机绝对路径**；本机路径只写进 `log/**/local-env.md`（git-ignore，不入库）。
- 未经 owner 不 commit / 不 push；不动 dsh-llm-mimo 仓。
- 不移植旧基线 llm/stream 瀑布内改写/直发的任何代码（已死方案：冻结 options.system 赋值抛错、yield* 不可迭代炸全部请求）。
- 验收纪律：程序化检验优先（单测 / headless 冒烟 / 轨迹文件对账 / speedprint 三重指纹），纯渲染层才交视觉验收。
