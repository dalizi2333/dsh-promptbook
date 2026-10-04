/**
 * @mimo-codex/dsh-promptbook — 提示词簿（host 侧）。
 *
 * 数据面（S1）：注册制文本源。注册表（键 → label/fallback）由种子 registry.json +
 * Config.registryJson 合成；本地化文本按模型分层，解析链（高 → 低）：
 *   Config.entriesJson（GUI，逐作用域）→ overrides 文件（编译 set() 落点，逐作用域）
 *   → models/<模型>.json → models/<供应商>.json（供应商层，显式入链）
 *   → entries 的 default 键 → registry.fallback。
 * 作用域候选 = [模型, 供应商, default]——旧「家族层」（模型 id 逐级剥 -tier 推导
 * 祖先链）已退役：中间祖先不再是解析候选，供应商层只认 provider id。
 * 包层写：GUI 重置经 packOpsJson 对账通道物理删除 models/<候选>.json 条目
 * （owner 2026-10-04 裁决：注册值可丢失，重装/升级或 git checkout 恢复；队列带
 * TTL 且 boot 不对账——陈旧队列只作废不执行，git 恢复 + 重启后注册值回归）。
 *
 * 设计约束（decisions D1–D17，违反即回退重做）：
 *  - **故意无状态、零私有成员**——cordis 跨作用域返回派生对象，JS 私有成员在派生
 *    接收者上会抛；全部状态 = 文档文件 + 每次 call 现读。
 *  - resolve 是 (key, model) 的确定性纯函数（同输入逐字节稳定——前缀缓存纪律）；
 *    切模型导致的重解析属预期（缓存本来必 miss）。
 *  - 通道边界：只管理散文文本；工具名与参数 JSON 结构永不入库。
 *  - volatile 双形态兼容：字段可能是活引用(.get())、已物化对象或 JSON 字符串，
 *    统一经 fieldValue/asDoc 解包（0.2.0-rc.1 上待重验，重验后能删则删——S1 保留）。
 *  - 合法模型世界与注入（S2）：名单 = ctx.llmMimo.listHostedModels()，模型源 =
 *    pending route（session.requestHeader()）；本文件不碰这些，注入两通道在 S2 加。
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";

export const name = "promptbook";

/** 插件级依赖 dsh-llm-mimo：合法模型世界与兜底通道都来自它。 */
export const inject = ["llmMimo"];

export const DEFAULT_SYSTEM_KEY = "persona.minimal.prefix";

/** 卡面镜像里承载 overrides 文档的保留键（候选 id 不会是它——resolveCandidates 不产生下划线头）。 */
export const LAYERS_MIRROR_OVERRIDES_KEY = "__overrides__";

/** 卡面镜像里的路径元数据键：{ layersDir, overridesPath }，供来源提示展开文件路径。 */
export const LAYERS_MIRROR_PATHS_KEY = "__paths__";

/* 配置面：资源包分层的可写层（registry 扩展 / GUI 编辑 / 编译落点）+ 注入键 + 卡面镜像。 */
export const Config = z.object({
	registryJson: z.string().default("{}").volatile().description("Registry extensions as JSON text (key -> {label, fallback})."),
	entriesJson: z.string().default("{}").volatile().description("Per-scope localized texts as JSON text (GUI-managed, {key: {candidate: text}})."),
	overrides: z.string().default("").volatile().description("Path to the compile overrides document (set() writes land here)."),
	systemKey: z.string().default(DEFAULT_SYSTEM_KEY).volatile().description("Registry key resolved into the system prompt for hosted models."),
	layersJson: z.string().default("{}").volatile().description("Card display mirror: {\"__overrides__\": doc, \"<candidate>\": pack doc}. Host-maintained at boot and set(); the card replays the resolve chain from it."),
	packOpsJson: z.string().default("{}").volatile().description("GUI pack-layer write queue ({deletions:[{key, candidate}]}); host reconciles (applies to models/*.json) then clears.")
});

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** volatile 字段在构造配置里是带 .get() 的活引用；解包之（普通值原样返回）。 */
export function fieldValue(value) {
	return value && typeof value === "object" && typeof value.get === "function" ? value.get() : value;
}

function parseJsonDoc(text) {
	try {
		const parsed = text ? JSON.parse(text) : {};
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		// GUI 暂存态可能是半个文档；静默忽略。文件级畸形由读取路径响亮报错。
		return {};
	}
}

function readLayerFile(path) {
	if (!existsSync(path)) return {};
	const raw = readFileSync(path, "utf-8").trim();
	if (raw === "") return {};
	const doc = JSON.parse(raw);
	const out = {};
	for (const [key, value] of Object.entries(doc)) {
		if (!key.startsWith("$")) out[key] = value;
	}
	return out;
}

/** 覆盖文档统一读取：兼容 JSON 字符串与已物化对象双形态（$ 前缀键忽略——两路径一致）。 */
export function asDoc(value) {
	const v = fieldValue(value);
	let doc;
	if (v && typeof v === "object" && !Array.isArray(v)) doc = v;
	else if (typeof v === "string" && v.trim() !== "") doc = parseJsonDoc(v);
	else return {};
	const out = {};
	for (const [key, val] of Object.entries(doc)) {
		if (!key.startsWith("$")) out[key] = val;
	}
	return out;
}

/** ("mimo-v2.6-flash", "mimo") → ["mimo-v2.6-flash", "mimo", "default"]（去重；空段跳过）。 */
export function resolveCandidates(model, provider) {
	const chain = [];
	if (typeof model === "string" && model !== "") chain.push(model);
	if (typeof provider === "string" && provider !== "" && provider !== model) chain.push(provider);
	chain.push("default");
	return chain;
}

function overridesPathOf(config) {
	// settings 控制器物化 volatile 字段时可能把字符串默认值写成 {}（旧基线实测）——
	// 非字符串一律视为"无文件层"，编译 set() 需要时用 Config.overrides 显式字符串。
	const o = fieldValue(config?.overrides);
	return typeof o === "string" && o !== "" ? resolve(o) : void 0;
}

function loadRegistry({ registryFile, config }) {
	const registry = readLayerFile(registryFile);
	for (const [key, value] of Object.entries(asDoc(config?.registryJson))) {
		registry[key] = { ...registry[key], ...value };
	}
	return registry;
}

function loadEntries({ layersOverridesPath, config }) {
	const entries = {};
	if (layersOverridesPath !== void 0 && existsSync(layersOverridesPath)) {
		const doc = parseJsonDoc(readFileSync(layersOverridesPath, "utf-8"));
		for (const [key, value] of Object.entries(doc)) {
			if (key.startsWith("$")) continue;
			entries[key] = { ...entries[key], ...value };
		}
	}
	for (const [key, value] of Object.entries(asDoc(config?.entriesJson))) {
		entries[key] = { ...entries[key], ...value };
	}
	return entries;
}

/**
 * 构造 promptbook 服务对象（纯函数集，无状态）。
 * @param {{ registryFile: string, layersDir: string, config?: object }} pack
 *   registryFile/layersDir 指向资源包（默认本包自带；测试注入临时目录）。
 */
export function createPromptbook({ registryFile, layersDir, config = {} }) {
	const pack = { registryFile, layersDir, config };
	return {
		/** 已注册键的完整定义列表（AGENTS 契约面）。 */
		listKeys() {
			return Object.entries(loadRegistry(pack))
				.filter(([key]) => !key.startsWith("$"))
				.map(([key, def]) => ({ key, label: def.label ?? key, fallback: def.fallback }));
		},
		/** 已注册键名。 */
		keys() {
			return this.listKeys().map((k) => k.key);
		},
		/** 键的注册定义（{label, fallback}）；未注册返回 undefined。 */
		definition(key) {
			return loadRegistry(pack)[key];
		},
		/**
		 * 按模型解析一条文本（含 registry.fallback 兜底）。键未注册返回 undefined。
		 * provider 可选（省略时供应商层不可达——解析链退化为 [模型, default]）。
		 */
		resolve(key, model, provider) {
			const entry = loadRegistry(pack)[key];
			if (entry === void 0) return void 0;
			const hit = this.resolveOverride(key, model, provider);
			return hit === void 0 ? entry.fallback : hit;
		},
		/**
		 * 只解析**本地化命中**（D20 透传语义）：entriesJson(GUI) → overrides 文件 →
		 * models/<模型> → models/<供应商> → entries 的 default；**不落 registry.fallback**。
		 * 全链未命中返回 undefined —— 注入通道据此透传官方 persona/工具描述。
		 */
		resolveOverride(key, model, provider) {
			applyPackOps(config, layersDir);
			if (loadRegistry(pack)[key] === void 0) return void 0;
			const entries = loadEntries({ layersOverridesPath: overridesPathOf(config), config });
			const chain = resolveCandidates(model, provider);
			for (const candidate of chain) {
				if (entries[key]?.[candidate] !== void 0) return entries[key][candidate];
			}
			for (const candidate of chain) {
				if (candidate === "default") break;
				const layer = readLayerFile(resolve(layersDir, candidate + ".json"));
				if (layer[key] !== void 0) return layer[key];
			}
			return void 0;
		},
		/**
		 * 注册一个键（消费方插件激活时调用）。**fallback 必填**——它是该键的兜底
		 * 文本。写透 registry.json（持久化）并镜像 Config.registryJson。
		 */
		register(key, definition) {
			if (!key || typeof key !== "string") throw new Error("promptbook.register: key required");
			const fallback = definition?.fallback;
			if (typeof fallback !== "string" || fallback === "") {
				throw new Error(`promptbook.register: key "${key}" must provide a non-empty fallback text`);
			}
			const registry = readLayerFile(registryFile);
			registry[key] = { label: definition?.label ?? key, fallback };
			writeFileSync(registryFile, JSON.stringify(registry, null, "\t") + "\n");
			const mirror = asDoc(config?.registryJson);
			mirror[key] = { label: definition?.label ?? key, fallback };
			if (config) config.registryJson = JSON.stringify(mirror);
		},
		/**
		 * 写一条编译产物到 overrides 文档（compile 工具的落点）。
		 * 编译永不写资源包发布层（models/）。
		 */
		set(key, model, text, compiled) {
			const path = overridesPathOf(config);
			if (path === void 0) {
				throw new Error("promptbook: set() requires Config.overrides (compile writes never touch the pack layers)");
			}
			const raw = existsSync(path) ? readFileSync(path, "utf-8").trim() : "";
			const doc = raw === "" ? {} : JSON.parse(raw);
			const entry = { ...doc[key], [model]: text };
			if (compiled !== void 0) entry.$compiled = { ...entry.$compiled, [model]: compiled };
			doc[key] = entry;
			writeFileSync(path, JSON.stringify(doc, null, "\t") + "\n");
			refreshLayersMirror(layersDir, config);
		}
	};
}

/** 插件装配：提供 promptbook 服务（资源包 = 本包自带 registry.json + models/）。 */
export async function apply(ctx, config) {
	const pb = createPromptbook({
		registryFile: resolve(PKG_DIR, "registry.json"),
		layersDir: resolve(PKG_DIR, "models"),
		config
	});
	ctx.provide("promptbook", pb);
	mirrorSeedKeys(pb, config);
	refreshLayersMirror(resolve(PKG_DIR, "models"), config);

	// 合法模型世界：llm-mimo 托管名单（D4——唯一来源，无事件监听式"检测"）。
	const isHosted = (model) => ctx.llmMimo.listHostedModels().some((m) => m.id === model);
	const systemKey = typeof fieldValue(config?.systemKey) === "string" && fieldValue(config.systemKey) !== ""
		? fieldValue(config.systemKey)
		: DEFAULT_SYSTEM_KEY;

	// 主通道（GUI 可见）：system-prompt/assemble 装配瀑布，返回值权威。
	ctx.on("system-prompt/assemble", createAssembleHandler({ pb, isHosted, systemKey }), { global: true });

	// 兜底通道：llm-mimo dispatch 内问询（结构性只作用于托管路由）。
	const disposeSource = ctx.llmMimo.registerPromptSource(createPromptSource({ pb, isHosted, systemKey }));
	ctx.on("dispose", () => disposeSource());

	ctx.logger?.info?.("promptbook: ready (s1 resolve service + s2 injection channels)");
}

/**
 * 装配瀑布监听器（主通道，纯函数可测）。
 * 模型源 = pending route：框架在装配输入里注入 `assembly.variables.provider/model`
 * （installModelSelection 所为，实测首装配即携带——R5 零滞后要求）；
 * requestHeader 折叠链仅作后备（首个请求头在 dispatch 期才落盘，装配期恒空）。
 * 名单外模型原样透传；hosted 模型的 system 段被整体替换为 resolve(systemKey, model, provider)
 * （sections 组合式：harness:identity / deployment:persona-* / tool:* 等——hosted 时
 * 由 promptbook 段独占，与旧基线 persona 全文替换语义一致），
 * 工具描述按 `tool.<name>` 键逐个改写（未命中的键不动）。
 */
export function createAssembleHandler({ pb, isHosted, systemKey }) {
	return async function promptbookAssemble(assembly, context, next) {
		const result = await next();
		const { provider, model } = pendingRouteOf(result ?? assembly, context);
		if (model === undefined || !isHosted(model)) return result;
		const persona = pb.resolveOverride(systemKey, model, provider);
		if (typeof persona === "string" && persona !== "" && Array.isArray(result.sections)) {
			result.sections = [{ name: "promptbook", order: 0, text: persona }];
		}
		if (Array.isArray(result.tools)) {
			for (const tool of result.tools) {
				const localized = pb.resolveOverride(`tool.${tool.name}`, model, provider);
				if (typeof localized === "string" && localized !== "") tool.description = localized;
			}
		}
		return result;
	};
}

/** 装配 → pending route {provider, model}：variables 优先，requestHeader 链后备（逐字段独立回退）。 */
export function pendingRouteOf(assembly, context) {
	const v = assembly?.variables;
	const header = context?.agent?.session?.requestHeader()?.config;
	const pick = (fromVars, fromHeader) => {
		if (typeof fromVars === "string" && fromVars !== "") return fromVars;
		if (typeof fromHeader === "string" && fromHeader !== "") return fromHeader;
		return undefined;
	};
	return { provider: pick(v?.provider, header?.provider), model: pick(v?.model, header?.model) };
}

/**
 * 种子键镜像进 Config.registryJson（幂等，只在缺键时写）——设置卡的键清单
 * 只读配置命名空间，种子 registry.json 的键由此对卡可见。
 */
export function mirrorSeedKeys(pb, config) {
	if (!config) return;
	const mirror = asDoc(config?.registryJson);
	let changed = false;
	for (const { key, label, fallback } of pb.listKeys()) {
		if (mirror[key] === undefined) {
			mirror[key] = { label, fallback };
			changed = true;
		}
	}
	if (changed) config.registryJson = JSON.stringify(mirror);
}

/**
 * 卡面分层镜像（D23）：overrides 文档 + models/ 资源包层原样打包成一份 JSON 文本，
 * 供浏览器端重放解析链（候选优先序与 resolveOverride 逐分支一致——两层实现必须同步改）。
 * 运行期只有 set() 会改 overrides 文件、包层随包版本冻结，故刷新点 = boot 与 set()。
 */
export function buildLayersMirror(layersDir, overridesPath) {
	const mirror = {};
	let names = [];
	try {
		names = readdirSync(layersDir);
	} catch {
		names = [];
	}
	for (const name of names.sort()) {
		if (!name.endsWith(".json")) continue;
		const stem = name.slice(0, -".json".length);
		if (stem === LAYERS_MIRROR_OVERRIDES_KEY) continue;
		mirror[stem] = readLayerFile(resolve(layersDir, name));
	}
	if (overridesPath !== void 0 && existsSync(overridesPath)) {
		mirror[LAYERS_MIRROR_OVERRIDES_KEY] = parseJsonDoc(readFileSync(overridesPath, "utf-8"));
	}
	mirror[LAYERS_MIRROR_PATHS_KEY] = { layersDir, overridesPath: overridesPath ?? null };
	return mirror;
}

/** 刷新卡面镜像进 Config.layersJson（volatile 活引用直接赋值，设置卡下次 describe 即可见）。 */
export function refreshLayersMirror(layersDir, config) {
	if (!config) return;
	config.layersJson = JSON.stringify(buildLayersMirror(layersDir, overridesPathOf(config)));
}

/**
 * 包层写操作对账（GUI 物理删除通道，owner 2026-10-04 裁决修订包层冻结纪律）：
 * packOpsJson = {deletions:[{key, candidate, ts}]}——对每条把 models/<candidate>.json 里的
 * key 条目**物理删除**（写回磁盘；$ 元数据键原样保留），清空队列并刷新镜像。
 * 惰性对账 = 每次 resolveOverride 前（正常路径配置热重载在保存后即刻触发）；**boot 不对账**。
 * TTL 防陈旧删除复活：超过 PACK_OPS_TTL_MS 的操作只作废不执行（否则「git 恢复文件 +
 * 重启」会被 profile 里持久化的陈旧队列再次删掉）。返回是否实际落盘。
 */
export const PACK_OPS_TTL_MS = 10 * 60 * 1000;

export function applyPackOps(config, layersDir) {
	const ops = asDoc(fieldValue(config?.packOpsJson));
	const deletions = Array.isArray(ops?.deletions) ? ops.deletions : [];
	if (deletions.length === 0) return false;
	let applied = false;
	for (const op of deletions) {
		const { key, candidate, ts } = op ?? {};
		if (typeof key !== "string" || key === "" || key.startsWith("$")) continue;
		if (typeof candidate !== "string" || candidate === "" || candidate.startsWith("$")) continue;
		if (typeof ts !== "number" || Date.now() - ts > PACK_OPS_TTL_MS) continue;
		const path = resolve(layersDir, candidate + ".json");
		if (!existsSync(path)) continue;
		let doc;
		try {
			const raw = readFileSync(path, "utf-8").trim();
			doc = raw === "" ? {} : JSON.parse(raw);
		} catch {
			continue;
		}
		if (doc === null || typeof doc !== "object" || Array.isArray(doc) || !(key in doc)) continue;
		delete doc[key];
		writeFileSync(path, JSON.stringify(doc, null, "\t") + "\n");
		applied = true;
	}
	if (applied) refreshLayersMirror(layersDir, config);
	config.packOpsJson = "{}";
	return applied;
}

/**
 * 兜底通道源（llmMimo.registerPromptSource 输入，纯函数可测）。
 * 契约：返回 undefined = 不改（透传）。dispatch 只对托管路由问询，isHosted 为双保险。
 */
export function createPromptSource({ pb, isHosted, systemKey }) {
	return {
		resolveSystem({ provider, model, system }) {
			if (!isHosted(model)) return undefined;
			const text = pb.resolveOverride(systemKey, model, provider);
			return typeof text === "string" && text !== "" ? text : undefined;
		},
		resolveToolDescription({ provider, model, toolName, description }) {
			if (!isHosted(model)) return undefined;
			const text = pb.resolveOverride(`tool.${toolName}`, model, provider);
			return typeof text === "string" && text !== "" ? text : undefined;
		}
	};
}
