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
