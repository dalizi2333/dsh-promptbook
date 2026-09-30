// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# 进度日志（gui-acceptance）

> 纪律：开工前读本文件；收工后把「做了什么 / 验证结果 / 遗留」追加进日志表。
> 视觉轮次的现象→改动→复验记录也在本表（一分片一主题一提交）。

| 日期 | 阶梯 | 做了什么 | 验证结果 | 遗留 |
| --- | --- | --- | --- | --- |
| 2026-09-30 | M0 | 分支重启：未提交美化 blob（10 文件 +689 行）原样归档 `archive/gui-uncommitted-20260930`（948dfdf）；从 main（4e96cc2）拉 `feat/gui-acceptance`；client 拆四分片（locales/logic/card/apply）+ `build-client.mjs` 拼装脚本，`lib/client.js` 转生成物（头部 +3 行声明）；ci.mjs 加 `--check` 新鲜度门；package.json 加 `build:client`；AGENTS.md 纪律更新；本 plan 四件套落盘 | 拼装产物与拆分前**逐字节一致**（唯一 diff = 头部 3 行）；测试 7/7；verify-install 全过；本地 CI 全链绿（含临时 DSH_HOME 组合级 plugin add + dump-config 断言，dsh 0.2.0-rc.2） | M1 未启动；根目录 `nul`（Windows dir 命令垃圾）已删；两个提交待 push（pre-push 全链已绿过一次） |
