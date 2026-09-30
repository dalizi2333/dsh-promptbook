// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 进度日志（gui-acceptance）

> 纪律：开工前读本文件；收工后把「做了什么 / 验证结果 / 遗留」追加进日志表。
> 视觉轮次的现象→改动→复验记录也在本表（一分片一主题一提交）。

| 日期 | 阶梯 | 做了什么 | 验证结果 | 遗留 |
| --- | --- | --- | --- | --- |
| 2026-09-30 | M0 | 分支重启：未提交美化 blob（10 文件 +689 行）原样归档 `archive/gui-uncommitted-20260930`（948dfdf）；从 main（4e96cc2）拉 `feat/gui-acceptance`；client 拆四分片（locales/logic/card/apply）+ `build-client.mjs` 拼装脚本，`lib/client.js` 转生成物（头部 +3 行声明）；ci.mjs 加 `--check` 新鲜度门；package.json 加 `build:client`；AGENTS.md 纪律更新；本 plan 四件套落盘 | 拼装产物与拆分前**逐字节一致**（唯一 diff = 头部 3 行）；测试 7/7；verify-install 全过；本地 CI 全链绿（含临时 DSH_HOME 组合级 plugin add + dump-config 断言，dsh 0.2.0-rc.2） | M1 未启动；根目录 `nul`（Windows dir 命令垃圾）已删；两个提交待 push（pre-push 全链已绿过一次） |
| 2026-09-30 | M1-R1（**D21 再落地**） | owner 报告详情页配置界面掉了（M0 恢复 S3 基线时槽位退回 plugins.item=官方设置组，而详情页只认 plugins.bundle.config）；apply.js 分片换槽注册（key=包名，照归档线已实证形状），verify-install 两条断言同步；真机（020rc2 core-web，运行中实例热生效）浏览器实测 | 测试 15+10+7 全绿；verify-install 全过；插件页「已安装」→「查看 @mimo-codex/dsh-promptbook」详情页卡面完整渲染（系统提示词键 + 逐模型文本三级下拉含 llm-mimo 3 供应商 + 编译产物文件 + 保存），截图存证（f2626f5） | 被 D28 移植取代（f2626f5 保留为历史） |
| 2026-09-30 | M1-R2（**D28 基线移植**） | owner 拍板：从会话前的 round-14 状态继续（没过验收但推进量大）。归档 lib/client.js 转写五分片（styles 独立成片），stitcher 模板换归档版头部/导出表；lib/index.js（layersJson 镜像）+ 测试（17+10+10）+ verify-install + promptbook-plugin 文档自归档恢复；修正归档版 verify D22 裸串断言（误伤 `paths.overridesPath` 镜像元数据→只查卡面字段 id）；AGENTS.md 配置表补 systemKey/layersJson 两行 | 产物 vs 归档**字节对账**：差异仅头部 3 行声明 + 卡组件 region 拆两标记，零代码漂移；测试 17+10+10 全绿；verify-install 全过 + --check 一致 | 未 push；下一轮起 = 在移植基线上按 owner 视觉反馈逐片隔离修故障 |
| 2026-09-30 | M2-R1（缝线组尾圆角） | owner 报障：展开 tool.x 时 persona 行下缘方角（截图指认）。定位 card.js 分组圆角映射：`groupEnd` 分支误写 `"0px"`（与缝中卡同值）——组尾卡是展开卡上方断缝处的收口，应上缝下圆。修复为 `"0 0 12px 12px"`；折叠态末键同享此值无副作用（结尾假行 -12px 同色叠盖） | 真机复验两态：展开态 persona 下缘圆角回归 ✓（截图）；折叠回闭合态卡体连续无回归 ✓（截图）。测试 17+10+10 + verify + --check 全绿（8ffa16b） | 未 push；等 owner 下一条视觉报障 |
