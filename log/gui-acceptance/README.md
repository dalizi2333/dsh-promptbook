// SPDX-License-Identifier: CC-BY-4.0
<!-- Copyright (c) 2026 MiMo CodeX / dalizi233 -->

# gui-acceptance —— 设置卡 GUI 磨合计划（`feat/gui-acceptance` 分支）

> **一句话任务**：把设置→插件页的 Promptbook 卡磨到**视觉上没有故障**（owner 主观验收，
> 无预设清单），且每一轮改动可归因、可回退。
> 接手方先读本文件，再看 `handover.md` §3 的轮次操作循环开工。

## 一、背景：为什么重启

上一条 GUI 美化线（D21–D24 + 动画 12 轮）全程未提交，且执行会话倾向用临时 py 脚本改码，
最终形态无法完全回退、改动无法归因（owner 判定：可维护性失败）。处置：

- 全部未提交改动**原样归档**到 `archive/gui-uncommitted-20260930`（948dfdf）——只作设计
  参考，代码不 cherry-pick、不再演进；
- 本计划从 main（D20, 4e96cc2）拉 `feat/gui-acceptance` 重启，基础设施先行（§二分片拆分），
  之后每轮视觉改动都落在单一分片、独立提交（§四验收协议）。
- 决策记录见本目录 `decisions.md`（D25 起；**D21–D24 号段保留**给归档线设计再落地时沿用，
  与记忆笔记/归档分支的编号连续）。

## 二、架构：源码分片 + 拼装产物（D26）

### 宿主契约（不可协商的事实，0.2.0-rc.2 `@deepseek-ai/dsh-client-modules` 实证）

1. 每包只解析 `exports["./client"]` **一个入口**，启动 combo 按 `<包名>/client.js` 加载——
   运行时多文件入口不存在；
2. factory 闭包内 `require` 只认模块 id（平台种子表 → 已物化记录 → boot graph → 已注册
   工厂），**不认相对路径**——`require("./xxx.js")` 这种拆法不存在；
3. 官方多文件先例（如 documentpreview 的 `client.excel.js`）全是 tsdown 从源码构建出的
   chunk（`import()` 切分 + `require.async`），entry 与 chunk 之间禁止同步 require。

结论：**产物必须是单文件，多文件只能发生在源码层**。这就是「源码分片 + 拼装」。

### 分片结构

| 分片（`src/client/`） | 内容 | 备注 |
|---|---|---|
| `locales.js` | en/zh 词典 | |
| `logic.js` | 全部纯函数（parseEntries/mergeEntry/resolve 链等） | test/client.test.mjs 直测的导出面 |
| `styles.js` | （预留）PB_STYLES 等卡面样式常量 | 样式长出独立体量时新建，**插进 PARTS 的 card 之前** |
| `card.js` | PromptbookCard 组件（布局/交互/动画的宿主） | 视觉轮次的主战场 |
| `apply.js` | NS 常量 + controller + apply + 导出清单 | |

- 分片**不是独立模块**：同处一个 factory 闭包，按声明序共享标识符，片间无 import/export；
- `scripts/build-client.mjs` 按序拼装 + 套 loader 外壳写出 `lib/client.js`；
- **`lib/client.js` 是生成物，禁止手改**（会被下次拼装覆盖；`ci.mjs` 的 `--check` 门抓
  分片与产物不一致）；改分片后 `npm run build:client`。

### 零行为变化的证明

拆分提交（M0）的产物与拆分前逐字节一致，仅文件头多 3 行「构建产物」声明——`git diff`
可复核。测试/verify-install/组合级 CI 全绿（见 progress.md M0 行）。

## 三、轮次工作流（每轮固定动作）

```
改分片（只用编辑器原生 Edit，禁止 py/内联脚本改码——owner 明令）
→ npm run build:client
→ npm test && npm run verify:install
→ GUI 会话视觉核验（core-web 实例，见 handover §2）
→ 核验记录写 progress.md；改动按「一分片一主题」提交
→ 收工前 npm run ci 全链绿（push 由 pre-push 钩子强制）
```

## 四、验收协议（D27）

- **验收标准**：无预设清单，磨到 owner 看不到视觉故障为止；每轮以 GUI 会话逐条核验记录
  （现象 → 改动 → 复验）为单元；
- **可归因纪律**：一轮只动一个分片的一个主题，独立提交——「明确改过的是什么」是本计划
  的存在理由，攒大 diff 视为流程违规；
- 程序化门（test/verify/build --check）每轮必绿；纯渲染残差才交视觉核验（延续 D9 收敛）。

## 五、里程碑路线（顺序可按 owner 意愿调整）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 分支重启 + 归档 + 分片拆分基础设施 | ✅ 2026-09-30 |
| M1 | 再落地 D21–D24：插槽迁 `plugins.bundle.config`、撤 systemKey/overrides 管道字段、键行卡（resolveTraced 重放 + layersJson 镜像）、下拉浮层卡 | 待启动 |
| M2 | 缝合卡形态 + 动画轴律（§六） | 待启动 |
| M3 | 悬浮判定分流 / 截断测量守卫 / 揭示动效 | 待启动 |
| M4 | 磨合迭代至视觉验收通过 | 持续 |

## 六、再落地设计要点（从归档线沉淀的形态结论，细节读归档分支对应代码）

- **缝合卡（M2 目标形态）**：头卡 + 每键一卡（`fillcard` 常驻兄弟）用负 margin（-12px）
  互叠 + 分段圆角缝成一块；展开 = 缝线松开（margin→+8、展开卡全圆角），margin/radius 挂
  同批 `.26s` 过渡使缝线松紧连续。裂变三段 / 单卡双态皆是死路，勿复活。
- **动画轴律（owner 立规）**：Y 轴只归展开/折叠（缝线 margin 独占；head-drop translateY
  已废弃=曾致展开跳变）；X 轴只归悬浮（键行 hover 缩进、寻址元素滑入）；文本全程实心
  不淡出；值行→输入框 = grid-rows 0fr→1fr 解包（max-height/height 关键帧是死路）。
- **悬浮判定分流**：收起态 = 整行卡触发弹卡；展开态 = 键名/寻址元素各自 self-hover（卡
  悬浮零效果）。弹出态 max-content 盒使 scrollWidth 测量自指 → 加/撤震荡：box-shadow
  非空跳过重测，离场自然重测。
- **历史死路备忘**（勿重蹈）：fieldset 包含块原点在 legend 下方；合成 mouseout 无
  relatedTarget（用 document 级 mouseover 委托）；子串匹配 aria-label 会误点动作按钮；
  键名负水平 margin 使 scrollWidth 判定永假。
