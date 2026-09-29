/**
 * S2 注入通道冒烟（零依赖，node 直跑）：直接驱动 createAssembleHandler /
 * createPromptSource 纯函数（瀑布契约 = (assembly, context, next) → 权威返回值），
 * 断言 hosted 替换 / 非 hosted 透传 / 模型源 = pending route。
 * 真实装配注册表与真 llm-mimo 的端到端在 S4 本机 020 实例验收（decisions D15）。
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPromptbook, createAssembleHandler, createPromptSource, pendingModelOf, mirrorSeedKeys } from "../lib/index.js";

let passed = 0;
const scenario = async (n, fn) => {
	try {
		await fn();
		passed += 1;
		console.log(`  ✓ 场景${n}`);
	} catch (error) {
		console.error(`  ✗ 场景${n}：${error.message}`);
		process.exitCode = 1;
	}
};

const K = "persona.minimal.prefix";
const tempPack = ({ layers = {}, config = {}, registry = {} } = {}) => {
	const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "promptbook-inject-"));
	const registryFile = join(dir, "registry.json");
	writeFileSync(registryFile, JSON.stringify({ [K]: { label: "人设", fallback: "FALLBACK" }, ...registry }, null, "\t"));
	const layersDir = join(dir, "models");
	mkdirSync(layersDir);
	for (const [name, doc] of Object.entries(layers)) writeFileSync(join(layersDir, name + ".json"), JSON.stringify(doc, null, "\t"));
	return { registryFile, layersDir, config, dir };
};

const HOSTED = new Set(["mimo-v2.6-flash", "mimo-v2.6-pro", "acme-flash"]);
const isHosted = (m) => HOSTED.has(m);
const contextWith = (model) => ({
	agent: { session: { requestHeader: () => (model === undefined ? undefined : { config: { provider: "mimo", model } }) } }
});
const assemblyWith = (model) => ({
	variables: model === undefined ? {} : { provider: "mimo", model },
	sections: [],
	tools: []
});
const nextPassing = (assembly) => async () => structuredClone(assembly);
const baseAssembly = () => ({
	sections: [{ name: "harness.base", order: 10, text: "官方基础段" }, { name: "harness.tools", order: 20, text: "工具说明段" }],
	tools: [
		{ name: "bash", description: "官方 bash 描述" },
		{ name: "read", description: "官方 read 描述" }
	]
});

console.log("[装配瀑布主通道]");

await scenario("1 hosted 模型：persona 命中 → system 段整体替换为 promptbook 段", async () => {
	const pb = createPromptbook(tempPack({ layers: { "mimo-v2.6-flash": { [K]: "Flash 人设" } } }));
	const handler = createAssembleHandler({ pb, isHosted, systemKey: K });
	const out = await handler(baseAssembly(), contextWith("mimo-v2.6-flash"), async () => ({ ...structuredClone(baseAssembly()), variables: { provider: "mimo", model: "mimo-v2.6-flash" } }));
	assert.deepEqual(out.sections, [{ name: "promptbook", order: 0, text: "Flash 人设" }]);
});

await scenario("2 hosted 模型：tool.<name> 命中改写、未命中保持官方描述", async () => {
	const pb = createPromptbook(tempPack({
		registry: { "tool.bash": { label: "bash", fallback: "官方 bash 描述" } },
		layers: { "mimo-v2.6-flash": { [K]: "P", "tool.bash": "本地化 bash" } }
	}));
	const handler = createAssembleHandler({ pb, isHosted, systemKey: K });
	const out = await handler(baseAssembly(), contextWith("mimo-v2.6-flash"), async () => ({ ...structuredClone(baseAssembly()), variables: { provider: "mimo", model: "mimo-v2.6-flash" } }));
	assert.equal(out.tools[0].description, "本地化 bash");
	assert.equal(out.tools[1].description, "官方 read 描述");
});

await scenario("3 非 hosted 模型（deepseek-flash）：装配产物原样透传", async () => {
	const pb = createPromptbook(tempPack({ layers: { "deepseek-flash": { [K]: "不该出现" } } }));
	const handler = createAssembleHandler({ pb, isHosted, systemKey: K });
	const before = baseAssembly();
	const out = await handler(before, contextWith("deepseek-flash"), async () => ({ ...structuredClone(before), variables: { provider: "deepseek-official", model: "deepseek-flash" } }));
	assert.deepEqual(out.sections, before.sections);
	assert.deepEqual(out.tools, before.tools);
});

await scenario("4 无 pending route（requestHeader 未折叠 / agent 缺失）：透传", async () => {
	const pb = createPromptbook(tempPack());
	const handler = createAssembleHandler({ pb, isHosted, systemKey: K });
	for (const ctx of [contextWith(undefined), {}, { agent: {} }]) {
		const before = baseAssembly();
		const out = await handler(before, ctx, nextPassing(before));
		assert.deepEqual(out.sections, before.sections);
	}
});

await scenario("5 透传语义（D20）：无本地化命中时 fallback 不接管，system 段原样", async () => {
	const pb = createPromptbook(tempPack());
	const handler = createAssembleHandler({ pb, isHosted, systemKey: K });
	const before = baseAssembly();
	const out = await handler(before, contextWith("mimo-v2.6-pro"), nextPassing(before));
	assert.deepEqual(out.sections, before.sections, "未命中 → 透传官方 persona");
});

await scenario("6 systemKey 未注册（resolve=undefined）→ system 段不动（无兜底可换）", async () => {
	const pb = createPromptbook(tempPack());
	const handler = createAssembleHandler({ pb, isHosted, systemKey: "no.such.key" });
	const before = baseAssembly();
	const out = await handler(before, contextWith("mimo-v2.6-pro"), async () => ({ ...structuredClone(before), variables: { provider: "mimo", model: "mimo-v2.6-pro" } }));
	assert.deepEqual(out.sections, before.sections);
});

console.log("[模型源]");

await scenario("7 pendingModelOf：variables.model 优先，requestHeader 链后备", () => {
	assert.equal(pendingModelOf(assemblyWith("mimo-v2.6-flash"), {}), "mimo-v2.6-flash");
	assert.equal(pendingModelOf(assemblyWith(undefined), contextWith("mimo-v2.6-pro")), "mimo-v2.6-pro");
	assert.equal(pendingModelOf(assemblyWith(undefined), contextWith(undefined)), undefined);
	assert.equal(pendingModelOf({}, {}), undefined);
	assert.equal(pendingModelOf(), undefined);
	// 变量与后备并存时变量胜（装配期 requestHeader 是上一请求，非本次路由）
	assert.equal(pendingModelOf(assemblyWith("mimo-v2.6-flash"), contextWith("deepseek-flash")), "mimo-v2.6-flash");
});

console.log("[dispatch 兜底通道]");

await scenario("8 resolveSystem：hosted 返回解析文本；非 hosted 与未命中返回 undefined（=不改）", () => {
	const pb = createPromptbook(tempPack({ layers: { "mimo-v2.6-flash": { [K]: "Flash 人设" } } }));
	const source = createPromptSource({ pb, isHosted, systemKey: K });
	assert.equal(source.resolveSystem({ provider: "mimo", model: "mimo-v2.6-flash", system: "原" }), "Flash 人设");
	assert.equal(source.resolveSystem({ provider: "mimo", model: "mimo-v2.6-pro", system: "原" }), undefined, "无本地化命中 → 不改（透传）");
	assert.equal(source.resolveSystem({ provider: "deepseek-official", model: "deepseek-flash", system: "原" }), undefined);
});

await scenario("9 resolveToolDescription：命中改写、未命中/非 hosted 返回 undefined", () => {
	const pb = createPromptbook(tempPack({
		registry: { "tool.bash": { label: "bash", fallback: "官方" } },
		layers: { "mimo": { "tool.bash": "本地化 bash" } }
	}));
	const source = createPromptSource({ pb, isHosted, systemKey: K });
	assert.equal(source.resolveToolDescription({ provider: "mimo", model: "mimo-v2.6-flash", toolName: "bash", description: "官方" }), "本地化 bash");
	assert.equal(source.resolveToolDescription({ provider: "mimo", model: "mimo-v2.6-flash", toolName: "read", description: "官方" }), undefined);
	assert.equal(source.resolveToolDescription({ provider: "mimo", model: "mimo-v2.6-pro", toolName: "bash", description: "官方" }), "本地化 bash");
	assert.equal(source.resolveToolDescription({ provider: "x", model: "deepseek-flash", toolName: "bash", description: "官方" }), undefined);
});


await scenario("10 mirrorSeedKeys：种子键镜像进 config.registryJson，幂等不重写", () => {
	const p = tempPack({ registry: { "tool.x": { label: "新工具", fallback: "T" } } });
	const pb = createPromptbook(p);
	const config = {};
	mirrorSeedKeys(pb, config);
	const first = JSON.parse(config.registryJson);
	assert.ok(first[K] && first["tool.x"], "种子键已镜像");
	const snapshot = JSON.stringify(first);
	mirrorSeedKeys(pb, config);
	assert.equal(config.registryJson, snapshot, "幂等：无缺键不重写");
	mirrorSeedKeys(pb, undefined); // config 缺省不炸
});

console.log(passed === 10 ? "\nPASS：10/10 场景全绿" : `\nFAIL：${10 - passed} 项未过`);
