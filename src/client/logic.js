		//#region 纯逻辑（供单测；不依赖 React/宿主）
		/** 安全解析 {key: {model: text}} 文档（畸形→空对象，$ 前缀键忽略）。 */
		function parseEntries(jsonText) {
			if (typeof jsonText !== "string" || jsonText.trim() === "") return {};
			try {
				const parsed = JSON.parse(jsonText);
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
				const out = {};
				for (const [key, models] of Object.entries(parsed)) {
					if (key.startsWith("$") || models === null || typeof models !== "object") continue;
					out[key] = { ...models };
				}
				return out;
			} catch {
				return {};
			}
		}
		/** 把一条覆盖并入 entries 文档（返回 JSON 字符串；text 为 null = 移除该条）。 */
		function mergeEntry(jsonText, key, model, text) {
			const entries = parseEntries(jsonText);
			if (text === null) {
				if (entries[key] === undefined) return JSON.stringify(entries);
				delete entries[key][model];
				if (Object.keys(entries[key]).length === 0) delete entries[key];
			} else {
				entries[key] = { ...entries[key], [model]: String(text) };
			}
			return JSON.stringify(entries);
		}
		/** 某条 (key, model) 是否被用户层覆盖（以 user 层 entriesJson 为准）。 */
		function isOverridden(userEntriesJson, key, model) {
			const v = parseEntries(userEntriesJson)[key]?.[model];
			return typeof v === "string";
		}
		/** 从本插件配置快照提取键选项（registryJson 已由 host 镜像种子键）。 */
		function keyOptionsFromSnapshot(snapshotValue) {
			const raw = typeof snapshotValue?.registryJson === "string" ? safeParse(snapshotValue.registryJson) : {};
			return Object.entries(raw ?? {})
				.filter(([key, def]) => !key.startsWith("$") && def && typeof def === "object" && typeof def.fallback === "string")
				.map(([key, def]) => ({ key, label: typeof def.label === "string" && def.label !== "" ? def.label : key, fallback: def.fallback }))
				.sort((a, b) => a.key.localeCompare(b.key));
		}
		function safeParse(text) {
			try {
				return JSON.parse(text);
			} catch {
				return {};
			}
		}
		/** 卡面镜像里 overrides 文档的保留键（与 host LAYERS_MIRROR_OVERRIDES_KEY 一致）。 */
		const LAYERS_OVERRIDES_KEY = "__overrides__";
		/**
		 * 候选链（host modelCandidates 的卡面副本）：逐级剥末段 → "default" 去重。
		 * 契约：与 host 侧实现逐分支一致（AGENTS §三），改动必须两边同步。
		 */
		function modelCandidates(model) {
			const chain = [];
			let current = String(model ?? "");
			while (current !== "") {
				chain.push(current);
				const cut = current.lastIndexOf("-");
				if (cut <= 0) break;
				current = current.slice(0, cut);
			}
			chain.push("default");
			return [...new Set(chain)];
		}
		/** 卡面分层镜像解包（畸形/非串 → 空对象）。 */
		function layersFromSnapshot(snapshotValue) {
			return typeof snapshotValue?.layersJson === "string" ? safeParse(snapshotValue.layersJson) : {};
		}
		/**
		 * 卡面解析链重放（D23）：候选优先序与 host resolveOverride 逐分支一致——
		 * 每候选先 GUI entriesJson 后编译 overrides 文档（镜像 __overrides__），候选走完
		 * 再包层 models/<候选>（跳过 default），全链未命中落注册表兜底。
		 * 返回 {text, source}；source.layer ∈ gui|compile|model|provider|fallback。
		 */
		function resolveTraced(key, model, docs) {
			const registry = typeof docs?.registryJson === "string" ? safeParse(docs.registryJson) : {};
			const entry = registry?.[key];
			if (!entry || typeof entry.fallback !== "string") return void 0;
			const gui = typeof docs?.entriesJson === "string" ? safeParse(docs.entriesJson) : {};
			const layers = layersFromSnapshot({ layersJson: docs?.layersJson });
			const overridesDoc = layers[LAYERS_OVERRIDES_KEY];
			const chain = modelCandidates(model);
			for (const candidate of chain) {
				if (gui[key]?.[candidate] !== void 0) return { text: gui[key][candidate], source: { layer: "gui" } };
				if (overridesDoc && overridesDoc[key]?.[candidate] !== void 0) return { text: overridesDoc[key][candidate], source: { layer: "compile" } };
			}
			for (const candidate of chain) {
				if (candidate === "default") break;
				const layerDoc = layers[candidate];
				if (layerDoc && typeof layerDoc === "object" && layerDoc[key] !== void 0) {
					return { text: layerDoc[key], source: { layer: candidate === String(model ?? "") ? "model" : "provider", id: candidate } };
				}
			}
			return { text: entry.fallback, source: { layer: "fallback" } };
		}
		/** 镜像路径元数据键（与 host LAYERS_MIRROR_PATHS_KEY 一致）。 */
		const LAYERS_PATHS_KEY = "__paths__";
		/**
		 * 来源 → 文件路径（来源标签的可展开层）：
		 * 模型/家族层 = 资源包 models/<候选>.json；编译层 = overrides 文档；
		 * 兜底 = registry.json；GUI 层 = 实例 profile 的 cordis.patch.yml（settings 控制器落点，S4 实证）。
		 */
		function sourcePathOf(source, layersJson) {
			const paths = layersFromSnapshot({ layersJson })[LAYERS_PATHS_KEY];
			if (!source) return null;
			if (source.layer === "model" || source.layer === "provider") return paths?.layersDir ? `${paths.layersDir}/${source.id}.json` : `models/${source.id}.json`;
			if (source.layer === "compile") return paths?.overridesPath ?? null;
			if (source.layer === "fallback") return "registry.json";
			if (source.layer === "gui") return "cordis.patch.yml（实例 profile）";
			return null;
		}
		/**
		 * 从 llm-mimo 配置快照提取供应商/模型二级选项（与其设置卡同源：主路由 modelsJson
		 * + customProviders 各条目的 modelsJson）。快照不可用返回 []。
		 */
		function hostedOptionsFromLlMimoSnapshot(snapshot) {
			const value = snapshot?.status === "ready" ? snapshot.value : undefined;
			if (value === undefined) return [];
			const providers = [];
			const mainModels = modelsOf(value.modelsJson);
			if (mainModels.length > 0) providers.push({ provider: "mimo", label: providerLabel(value, "mimo"), models: mainModels });
			const customs = value.customProviders && typeof value.customProviders === "object" ? value.customProviders : {};
			if (customs && typeof customs.get === "function") {
				// volatile 物化活引用形态
				const inner = customs.get();
				for (const [route, entry] of Object.entries(inner ?? {})) providers.push({ provider: route, label: providerLabel(entry, route), models: modelsOf(entry?.modelsJson) });
			} else {
				for (const [route, entry] of Object.entries(customs)) providers.push({ provider: route, label: providerLabel(entry, route), models: modelsOf(entry?.modelsJson) });
			}
			return providers.filter((p) => p.models.length > 0);
		}
		function providerLabel(entry, fallback) {
			return typeof entry?.displayName === "string" && entry.displayName !== "" ? entry.displayName : fallback;
		}
		function modelsOf(modelsJson) {
			const parsed = typeof modelsJson === "string" ? safeParse(modelsJson) : modelsJson;
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter((m) => m && typeof m.id === "string")
				.map((m) => ({ id: m.id, name: typeof m.name === "string" && m.name !== "" ? m.name : m.id }))
				.sort((a, b) => a.id.localeCompare(b.id));
		}
		//#endregion
