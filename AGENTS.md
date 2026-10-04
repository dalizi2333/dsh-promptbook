# AGENTS.md — dsh-promptbook 接口契约与工程纪律

给 AI 代理/消费方看的接口契约与仓库纪律。修改本插件前先读
`log/promptbook-plugin/README.md`（设计权威）与 `log/promptbook-plugin/decisions.md`（D1–D20）；
GUI 卡线先读 `log/gui-acceptance/README.md`（feat/gui-acceptance 分支的现行计划）。

**当前状态：S0–S4 完成（含 GUI 视觉验收）。GUI 美化在 `feat/gui-acceptance` 分支重启
（plan 目录 `log/gui-acceptance/`；未提交的旧美化轮已归档 `archive/gui-uncommitted-20260930`，
仅为设计参考、代码不再使用）；发布前剩 GUI 磨合、npm 发布——见各自 handover。**

## 一、promptbook 服务（**S1 起生效**）

`ctx.provide("promptbook", api)`，消费方 `inject: ["promptbook"]` 后经 `ctx.promptbook` 访问。

### `listKeys(): Array<{ key, label, fallback }>`
枚举已注册键（键由插件注册方声明，**必须携带默认值**）。另有 `keys()`（仅键名）与
`definition(key)`（单键定义）。

### `resolve(key, model, provider?): string | undefined`
按「模型 → 供应商 → 全局 default」分层解析键文本。完整层序（高 → 低）：
`Config.entriesJson`（GUI，逐作用域）→ overrides 文件（编译 `set()` 落点，逐作用域）
→ `models/<模型>.json` → `models/<供应商>.json`（供应商层，provider 显式入链）
→ entries 的 `default` 键 → `registry.fallback`。
作用域候选 = `[模型, 供应商, "default"]` 去重（`resolveCandidates`）；**旧「家族层」
（模型 id 逐级剥 `-tier` 推导祖先链）已退役**——中间祖先不再入链，provider 省略时
供应商层不可达。键未注册返回 `undefined`。
**包层物理删除（`packOpsJson` 对账通道，owner 2026-10-04 裁决修订包层冻结纪律）**：
GUI 重置包层来源的命中时把 `{deletions:[{key, candidate, ts}]}` 写进 `Config.packOpsJson`；
host 在每次 `resolveOverride` 前对账——把 `models/<candidate>.json` 里的条目**物理删除**
（$ 元数据键保留）并清空队列。**TTL = `PACK_OPS_TTL_MS`（10 分钟）**：过期操作只作废
不执行，且 **boot 不对账**——否则 profile 里持久化的陈旧队列会在「git 恢复/重装后重启」
时把注册值再次删掉。被删条目的恢复 = 重装/升级插件（npm 包层刷新）或 `git checkout`
（开发仓）。编译器仍永不写发布层。

### `register(key, { label, fallback }): void`（消费方激活时调用）
fallback 必填（该键的兜底文本）；写透 `registry.json` 并镜像 `Config.registryJson`。

### `set(key, model, text, compiled?): void`（编译器落点）
写 overrides 文档；**需要 `Config.overrides` 已配置**，编译永不写发布层（models/）。

**契约**：
1. `resolve` 必须是 `(key, model, provider)` 的**确定性纯函数**（逐字节稳定）——系统提示词位于请求前缀，抖动即缓存全量 miss；切模型场景的缓存失效属预期，由 harness 的 in-history 重建机制顺势处理。
2. 解析结果只依赖资源包分层与配置，**不读会话状态、不读时钟**。
3. 服务无状态、零 JS 私有成员（cordis 派生对象纪律）；文档每次 call 现读。

## 二、注入契约（**S2 起生效**）

- **合法模型世界 = `ctx.llmMimo.listHostedModels()`**（本插件硬依赖 dsh-llm-mimo）。名单外模型（llm-deepseek / llm-pi-ai 路由）**结构性不可达**：不列出、不解析、不注入。
- **模型源 = pending route = `assembly.variables.provider/model`**（框架注入装配输入；D18 实证：首个 request/header 在 dispatch 期才落盘，首装配时 `session.requestHeader()` 恒空，不可作主源）。**禁止**读 `agent.options` 创建快照（R5 教训）。提取器 = `pendingRouteOf`（provider/model 逐字段独立回退到 requestHeader）。
- 主通道：`ctx.on("system-prompt/assemble", …)` 装配瀑布（返回值权威，GUI 轨迹面板可见）；工具描述改写同层。
- **接管条件 = `resolveOverride` 本地化命中（D20 透传语义）**：entriesJson/overrides 文件/models 层（含 entries.default）命中才替换；**无命中一律透传官方 persona/工具描述**——registry.fallback 不触发接管（仅服务面 `resolve` 与卡内展示使用）。**空字符串命中也算接管**，但注入通道 `text !== ""` 门使其表现为透传——即「显式空白 = 该作用域退出接管」。包内种子 `models/mimo.json` = mimo 特殊供应商的**默认注册**（开箱预置的供应商层人设，语义上与普通供应商槽无差别）：GUI 编辑以 GUI 层条目覆写之；GUI 重置经 `packOpsJson` 对账**物理删除**该条目（注册值可丢失——重装/升级或 git checkout 恢复），删除后回落透传。
- 兜底：`ctx.llmMimo.registerPromptSource({ resolveSystem, resolveToolDescription })`——只在 llm-mimo dispatch 内被问询。
- 只改文本，**不碰 tool 的 `name`/`parameters`**（历史 tool_use 块以名为关联键）。

## 三、配置面（S1 起生效）

cordis.patch.yml 顶层 `promptbook` 行（全部 volatile 字符串，双形态兼容——活引用/物化对象/JSON 文本）：

| 字段 | 说明 |
|---|---|
| `registryJson` | 注册表扩展 JSON 文本 `{key: {label, fallback}}`（GUI 键清单也从这里合成） |
| `entriesJson` | GUI 编辑的逐作用域文本 `{key: {candidate: text}}`——candidate 为模型 id 或供应商 id（卡内「供应商默认」作用域写后者，覆写包层注册；用户层最高） |
| `overrides` | 编译产物文档路径（`set()` 落点；低于 entriesJson） |
| `systemKey` | hosted 模型装配时注入哪个键的文本（默认 persona.minimal.prefix；管道配置，不上卡） |
| `layersJson` | 卡面分层镜像（D23）：overrides 文档（`__overrides__` 键）+ models/ 包层按候选 id 原样打包；host 于 boot 与 set() 刷新，卡内 resolveTraced 重放解析链——**与 resolveOverride 的层序实现必须逐分支一致**（含 `resolveCandidates` 候选链） |
| `packOpsJson` | GUI 包层写操作队列 `{deletions:[{key,candidate}]}`（重置包层注册 → 物理删除对账；host 处理后清空，见 §一） |

## 四、仓库纪律

- **CI 第一道门 = 可安装性**（`.github/workflows/ci.yml`，push/PR 必跑）：`npm run verify:install`（模块+静态检查）+ 干净 runner 上官方 `dsh plugin add` + `--dump-config` 断言；CLI 钉 `@deepseek-ai/dsh@0.2.0-rc.2`（D2-amended，2026-09-29 随 llm-mimo v0.3.0 迁基线）。改动 package.json/入口/patch 后本地先跑 `npm run verify:install`。**仅文档变更（README/AGENTS/LICENSE/log/**）已被 paths-ignore 跳过，不触发 CI；文档改动攒批随下次功能提交一起推。**
- **本地全绿才 push**：`npm run ci`（`scripts/ci.mjs`）与 GitHub Actions 跑**同一份脚本**；本机启用 `git config core.hooksPath scripts/hooks` 后 pre-push 钩子强制执行——钩子挡下的 push 就是还没绿的 push。本机 dsh 不在 PATH 时 `export DSH_RUNTIME_BIN=<运行时 dsh 路径>`（本机值见 local-env.md）。
- **仓库必须自带 node_modules**（本机 `npm ci --legacy-peer-deps`）：pnpm link 安装后 DSH 引导经真实路径解析插件依赖——依赖装不全 = 别人的实例装不上你。
- `log/promptbook-plugin/` 是计划的唯一事实来源（README=设计权威、handover=接手入口、progress=进度、decisions=决策）；收工必须回写 `progress.md`。
- **client 面源码 = `src/client/*.js` 分片，`lib/client.js` 是拼装产物**（宿主契约：每包只认
  `exports["./client"]` 单一入口、factory 内 require 不认相对路径——运行时多文件不存在）。
  改分片后必须 `npm run build:client`；**禁止手改 `lib/client.js`**（会被拼装覆盖，且
  `ci.mjs` 的 `--check` 门会抓出分片与产物不一致）。分片不是独立模块：同处一个 factory
  闭包，靠声明序共享标识符，新增分片须在 `build-client.mjs` 的 PARTS 里按声明序登记。
- **提交文档零本机绝对路径**；本机路径只写进 `log/**/local-env.md`（git-ignore，不入库）。
- 未经 owner 不 commit / 不 push；不动 dsh-llm-mimo 仓。
- 不移植旧基线 llm/stream 瀑布内改写/直发的任何代码（已死方案：冻结 options.system 赋值抛错、yield* 不可迭代炸全部请求）。
- 验收纪律：程序化检验优先（单测 / headless 冒烟 / 轨迹文件对账 / speedprint 三重指纹），纯渲染层才交视觉验收。
