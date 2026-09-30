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
			.pb-hoverbox { position: absolute; z-index: 0; pointer-events: none; box-sizing: border-box; background: var(--dsw-alias-interactive-bg-hover); border-radius: 8px; opacity: 0; transition: top .26s cubic-bezier(.2,0,0,1), left .26s cubic-bezier(.2,0,0,1), width .26s cubic-bezier(.2,0,0,1), height .26s cubic-bezier(.2,0,0,1), opacity .15s ease; }
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
			.pb-keyrow.collapsed .pb-source { transform: translateX(16px); opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .26s cubic-bezier(.2,0,0,1), max-width .3s cubic-bezier(.2,0,0,1); }
			.pb-keyitem:hover .pb-keyrow.collapsed .pb-source { opacity: 1; transform: translateX(0); max-width: 280px; pointer-events: auto; }
			.pb-source.expanded { max-width: 100%; }
			.pb-keyrow.expanded .pb-source.pb-fit { max-width: none; min-width: max-content; }
			.pb-source .pb-path { display: inline; max-width: 0; opacity: 0; overflow: hidden; font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); color: var(--dsw-alias-label-tertiary); transition: max-width .3s cubic-bezier(.2,0,0,1), opacity .2s ease; }
			.pb-source.expanded .pb-path { max-width: 300px; opacity: 1; }
			.pb-source.pb-clipped { border: 1px solid transparent; border-radius: 8px; }
			/* 弹卡只属展开态徽标（真被卡内缘裁剪时悬停读全文）；折叠徽标是瞬态显形，
			   pb-clipped 不再点亮（M2-R6），杜绝指针蹭到右缘就翻脸成浮牌 */
			.pb-keyrow.expanded .pb-source.pb-clipped:hover { position: relative; z-index: 2; width: max-content; padding: 2px 8px; margin: -3px -9px; border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-module-platform); box-shadow: 0 10px 28px rgba(0,0,0,.18); }
			.pb-editor:focus-within { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: 4px; border-radius: 8px; }
			.pb-fillcard { background: var(--dsw-alias-bg-module-platform); border-radius: 12px; padding: 10px 12px; display: grid; gap: 8px; align-content: start; }
			/* 整行元素（wrapper 承担缝合 margin）+ 整行卡片（展开时在 wrapper 内额外下移 + 圆角过渡） */
			.pb-rowwrap { transition: margin-top .26s cubic-bezier(.2,0,0,1), padding-bottom .26s cubic-bezier(.2,0,0,1); }
			.pb-keycard { transition: transform .26s cubic-bezier(.2,0,0,1), border-radius .26s cubic-bezier(.2,0,0,1); }
			.pb-chead { font-size: 12px; color: var(--dsw-alias-label-tertiary); padding: 0 2px; }
			.pb-stack { display: grid; gap: 0; }
			.pb-keyitem { padding: 6px 10px; cursor: pointer; display: grid; gap: 4px; transition: padding .26s cubic-bezier(.2,0,0,1); }
			/* 漏缝补偿：仅缝的下面一侧（展开卡自身 + 其后的卡）；上方卡不补偿 */
			.pb-keyitem:has(.pb-keyrow.expanded) { padding: 10px; }
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
			.pb-editoractions { display: flex; gap: 8; justify-content: flex-end; }
			/* 图标动作钮（M3-R11）：28×28 实心，范式照 llm-mimo 图标钮（owner 定）。
			   绿=保存（空覆盖合法，存空即空覆盖），黄=清除回归默认（黄绿沿用指示灯配色） */
			.pb-iconbtn { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; transition: background-color .15s ease, opacity .15s ease; }
			.pb-iconbtn:disabled { opacity: .4; cursor: default; }
			.pb-iconsave { background: #22C55E; }
			.pb-iconsave:hover:not(:disabled) { background: #16A34A; }
			.pb-iconclear { background: #EAB308; }
			.pb-iconclear:hover:not(:disabled) { background: #CA8A04; }
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
