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
				// GUI 已发起、host 尚未对账落盘的包层物理删除（"key\u0000candidate"）：
				// 重置到下一次 dispatch 对账之间，卡面解析靠它做乐观排他
				pendingPackDeletes: new Set(),
				projection(snapshot) {
					const mimoSnapshot = mimoScope.getSnapshot();
					const hosted = hostedOptionsFromLlMimoSnapshot(mimoSnapshot);
					if (controller.selection.provider === "" && hosted.length > 0) controller.selection = { provider: hosted[0].provider, model: hosted[0].models[0]?.id ?? "", expanded: "" };
					// 镜像已确认删掉的（对账落盘后包层不再含该条目）即从待确认集剪除
					const layersJson = typeof snapshot.value?.layersJson === "string" ? snapshot.value.layersJson : "{}";
					const layerDocs = layersFromSnapshot({ layersJson });
					const pendingPack = [...controller.pendingPackDeletes].filter((entry) => {
						const cut = entry.indexOf("\u0000");
						const doc = layerDocs[entry.slice(cut + 1)];
						return doc && typeof doc === "object" && doc[entry.slice(0, cut)] !== void 0;
					});
					controller.pendingPackDeletes = new Set(pendingPack);
					return {
						...controller.form.shell(),
						writable: snapshot.writable,
						registryJson: snapshot.value?.registryJson ?? "{}",
						entriesJson: snapshot.value?.entriesJson ?? "{}",
						userEntriesJson: typeof snapshot.user?.entriesJson === "string" ? snapshot.user.entriesJson : "",
						layersJson: snapshot.value?.layersJson ?? "{}",
						pendingPack,
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
				},
				// 重置包层来源的命中：物理删除 models/<candidate>.json 里的条目（owner 裁决：
				// 注册值可丢失，重装/升级或 git checkout 恢复）。写入 ops 队列，host 在装配/
				// resolve 时对账落盘；卡面在落盘前用 pendingPack 乐观排他
				async commitPackOp(key, candidate) {
					const raw = scope.getSnapshot().value?.packOpsJson;
					const ops = safeParse(typeof raw === "string" ? raw : "{}");
					const deletions = Array.isArray(ops?.deletions)
						? ops.deletions.filter((d) => !(d && d.key === key && d.candidate === candidate))
						: [];
					deletions.push({ key, candidate, ts: Date.now() });
					controller.form.actions().edit("packOpsJson", JSON.stringify({ deletions }));
					await controller.form.save();
					controller.pendingPackDeletes.add(key + "\u0000" + candidate);
					// 所见即所编：重置后草稿 = 乐观排他下的实际生效文本（回退后的全局 default）
					const snap = scope.getSnapshot();
					const seed = resolveTraced(key, candidate, controller.selection.provider, {
						registryJson: snap.value?.registryJson ?? "{}",
						entriesJson: snap.value?.entriesJson ?? "{}",
						layersJson: snap.value?.layersJson ?? "{}",
						pendingPack: [key + "\u0000" + candidate]
					})?.text ?? "";
					controller.drafts = { ...controller.drafts, [key]: seed };
					controller.store.set(controller.projection(scope.getSnapshot()));
				}
			};
			controller.form = new primitives.SettingsFormModel(scope, [
				(0, primitives.settingsTextField)("entriesJson"),
				(0, primitives.settingsTextField)("packOpsJson")
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
					commitEntry: (key, model, text) => controller.commitEntry(key, model, text),
					commitPackOp: (key, candidate) => controller.commitPackOp(key, candidate)
				})
			}, PromptbookCard))), "promptbook: page");
		}
		//#endregion
