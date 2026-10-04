# dsh-promptbook

> 按模型本地化系统提示词与工具描述的提示词簿插件：资源包分层解析（模型→供应商→默认），装配层注入仅对 llm-mimo 托管模型生效，设置页逐键编辑。

`@mimo-codex/dsh-promptbook` 是 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）0.2.0-rc.1 / rc.2 的插件：把「同一个键、按会话实际路由的模型取哪份文本」做成一条**资源包分层解析链**，并把解析结果注入系统提示词与工具描述。

> **状态**：注入、服务面与设置页 GUI 均已可用（GUI 验收已合并 main）。

## 功能

| 面孔 | 内容 |
| --- | --- |
| 注入 | 按模型改写系统提示词与工具描述——主通道 `system-prompt/assemble` 装配瀑布（GUI 轨迹可见），`llmMimo.registerPromptSource` 兜底 |
| 编辑 | 设置→插件页的逐键编辑卡（供应商/模型二级下拉 + 文本框 + 清除断层），`ConfigForm("settings.promptbook")` 原子写 |
| 服务 | `ctx.promptbook`：`listKeys()` / `resolve(key, model, provider?)` 分层解析，供编译器等后续消费方注入使用 |

**作用域**：合法模型世界 = `llmMimo.listHostedModels()`（本插件硬依赖 [dsh-llm-mimo](https://github.com/dalizi2333/dsh-llm-mimo)）。走 llm-deepseek / llm-pi-ai 的模型不在名单内——不列出、不解析、不注入。

## 安装

一条命令（DSH ≥ 0.2.0-rc.1）：

```sh
dsh plugin --profile <name> add github:dalizi2333/dsh-promptbook
```

卸载：`dsh plugin --profile <name> remove @mimo-codex/dsh-promptbook`。发布 npm 后同样支持包名安装（`add @mimo-codex/dsh-promptbook`）。

## 开发

- 计划与交接文档（唯一事实来源）：[`log/promptbook-plugin/`](log/promptbook-plugin/README.md)——设计权威、决策记录（D1–D23）、进度与接手入口；
- 接口契约：[`AGENTS.md`](AGENTS.md)；
- 程序化检验优先：resolve 单测、headless cordis 注入冒烟、卡逻辑层单测、配置往返、轨迹文件对账；纯渲染层才需要视觉验收。

## License

MIT © 2026 MiMo CodeX
