/**
 * @mimo-codex/dsh-promptbook/client — 浏览器侧模块(S0 占位)。
 *
 * 装载形态照 dsh-llm-mimo:宿主经 window.__ModuleLoader__ 装载本模块并调用其导出。
 * S3 起实现:设置→插件页的 plugins.item 卡(供应商/模型二级下拉 + 逐键文本框 +
 * ConfigForm("settings.promptbook") 原子写);数据/状态逻辑与 JSX 渲染分离,逻辑层进单测。
 * 官方样板:dsh-client-ui-settings-web-search/lib/client.js 的 plugins.item 注册。
 */
window.__ModuleLoader__.load({
	id: "@mimo-codex/dsh-promptbook",
	factory: () => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		// S3: exports.apply = …(plugins.item 卡注册);S0 保持空操作。
		exports.apply = function apply() {};
		return module.exports;
	},
});
