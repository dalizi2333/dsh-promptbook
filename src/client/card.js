		//#region 卡组件
		function PromptbookCard(props) {
			const { t } = props;
			const state = props.usePromptbookCard((snapshot) => snapshot);
			// —— 视图态：下拉浮层（供应商/模型）为卡级本地状态 ——
			const [pop, setPop] = react.useState(null);
			const [popClosing, setPopClosing] = react.useState(false);
			const popRef = react.useRef(null);
			const triggerRefs = react.useRef({});
			const bodyRef = react.useRef(null);
			const [hoverBox, setHoverBox] = react.useState(null);
			const [hoverInstant, setHoverInstant] = react.useState(false);
			const hoverOnRef = react.useRef(false);
			const hoverKeyRef = react.useRef(null);
			const hoverRectRef = react.useRef(null);
			const hoverOffAtRef = react.useRef(0);
			const closePop = () => {
				if (!pop || popClosing) return;
				setPopClosing(true);
				window.setTimeout(() => {
					setPop(null);
					setPopClosing(false);
				}, 200);
			};
			// 对位：激活行钉在触发钮的屏幕高度上（头向上弹，其余向下弹）——llm-mimo 同款。
			const placePop = () => {
				const card = popRef.current;
				const trigger = triggerRefs.current[pop];
				if (!card || !trigger) return;
				const tr = trigger.getBoundingClientRect();
				const head = card.querySelector(".pb-pophead");
				const active = card.querySelector(".pb-popline.active");
				const activeOffset = active ? active.offsetTop : (head?.offsetHeight ?? 22);
				card.style.top = `${Math.round(tr.top - activeOffset)}px`;
				card.style.left = `${Math.round(tr.left - 6)}px`;
				card.style.width = `${Math.round(tr.width + 12)}px`;
			};
			react.useEffect(() => {
				if (!pop) return;
				const onDocMousedown = (event) => {
					if (popRef.current?.contains(event.target)) return;
					if (triggerRefs.current[pop]?.contains(event.target)) return;
					closePop();
				};
				const reposition = () => placePop();
				document.addEventListener("mousedown", onDocMousedown, true);
				window.addEventListener("resize", reposition);
				document.addEventListener("scroll", reposition, true);
				return () => {
					document.removeEventListener("mousedown", onDocMousedown, true);
					window.removeEventListener("resize", reposition);
					document.removeEventListener("scroll", reposition, true);
				};
			}, [pop, popClosing]);
			react.useLayoutEffect(() => {
				if (pop) placePop();
			}, [pop]);
			react.useEffect(() => {
				if (!pop) return;
				const timer = window.setTimeout(() => placePop(), 260);
				return () => window.clearTimeout(timer);
			}, [pop]);
			// 【暂时关闭】旅行悬浮框：缝合卡重构后落框几何需重校，待展开过渡定稿再开。
			const PB_TRAVEL_FRAME = false;
			react.useEffect(() => {
				if (!PB_TRAVEL_FRAME || !state.available) return;
				const body = bodyRef.current;
				if (!body) return;
				const measure = (el) => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight, radius: 10, on: true });
				const sameRect = (a, b) => !!a && !!b && Math.abs(a.top - b.top) < 0.1 && Math.abs(a.left - b.left) < 0.1 && Math.abs(a.width - b.width) < 0.1 && Math.abs(a.height - b.height) < 0.1;
				const resolveSpot = (el) => {
					const spot = el?.closest?.(".pb-keyitem");
					return spot && body.contains(spot) ? spot : null;
				};
				const push = (rect, animate) => {
					if (hoverOnRef.current && !animate && sameRect(hoverRectRef.current, rect)) return;
					hoverRectRef.current = rect;
					if (!hoverOnRef.current) {
						hoverOnRef.current = true;
						setHoverInstant(true);
						setHoverBox(rect);
						requestAnimationFrame(() => requestAnimationFrame(() => setHoverInstant(false)));
						return;
					}
					setHoverInstant(!animate);
					setHoverBox(rect);
				};
				const applyHover = (el) => {
					const spot = resolveSpot(el);
					if (!spot) {
						if (hoverOnRef.current) {
							hoverOffAtRef.current = Date.now();
							hoverOnRef.current = false;
							setHoverBox((prev) => prev && { ...prev, on: false });
						}
						hoverKeyRef.current = null;
						return;
					}
					const keyChanged = hoverKeyRef.current !== spot;
					hoverKeyRef.current = spot;
					const rect = measure(spot);
					if (!hoverOnRef.current && hoverRectRef.current && Date.now() - hoverOffAtRef.current < 200) {
						hoverOnRef.current = true;
						hoverRectRef.current = rect;
						setHoverInstant(false);
						setHoverBox(rect);
						return;
					}
					push(rect, keyChanged);
				};
				const over = (event) => applyHover(event.target);
				document.addEventListener("mouseover", over);
				return () => document.removeEventListener("mouseover", over);
			}, [state.available]);
			if (props.view === "summary") return t("description");
			if (!state.available) return (0, jsx.jsx)("p", { role: "status", style: NOTICE_STYLE.tertiary, children: t("unavailable") });
			// 卡面 = 编辑主流程；systemKey/overrides 是管道配置，留在 Config 契约层（D22）。
			const disabled = !state.writable;
			const hosted = state.hosted;
			const sel = state.selection;
			const currentProvider = hosted.find((p) => p.provider === sel.provider);
			const modelDisplay = currentProvider?.models.find((m) => m.id === sel.model)?.name ?? sel.model;
			const docs = { registryJson: state.registryJson, entriesJson: state.entriesJson, layersJson: state.layersJson, model: sel.model };
			// 键行工厂：唯一 consistently-mounted 键行（collapsed/expanded 状态类，DOM 跨态复用），
			// 来源标签（pb-source）为每键唯一常驻元素；分离由外层 wrapper/内卡的双层过渡承担。
			const keyItem = (k, isExpanded) => {
				const overridden = isOverridden(state.userEntriesJson, k.key, sel.model);
				const traced = resolveTraced(k.key, sel.model, docs);
				const preview = overridden ? (parseEntries(state.userEntriesJson)[k.key]?.[sel.model] ?? "") : (traced?.text ?? "");
				const sourceTitle = overridden ? t("sourceGui") : sourceTitleText(traced?.source, modelDisplay, t);
				const rowDraft = state.drafts[k.key] ?? "";
				const pathText = sourcePathOf(traced?.source, state.layersJson);
				const line = (0, jsx.jsxs)("div", {
					className: "pb-keyrow " + (isExpanded ? "expanded" : "collapsed"),
					style: { display: "grid", gridTemplateColumns: isExpanded ? "14px 50% minmax(0, 1fr)" : "14px 100px 1fr", gap: 8, alignItems: "center", minWidth: 0 },
					children: [
						(0, jsx.jsx)("span", { className: "pb-dot", role: "img", "aria-label": sourceTitle, style: { background: dotColorOf(traced?.source) } }),
						(0, jsx.jsx)("span", { className: "pb-keyname", style: { fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dsw-alias-label-primary)" }, children: k.key }),
						// 正文预览已并入下方常驻编辑器（M3-R3：textarea 折叠态扁平化即预览，
						// 同一元素连续过渡），本行只剩 灯/键名/来源 三列
						(0, jsx.jsxs)("span", { className: "pb-source" + (isExpanded ? " expanded" : ""), children: [
							(0, jsx.jsx)("span", { children: `【${sourceTitle}】` }),
							pathText ? (0, jsx.jsx)("span", { className: "pb-path", children: pathText }) : null
						] })
					]
				});
				// 编辑器常驻挂载（M3-R7）：开合由 .open 切换 grid-rows 0fr↔1fr 过渡，
				// 折叠不再瞬摘——双向都是连续动画；隐藏态 visibility 隔离聚焦与命中
				return (0, jsx.jsxs)(jsx.Fragment, { children: [
					line,
					(0, jsx.jsxs)("div", { className: "pb-editorwrap" + (isExpanded ? " open" : ""), children: [(0, jsx.jsxs)("div", {
						className: "pb-editor",
						onClick: (event) => event.stopPropagation(),
						style: { display: "grid", gap: 6 },
						children: [
							(0, jsx.jsx)("textarea", {
								className: "pb-ta" + (overridden ? " pb-overridden" : ""),
								"aria-label": `${k.key} · ${t("draft")}`,
								placeholder: overridden ? "" : preview,
								value: isExpanded ? rowDraft : preview,
								rows: 4,
								tabIndex: isExpanded ? 0 : -1,
								onChange: (event) => props.pick("draft", k.key, event.target.value)
							}),
							(0, jsx.jsx)("p", { style: NOTICE_STYLE.tertiary, children: t("draftHint") }),
								(0, jsx.jsxs)("div", { className: "pb-editoractions", children: [
								(0, jsx.jsx)(primitives.Button, {
									variant: "secondary",
									disabled: disabled || rowDraft === "",
									onClick: () => props.commitEntry(k.key, sel.model, rowDraft),
									children: t("set")
								}),
								(0, jsx.jsx)(primitives.Button, {
									variant: "secondary",
									disabled: disabled || !overridden,
									onClick: () => props.commitEntry(k.key, sel.model, null),
									children: t("clear")
								})
							] })
						]
					})] })
				] });
			};
			const expIdx = state.keyOptions.findIndex((k) => k.key === sel.expanded);
			// 截断判定封装在键元素生命周期里：每次 React 提交后全量重算（展开/折叠/换模型/
			// 列宽变化都会触发）。悬浮中的元素只加不撤（弹出态测量失真，撤类会引发震荡）。
			react.useEffect(() => {
				if (!state.available) return;
				const measureAll = () => {
					for (const item of document.querySelectorAll(".pb-keyitem")) {
						const isExpItem = !!item.querySelector(".pb-keyrow.expanded");
						const keyname = item.querySelector(".pb-keyname");
						if (keyname && !keyname.matches(":hover") && getComputedStyle(keyname).boxShadow === "none") {
							keyname.classList.toggle("pb-clipped", keyname.scrollWidth > keyname.clientWidth);
						}
						const src = item.querySelector(".pb-source");
						if (!src) continue;
						// 徽标自然宽度入 CSS 变量：悬停让位 padding 用它精确截断（M3-R5），
						// 隐藏态 scrollWidth 也量得到（max-width:0 不影响 scrollWidth）
						item.style.setProperty("--src-w", src.scrollWidth + "px");
						// 折叠徽标是瞬态显形（隐藏态 scrollWidth 恒大于 0），“截断”只对展开态有意义，
						// 否则 pb-clipped 常开、指针蹭到右缘就误触弹卡（M2-R6）
						if (isExpItem && !src.matches(":hover") && getComputedStyle(src).boxShadow === "none") {
							src.classList.toggle("pb-clipped", src.scrollWidth > src.clientWidth);
						}
						// P2 绕过分支（F9）：寻址元素在展开态若 总宽 ≤ 半卡，则完全无视裁剪/弹卡
						// （isExpItem 在归档版未定义——ReferenceError 令测量管线死在首个键项，fit 从未生效）
						if (isExpItem) {
							const halfCard = item.clientWidth * 0.5;
							src.classList.toggle("pb-fit", src.scrollWidth <= halfCard);
							if (src.classList.contains("pb-fit")) src.classList.remove("pb-clipped");
						} else {
							src.classList.remove("pb-fit");
						}
					}
				};
				const raf = requestAnimationFrame(measureAll);
				// 展开/折叠过渡（缝线、解包、路径展开）落定后补测一次，消除瞬态误判；
				// 字体加载会改变文本宽度——就绪后也重算一次。
				const settle = window.setTimeout(measureAll, 400);
				document.fonts?.ready?.then(() => measureAll()).catch(() => {});
				const clip = (event) => {
					// 假行彩蛋显形：触发区缩到小点本身
					const eggdot = event.target?.closest?.(".pb-eggdot");
					document.querySelector(".pb-endrow")?.classList.toggle("pb-eggshow", !!eggdot);
					const item = event.target?.closest?.(".pb-keyitem");
					if (!item) return;
					const keyname = item.querySelector(".pb-keyname");
					if (keyname && !keyname.matches(":hover") && getComputedStyle(keyname).boxShadow === "none") {
						keyname.classList.toggle("pb-clipped", keyname.scrollWidth > keyname.clientWidth);
					}
					// 折叠徽标不参与截断判定（M2-R6，同 measureAll）；徽标宽度变量同机写入（M3-R5）
					const src = item.querySelector(".pb-source");
					if (src) {
						item.style.setProperty("--src-w", src.scrollWidth + "px");
						if (item.querySelector(".pb-keyrow.expanded") && !src.matches(":hover") && getComputedStyle(src).boxShadow === "none") {
							src.classList.toggle("pb-clipped", src.scrollWidth > src.clientWidth);
						}
					}
				};
				document.addEventListener("mouseover", clip);
				document.addEventListener("mouseout", clip);
				return () => {
					cancelAnimationFrame(raf);
					window.clearTimeout(settle);
					document.removeEventListener("mouseover", clip);
					document.removeEventListener("mouseout", clip);
				};
			}, [state.available, state.keyOptions, state.selection]);
			const popLine = (label, meta, active, onPick, key) => (0, jsx.jsxs)("button", {
				type: "button",
				className: "pb-popline" + (active ? " active" : ""),
				onClick: onPick,
				children: [(0, jsx.jsx)("span", { title: label, style: { overflow: "hidden", textOverflow: "ellipsis" }, children: label }), meta ? (0, jsx.jsx)("span", { className: "pb-popmeta", children: meta }) : null]
			}, key);
			const popOptions = pop === "provider"
				? hosted.map((p) => popLine(p.label, `${p.models.length}`, p.provider === sel.provider, () => {
					props.pick("provider", "", p.provider);
					closePop();
				}, p.provider))
				: (currentProvider?.models ?? []).map((m) => popLine(m.name, null, m.id === sel.model, () => {
					props.pick("model", "", m.id);
					closePop();
				}, m.id));
			return (0, jsx.jsxs)("div", { style: { display: "grid", gap: 12 }, children: [
				(0, jsx.jsx)("style", { children: PB_STYLES }),
				!state.writable ? (0, jsx.jsx)("p", { role: "status", style: NOTICE_STYLE.secondary, children: t("readOnly") }) : null,
				(0, jsx.jsxs)("div", { ref: bodyRef, className: "pb-body", style: { position: "relative", display: "grid" }, children: [
					(0, jsx.jsx)("div", {
						className: "pb-hoverbox" + (hoverBox?.on ? " on" : "") + (hoverInstant ? " instant" : ""),
						style: hoverBox ? { top: hoverBox.top, left: hoverBox.left, width: hoverBox.width, height: hoverBox.height, borderRadius: hoverBox.radius } : undefined
					}),
					hosted.length === 0 ? (0, jsx.jsx)("div", { style: { fontSize: 13 }, children: t("noHosted") }) : (0, jsx.jsxs)(jsx.Fragment, { children: [
						(0, jsx.jsxs)("div", { className: "pb-fillcard pb-stitch", style: { borderRadius: expIdx === 0 ? "12px" : "12px 12px 0 0" }, children: [
							(0, jsx.jsx)("div", { className: "pb-chead", children: t("entries") }),
							(0, jsx.jsxs)("div", { className: "pb-pickrow", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
								(0, jsx.jsxs)("button", {
									type: "button",
									ref: (el) => (triggerRefs.current.provider = el),
									className: "pb-trigger",
									"aria-label": t("provider"),
									"aria-expanded": pop === "provider",
									onClick: () => setPop((prev) => (prev === "provider" ? null : "provider")),
									children: [
										(0, jsx.jsx)("span", { children: `${currentProvider?.label ?? sel.provider} (${currentProvider?.models.length ?? 0})` }),
										(0, jsx.jsx)("span", { className: "pb-caret", children: "▾" })
									]
								}),
								(0, jsx.jsxs)("button", {
									type: "button",
									ref: (el) => (triggerRefs.current.model = el),
									className: "pb-trigger",
									"aria-label": t("model"),
									"aria-expanded": pop === "model",
									onClick: () => setPop((prev) => (prev === "model" ? null : "model")),
									children: [
										(0, jsx.jsx)("span", { children: modelDisplay }),
										(0, jsx.jsx)("span", { className: "pb-caret", children: "▾" })
									]
								})
							] }),
							(0, jsx.jsx)("p", { style: NOTICE_STYLE.tertiary, children: t("rowsHint") })
						] }),
						...state.keyOptions.map((k, j) => {
							const isExp = j === expIdx;
							const groupStart = isExp || (expIdx !== -1 && j === expIdx + 1);
							// 组尾 = 下方有断缝的卡（自身展开，或下一张是展开卡）：上缝方角 + 下缘圆角。
							// 末键贴着假行时不算组尾——它是缝中卡（下缘方角），收口由假行的圆角底负责
							const groupEnd = isExp || j + 1 === expIdx;
							const marginTop = j === 0 ? (isExp ? 8 : -12) : (groupStart ? 8 : -12);
							const borderRadius = groupStart && groupEnd ? "12px" : groupStart ? "12px 12px 0 0" : groupEnd ? "0 0 12px 12px" : "0px";
							return (0, jsx.jsx)("div", {
								className: "pb-rowwrap",
								style: { marginTop: `${marginTop}px` },
								children: (0, jsx.jsx)("div", {
									className: "pb-fillcard pb-keycard pb-keyitem",
									style: { borderRadius },
									onClick: () => props.pick("expand", k.key, isOverridden(state.userEntriesJson, k.key, sel.model) ? (parseEntries(state.userEntriesJson)[k.key]?.[sel.model] ?? "") : ""),
									children: keyItem(k, isExp)
								}, k.key)
							}, k.key);
						}),
						(0, jsx.jsx)("div", {
							className: "pb-fillcard pb-endrow",
							// 附着态 -6px：恰好吃满末键卡 6px 底 padding，不进内容（M2-R3）——
							// 文本到卡底总间距 = 假行可见 14px，与历史形态一致
							style: expIdx === state.keyOptions.length - 1
								? { marginTop: "8px", borderRadius: "12px" }
								: { marginTop: "-6px", borderRadius: "0 0 12px 12px" },
							children: [
								(0, jsx.jsx)("span", { className: "pb-eggdot" }),
								(0, jsx.jsx)("span", { className: "pb-eggtext", children: "用户也不知道要放什么但必须得有这个假行" })
							]
						}, "pb-endrow"),
					] })
				] }),
				state.failed ? (0, jsx.jsx)("p", { role: "status", style: NOTICE_STYLE.error, children: t("saveFailed") }) : null,
				(pop || popClosing) ? (0, jsx.jsxs)("div", { ref: popRef, className: "pb-pop" + (popClosing ? " closing" : ""), role: "listbox", children: [
					(0, jsx.jsx)("div", { className: "pb-pophead", children: pop === "provider" ? t("provider") : t("model") }),
					...popOptions
				] }) : null
			] });
		}
		//#endregion
