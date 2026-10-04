/**
 * promptbook resolve 链 10+ 场景逻辑测试（零依赖，node 直跑：node test/promptbook.test.mjs）。
 * 全部经 createPromptbook 工厂注入临时资源包——测试不写仓库文件。
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createPromptbook, resolveCandidates, asDoc, buildLayersMirror, LAYERS_MIRROR_OVERRIDES_KEY } from "../lib/index.js";

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

await scenario("4 供应商层命中（models/<供应商>.json，provider 显式入链）", () => {
	const p = tempPack({ registry: { [K]: { fallback: "FALLBACK" } }, layers: { "mimo": { [K]: "PROVIDER层" } } });
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash", "mimo"), "PROVIDER层");
	// 家族层退役：不带 provider（或 provider 不同）时，剥段祖先不再是候选 → 不命中
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash"), "FALLBACK", "无 provider → 供应商层不可达");
	assert.equal(createPromptbook(p).resolve(K, "mimo-v2.6-flash", "acme"), "FALLBACK", "异 provider 不串层");
});

await scenario("5 模型层优先于供应商层；供应商层覆盖同供应商其余模型", () => {
	const p = tempPack({
		registry: { [K]: { fallback: "FALLBACK" } },
		layers: { "mimo": { [K]: "PROVIDER层" }, "mimo-v2.6-flash": { [K]: "MODEL层" } }
	});
	const pb = createPromptbook(p);
	assert.equal(pb.resolve(K, "mimo-v2.6-flash", "mimo"), "MODEL层");
	assert.equal(pb.resolve(K, "mimo-v2.6-pro", "mimo"), "PROVIDER层");
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

await scenario("9 resolveCandidates 链与去重（[模型, 供应商, default]；空段跳过）", () => {
	assert.deepEqual(resolveCandidates("mimo-v2.6-flash", "mimo"), ["mimo-v2.6-flash", "mimo", "default"]);
	assert.deepEqual(resolveCandidates("mimo", "mimo"), ["mimo", "default"], "模型 id = 供应商 id → 去重");
	assert.deepEqual(resolveCandidates(undefined, "mimo"), ["mimo", "default"]);
	assert.deepEqual(resolveCandidates("solo", undefined), ["solo", "default"]);
	assert.deepEqual(resolveCandidates(undefined, undefined), ["default"]);
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
	const p = tempPack({ registry: { [K]: { label: "人设", fallback: "FALLBACK" } }, layers: { "mimo": { [K]: "供应商层" } } });
	const pb = createPromptbook(p);
	assert.equal(pb.resolveOverride(K, "mimo-v2.6-flash", "mimo"), "供应商层");
	assert.equal(pb.resolveOverride(K, "mimo-v2.6-flash"), undefined, "无 provider → 剥段祖先不入链（家族层退役）");
	assert.equal(pb.resolveOverride(K, "其他模型", "acme"), undefined, "无层命中 → undefined（透传信号）");
	assert.equal(pb.resolve(K, "其他模型", "acme"), "FALLBACK", "resolve 仍含 fallback（服务面语义不变）");
});

await scenario("15 resolveOverride：GUI entries（含 provider 键与 default 键）也算命中", () => {
	const p = tempPack({
		registry: { [K]: { label: "人设", fallback: "FALLBACK" } },
		config: { entriesJson: JSON.stringify({ [K]: { "mimo": "GUI供应商默认", default: "GUI默认" } }) }
	});
	const pb = createPromptbook(p);
	assert.equal(pb.resolveOverride(K, "mimo-v2.6-flash", "mimo"), "GUI供应商默认");
	assert.equal(pb.resolveOverride(K, "任意模型", "acme"), "GUI默认");
});

await scenario("16 buildLayersMirror：包层按候选 id 打包 + overrides 文档进保留键", () => {
	const p = tempPack({
		registry: { [K]: { label: "人设", fallback: "FALLBACK" } },
		layers: { mimo: { [K]: "家族人设" }, "mimo-v2.6-flash": { [K]: "精确人设" } },
		config: { overrides: join(process.env.TMPDIR ?? "/tmp", "does-not-exist.json") }
	});
	const mirror = buildLayersMirror(p.layersDir, p.config.overrides);
	assert.deepEqual(mirror.mimo, { [K]: "家族人设" });
	assert.deepEqual(mirror["mimo-v2.6-flash"], { [K]: "精确人设" });
	assert.equal(mirror[LAYERS_MIRROR_OVERRIDES_KEY], undefined);
	// overrides 文件存在时进镜像
	const overridesPath = join(p.dir, "overrides.json");
	writeFileSync(overridesPath, JSON.stringify({ [K]: { "mimo-v2.6-flash": "编译文本" } }));
	const mirror2 = buildLayersMirror(p.layersDir, overridesPath);
	assert.deepEqual(mirror2[LAYERS_MIRROR_OVERRIDES_KEY], { [K]: { "mimo-v2.6-flash": "编译文本" } });
});

await scenario("17 refreshLayersMirror：set() 落盘后 config.layersJson 同步刷新", async () => {
	const base = tempPack({ registry: { [K]: { label: "人设", fallback: "FALLBACK" } }, layers: { mimo: { [K]: "家族人设" } } });
	const p = { ...base, config: { overrides: join(base.dir, "overrides.json"), registryJson: "{}", layersJson: "{}", entriesJson: "{}" } };
	const pb = createPromptbook(p);
	assert.equal(p.config.layersJson, "{}");
	pb.set(K, "mimo-v2.6-flash", "编译文本");
	const mirror = JSON.parse(p.config.layersJson);
	assert.deepEqual(mirror[LAYERS_MIRROR_OVERRIDES_KEY], { [K]: { "mimo-v2.6-flash": "编译文本" } });
	assert.deepEqual(mirror.mimo, { [K]: "家族人设" });
});

await scenario("18 applyPackOps：包层物理删除对账（TTL 内写盘+清队列；$ 键保留；过期作废；幂等）", () => {
	const p = tempPack({ registry: { [K]: { label: "人设", fallback: "FALLBACK" } }, layers: { "mimo": { [K]: "PROVIDER层", "$meta": "keep" } } });
	const mimoFile = join(p.layersDir, "mimo.json");
	p.config.packOpsJson = JSON.stringify({ deletions: [{ key: K, candidate: "mimo", ts: Date.now() }] });
	const pb = createPromptbook(p);
	// resolveOverride 前置对账：条目物理删除 → 链上不可见（透传信号）
	assert.equal(pb.resolveOverride(K, "mimo-v2.6-flash", "mimo"), undefined);
	const doc = JSON.parse(readFileSync(mimoFile, "utf8"));
	assert.equal(doc[K], undefined, "条目已物理删除");
	assert.equal(doc.$meta, "keep", "$ 元数据键保留");
	assert.equal(p.config.packOpsJson, "{}", "队列已清空");
	// TTL 外的陈旧操作只作废不执行（git 恢复文件 + 重启不被再次删除）——独立新包验证
	const p2 = tempPack({ registry: { [K]: { fallback: "FALLBACK" } }, layers: { "mimo": { [K]: "PROVIDER层" } } });
	const pb2 = createPromptbook(p2);
	p2.config.packOpsJson = JSON.stringify({ deletions: [{ key: K, candidate: "mimo", ts: Date.now() - 11 * 60 * 1000 }] });
	assert.equal(pb2.resolveOverride(K, "mimo-v2.6-flash", "mimo"), "PROVIDER层", "过期操作不执行");
	assert.equal(p2.config.packOpsJson, "{}", "过期队列仍清空");
	assert.equal(JSON.parse(readFileSync(join(p2.layersDir, "mimo.json"), "utf8"))[K], "PROVIDER层", "文件未被过期操作改动");
	// 幂等：对已删条目重复对账零写盘、无副作用
	p.config.packOpsJson = JSON.stringify({ deletions: [{ key: K, candidate: "mimo", ts: Date.now() }] });
	assert.equal(pb.resolveOverride(K, "mimo-v2.6-flash", "mimo"), undefined);
	assert.equal(p.config.packOpsJson, "{}");
});

console.log(passed === 18 ? "\nPASS：18/18 场景全绿" : `\nFAIL：${18 - passed} 项未过`);
