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
	for (const key of ["NS", "apply", "inject", "parseEntries", "mergeEntry", "isOverridden", "keyOptionsFromSnapshot", "hostedOptionsFromLlMimoSnapshot", "modelCandidates", "resolveTraced", "layersFromSnapshot"]) {
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

scenario("8 modelCandidates：逐级剥末段 + default 去重", () => {
	assert.deepEqual(client.modelCandidates("mimo-v2.6-flash"), ["mimo-v2.6-flash", "mimo-v2.6", "mimo", "default"]);
	assert.deepEqual(client.modelCandidates("mimo"), ["mimo", "default"]);
	assert.deepEqual(client.modelCandidates(""), ["default"]);
	assert.deepEqual(client.modelCandidates(undefined), ["default"]);
});

scenario("9 resolveTraced：候选优先序与 host resolveOverride 一致（gui/compile/model/provider/fallback）", () => {
	const registryJson = JSON.stringify({ [K]: { label: "人设", fallback: "兜底句" } });
	// GUI 层精确候选命中
	let docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo-v2.6-flash": "GUI 文本" } }), layersJson: "{}", model: "mimo-v2.6-flash" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", docs), { text: "GUI 文本", source: { layer: "gui" } });
	// 同候选下 GUI 压过编译文档
	docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo-v2.6-flash": "GUI 文本" } }), layersJson: JSON.stringify({ __overrides__: { [K]: { "mimo-v2.6-flash": "编译文本" } } }), model: "mimo-v2.6-flash" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", docs), { text: "GUI 文本", source: { layer: "gui" } });
	// 合并文档（GUI/编译）全候选优先于包层：GUI 家族候选压过包层精确候选
	docs = { registryJson, entriesJson: JSON.stringify({ [K]: { "mimo": "GUI 家族文本" } }), layersJson: JSON.stringify({ "mimo-v2.6-flash": { [K]: "包层精确文本" } }), model: "mimo-v2.6-flash" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", docs), { text: "GUI 家族文本", source: { layer: "gui" } });
	// 编译文档精确候选压过包层家族（合并文档先走完）
	docs = { registryJson, entriesJson: "{}", layersJson: JSON.stringify({ __overrides__: { [K]: { "mimo-v2.6-flash": "编译精确文本" } }, mimo: { [K]: "包层家族文本" } }), model: "mimo-v2.6-flash" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", docs), { text: "编译精确文本", source: { layer: "compile" } });
	// 包层家族命中（mimo.json 种子人设场景）
	docs = { registryJson, entriesJson: "{}", layersJson: JSON.stringify({ mimo: { [K]: "家族人设" } }), model: "mimo-v2.6-flash" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", docs), { text: "家族人设", source: { layer: "provider", id: "mimo" } });
	// 全链未命中 → 注册表兜底
	docs = { registryJson, entriesJson: "{}", layersJson: "{}", model: "mimo-v2.6-flash" };
	assert.deepEqual(client.resolveTraced(K, "mimo-v2.6-flash", docs), { text: "兜底句", source: { layer: "fallback" } });
	// 键未注册 → undefined
	assert.equal(client.resolveTraced("no.such.key", "mimo", { registryJson, entriesJson: "{}", layersJson: "{}" }), void 0);
});

scenario("10 layersFromSnapshot：畸形/非串容错", () => {
	assert.deepEqual(client.layersFromSnapshot({ layersJson: "not json" }), {});
	assert.deepEqual(client.layersFromSnapshot({}), {});
	assert.deepEqual(client.layersFromSnapshot({ layersJson: '{"mimo":{"k":"v"}}' }), { mimo: { k: "v" } });
});

scenario("7 hostedOptionsFromLlMimoSnapshot：主路由 + customProviders 两级派生，未加载→[]", () => {
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

console.log(passed === 10 ? "\nPASS：10/10 场景全绿" : `\nFAIL：${10 - passed} 项未过`);
