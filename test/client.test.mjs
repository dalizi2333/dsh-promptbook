/**
 * S3 client 卡逻辑层测试（零依赖，node 直跑）。
 * 经伪 window.__ModuleLoader__ 工厂装载 lib/client.js，抽出其导出的纯逻辑函数直测；
 * React/primitives 仅作桩（逻辑层不触碰渲染）。
 */

import { strict as assert } from "node:assert";

let loaded = undefined;
globalThis.window = {
	__ModuleLoader__: {
		load(def) {
			loaded = def;
		}
	}
};
await import("../lib/client.js");

assert.equal(loaded?.id, "@mimo-codex/dsh-promptbook", "ModuleLoader id");

const stubs = {
	react: {
		useState: (v) => [typeof v === "function" ? v() : v, () => {}],
		useRef: (v) => ({ current: v }),
		useEffect: () => {},
		useLayoutEffect: () => {}
	},
	"react/jsx-runtime": { jsx: () => null, jsxs: () => null, Fragment: "F" },
	"@deepseek-ai/dsh-client-ui-primitives": {
		SettingsForm: () => null,
		SettingsValueField: () => null,
		SettingsFormModel: class {},
		settingsTextField: (f) => ({ field: f })
	}
};
const client = loaded.factory((name) => stubs[name] ?? {});

let passed = 0;
const scenario = (n, fn) => {
	try {
		fn();
		passed += 1;
		console.log(`  ✓ 场景${n}`);
	} catch (error) {
		console.error(`  ✗ 场景${n}：${error.message}`);
		process.exitCode = 1;
	}
};

const K = "persona.minimal.prefix";

console.log("[模块面]");
scenario("1 工厂导出契约：NS/apply/inject + 纯逻辑函数", () => {
	for (const key of ["NS", "apply", "inject", "parseEntries", "mergeEntry", "isOverridden", "keyOptionsFromSnapshot", "hostedOptionsFromLlMimoSnapshot", "PROVIDER_DEFAULT_ID", "scopeCandidate", "resolveCandidates", "resolveTraced", "lightOf", "layersFromSnapshot"]) {
		assert.notEqual(client[key], undefined, `缺导出 ${key}`);
	}
	assert.equal(client.NS, "settings.promptbook");
	assert.deepEqual(client.inject, ["slots", "locale", "configForms"]);
});

console.log("[entries 文档操作]");
scenario("2 parseEntries：畸形/非串/$ 键容错", () => {
	assert.deepEqual(client.parseEntries("{}"), {});
	assert.deepEqual(client.parseEntries(""), {});
	assert.deepEqual(client.parseEntries("not json"), {});
	assert.deepEqual(client.parseEntries('{"a":{"m":"t"},"$meta":1,"bad":"scalar"}'), { a: { m: "t" } });
});

scenario("3 mergeEntry：写入合并（不动其他键/模型）", () => {
	const base = JSON.stringify({ other: { "mimo": "keep" } });
	const merged = JSON.parse(client.mergeEntry(base, K, "mimo-v2.6-flash", "新文本"));
	assert.equal(merged[K]["mimo-v2.6-flash"], "新文本");
	assert.equal(merged.other.mimo, "keep");
});

scenario("4 mergeEntry(null)=移除该条；键空了连键一起删", () => {
	const base = JSON.stringify({ [K]: { "mimo-v2.6-flash": "x", "mimo-v2.6-pro": "y" }, solo: { m: "z" } });
	let doc = JSON.parse(client.mergeEntry(base, K, "mimo-v2.6-flash", null));
	assert.equal(doc[K]["mimo-v2.6-flash"], undefined);
	assert.equal(doc[K]["mimo-v2.6-pro"], "y");
	doc = JSON.parse(client.mergeEntry(JSON.stringify(doc), K, "mimo-v2.6-pro", null));
	assert.equal(doc[K], undefined, "键下空 → 删键");
	assert.equal(doc.solo.m, "z");
});

scenario("5 isOverridden：以 user 层 entriesJson 为准", () => {
	const user = JSON.stringify({ [K]: { "mimo-v2.6-flash": "覆盖" } });
	assert.equal(client.isOverridden(user, K, "mimo-v2.6-flash"), true);
	assert.equal(client.isOverridden(user, K, "mimo-v2.6-pro"), false);
	assert.equal(client.isOverridden("", K, "mimo-v2.6-flash"), false);
});

console.log("[选项派生]");
scenario("6 keyOptionsFromSnapshot：registryJson（含 host 镜像的种子键）→ 排序键表（带兜底文本）", () => {
	const opts = client.keyOptionsFromSnapshot({
		registryJson: JSON.stringify({
			[K]: { label: "人设", fallback: "F" },
			"tool.x": { fallback: "T" },
			"$meta": { fallback: "忽略" },
			broken: "not-an-object"
		})
	});
	assert.deepEqual(opts, [
		{ key: K, label: "人设", fallback: "F" },
		{ key: "tool.x", label: "tool.x", fallback: "T" }
	]);
});

scenario("8 resolveCandidates：[模型, 供应商, default] 去重（家族层退役，与 host 逐分支一致）", () => {
	assert.deepEqual(client.resolveCandidates("mimo-v2.6-flash", "mimo"), ["mimo-v2.6-flash", "mimo", "default"]);
	assert.deepEqual(client.resolveCandidates("mimo", "mimo"), ["mimo", "default"]);
	assert.deepEqual(client.resolveCandidates(undefined, "mimo"), ["mimo", "default"]);
	assert.deepEqual(client.resolveCandidates("", "acme"), ["acme", "default"]);
	assert.deepEqual(client.resolveCandidates(undefined, undefined), ["default"]);
});

scenario("9 scopeCandidate：供应商默认伪条目展开为 provider id，具体模型原样", () => {
	assert.equal(client.scopeCandidate({ provider: "mimo", model: client.PROVIDER_DEFAULT_ID }), "mimo");
	assert.equal(client.scopeCandidate({ provider: "mimo", model: "mimo-v2.6-flash" }), "mimo-v2.6-flash");
});

scenario("10 resolveTraced：候选优先序与 host resolveOverride 一致（gui/compile/model/provider/fallback，source 带命中候选 id）", () => {
	const registryJson = JSON.stringify({ [K]: { label: "人设", fallback: "兜底句" } });
	// GUI 层精确候选命中（source.id = 命中候选）
	let docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo-v2.6-flash": "GUI 文本" } }), layersJson: "{}" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "GUI 文本", source: { layer: "gui", id: "mimo-v2.6-flash" } });
	// 同候选下 GUI 压过编译文档
	docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo-v2.6-flash": "GUI 文本" } }), layersJson: JSON.stringify({ __overrides__: { [K]: { "mimo-v2.6-flash": "编译文本" } } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "GUI 文本", source: { layer: "gui", id: "mimo-v2.6-flash" } });
	// 合并文档（GUI/编译）全候选优先于包层：GUI 供应商候选压过包层精确候选
	docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo": "GUI 供应商默认" } }), layersJson: JSON.stringify({ "mimo-v2.6-flash": { [K]: "包层精确文本" } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "GUI 供应商默认", source: { layer: "gui", id: "mimo" } });
	// 编译文档精确候选压过包层供应商（合并文档先走完）
	docs = { registryJson, entriesJson: "{}", layersJson: JSON.stringify({ __overrides__: { [K]: { "mimo-v2.6-flash": "编译精确文本" } }, mimo: { [K]: "包层供应商文本" } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "编译精确文本", source: { layer: "compile", id: "mimo-v2.6-flash" } });
	// 包层供应商命中（mimo.json 种子人设场景）
	docs = { registryJson, entriesJson: "{}", layersJson: JSON.stringify({ mimo: { [K]: "供应商注册人设" } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "供应商注册人设", source: { layer: "provider", id: "mimo" } });
	// 家族层退役：剥段祖先（mimo-v2.6）不再是候选
	docs = { registryJson, entriesJson: "{}", layersJson: JSON.stringify({ "mimo-v2.6": { [K]: "退役家族层" } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "兜底句", source: { layer: "fallback" } });
	// 全链未命中 → 注册表兜底
	docs = { registryJson, entriesJson: "{}", layersJson: "{}" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", docs), { text: "兜底句", source: { layer: "fallback" } });
	// 键未注册 → undefined
	assert.equal(client.resolveTraced("no.such.key", "mimo", "mimo", { registryJson, entriesJson: "{}", layersJson: "{}" }), void 0);
});

scenario("11 供应商默认作用域重放：链 = [供应商, default]，包层注册命中 → 供应商层绿", () => {
	const registryJson = JSON.stringify({ [K]: { label: "人设", fallback: "兜底句" } });
	// 供应商默认作用域（model 参数 = provider id，去重后链退化）命中包层注册
	let docs = { registryJson, entriesJson: "{}", layersJson: JSON.stringify({ mimo: { [K]: "供应商注册人设" } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo", "mimo", docs), { text: "供应商注册人设", source: { layer: "provider", id: "mimo" } });
	// 同作用域下 GUI 供应商覆盖压过包层注册
	docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo": "GUI 覆盖" } }), layersJson: JSON.stringify({ mimo: { [K]: "供应商注册人设" } }) };
	assert.deepEqual(client.resolveTraced(K, "mimo", "mimo", docs), { text: "GUI 覆盖", source: { layer: "gui", id: "mimo" } });
	// 供应商槽未设置但全局 default 有 → 命中全局 default
	docs = { registryJson, entriesJson: JSON.stringify({ [K]: { default: "全局默认" } }), layersJson: "{}" };
	assert.deepEqual(client.resolveTraced(K, "mimo", "mimo", docs), { text: "全局默认", source: { layer: "gui", id: "default" } });
});

scenario("12 lightOf：作用域相对灯态矩阵（owner 灯语）", () => {
	const src = (layer, id) => ({ layer, id });
	const G = "green", Y = "yellow", R = "gray";
	// 模型作用域：命中本槽绿 / 供应商槽黄 / 全局 default 与兜底灰
	assert.equal(client.lightOf({ source: src("gui", "mimo-v2.6-flash") }, "mimo-v2.6-flash"), G);
	assert.equal(client.lightOf({ source: src("compile", "mimo-v2.6-flash") }, "mimo-v2.6-flash"), G);
	assert.equal(client.lightOf({ source: src("model", "mimo-v2.6-flash") }, "mimo-v2.6-flash"), G);
	assert.equal(client.lightOf({ source: src("provider", "mimo") }, "mimo-v2.6-flash"), Y, "模型作用域命中供应商槽 → 黄");
	assert.equal(client.lightOf({ source: src("gui", "mimo") }, "mimo-v2.6-flash"), Y, "GUI 供应商默认在模型作用域 → 黄");
	assert.equal(client.lightOf({ source: src("gui", "default") }, "mimo-v2.6-flash"), R, "全局 default → 灰");
	assert.equal(client.lightOf({ source: { layer: "fallback" } }, "mimo-v2.6-flash"), R);
	assert.equal(client.lightOf(undefined, "mimo-v2.6-flash"), R);
	// 供应商默认作用域：命中供应商槽绿 / 全局 default 与兜底灰；黄不可达
	assert.equal(client.lightOf({ source: src("provider", "mimo") }, "mimo"), G);
	assert.equal(client.lightOf({ source: src("gui", "mimo") }, "mimo"), G);
	assert.equal(client.lightOf({ source: src("gui", "default") }, "mimo"), R);
	assert.equal(client.lightOf({ source: { layer: "fallback" } }, "mimo"), R);
});

scenario("13 layersFromSnapshot：畸形/非串容错", () => {
	assert.deepEqual(client.layersFromSnapshot({ layersJson: "not json" }), {});
	assert.deepEqual(client.layersFromSnapshot({}), {});
	assert.deepEqual(client.layersFromSnapshot({ layersJson: '{"mimo":{"k":"v"}}' }), { mimo: { k: "v" } });
});

scenario("14 hostedOptionsFromLlMimoSnapshot：主路由 + customProviders 两级派生，未加载→[]", () => {
	assert.deepEqual(client.hostedOptionsFromLlMimoSnapshot({ status: "loading" }), []);
	const snap = {
		status: "ready",
		value: {
			modelsJson: '[{"id":"mimo-v2.6-flash","name":"Flash"},{"id":"mimo-v2.6-pro"}]',
			customProviders: {
				acme: { displayName: "Acme 网关", modelsJson: '[{"id":"mimo-v2.6-flash","name":"Acme Flash"}]' },
				empty: { modelsJson: "[]" }
			}
		}
	};
	assert.deepEqual(client.hostedOptionsFromLlMimoSnapshot(snap), [
		{ provider: "mimo", label: "mimo", models: [{ id: "mimo-v2.6-flash", name: "Flash" }, { id: "mimo-v2.6-pro", name: "mimo-v2.6-pro" }] },
		{ provider: "acme", label: "Acme 网关", models: [{ id: "mimo-v2.6-flash", name: "Acme Flash" }] }
	]);
	// volatile 物化活引用形态（.get()）
	const live = { status: "ready", value: { modelsJson: "", customProviders: { get: () => snap.value.customProviders } } };
	assert.equal(client.hostedOptionsFromLlMimoSnapshot(live).length, 1);
	// displayName 缺省回落 route 名
	assert.equal(client.hostedOptionsFromLlMimoSnapshot(live)[0].label, "Acme 网关");
});

scenario("15 docs.pendingPack：乐观排他包层命中（重置落盘前的卡面一致性）", () => {
	const registryJson = JSON.stringify({ [K]: { label: "人设", fallback: "兜底句" } });
	const layersJson = JSON.stringify({ mimo: { [K]: "供应商注册人设" } });
	// 待确认集内的包层命中按已删处理 → 回落兜底
	const pending = { registryJson, entriesJson: "{}", layersJson, pendingPack: [K + "\u0000mimo"] };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", pending), { text: "兜底句", source: { layer: "fallback" } });
	// 对账确认后剪除待确认集 → 常规解析恢复
	const confirmed = { registryJson, entriesJson: "{}", layersJson, pendingPack: [] };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", "mimo", confirmed), { text: "供应商注册人设", source: { layer: "provider", id: "mimo" } });
});

console.log(passed === 14 ? "\nPASS：14/14 场景全绿" : `\nFAIL：${14 - passed} 项未过`);
