// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 决策记录（每项含被否决方案）

| # | 决策 | 理由 | 被否决方案 |
| --- | --- | --- | --- |
| D1 | **单插件合并**：persona 职能吸收进 promptbook，persona 插件/仓库不再出生 | owner 原则：不做纯依赖库型插件，插件必须自带功能面；卡上编辑的就是注入的，单一事实源 | 双插件拆分（promptbook=服务+卡、persona=消费方）——persona 沦为无独立价值的薄壳，且两仓版本偏斜 |
| D2 | **基线 = 0.2.0-rc.1 / 实例 mimo-codex-020** | owner 决策：DSH 更新频繁 + 桌面版存在，基线必须钉死 | 继续在 17a2 / 0.1.7-alpha.2 上修——装配 API 已换代，旧缝的修复对新基线无意义 |
| D3 | **一插件一小仓**（本仓即插件包根，照 dsh-llm-mimo 模板） | owner 决策；llm-mimo 已是跑通的模板（独立仓 + 实例内 link 镜像） | 所有实例共享 HDSL/data 大仓——实例间耦合、提交噪音大 |
| D4 | **合法模型名单 = `llmMimo.listHostedModels()`，插件级依赖 llm-mimo** | 名单本身由 llm-mimo 提供：依赖保证 mimo 必在；llm-deepseek/llm-pi-ai 的模型结构性不在名单 → 不列、不解析、不注入 | ①监听 model/selection 动态注册/注销 section（owner 否决："不是检测"）②自带名单配置（与 llm-mimo 目录漂移） |
| D5 | **模型源 = pending route（`session.requestHeader()`）** | 增量折叠 model/selection，语义即"下一个请求将用的头"；首条即对 | `agent.options` 创建快照——R5 首条错配的实测根因；llm-mimo AGENTS.md 已写契约禁止 |
| D6 | **注入主通道 = `system-prompt/assemble` 瀑布，`registerPromptSource` 只做兜底** | 装配产物 GUI 轨迹可见（owner 硬要求"换掉的提示词看得见"，llm-mimo 〇-附4 冒烟已证）；兜底防绕过路径 | ①只用 dispatch 层——GUI 不可见 ②只用装配层——防绕过缺一道 ③旧 llm/stream 改写方案——已死（冻结崩溃/yield* 崩溃，见旧 HANDOFF §5） |
| D7 | **GUI 卡 = `plugins.item` 插槽 + `ConfigForm("settings.promptbook")`** | 官方逐插件卡位（设置→插件），web-search 是官方先例（client.js:307，含 `configForms.whileServed` 样板）；零 bundle patch | ①llm-mimo 用的 `settings.models.provider-card`/`custom-api-card`——模型设置页专属，用不了（owner 指正）②17a2 的 bundle patch 注入官方——同 id 行后写胜出的坑（旧 §6-6），且 0.2.0 有官方插槽 ③顶级 `settings.section`——留作卡膨胀后的升格选项，先不占 |
| D8 | **切模型后的历史重建交给 harness（零插件代码）** | 0.2.0-rc.1 系统提示词为 in-history 形态；切模型前缀缓存必全量 miss，harness 自行用新装配产物更新 in-history 系统消息——顺势而为 | 插件手动重写会话历史——越权且重复 harness 已有机制 |
| D9 | **GUI 验收范围收敛到纯渲染层**：卡的数据/状态逻辑、注入链、配置往返、端到端对账全部程序化（README §3.6）；只有外观/点击体验交视觉验收 | 本会话模型无视觉——但程序化能覆盖除渲染外的一切；视觉验收范围从"整个 GUI"缩到"渲染残余" | 本会话盲签 GUI——不可接受（owner 指出）；反过来"GUI 全部移交视觉"——放弃了大块可自动化验证 |
| D10 | **提交文档零本机绝对路径**：仓库要推远程；本机路径统一收进 `log/**/local-env.md`（git-ignore） | 模板仓 llm-mimo 的纪律（AGENTS/HANDOFF 提交但几乎无绝对路径）；克隆者无法解析本机路径，且泄露机器布局 | 绝对路径直接进提交——远程读者拿到一堆断链 |
| D11 | **仓库名 `dsh-promptbook`**（npm `@mimo-codex/dsh-promptbook`），简介中文（GitHub 一句话 + package.json description 见 README 头部） | 与模板仓 dsh-llm-mimo 同构；promptbook 是项目自有词汇（旧分支/registry 体系）延续不造新词；mimo 归属由 scope 与硬依赖表达 | `dsh-promptbook-mimo`——与包名不对称、冗长（保留为备选）；另造新词（prompt-localizer 等）——丢连续性 |
| D12 | **S0 = 可安装性**（owner 修正）：入口与格式正确（package.json/lib×2/cordis.patch.yml）+ 根 README/AGENTS/LICENSE；完成判据 = dump-config 组合通过 + headless 一次性任务全通 | 插件先证明"能被 DSH 正确装载"，再谈功能；设计文档（log/ 四件套）是 S0 前置而非 S0 本体 | 原切法（S0=纯文档、S1 才建骨架）——owner 指正：装不上的一切都白搭 |
| D13 | **可安装性 = 第一道 CI 门**（owner 定夺）：`ci.yml` 于 push/PR 跑 verify-install（模块+静态）+ 干净 runner 上官方 `dsh plugin add` + `--dump-config` 断言；CLI 钉 0.2.0-rc.1；**仓库必须自带 node_modules**（pnpm link 经真实路径解析依赖，CI 与本机同规则） | 装载破坏在最便宜的层被拦截；整条链路已本机彩排后才冻结进 workflow | ①CI 只跑单测不装 DSH——装不上就全白搭，必须第一门 ②CI 里跑 headless 真发任务——需凭据，装载级验证留在本机/S4 |
| D14 | **llm-mimo 不在 npm 不阻塞 S0/S1 CI 门**；~~S2 起才需要它在 CI profile 里真实存在~~（S2 方案已被 D15 取代：CI 永不装真 llm-mimo） | 实测（S0.4 彩排）：pnpm 对 link: 本地依赖**不自动安装 peer**（全新 home 彩排 exit 0、零 peer 解析）；S0 stub 无运行时 llm-mimo 依赖；dump-config 只组合 YAML 不执行插件代码。双插件共装形态已本地实证（组合树两段俱全） | 等 llm-mimo 上 npm 才建 CI——S0/S1 门本可先跑 |
| D15 | **CI 永不安装真 llm-mimo**：S2 注入冒烟 = **mock llmMimo 服务 + 真 dsh-system-prompt 事件基建**（基建随 `@deepseek-ai/dsh@0.2.0-rc.1` CLI 自带，npm 公开，彩排组合树已证）；真身集成验收 = 本机 020 实例（宿主补丁齐全）S4 端到端 | owner 亲证：llm-mimo 安装要额外打宿主补丁（patches/ 的 dsh-llm 投影/设置页补丁），干净 runner 装不出可用真身——官方 CI 路线对它不可行；而注入逻辑的可测面本来就不依赖真身（名单/服务面 mock 即可） | ①CI 里 git-hosted 装 llm-mimo——补丁缺失，装了也不是真身 ②llm-mimo 上 npm 解 CI 之困——发行事务，与 CI 解耦（发了也进不了 CI，缺补丁） |
| D16 | **仅文档变更不触发 CI**（push/PR 均 `paths-ignore`: README.md / AGENTS.md / LICENSE / log/**）；文档改动攒批随功能提交一起推 | owner 指正：CI 是可安装性门，文档变更不影响装载，跑了没意义还刷记录 | 每次文档修订单独推——频繁触发无意义 CI |
