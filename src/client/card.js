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
			// 旅行悬浮框（M3-R18c 恢复 → R18d 独立圆角条 → R18e 纵向贴合文字线 →
			// R18f/g 展开态框=收起钮）：横向内收 8、圆角固定 10，不随缝合卡缘；折叠行以
			// keyrow 内容线为基准上下各放 3px；展开态整卡不再画框——框落到收起钮
			// （矩形原样+14px 圆角=复刻钮的 :hover 胶囊底色，hover 到展开卡任何位置都
			// 映射到钮上）；层序对齐 llm-mimo——框 z2 盖卡面，动作钮 z3 豁免。
			const PB_TRAVEL_FRAME = true;
			const sameRect = (a, b) => !!a && !!b && Math.abs(a.top - b.top) < 0.1 && Math.abs(a.left - b.left) < 0.1 && Math.abs(a.width - b.width) < 0.1 && Math.abs(a.height - b.height) < 0.1;
			const measure = (el) => {
				const row = el.querySelector(".pb-keyrow");
				if (row && row.classList.contains("expanded")) {
					const btn = el.querySelector(".pb-collapsebtn");
					// 框=钮矩形原样+同款 14px 圆角（R18g）：钮身透明，框色透过来即复刻
					// 之前调好的 :hover 胶囊底色，单层不叠
					if (btn) return { top: btn.offsetTop, left: btn.offsetLeft, width: btn.offsetWidth, height: btn.offsetHeight, radius: 14, on: true };
				} else if (row) {
					return { top: row.offsetTop - 3, left: el.offsetLeft + 8, width: el.offsetWidth - 16, height: row.offsetHeight + 6, radius: 10, on: true };
				}
				return { top: el.offsetTop + 4, left: el.offsetLeft + 8, width: el.offsetWidth - 16, height: el.offsetHeight - 8, radius: 10, on: true };
			};
			const resolveSpot = (el) => {
				const spot = el?.closest?.(".pb-keyitem");
				return spot && bodyRef.current?.contains(spot) ? spot : null;
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
			const transferAtRef = react.useRef(0);
			const applyHover = (el) => {
				let spot = resolveSpot(el);
				// 展开卡只有收起钮本身触发悬浮（R18f）。钮外分两种（R18h）：
				// 卡内钮外=真实悬停非触发区，立即熄框（不吃转移豁免——绿框位仍亮即此漏）；
				// 卡外=离场或转移后的浏览器 hover 重算，吃 400ms 豁免
				let forceOff = false;
				if (spot) {
					const row = spot.querySelector(".pb-keyrow");
					if (row?.classList.contains("expanded") && !el?.closest?.(".pb-collapsebtn")) {
						spot = null;
						forceOff = true;
					}
				}
				if (!spot) {
					// 转移后 400ms 内不熄框（R18f）：收卡瞬间 DOM 变化触发浏览器 hover 重算，
					// 指针下方已无键卡——mouseover 的关框会抢先吃掉刚转移回来的框
					if (hoverOnRef.current && (forceOff || Date.now() - transferAtRef.current > 400)) {
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
			react.useEffect(() => {
				if (!PB_TRAVEL_FRAME || !state.available) return;
				const over = (event) => applyHover(event.target);
				document.addEventListener("mouseover", over);
				return () => document.removeEventListener("mouseover", over);
			}, [state.available]);
			// 框转移（R18f，llm-mimo retargetHover 同语义）：点击开卡→框飞到收起钮
			// （等 0.28s 展开过渡落定再推，过渡中 mouseover 实时重测跟随）；点击收卡→
			// 框飞回该键行线。仅框已显示（hoverOn）时转移，键盘/程序性展开不凭空画框。
			const lastExpandedRef = react.useRef("");
			react.useEffect(() => {
				if (!PB_TRAVEL_FRAME || !state.available) return;
				const nowExpanded = state.selection.expanded;
				const prev = lastExpandedRef.current;
				lastExpandedRef.current = nowExpanded;
				if (prev === nowExpanded || !hoverOnRef.current) return;
				// 入场即打豁免戳（R18i）：展开/收卡瞬间的缝合位移把指针甩出卡外，浏览器
				// 重算的 no-spot 关框会在转移定时器之前熄框——400ms 豁免让框活到落定重推
				transferAtRef.current = Date.now();
				// 归属守卫（R18i）：落定重推只在指针无归属（null=卡外空档/页面）或仍属于
				// 该键时执行；hoverKeyRef 已被别的行认领（320ms 内挪去别的行）则不抢框
				const ownsFrame = (item) => hoverKeyRef.current === null || hoverKeyRef.current === item;
				let timer = 0;
				if (nowExpanded) {
					timer = window.setTimeout(() => {
						const item = document.querySelector(".pb-keyitem:has(.pb-keyrow.expanded)");
						if (item && ownsFrame(item)) {
							transferAtRef.current = Date.now();
							push(measure(item), true);
						}
					}, 320);
				} else if (prev) {
					for (const item of document.querySelectorAll(".pb-keyitem")) {
						const name = item.querySelector(".pb-keyname");
						if (name && name.textContent === prev) {
							push(measure(item), true);
							// 收卡过渡（margin -12↔8 + padding）会移动行线——落定后按已收起行重校
							timer = window.setTimeout(() => {
								if (ownsFrame(item)) {
									transferAtRef.current = Date.now();
									push(measure(item), true);
								}
							}, 320);
							break;
						}
					}
				}
				return () => window.clearTimeout(timer);
			}, [state.available, state.selection.expanded]);
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
				const slug = k.key.replace(/[^a-zA-Z0-9]/g, "-");
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
						// 同一元素连续过渡），本行只剩 灯/键名/来源 三列。
						// pb-srctext = 自然宽 sizer（M3-R17）：width:max-content + flex:none，
						// 恒等于内容自然宽、不随外盒夹持收缩——截断判定与弹卡展开都以它为准，
						// 外盒 overflow:hidden 只管视觉裁剪（夹持态显示 标题全 + path 头段）。
						// pb-caret（M3-R18，llm-mimo caret 同款）：折叠态徽标首元素=展开 affordance，
						// 随徽标显形；展开态隐藏（收起改由编辑器钮接管）
						(0, jsx.jsxs)("span", { className: "pb-source" + (isExpanded ? " expanded" : ""), children: [
							(0, jsx.jsxs)("span", { className: "pb-srctext", children: [
								(0, jsx.jsx)("span", { className: "pb-caret", "aria-hidden": true, children: "▾" }),
								(0, jsx.jsx)("span", { className: "pb-srctitle", children: `【${sourceTitle}】` }),
								pathText ? (0, jsx.jsx)("span", { className: "pb-path", children: pathText }) : null
							] })
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
							// 图标动作钮（M3-R11/R12，owner 定稿）：绿 Iconoir 软盘描边=保存（空覆盖合法）、
							// 黄二创挖孔=清除回归默认（Iconoir 同廓实心 + Humble·restart 缩小 0.6389 挖空，
							// 挖孔描边 3.76 → 视觉 2.4/24vb，十档矩阵选定 S=0.639）；28×28 squircle 照
							// llm-mimo 图标钮范式，右下角对齐
							(0, jsx.jsxs)("div", { className: "pb-editoractions", children: [
								// 收起钮（M3-R18，owner 定）：llm-mimo collapsebtn 同款字形钮；
								// 展开态行头点击收起就此退役（M3-R18），收起只走本钮
								(0, jsx.jsx)("button", {
									type: "button",
									className: "pb-collapsebtn",
									title: t("collapse"),
									"aria-label": t("collapse"),
									onClick: () => props.pick("expand", k.key, ""),
									children: "▴"
								}),
								(0, jsx.jsxs)("button", {
									type: "button",
									className: "pb-iconbtn pb-iconsave",
									title: t("set"),
									"aria-label": t("set"),
									disabled: disabled || rowDraft === preview,
									onClick: () => props.commitEntry(k.key, sel.model, rowDraft),
									children: [(0, jsx.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", children: [
										(0, jsx.jsx)("path", { d: "M3 19V5a2 2 0 0 1 2-2h11.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 21 7.828V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }),
										(0, jsx.jsx)("path", { d: "M8.6 9h6.8a.6.6 0 0 0 .6-.6V3.6a.6.6 0 0 0-.6-.6H8.6a.6.6 0 0 0-.6.6v4.8a.6.6 0 0 0 .6.6Z" }),
										(0, jsx.jsx)("path", { d: "M6 13.6V21h12v-7.4a.6.6 0 0 0-.6-.6H6.6a.6.6 0 0 0-.6.6Z" })
									] })]
								}),
								(0, jsx.jsxs)("button", {
									type: "button",
									className: "pb-iconbtn pb-iconclear",
									title: t("clear"),
									"aria-label": t("clear"),
									disabled: disabled || !overridden,
									onClick: () => props.commitEntry(k.key, sel.model, null),
children: [(0, jsx.jsxs)("svg", { width: 16, height: 16, viewBox: "0 0 24 24", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, children: [
										(0, jsx.jsx)("path", { d: "M3 19V5a2 2 0 0 1 2-2h11.172a2 2 0 0 1 1.414.586l2.828 2.828A2 2 0 0 1 21 7.828V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z", class: "pb-clearglyph" }),
										(0, jsx.jsx)("path", { d: "M4.252 4v5H9M5.07 8a8 8 0 1 1-.818 6", transform: "translate(5.04 6.54) scale(0.58)", class: "pb-clearink", fill: "none", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" })
									] })]
								})
							] })
						]
					})] })
				] });
			};
			const expIdx = state.keyOptions.findIndex((k) => k.key === sel.expanded);
			// 截断判定封装在键元素生命周期里：每次 React 提交后全量重算（展开/折叠/换模型/
			// 列宽变化都会触发）。悬浮中的元素只加不撤（弹出态测量失真，撤类会引发震荡）。
			// M3-R17：判定量全部改为「过渡不变量」——srctitle 自然宽 + path scrollWidth
			// （内容宽，与自身 max-width 过渡无关）+ keyrow computed grid 的徽标轨道 used 值；
			// 旧法测活盒 scrollWidth，rAF 首测撞上 path 尚未张开 → 误判 pb-fit 滑到全宽，
			// settle 补测撤 fit → max-width none→100% 不可插值，一帧跳变（300% 缩放下可见）。
			const classifySource = (item) => {
				const row = item.querySelector(".pb-keyrow");
				const src = item.querySelector(".pb-source");
				if (!row || !src) return;
				// 徽标宽入 CSS 变量：悬停让位用它精确截断（M3-R5）。折叠态 path 盒为 0，
				// scrollWidth = 标题段宽——让位预留正好等于可见徽标宽（隐藏态也量得到）
				item.style.setProperty("--src-w", src.scrollWidth + "px");
				if (!row.className.includes("expanded")) {
					// 折叠徽标是瞬态显形，“截断”只对展开态有意义（M2-R6）
					src.classList.remove("pb-fit");
					return;
				}
				const title = src.querySelector(".pb-srctitle");
				const path = src.querySelector(".pb-path");
				const natural = (title ? title.offsetWidth : 0) + (path ? path.scrollWidth : 0);
				// P2 绕过分支（F9）：总宽 ≤ 半卡则完全无视裁剪/弹卡（natural 稳定 → 首测即终判）
				const fit = natural <= item.clientWidth * 0.5;
				src.classList.toggle("pb-fit", fit);
				if (fit) {
					src.classList.remove("pb-clipped");
					return;
				}
				// 弹卡判定：徽标轨道装不下自然宽。不看自身 clientWidth——夹持态内容被
				// overflow:hidden 收进盒内，自比较恒 false，pb-clipped 永远点不亮（M3-R17 障二）
				const tracks = getComputedStyle(row).gridTemplateColumns.split(/\s+/);
				const track = parseFloat(tracks[tracks.length - 1]);
				const clipped = Number.isFinite(track) && natural > track + 0.5;
				if (!src.matches(":hover") && getComputedStyle(src).boxShadow === "none") {
					src.classList.toggle("pb-clipped", clipped);
				}
			};
			react.useEffect(() => {
				if (!state.available) return;
				const measureAll = () => {
					for (const item of document.querySelectorAll(".pb-keyitem")) {
						const keyname = item.querySelector(".pb-keyname");
						if (keyname && !keyname.matches(":hover") && getComputedStyle(keyname).boxShadow === "none") {
							keyname.classList.toggle("pb-clipped", keyname.scrollWidth > keyname.clientWidth);
						}
						classifySource(item);
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
					classifySource(item);
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
									onClick: isExp ? undefined : () => props.pick("expand", k.key, isOverridden(state.userEntriesJson, k.key, sel.model) ? (parseEntries(state.userEntriesJson)[k.key]?.[sel.model] ?? "") : ""),
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
