// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 决策记录（每项含被否决方案）

> 本目录决策从 **D25** 起，接续 `log/promptbook-plugin/decisions.md`（D1–D20 冻结在 main）。
> **D21–D24 号段保留**：归档线（`archive/gui-uncommitted-20260930`）已用它们指代
> 「插槽迁 bundle.config / 撤管道字段 / 键行卡 / 下拉浮层卡」四个设计；这些设计在本分支
> 再落地时**沿用原编号**（记录在本文件，加「(再落地)」后缀），保持与归档分支、会话记忆
> 的指代连续。

| # | 决策 | 理由 | 被否决方案 |
| --- | --- | --- | --- |
| D25 | **GUI 美化重启 = 从 main 拉新分支 `feat/gui-acceptance`**；旧未提交 blob（D21–D24 + 动画 12 轮）原样归档 `archive/gui-uncommitted-20260930`，只作设计参考，代码不 cherry-pick | blob 被临时 py 脚本反复改写，无法完全回退、无法归因（owner 判定可维护性失败）；归档保住设计证据（缝合卡/动画轴律的最终形态），重启保证每轮改动可归因 | ①在损伤 blob 上继续修——没有干净基线，回退与归因都不可行 ②直接在 main 上搞——污染已发布线，S0–S4 的已验证状态失去退路 |
| D26 | **client 面源码分片 + 拼装产物**：`src/client/{locales,logic,[styles],card,apply}.js`（同一 factory 闭包的连续片段，按声明序拼装）+ `scripts/build-client.mjs` → `lib/client.js`；产物头部带「构建产物」声明，`ci.mjs` 以 `--check` 门强制分片↔产物一致，禁止手改产物 | 宿主契约实证（dsh-client-modules 0.2.0-rc.2）：每包单一 `exports["./client"]` 入口、factory 内 require 不认相对路径——运行时多文件不存在，多文件只能发生在源码层；零依赖拼装（对比打包器）保住产物的手形与可调试对应性；M0 拆分以逐字节对账证明零行为变化 | ①tsdown/esbuild 打包器——加依赖、产物脱离手形，浏览器调试与源码对应性变差，对手调样式/动画的仓是净损失 ②双包拆分跨包 require（宿主支持 boot graph 依赖）——为一个卡的内部组织引入第二包 + external 声明 + 加载顺序约束，成本失衡 ③手写 `require.async` chunk（照 documentpreview 先例）——那是 tsdown 编译协议，手维护等于逆向编译器，rc 升级易碎 ④维持单文件 + `//#region`——现状已证明撑不住（定位难、diff 不可归因） |
| D27 | **验收协议**：无预设清单，磨到 owner 视觉无故障；每轮 = 单一分片单一主题 + 独立提交 + GUI 会话核验记录（现象→改动→复验，记 progress）；程序化门（test/verify/--check）每轮必绿，纯渲染残差才交视觉（延续 D9 收敛） | 「明确改过的是什么」是本计划的存在理由；视觉验收本就主观，能程序化的先挡掉，把人的注意力留给渲染残差 | ①攒大 diff 一起交——上一条线的直接教训，无法归因也无法二分回退 ②放宽「一分片一主题」——跨片大轮次会重演不可归因 |
| D21 (再落地) | **配置卡槽 = `plugins.bundle.config`（key=包名）**，渲染在插件页「已安装」→ 包详情页；formal 定论：`plugins.item` 被官方设置页占用（注册即进官方组，硬编码），详情页配置位只有 bundle.config 一个正式槽。owner 实证：M0 恢复 S3（plugins.item）后详情页即空，换回 bundle.config 即恢复 | 官方渲染方 = dsh-client-ui-plugin-manager 详情页；归档线已实证该槽形状；真机热生效（link 包改文件→刷新即用） | 留在 plugins.item——卡在官方组里渲染、详情页恒空，与 owner 的 GUI 主场（详情页）错位 |
| D28 | **基线移植：归档 round-14 状态整体进分片**（owner 拍板，推翻 D25 的「代码不复用」）：`archive/gui-uncommitted-20260930` 的 lib/client.js 拆成五分片（字节对账，差异仅头部声明 + 卡组件 region 拆「卡面样式/卡组件」两标记）、lib/index.js（layersJson 镜像）+ 测试（17+10+10）+ promptbook-plugin 文档一并恢复；此后每轮按 D27 在移植基线上隔离修故障。顺带修正归档版 verify 的 D22 裸串断言（`overridesPath` 误伤逻辑层镜像路径元数据 `paths.overridesPath`，改为只查卡面字段 id `plugin-config-promptbook-*`）——归档状态本就过不了自己这条断言 | owner：那版没通过验收但推进量大（D21–D24 + 14 轮动画/悬浮机制），从它继续比重走 S3 便宜得多；拆分的价值正在于把「没通过」拆成可逐片定位的故障 | ①继续 S3 逐设计再落地（M1 路线）——重复劳动，owner 明确否决 ②原样恢复归档工作区（单文件 732 行）——回到不可归因的老路 |

