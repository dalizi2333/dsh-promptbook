/**
 * verify-install —— 可安装性检查（CI 第一道门，本地同用，零外部依赖）。
 *
 * 检查四层：
 *  1. package.json 形状：包名 / exports 路径 / files 路径全部存在；
 *  2. 模块级：lib/index.js 可加载（依赖经仓库自带 node_modules 解析——pnpm link 安装
 *     走真实路径，仓库目录必须自带依赖，本规则对 CI 与本机一视同仁）、apply() 提供
 *     promptbook 服务；
 *  3. client 桩静态形状（window.__ModuleLoader__ 装载形态）；
 *  4. cordis.patch.yml 自挂载条目静态形状。
 *
 * 组合级/装载级验证（dsh plugin add + --dump-config + headless 一次性任务）在 CI
 * workflow 与 local-env.md 的配方里，不在本脚本内。
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
	failed += 1;
	console.error(`  ✗ ${m}`);
};

console.log("[1/4] package.json 形状");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.name !== "@mimo-codex/dsh-promptbook") bad(`包名 ${pkg.name}`);
else ok(`包名 ${pkg.name}`);
for (const [k, sub] of Object.entries(pkg.exports ?? {})) {
	const p = join(root, sub);
	existsSync(p) ? ok(`exports "${k}" → ${sub}`) : bad(`exports "${k}" 指向不存在的 ${sub}`);
}
for (const f of pkg.files ?? []) {
	const p = join(root, f);
	existsSync(p) ? ok(`files 含 ${f}`) : bad(`files 声明了不存在的 ${f}`);
}

console.log("[2/4] 模块级加载与服务提供");
const mod = await import(pathToFileURL(join(root, "lib/index.js")).href);
for (const key of ["name", "inject", "Config", "apply"]) {
	typeof mod[key] === "undefined" ? bad(`缺少导出 ${key}`) : ok(`导出 ${key}`);
}
const provided = {};
await mod.apply({ provide: (n, s) => (provided[n] = s), logger: { info: () => {} } });
if (!provided.promptbook) bad("apply() 未提供 promptbook 服务");
else {
	for (const fn of ["listKeys", "resolve"]) {
		typeof provided.promptbook[fn] === "function" ? ok(`服务方法 ${fn}()`) : bad(`服务缺方法 ${fn}`);
	}
	ok("apply() 提供 promptbook 服务");
}

console.log("[3/4] client 桩静态形状");
const client = readFileSync(join(root, "lib/client.js"), "utf8");
client.includes("window.__ModuleLoader__.load") ? ok("ModuleLoader 装载形态") : bad("缺 ModuleLoader 装载");
client.includes('"@mimo-codex/dsh-promptbook"') ? ok("装载 id = 包名") : bad("装载 id 不是包名");

console.log("[4/4] cordis.patch.yml 自挂载条目");
const patch = readFileSync(join(root, "cordis.patch.yml"), "utf8");
patch.includes("- id: promptbook") ? ok("自挂载 id: promptbook") : bad("缺自挂载条目 id");
patch.includes("'@mimo-codex/dsh-promptbook'") || patch.includes('"@mimo-codex/dsh-promptbook"')
	? ok("自挂载 name = 包名")
	: bad("自挂载 name 不是包名");

if (failed) {
	console.error(`\nFAIL：${failed} 项未过`);
	process.exit(1);
}
console.log("\nPASS：可安装性检查全部通过");
