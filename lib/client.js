/**
 * @mimo-codex/dsh-promptbook/client — 设置→插件页的 Promptbook 卡（S3）。
 *
 * 形态照官方样板（dsh-client-ui-settings-web-search/lib/client.js）：
 * window.__ModuleLoader__ 工厂 + plugins.item 插槽 + configForms 命名空间。
 * 数据面（全部纯函数，test/client.test.mjs 经伪 window 工厂直测）：
 *  - 键清单/目标文本 ← 本插件配置命名空间 "promptbook"（registryJson/entriesJson/systemKey/overrides）；
 *  - 供应商/模型二级下拉 ← llm-mimo 配置命名空间快照（modelsJson 解析，与其设置卡同源；
 *    llm-mimo 未加载时下拉降级为空并提示）。
 * 保存语义：逐键编辑合入 entriesJson 后经 SettingsFormModel 分阶段原子写（edit → save）。
 * 渲染层（布局/观感）留视觉验收（decisions D9）；本文件只保证逻辑与结构正确。
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
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region locales
		const en = {
			title: "Promptbook",
			description: "Per-model localization of the system prompt and tool descriptions (llm-mimo hosted models only).",
			systemKey: "System prompt key",
			systemKeyHint: "Registry key resolved into the system prompt for hosted models.",
			entries: "Per-model texts",
			provider: "Provider",
			model: "Model",
			key: "Key",
			draft: "Text",
			draftHint: "Empty string clears nothing — use Clear to remove an override.",
			set: "Set for this model",
			clear: "Clear this override",
			noHosted: "llm-mimo is not loaded; provider/model lists are unavailable.",
			overridden: "Overridden",
			reset: "Reset to default",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			overridesPath: "Compile overrides file",
			overridesPathHint: "Path where compiler set() writes land. Leave blank to disable."
		};
		const zh = {
			title: "提示词簿",
			description: "按模型本地化系统提示词与工具描述（仅 llm-mimo 托管模型生效）。",
			systemKey: "系统提示词键",
			systemKeyHint: "hosted 模型装配时解析为此键的文本作为系统提示词。",
			entries: "逐模型文本",
			provider: "供应商",
			model: "模型",
			key: "键",
			draft: "文本",
			draftHint: "留空保存不等于清除——清除请用「清除该覆盖」。",
			set: "保存该模型的覆盖",
			clear: "清除该覆盖",
			noHosted: "llm-mimo 未加载，供应商/模型列表不可用。",
			overridden: "已覆盖",
			reset: "恢复默认",
			invalidNumber: "请填数字；留空表示使用默认值。",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			overridesPath: "编译产物文件",
			overridesPathHint: "编译 set() 的落点路径；留空表示不启用。"
		};
		//#endregion
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
		//#region 卡组件
		function PromptbookCard(props) {
			const { t } = props;
			const state = props.usePromptbookCard((snapshot) => snapshot);
			if (props.view === "summary") return t("description");
			const disabled = !state.writable;
			const hosted = state.hosted;
			const keyOptions = state.keyOptions;
			const sel = state.selection;
			const draft = state.draft;
			const currentText = sel.key && sel.model ? (parseEntries(state.entriesJson)[sel.key]?.[sel.model] ?? "") : "";
			return (0, jsx.jsxs)(primitives.SettingsForm, {
				labels: {
					unavailable: t("unavailable"),
					readOnly: t("readOnly"),
					saveFailed: t("saveFailed"),
					save: t("save"),
					saving: t("saving")
				},
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					(0, jsx.jsx)(primitives.SettingsValueField, {
						id: "plugin-config-promptbook-systemkey",
						label: t("systemKey"),
						hint: t("systemKeyHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.systemKey,
						onEdit: (text) => props.edit("systemKey", text),
						onReset: () => props.resetField("systemKey")
					}),
					(0, jsx.jsxs)("fieldset", {
						style: { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: "8px 12px", display: "grid", gap: 8 },
						children: [
							(0, jsx.jsx)("legend", { style: { fontSize: 13, padding: "0 6px" }, children: t("entries") }),
							hosted.length === 0
								? (0, jsx.jsx)("div", { style: { fontSize: 13 }, children: t("noHosted") })
								: (0, jsx.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
										(0, jsx.jsxs)("select", {
											"aria-label": t("provider"),
											value: sel.provider,
											onChange: (event) => props.pick("provider", event.target.value),
											children: hosted.map((p) => (0, jsx.jsx)("option", { value: p.provider, children: `${p.label} (${p.models.length})` }, p.provider))
										}),
										(0, jsx.jsxs)("select", {
											"aria-label": t("model"),
											value: sel.model,
											onChange: (event) => props.pick("model", event.target.value),
											children: (hosted.find((p) => p.provider === sel.provider)?.models ?? []).map((m) => (0, jsx.jsx)("option", { value: m.id, children: m.name }, m.id))
										})
									] }),
							(0, jsx.jsxs)("select", {
								"aria-label": t("key"),
								value: sel.key,
								onChange: (event) => props.pick("key", event.target.value),
								children: [
									(0, jsx.jsx)("option", { value: "", children: "—" }),
									...keyOptions.map((k) => (0, jsx.jsx)("option", { value: k.key, children: k.key === k.label ? k.key : `${k.key} · ${k.label}` }, k.key))
								]
							}),
							(0, jsx.jsxs)("textarea", {
								"aria-label": t("draft"),
								placeholder: currentText === "" ? "" : currentText,
								value: draft,
								rows: 4,
								onChange: (event) => props.pick("draft", event.target.value),
								style: { width: "100%", font: "inherit" }
							}),
							(0, jsx.jsxs)("div", { style: { display: "flex", gap: 8 }, children: [
								(0, jsx.jsx)(primitives.Button, {
									variant: "secondary",
									disabled: disabled || !sel.key || !sel.model,
									onClick: () => props.commitEntry(sel.key, sel.model, draft),
									children: t("set")
								}),
								(0, jsx.jsx)(primitives.Button, {
									variant: "secondary",
									disabled: disabled || !isOverridden(state.userEntriesJson, sel.key, sel.model),
									onClick: () => props.commitEntry(sel.key, sel.model, null),
									children: t("clear")
								}),
								sel.key && sel.model && isOverridden(state.userEntriesJson, sel.key, sel.model)
									? (0, jsx.jsx)("span", { style: { fontSize: 12, alignSelf: "center" }, children: t("overridden") })
									: null
							] })
						]
					}),
					(0, jsx.jsx)(primitives.SettingsValueField, {
						id: "plugin-config-promptbook-overrides",
						label: t("overridesPath"),
						hint: t("overridesPathHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.overrides,
						onEdit: (text) => props.edit("overrides", text),
						onReset: () => props.resetField("overrides")
					})
				]
			});
		}
		//#endregion
		//#region 控制器 + apply
		const NS = "settings.promptbook";
		const PB_NS = "promptbook";
		const LLM_MIMO_NS = "llm-mimo";
		const inject = ["slots", "locale", "configForms"];
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "promptbook: dictionaries");
			const scope = ctx.configForms.get(PB_NS);
			const mimoScope = ctx.configForms.get(LLM_MIMO_NS);
			const controller = {
				selection: { provider: "", model: "", key: "" },
				draft: "",
				projection(snapshot) {
					const mimoSnapshot = mimoScope.getSnapshot();
					const hosted = hostedOptionsFromLlMimoSnapshot(mimoSnapshot);
					if (controller.selection.provider === "" && hosted.length > 0) controller.selection = { provider: hosted[0].provider, model: hosted[0].models[0]?.id ?? "", key: "" };
				return {
					...controller.form.shell(),
					writable: snapshot.writable,
					entriesJson: snapshot.value?.entriesJson ?? "{}",
					userEntriesJson: typeof snapshot.user?.entriesJson === "string" ? snapshot.user.entriesJson : "",
					keyOptions: keyOptionsFromSnapshot(snapshot.value),
					hosted,
					selection: { ...controller.selection },
					draft: controller.draft,
					systemKey: controller.form.field("systemKey"),
					overrides: controller.form.field("overrides")
				};
				},
				pick(field, value) {
					if (field === "provider") controller.selection = { ...controller.selection, provider: value, model: "" };
					else if (field === "model") controller.selection = { ...controller.selection, model: value };
					else if (field === "key") controller.selection = { ...controller.selection, key: value };
					else if (field === "draft") controller.draft = value;
					controller.store.set(controller.projection(scope.getSnapshot()));
				},
				async commitEntry(key, model, text) {
					const merged = mergeEntry(scope.getSnapshot().value?.entriesJson ?? "{}", key, model, text);
					controller.form.actions().edit("entriesJson", merged);
					await controller.form.save();
					controller.draft = "";
					controller.store.set(controller.projection(scope.getSnapshot()));
				}
			};
			controller.form = new primitives.SettingsFormModel(scope, [
				(0, primitives.settingsTextField)("systemKey"),
				(0, primitives.settingsTextField)("entriesJson"),
				(0, primitives.settingsTextField)("overrides")
			], []);
			controller.store = controller.form.bind(() => controller.projection(scope.getSnapshot()));
			const offMimo = mimoScope.subscribe(() => controller.store.set(controller.projection(scope.getSnapshot())));
			ctx.effect(() => () => {
				offMimo();
				controller.form.dispose();
			}, "promptbook: form subscription");
			ctx.effect(() => ctx.configForms.whileServed([PB_NS], () => ctx.slots.inject("plugins.item", () => ctx.slots.register({
				name: "plugins.item",
				id: "promptbook",
				order: 50,
				label: () => t("title"),
				locale: NS,
				inject: () => ({
					hooks: { promptbookCard: controller.store },
					save: controller.form.actions().save,
					discard: controller.form.actions().discard,
					edit: controller.form.actions().edit,
					resetField: controller.form.actions().resetField,
					pick: (field, value) => controller.pick(field, value),
					commitEntry: (key, model, text) => controller.commitEntry(key, model, text)
				})
			}, PromptbookCard))), "promptbook: page");
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		exports.parseEntries = parseEntries;
		exports.mergeEntry = mergeEntry;
		exports.isOverridden = isOverridden;
		exports.keyOptionsFromSnapshot = keyOptionsFromSnapshot;
		exports.hostedOptionsFromLlMimoSnapshot = hostedOptionsFromLlMimoSnapshot;
		return module.exports;
	}
});
