/**
 * @mimo-codex/dsh-promptbook — 提示词簿（S0 可安装性骨架）。
 *
 * 当前状态:S0 —— 本文件只保证「入口与格式正确」:插件可被 DSH 装载、服务占位可注入。
 * 实质功能按阶梯补齐(S1 resolve 分层链 / S2 注入两通道 / S3 client 卡):
 * 见 log/promptbook-plugin/README.md(设计权威)与 AGENTS.md(接口契约)。
 *
 * 设计约束(实现期不可违反,出处见 log/promptbook-plugin/decisions.md):
 *  - 合法模型世界 = ctx.llmMimo.listHostedModels(),不做事件监听式的"检测";
 *  - 注入模型源 = pending route(session.requestHeader()),禁用 agent.options 创建快照;
 *  - 同模型内 resolve 必须逐字节确定(缓存抖动=全量 miss);
 *  - 不携带任何 llm/stream 瀑布内改写/直发代码(旧基线已死方案)。
 */

import z from "@deepseek-ai/schemastery";

export const name = "promptbook";

/** S0 尚不注入宿主服务;S2 起追加 "llmMimo"(插件级依赖 dsh-llm-mimo 保证其存在)。 */
export const inject = [];

/** 配置面:S0 占位为空;S1 起承载资源包分层(registry/默认层/家族层/模型层/entriesJson/overrides)。 */
export const Config = z.object({});

/**
 * 服务占位:S1 起由分层解析实现取代。消费方 inject: ["promptbook"] 从现在起即可解析成功,
 * 形状保持向前兼容(listKeys/resolve)。
 */
export async function apply(ctx) {
	ctx.provide("promptbook", {
		stage: "s0-stub",
		listKeys: () => [],
		resolve: () => undefined,
	});
	ctx.logger?.info?.("promptbook: s0 stub loaded (service placeholder provided)");
}
