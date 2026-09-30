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
