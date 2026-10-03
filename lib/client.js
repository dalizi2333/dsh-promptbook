/**
 * @mimo-codex/dsh-promptbook/client — 插件页 Promptbook 卡（D21/D23/D24）。
 *
 * 形态照官方样板（dsh-client-ui-settings-web-search/lib/client.js）：
 * window.__ModuleLoader__ 工厂 + plugins.bundle.config 插槽（key=包名，渲染在
 * 「已安装」→ 包详情页；官方契约：plugins.item 被官方设置页占用）+ configForms 命名空间。
 * 数据面（全部纯函数，test/client.test.mjs 经伪 window 工厂直测）：
 *  - 键清单/兜底 ← 本插件配置命名空间 "promptbook"（registryJson/entriesJson/layersJson）；
 *  - 供应商/模型二级下拉 ← llm-mimo 配置命名空间快照（modelsJson 解析，与其设置卡同源；
 *    llm-mimo 未加载时行区降级提示）。
 *  - 键行解析 = resolveTraced 在卡内重放解析链（候选优先序与 host resolveOverride 一致，
 *    分层数据来自 host 镜像 layersJson），来源标签三态恒右对齐。
 * 保存语义：逐行编辑合入 entriesJson 后经 SettingsFormModel 分阶段原子写（edit → save）。
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
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region locales
		const en = {
			title: "Promptbook",
			description: "Per-model localization of the system prompt and tool descriptions (llm-mimo hosted models only).",
			entries: "Per-model texts",
			rowsHint: "Click a row to edit that key for the selected model; gray values are not overridden.",
			provider: "Provider",
			model: "Model",
			draft: "Text",
			set: "Set for this model",
			clear: "Clear override (back to default)",
			collapse: "Collapse",
			noHosted: "llm-mimo is not loaded; provider/model lists are unavailable.",
			sourceGui: "Overridden here (GUI)",
			sourceCompile: "Compile overrides layer",
			sourceModel: "Model layer · {name}",
			sourceProvider: "Family layer · {id}",
			sourceFallback: "Registry fallback",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "This plugin is not loaded, so it cannot be configured right now.",
			saveFailed: "The deployment did not accept these values; they were left for you to correct."
		};
		const zh = {
			title: "提示词簿",
			description: "按模型本地化系统提示词与工具描述（仅 llm-mimo 托管模型生效）。",
			entries: "逐模型文本",
			rowsHint: "点击一行编辑该键在所选模型下的文本；灰值 = 未覆盖（悬浮查看命中层）。",
			provider: "供应商",
			model: "模型",
			draft: "文本",
			set: "保存该模型的覆盖",
			clear: "清除该覆盖，回归默认",
			collapse: "收起",
			noHosted: "llm-mimo 未加载，供应商/模型列表不可用。",
			sourceGui: "本卡覆盖（GUI 层）",
			sourceCompile: "编译产物层",
			sourceModel: "模型层 · {name}",
			sourceProvider: "家族层 · {id}",
			sourceFallback: "注册表兜底",
			readOnly: "本部署的设置为只读。",
			unavailable: "该插件当前未加载，暂时无法配置。",
			saveFailed: "本部署没有接受这些值，已保留供你修改。"
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
		//#region 卡面样式
		/**
		 * 卡面样式（D24，模式移植自 llm-mimo 的 formatcard + 下拉浮层，pb- 前缀）：
		 * pb-pop* = 下拉浮层卡（激活行钉锚到触发钮、外点收合）；pb-rowwrap/pb-keycard =
		 * 整行元素/整行卡片双层（缝合 margin 在 wrapper，展开位移+圆角在内卡）；
		 * pb-source = 寻址元素（每键唯一常驻，恒右对齐，三态由整行卡触发）；旅行悬浮框
		 * 已随缝合卡重构暂时停用（PB_TRAVEL_FRAME 开关保留）。
		 */
		const PB_STYLES = `
			.pb-scope { position: relative; }
			/* 旅行悬浮框（M3-R18c 恢复 / R18d 校准）：z2 盖在卡面上（llm-mimo hoverbox
			   同款层序）；落框 = 独立圆角条（矩形内收横8/竖4、固定 10px 圆角），浮于卡上
			   不与缝合卡缘合并；动作钮 z3 豁免 */
			.pb-hoverbox { position: absolute; z-index: 2; pointer-events: none; box-sizing: border-box; background: var(--dsw-alias-interactive-bg-hover); corner-shape: superellipse(1.43); border-radius: 10px; opacity: 0; transition: top .26s cubic-bezier(.2,0,0,1), left .26s cubic-bezier(.2,0,0,1), width .26s cubic-bezier(.2,0,0,1), height .26s cubic-bezier(.2,0,0,1), opacity .15s ease; }
			.pb-hoverbox.on { opacity: 1; }
			.pb-hoverbox.instant { transition: opacity .15s ease; }
			.pb-pickrow, .pb-keyrow { position: relative; transition: grid-template-columns .3s cubic-bezier(.2,0,0,1); }
			.pb-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; transition: background-color .15s ease; }
			/* 键元素：盒位恒定（盒内文字不位移）；截断裁剪；弹卡双态触发（收起=整行卡，展开=自身悬浮） */
			.pb-keyrow .pb-keyname { padding: 0 8px; margin: -1px 0; border: 1px solid transparent; border-radius: 8px; transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease; }
			.pb-keyitem:hover .pb-keyrow.collapsed .pb-keyname.pb-clipped { position: relative; z-index: 1; width: max-content; min-width: 100%; border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-module-platform); box-shadow: 0 10px 28px rgba(0,0,0,.18); }
			.pb-keyrow.expanded .pb-keyname.pb-clipped { position: relative; z-index: 1; width: max-content; min-width: 100%; }
			/* 寻址元素：每键唯一常驻、恒右对齐（justify-self: end）；两态皆入流占位——
			   折叠态 max-width 0→280 过渡即第四列列宽过渡，正文预览（1fr）被其自然截断
			   而非重叠（M3-R8，替代 round-11 的绝对定位覆盖案——彼时第三列还是空的） */
			.pb-source { display: inline-flex; align-items: center; min-width: 0; justify-self: end; max-width: 0; overflow: hidden; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary); transition: max-width .3s cubic-bezier(.2,0,0,1); }
			/* 自然宽 sizer（M3-R17）：恒等于内容自然宽、不随外盒夹持收缩——夹持态由外盒
			   overflow:hidden 在盒缘硬裁（标题全 + path 头段），判定与弹卡都以它为基准 */
			.pb-srctext { display: inline-flex; align-items: center; width: max-content; flex: none; }
			/* 折叠展开箭头（M3-R18，llm-mimo caret 同款）：徽标首元素随徽标显形（外盒裁剪），
			   展开态隐藏——展开/收起 affordance 由编辑器收起钮接管 */
			.pb-source .pb-caret { display: none; color: var(--dsw-alias-label-tertiary); font-size: 12px; margin-right: 4px; }
			.pb-keyrow.collapsed .pb-source .pb-caret { display: inline; }
			/* 收起钮（M3-R18/R18b）：「保存+清除两钮连体」形状——宽=两钮+间距（28+10+28=66），
			   高=单钮 28；圆角固定 14px（=28 钮 100% 半径被半宽截断的有效值）+ 同款
			   superellipse(1.43)，端头几何与两圆钮一致。展开态行头不再点击收起
			   （keyitem onClick 仅折叠态挂），收起只走本钮 */
			.pb-collapsebtn { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; border-radius: 14px; corner-shape: superellipse(1.43); width: 66px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; flex: none; }
			/* 悬浮反馈全权归旅行框（R18f owner：两层悬浮）——钮自身不再画 hover 底色 */
			.pb-keyrow.collapsed .pb-source { transform: translateX(16px); opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .26s cubic-bezier(.2,0,0,1), max-width .3s cubic-bezier(.2,0,0,1); }
			.pb-keyitem:hover .pb-keyrow.collapsed .pb-source { opacity: 1; transform: translateX(0); max-width: 280px; pointer-events: auto; }
			.pb-source.expanded { max-width: 100%; }
			.pb-keyrow.expanded .pb-source.pb-fit { max-width: none; min-width: max-content; }
			.pb-source .pb-path { display: inline; max-width: 0; opacity: 0; overflow: hidden; font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); color: var(--dsw-alias-label-tertiary); transition: max-width .3s cubic-bezier(.2,0,0,1), opacity .2s ease; }
			.pb-source.expanded .pb-path { max-width: 300px; opacity: 1; }
			.pb-source.pb-clipped { border: 1px solid transparent; border-radius: 8px; }
			/* 弹卡只属展开态徽标（真被轨道夹持时悬停读全文）；折叠徽标是瞬态显形，
			   pb-clipped 不再点亮（M2-R6），杜绝指针蹭到右缘就翻脸成浮牌。
			   max-width:none 是弹卡能展开的先决条件——expanded 的 max-width:100% 会把
			   width:max-content 压回夹持宽，浮牌等于没开（M3-R17 障二） */
			.pb-keyrow.expanded .pb-source.pb-clipped:hover { position: relative; z-index: 2; width: max-content; max-width: none; padding: 2px 8px; margin: -3px -9px; border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-module-platform); box-shadow: 0 10px 28px rgba(0,0,0,.18); }
			.pb-editor:focus-within { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: 4px; border-radius: 8px; }
			.pb-fillcard { background: var(--dsw-alias-bg-module-platform); border-radius: 12px; padding: 10px 12px; display: grid; gap: 8px; align-content: start; }
			/* 整行元素（wrapper 承担缝合 margin）+ 整行卡片（展开时在 wrapper 内额外下移 + 圆角过渡） */
			.pb-rowwrap { transition: margin-top .26s cubic-bezier(.2,0,0,1), padding-bottom .26s cubic-bezier(.2,0,0,1); }
			.pb-keycard { transition: transform .26s cubic-bezier(.2,0,0,1), border-radius .26s cubic-bezier(.2,0,0,1); }
			.pb-chead { font-size: 12px; color: var(--dsw-alias-label-tertiary); padding: 0 2px; }
			.pb-stack { display: grid; gap: 0; }
			.pb-keyitem { padding: 6px 10px; cursor: pointer; display: grid; gap: 4px; transition: padding .26s cubic-bezier(.2,0,0,1); }
			/* 漏缝补偿：仅缝的下面一侧（展开卡自身 + 其后的卡）；上方卡不补偿。
			   展开态行头不可点击收起（M3-R18）——cursor 随之回落 */
			.pb-keyitem:has(.pb-keyrow.expanded) { padding: 10px; cursor: default; }
			/* 结尾假行：透明感应条——默认隐形（10px 零存在感），悬浮长到 26px 显形小点+彩蛋文本，全左对齐 */
			/* 结尾假行：大卡片的填充向下延伸块（固定尺寸，背板+底圆角由它闭合） */
			.pb-endrow { position: relative; box-sizing: border-box; height: 14px; padding: 0 12px 0 9px; display: flex; align-items: center; gap: 8px; transition: margin-top .26s cubic-bezier(.2,0,0,1), border-radius .26s cubic-bezier(.2,0,0,1); }
			/* 彩蛋（M2-R4）：触发点=悬浮目标，只显形不位移（transform 会让目标甩掉指针）。
			   位置 = 键行指示灯列竖向延长线 × 假行垂直中线：灯列中心在卡内 14.5px
			   （keyitem padding 10 + 灯 9/2），假行 padding-left 9 + 点盒 11/2 = 14.5 对齐；
			   垂直靠 flex align-items 居中（高度 14，点盒 11）。 */
			.pb-endrow .pb-eggdot { flex: none; width: 5px; height: 5px; padding: 3px; border-radius: 50%; background: var(--dsw-alias-label-caption); background-clip: content-box; opacity: 0; transition: opacity .2s ease; }
			.pb-endrow.pb-eggshow .pb-eggdot { opacity: .55; }
			/* 彩蛋文本两态统一：绝对定位横向居中（translateY 只是定位、隐显两态恒定） */
			.pb-endrow .pb-eggtext { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; margin: 0; font-size: 10px; color: var(--dsw-alias-label-caption); white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
			.pb-endrow.pb-eggshow .pb-eggtext { opacity: 1; }
			@keyframes pb-card-in { from { transform: translateY(-4px); } to { transform: none; } }
			/* 展开/折叠双向连续过渡（M3-R1/R3/R4）：编辑器常驻挂载，grid-rows 0fr↔1fr 过渡；
			   wrap min-height 22px = 折叠态的单行预览窗——textarea 即预览本体（M3-R3）。
			   M3-R4：折叠窗负 margin 上提叠进键行第三列空位（margin-left 对齐键名列之后），
			   折叠行回归单行紧凑；展开时 margin 连续过渡回编辑器位（30px/0）——同一元素
			   在「行内预览 ↔ 下方编辑器」两个停靠位之间滑移 */
			.pb-editorwrap { display: grid; grid-template-rows: 0fr; margin-top: -22px; margin-left: 120px; overflow: hidden; transition: grid-template-rows .28s cubic-bezier(.2,0,0,1), margin-top .28s cubic-bezier(.2,0,0,1), margin-left .28s cubic-bezier(.2,0,0,1); }
			.pb-editorwrap.open { grid-template-rows: 1fr; margin-top: 0; margin-left: 30px; }
			/* 编辑器自身 24px 下限：0fr 轨道的收纳终点=单行预览窗。pre 之后内容恒单行、
			   无第二行可露，窗高只服务墨迹余量：24px 给行底墨迹（下划线）留 ~7px 纯空，
			   任意缩放舍入都啃不到墨迹（M3-R9 20px 在缩放变化下仍不稳，owner 令再放宽）。
			   折叠态提示/按钮退出版流（否则被三行隐式网格平分，全部压扁） */
			.pb-editorwrap > .pb-editor { min-height: 24px; }
			.pb-editoractions { display: flex; gap: 10px; justify-content: flex-end; }
			/* 图标动作钮（M3-R11）：28×28 实心，范式照 llm-mimo 图标钮（owner 定）。
			   绿=保存（空覆盖合法，存空即空覆盖），黄=清除回归默认（黄绿沿用指示灯配色） */
			.pb-iconbtn { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 100%; corner-shape: superellipse(1.43); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; transition: background-color .15s ease, opacity .15s ease; }
			.pb-iconbtn:disabled { opacity: .4; cursor: default; }
			/* 动作钮渲染豁免（M3-R18c，llm-mimo trash/plusbtn 同款 position+z）：旅行框
			   z2 盖卡面，动作钮 z3 浮于框上——保存/清除/收起不被框色罩住 */
			.pb-iconbtn, .pb-collapsebtn { position: relative; z-index: 3; }
			.pb-iconsave { background: rgba(34, 197, 94, 0.35); }
			.pb-iconsave:hover:not(:disabled) { background: #22C55E; }
			.pb-iconsave svg path { stroke: #15803d; transition: stroke .15s ease; }
			.pb-iconsave:hover:not(:disabled) svg path { stroke: #fff; }
			.pb-iconclear { background: rgba(234, 179, 8, 0.35); }
			.pb-iconclear:hover:not(:disabled) { background: #EAB308; }
			.pb-iconclear svg .pb-clearglyph { fill: #a16207; stroke: #a16207; stroke-width: 1.5; transition: fill .15s ease, stroke .15s ease; }
			.pb-iconclear svg .pb-clearink { fill: none; stroke: #c7950a; stroke-width: 4.5; transition: stroke .15s ease; }
			.pb-iconclear:hover:not(:disabled) svg .pb-clearglyph { fill: #fff; stroke: #fff; }
			.pb-iconclear:hover:not(:disabled) svg .pb-clearink { stroke: #eab308; }
			.pb-editorwrap:not(.open) .pb-editor > :not(textarea) { display: none; }
			textarea.pb-ta { resize: vertical; max-height: 440px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; corner-shape: superellipse(1.43); background: var(--dsw-alias-bg-layer-1); transition: border-color .3s cubic-bezier(.2,0,0,1), background-color .3s cubic-bezier(.2,0,0,1), color .3s cubic-bezier(.2,0,0,1), padding .3s cubic-bezier(.2,0,0,1), margin-right .3s cubic-bezier(.2,0,0,1); }
			/* 折叠态 textarea = 正文预览（M3-R3）：扁平无边框、灰 = 未覆盖；不可点不可聚焦。
			   white-space:pre = 永不软换行（M3-R8 续）：内容恒为单行，长文右侧硬裁；
			   overflow:hidden 兼杀横向滚动条（pre+默认 auto 会在行下画滚动条，M3-R9/200%缩放）；
			   line-height 18px = 键行同款：行底墨迹（下划线）有落窗余量，16px 时被削（M3-R9）。
			   悬停行时右侧让位 = **margin-right**（徽标实际自然宽 --src-w 上限 280 + 12px 间隙）：
			   pre 长行的墨迹会画进 padding 区——padding-right 对可见性无效（M3-R5 教训），
			   margin 收缩盒边界才能硬裁。.3s 同曲线与徽标 max-width 逐帧同步 */
			.pb-editorwrap:not(.open) .pb-ta { white-space: pre; overflow: hidden; padding: 0 10px; line-height: 18px; border-color: transparent; background: 0 0; resize: none; pointer-events: none; color: var(--dsw-alias-label-tertiary); }
			.pb-keyitem:hover .pb-keyrow.collapsed + .pb-editorwrap:not(.open) .pb-ta { margin-right: calc(min(var(--src-w, 0px), 280px) + 12px); }
			.pb-editorwrap:not(.open) .pb-ta.pb-overridden { color: var(--dsw-alias-label-primary); }
			.pb-keyitem .pb-editor { cursor: default; }
			.pb-trigger { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: 0 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 3px 10px; cursor: pointer; }
			.pb-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
			.pb-caret { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
			.pb-pop { box-sizing: border-box; position: fixed; z-index: 1000; background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; box-shadow: 0 10px 28px rgba(0,0,0,.18); padding: 6px; animation: pb-pop-down .2s cubic-bezier(.2,0,0,1); }
			.pb-pop.closing { pointer-events: none; opacity: 0; transform: scaleY(.96); transform-origin: top; transition: opacity .2s ease, transform .2s cubic-bezier(.2,0,0,1); }
			@keyframes pb-pop-down { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
			.pb-pophead { font-size: 12px; color: var(--dsw-alias-label-tertiary); padding: 2px 10px 4px; }
			.pb-popline { display: flex; align-items: center; gap: 10px; width: 100%; padding: 5px 8px; cursor: pointer; border-radius: 8px; border: 0; background: 0 0; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); text-align: left; white-space: nowrap; overflow: hidden; transition: padding .26s cubic-bezier(.2,0,0,1), background .15s ease; }
			/* 悬浮行横向展开破卡而出（D24）：完整名称放得下，展开行自带浮层质感 */
			.pb-popline:hover { position: relative; z-index: 1; width: max-content; min-width: 100%; padding: 5px 14px; background: var(--dsw-alias-bg-module-platform); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; box-shadow: 0 10px 28px rgba(0,0,0,.18); }
			.pb-popline.active { background: var(--dsw-alias-interactive-bg-hover); }
			.pb-popmeta { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
		`;
		/** 状态提示行样式（手写三态：不可用 / 只读 / 保存失败）。 */
		const NOTICE_BASE = { margin: 0, fontSize: 13, lineHeight: "20px" };
		const NOTICE_STYLE = {
			tertiary: { ...NOTICE_BASE, color: "var(--dsw-alias-label-tertiary)" },
			secondary: { ...NOTICE_BASE, color: "var(--dsw-alias-label-secondary)" },
			error: { ...NOTICE_BASE, color: "var(--dsw-alias-state-error-primary)" }
		};
		/** 指示灯配色：命中深度三档（绿=模型级精确，黄=家族层，灰=注册表兜底）。 */
		const DOT_COLORS = { green: "#22C55E", yellow: "#EAB308", gray: "var(--dsw-alias-label-caption)" };
		function dotColorOf(source) {
			if (!source) return DOT_COLORS.gray;
			if (source.layer === "model" || source.layer === "gui" || source.layer === "compile") return DOT_COLORS.green;
			if (source.layer === "provider") return DOT_COLORS.yellow;
			return DOT_COLORS.gray;
		}
		/** 灰值悬浮文案：命中层的人话（模型名/家族 id/编译产物/注册表兜底）。 */
		function sourceTitleText(source, modelDisplay, t) {
			if (!source) return "";
			if (source.layer === "model") return t("sourceModel", { name: modelDisplay });
			if (source.layer === "provider") return t("sourceProvider", { id: source.id });
			if (source.layer === "compile") return t("sourceCompile");
			if (source.layer === "fallback") return t("sourceFallback");
			return t("sourceGui");
		}
		//#endregion
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
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		exports.parseEntries = parseEntries;
		exports.mergeEntry = mergeEntry;
		exports.isOverridden = isOverridden;
		exports.keyOptionsFromSnapshot = keyOptionsFromSnapshot;
		exports.hostedOptionsFromLlMimoSnapshot = hostedOptionsFromLlMimoSnapshot;
		exports.modelCandidates = modelCandidates;
		exports.resolveTraced = resolveTraced;
		exports.layersFromSnapshot = layersFromSnapshot;
		return module.exports;
	}
});
