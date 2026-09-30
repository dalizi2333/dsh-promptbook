		//#region 控制器 + apply
		const NS = "settings.promptbook";
		const PB_NS = "promptbook";
		const LLM_MIMO_NS = "llm-mimo";
		const PKG_NAME = "@mimo-codex/dsh-promptbook";
		const inject = ["slots", "locale", "configForms"];
		/** 插件页挂载：配置命名空间 + llm-mimo 快照派生 + 缝合键行卡。 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			const scope = ctx.configForms.get(PB_NS);
			const mimoScope = ctx.configForms.get(LLM_MIMO_NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "promptbook: dictionaries");
			const controller = {
				selection: { provider: "", model: "", expanded: "" },
				drafts: {},
				projection(snapshot) {
					const mimoSnapshot = mimoScope.getSnapshot();
					const hosted = hostedOptionsFromLlMimoSnapshot(mimoSnapshot);
					if (controller.selection.provider === "" && hosted.length > 0) controller.selection = { provider: hosted[0].provider, model: hosted[0].models[0]?.id ?? "", expanded: "" };
					return {
						...controller.form.shell(),
						writable: snapshot.writable,
						registryJson: snapshot.value?.registryJson ?? "{}",
						entriesJson: snapshot.value?.entriesJson ?? "{}",
						userEntriesJson: typeof snapshot.user?.entriesJson === "string" ? snapshot.user.entriesJson : "",
						layersJson: snapshot.value?.layersJson ?? "{}",
						keyOptions: keyOptionsFromSnapshot(snapshot.value),
						hosted,
						selection: { ...controller.selection },
						drafts: { ...controller.drafts }
					};
				},
				pick(field, key, value) {
					if (field === "provider") {
						const hosted = hostedOptionsFromLlMimoSnapshot(mimoScope.getSnapshot());
						controller.selection = { provider: value, model: hosted.find((p) => p.provider === value)?.models[0]?.id ?? "", expanded: "" };
						controller.drafts = {};
					} else if (field === "model") {
						controller.selection = { ...controller.selection, model: value, expanded: "" };
						controller.drafts = {};
					} else if (field === "expand") {
						if (controller.selection.expanded === key) {
							controller.selection = { ...controller.selection, expanded: "" };
						} else {
							controller.selection = { ...controller.selection, expanded: key };
							controller.drafts = { ...controller.drafts, [key]: typeof value === "string" ? value : "" };
						}
					} else if (field === "draft") {
						controller.drafts = { ...controller.drafts, [key]: value };
					}
					controller.store.set(controller.projection(scope.getSnapshot()));
				},
				async commitEntry(key, model, text) {
					const merged = mergeEntry(scope.getSnapshot().value?.entriesJson ?? "{}", key, model, text);
					controller.form.actions().edit("entriesJson", merged);
									await controller.form.save();
									controller.drafts = { ...controller.drafts, [key]: text };
									controller.store.set(controller.projection(scope.getSnapshot()));
				}
			};
			controller.form = new primitives.SettingsFormModel(scope, [
				(0, primitives.settingsTextField)("entriesJson")
			], []);
			controller.store = controller.form.bind(() => controller.projection(scope.getSnapshot()));
			const offMimo = mimoScope.subscribe(() => controller.store.set(controller.projection(scope.getSnapshot())));
			ctx.effect(() => () => {
				offMimo();
				controller.form.dispose();
			}, "promptbook: form subscription");
			// 配置卡走 plugins.bundle.config（key=包名）：渲染在「已安装」→ 本包详情页，
			// 官方契约明确 plugins.item 被官方设置页占用（voice-input 同款先例）。
			ctx.effect(() => ctx.configForms.whileServed([PB_NS], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: PKG_NAME,
				locale: NS,
				inject: () => ({
					hooks: { promptbookCard: controller.store },
					pick: (field, key, value) => controller.pick(field, key, value),
					commitEntry: (key, model, text) => controller.commitEntry(key, model, text)
				})
			}, PromptbookCard))), "promptbook: page");
		}
		//#endregion
