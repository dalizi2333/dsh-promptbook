/**
 * promptbook resolve 链 10+ 场景逻辑测试（零依赖，node 直跑：node test/promptbook.test.mjs）。
 * 全部经 createPromptbook 工厂注入临时资源包——测试不写仓库文件。
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPromptbook, modelCandidates, asDoc } from "../lib/index.js";

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

const tempPack = ({ registry = {}, layers = {}, config = {} } = {}) => {
	const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "promptbook-test-"));
	const registryFile = join(dir, "registry.json");
	writeFileSync(registryFile, JSON.stringify(registry, null, "\t"));
	const layersDir = join(dir, "models");
	mkdirSync(layersDir);
	for (const [name, doc] of Object.entries(layers)) writeFileSync(join(layersDir, name + ".json"), JSON.stringify(doc, null, "\t"));
	return { registryFile, layersDir, config, dir };
};

const K = "persona.minimal.prefix";

console.log("[resolve 链]");

await scenario("1 未注册键 → undefined", () => {
	const p = tempPack();
	const pb = createPromptbook(p);
	assert.equal(pb.resolve("no.such.key", "mimo-v2.6-flash"), undefined);
});

await scenario("2 无任何本地化层 → registry.fallback", () => {
	const p = tempPack({ registry: { [K]: { label: "人设", fallback: "FALLBACK" } } });
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "FALLBACK");
});

await scenario("3 models/<模型>.json 模型层命中", () => {
	const p = tempPack({ registry: { [K]: { fallback: "FALLBACK" } }, layers: { "mimo-v2.6-flash": { [K]: "MODEL层" } } });
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "MODEL层");
});

await scenario("4 家族层命中（flash → mimo-v2.6）", () => {
	const p = tempPack({ registry: { [K]: { fallback: "FALLBACK" } }, layers: { "mimo-v2.6": { [K]: "FAMILY层" } } });
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "FAMILY层");
});

await scenario("5 更上游家族命中（flash → mimo）且模型层优先于家族层", () => {
	const p = tempPack({
		registry: { [K]: { fallback: "FALLBACK" } },
		layers: { "mimo": { [K]: "GENUS层" }, "mimo-v2.6-flash": { [K]: "MODEL层" } }
	});
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "MODEL层");
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-pro"), "GENUS层");
});

await scenario("6 entriesJson(GUI) 高于发布层", () => {
	const p = tempPack({
		registry: { [K]: { fallback: "FALLBACK" } },
		layers: { "mimo-v2.6-flash": { [K]: "MODEL层" } },
		config: { entriesJson: JSON.stringify({ [K]: { "mimo-v2.6-flash": "GUI层" } }) }
	});
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "GUI层");
});

await scenario("7 overrides 文件层低于 entriesJson、高于发布层（编译产物被 GUI 覆盖）", () => {
	const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "promptbook-test-"));
	const overrides = join(dir, "overrides.json");
	writeFileSync(overrides, JSON.stringify({ [K]: { "mimo-v2.6-flash": "编译层" } }));
	const p = tempPack({
		registry: { [K]: { fallback: "FALLBACK" } },
		layers: { "mimo-v2.6-flash": { [K]: "MODEL层" } },
		config: { overrides }
	});
	const pb = createPromptbook(p);
	assert.equal(pb.resolve(K, "mimo-v2.6-flash"), "编译层");
	p.config.entriesJson = JSON.stringify({ [K]: { "mimo-v2.6-flash": "GUI层" } });
	assert.equal(pb.resolve(K, "mimo-v2.6-flash"), "GUI层");
});

await scenario("8 entries 的 default 键兜底（无模型命中时先于 registry.fallback）", () => {
	const p = tempPack({
		registry: { [K]: { fallback: "FALLBACK" } },
		config: { entriesJson: JSON.stringify({ [K]: { default: "GUI默认" } }) }
	});
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "GUI默认");
});

console.log("[工具函数]");

await scenario("9 modelCandidates 链与去重（含空模型 → default）", () => {
	assert.deepEqual(modelCandidates("mimo-v2.6-flash"), ["mimo-v2.6-flash", "mimo-v2.6", "mimo", "default"]);
	assert.deepEqual(modelCandidates("solo"), ["solo", "default"]);
	assert.deepEqual(modelCandidates(undefined), ["default"]);
});

await scenario("10 asDoc 双形态等价（JSON 字符串 = 已物化对象）且 $ 前缀键被忽略", () => {
	const viaString = asDoc(JSON.stringify({ a: { m: "t" }, "$meta": 1 }));
	const viaObject = asDoc({ a: { m: "t" }, "$meta": 1 });
	assert.deepEqual(viaString, viaObject);
	assert.equal("$meta" in viaString, false);
});

await scenario("11 register：fallback 必填、写透 registry、镜像 config、立即可解析", () => {
	const p = tempPack({ registry: { [K]: { fallback: "旧" } } });
	const pb = createPromptbook(p);
	assert.throws(() => pb.register("new.key", { label: "x" }), /non-empty fallback/);
	pb.register("new.key", { label: "新键", fallback: "新兜底" });
	assert.ok(pb.keys().includes("new.key"));
	assert.deepEqual(pb.definition("new.key"), { label: "新键", fallback: "新兜底" });
	assert.equal(pb.resolve("new.key", "whatever"), "新兜底");
	const persisted = JSON.parse(readFileSync(p.registryFile, "utf8"));
	assert.equal(persisted["new.key"].fallback, "新兜底");
	assert.ok(JSON.parse(p.config.registryJson)["new.key"]);
});

await scenario("12 set()：无 overrides 配置抛错；配置后写入并在链中生效", () => {
	const p = tempPack({ registry: { [K]: { fallback: "FALLBACK" } } });
	const pb = createPromptbook(p);
	assert.throws(() => pb.set(K, "mimo-v2.6-flash", "编译文本"), /requires Config.overrides/);
	const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "promptbook-test-"));
	p.config.overrides = join(dir, "overrides.json");
	pb.set(K, "mimo-v2.6-flash", "编译文本", { by: "bench", date: "2026-09-29" });
	assert.equal(pb.resolve(K, "mimo-v2.6-flash"), "编译文本");
	const doc = JSON.parse(readFileSync(p.config.overrides, "utf8"));
	assert.equal(doc[K]["$compiled"]["mimo-v2.6-flash"].by, "bench");
});

await scenario("13 listKeys 契约面（{key,label,fallback} 三元组）", () => {
	const p = tempPack({ registry: { [K]: { label: "人设", fallback: "F" }, "tool.x": { fallback: "T" } } });
	assert.deepEqual(createPromptbook(p).listKeys(), [
		{ key: K, label: "人设", fallback: "F" },
		{ key: "tool.x", label: "tool.x", fallback: "T" }
	]);
});


await scenario("14 resolveOverride：只认本地化命中（entries/models 层），不落 registry.fallback", () => {
	const p = tempPack({ registry: { [K]: { label: "人设", fallback: "FALLBACK" } }, layers: { "mimo": { [K]: "家族层" } } });
	const pb = createPromptbook(p);
	assert.equal(pb.resolveOverride(K, "mimo-v2.6-flash"), "家族层");
	assert.equal(pb.resolveOverride(K, "其他模型"), undefined, "无层命中 → undefined（透传信号）");
	assert.equal(pb.resolve(K, "其他模型"), "FALLBACK", "resolve 仍含 fallback（服务面语义不变）");
});

await scenario("15 resolveOverride：GUI entries（含 default 键）也算命中", () => {
	const p = tempPack({ registry: { [K]: { label: "人设", fallback: "FALLBACK" } }, config: { entriesJson: JSON.stringify({ [K]: { default: "GUI默认" } }) } });
	const pb = createPromptbook(p);
	assert.equal(pb.resolveOverride(K, "任意模型"), "GUI默认");
});

console.log(passed === 15 ? "\nPASS：15/15 场景全绿" : `\nFAIL：${15 - passed} 项未过`);
