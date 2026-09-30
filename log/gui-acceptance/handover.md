// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 交接文档：gui-acceptance（给接手的新会话）

> **本文件是接手入口。** 先读完本文件，再读同目录 `README.md`（设计权威），然后从 §3 开工。
> 本文件不预设接手方已知任何背景。

## §0 一句话任务

把 `@mimo-codex/dsh-promptbook` 的设置卡 GUI 磨到视觉无故障（owner 主观验收），每轮改动
单分片、单提交、可归因。

## §1 现状（2026-09-30 M0 收工时）

- 分支 `feat/gui-acceptance`（自 main = 4e96cc2 拉出）；本 plan 的 M0 基础设施已提交：
  - `src/client/{locales,logic,card,apply}.js` 四分片 + `scripts/build-client.mjs` 拼装脚本
    → `lib/client.js` 成为生成物（头部带 3 行产物声明，其余与拆分前逐字节一致）；
  - `ci.mjs` 增加 `--check` 产物新鲜度门；`npm run build:client` 脚本入口；AGENTS.md 纪律更新。
- 上一条美化线的未提交 blob（10 文件 +689 行，py 脚本损伤、无法归因）原样归档于
  `archive/gui-uncommitted-20260930`（948dfdf）——**只读参考**，其中的 D21–D24 设计与
  12 轮动画结论已沉淀进 README §六。
- M0 验证：字节对账（唯一 diff = 头部声明）+ 测试 7/7 + verify-install + 本地 CI 全链
  （含组合级 plugin add + dump-config 断言）全绿。
- 卡的当前形态 = S3 版（`plugins.item` 插槽、systemKey/overrides 管道字段还在卡面）——
  这是**刻意**的干净起点；M1 起按 README §五路线再落地。

## §2 环境与视觉核验

- 视觉核验实例 = **mimo-codex-020rc2**（0.2.0-rc.2）。web profile 启动：
  `DSH_HOME=<实例>/dsh-home <运行时>/.bin/dsh --profile core-web --port 3096`（本机绝对
  路径见 `log/promptbook-plugin/local-env.md`，该文件 git-ignore，不入库）。
- 实例内插件是 link 镜像指向本仓：改完跑 `npm run build:client` 后**刷新页面即生效**
  （client bundle 是宿主按文件读的）；样式若陈旧先 Ctrl+Shift+R 硬刷新再核对页面里的
  style 文本。
- 浏览器验收会话要点：先看控制台有无装载错误，再逐条过当轮核验清单；截图/现象记进
  progress.md。

## §3 轮次操作循环

```
1. 选定本轮主题（对应 README §五里程碑的一小步）
2. 只改对应分片（src/client/*.js）——禁 py/内联脚本改码，只用编辑器原生 Edit
3. npm run build:client && npm test && npm run verify:install
4. 实例页面视觉核验，记录进 progress.md
5. 提交（一分片一主题；身份 dalizi2333 <92371427+dalizi2333@users.noreply.github.com>）
6. 阶段收工：DSH_RUNTIME_BIN=<运行时 dsh> npm run ci 全链绿后才 push
```

## §4 关键契约与坑（速查）

- **宿主单入口契约 + require 语义**：README §二；运行时多文件不存在，别再试。
- **`lib/client.js` 禁手改**：生成物；`--check` 门会抓。
- 分片不是模块：同闭包共享标识符；新分片要登记 `build-client.mjs` 的 PARTS（样式片插
  card 前）。
- **动画轴律**：Y=展开折叠、X=悬浮、文本不淡出——README §六；归档线踩过的死路清单在同节，
  动 UI 前先对一眼。
- **提交身份**：必须 `dalizi2333 <92371427+dalizi2333@users.noreply.github.com>`（仓内
  config 已正确，勿用全局 legacy 身份覆盖）；GitHub 走本机代理，连不上 = 代理没开。
- 决策号：新决策从 **D25** 起（D21–D24 保留给归档线设计再落地）。

## §5 下一步

M1 第一轮：插槽迁 `plugins.bundle.config`（key=包名，voice-input 同款先例）+ 撤卡面
systemKey/overrides 管道字段（D22 语义）。动工前读归档分支同段实现
（`archive/gui-uncommitted-20260930:lib/client.js`）与 `log/promptbook-plugin/decisions.md`
D7（为何当初选 plugins.item）。
