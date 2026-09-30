/**
 * build-client —— 拼装 lib/client.js（宿主 client 面的唯一产物）。
 *
 * 宿主契约（@deepseek-ai/dsh-client-modules，0.2.0-rc.2 实证）：每包只解析
 * exports["./client"] 一个入口，factory 闭包内 require 只认模块 id——运行时多文件
 * 不存在。因此源码以分片形式放在 src/client/*.js：每片是同一 factory 闭包的连续
 * 片段（非独立模块，片间无 import/export，靠闭包共享标识符），本脚本按声明序拼进
 * 同一外壳写出产物。
 *
 * 分片序 = factory 闭包内声明序：locales → logic → styles → card → apply。改任何分片后
 * 必须重跑本脚本；手改 lib/client.js 会被 scripts/ci.mjs 的 --check 新鲜度门当场抓出。
 *
 * 用法：node scripts/build-client.mjs [--check]（--check 只比对不写盘）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PARTS = ["locales", "logic", "styles", "card", "apply"];

const HEADER = `/**
 * @mimo-codex/dsh-promptbook/client — 插件页 Promptbook 卡（D21/D23/D24）。
 *
 * 形态照官方样板（dsh-client-ui-settings-web-search/lib/client.js）：
 * window.__ModuleLoader__ 工厂 + plugins.bundle.config 插槽（key=包名，渲染在
 * 「已安装」→ 包详情页；官方契约：plugins.item 被官方设置页占用）+ configForms 命名空间。
 * 数据面（全部纯函数，test/client.test.mjs 经伪 window 工厂直测）：
 *  - 键清单/兜底 ← 本插件配置命名空间 "promptbook"（registryJson/entriesJson/layersJson）；
 *  - 供应商/模型二级下拉 ← llm-mimo 配置命名空间快照（modelsJson 解析，与其设置卡同源；
 *    llm-mimo 未加载时行区降级提示）。
 *  - 键行解析 = resolveTraced 在卡内重放解析链（候选优先序与 host resolveOverride 一致，
 *    分层数据来自 host 镜像 layersJson），来源标签三态恒右对齐。
 * 保存语义：逐行编辑合入 entriesJson 后经 SettingsFormModel 分阶段原子写（edit → save）。
 *
 * ⚠️ 构建产物：由 scripts/build-client.mjs 从 src/client/*.js 拼装生成——改分片后
 * 重跑 node scripts/build-client.mjs，勿直接手改本文件（会被下次拼装覆盖）。
 */
window.__ModuleLoader__.load({
	id: "@mimo-codex/dsh-promptbook",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let jsx = require("react/jsx-runtime");
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
`;

const FOOTER = `		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		exports.parseEntries = parseEntries;
		exports.mergeEntry = mergeEntry;
		exports.isOverridden = isOverridden;
		exports.keyOptionsFromSnapshot = keyOptionsFromSnapshot;
		exports.hostedOptionsFromLlMimoSnapshot = hostedOptionsFromLlMimoSnapshot;
		exports.modelCandidates = modelCandidates;
		exports.resolveTraced = resolveTraced;
		exports.layersFromSnapshot = layersFromSnapshot;
		return module.exports;
	}
});
`;

const body = PARTS
	.map((name) => readFileSync(join(root, "src", "client", `${name}.js`), "utf8").replace(/\n+$/, "\n"))
	.join("");

const built = HEADER + body + FOOTER;
const target = join(root, "lib", "client.js");

if (process.argv.includes("--check")) {
	const current = readFileSync(target, "utf8");
	if (current !== built) {
		console.error("FAIL：lib/client.js 与 src/client/ 分片不一致——先跑 node scripts/build-client.mjs 再提交。");
		process.exit(1);
	}
	console.log("  ✓ lib/client.js 与分片一致");
} else {
	writeFileSync(target, built);
	console.log(`✓ 已拼装 lib/client.js（${PARTS.length} 片：${PARTS.join(" → ")}）`);
}
