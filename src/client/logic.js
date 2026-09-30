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
				.map(([key, def]) => ({ key, label: typeof def.label === "string" && def.label !== "" ? def.label : key }))
				.sort((a, b) => a.key.localeCompare(b.key));
		}
		function safeParse(text) {
			try {
				return JSON.parse(text);
			} catch {
				return {};
			}
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
