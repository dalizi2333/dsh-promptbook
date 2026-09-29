/**
 * ci —— 可安装性全链门（本地与 GitHub Actions 跑同一份脚本，DRY）。
 *
 * 链路 = CI workflow 的全部实质步骤：
 *   1. 依赖就位检查（node_modules 缺失则 npm ci --legacy-peer-deps）；
 *   2. node scripts/verify-install.mjs（模块级 + 静态 21 项）；
 *   3. 干净临时 DSH_HOME：from-default-profile 造 profile → 官方 plugin add 本仓
 *      → --dump-config 断言 promptbook 条目。
 *
 * dsh 的来源：PATH 上的 `dsh`（CI 里全局安装；本地可 export DSH_RUNTIME_BIN 指向
 * 运行时的 dsh 可执行文件，见 local-env.md）。基线 0.2.0-rc.2（D2-amended）：版本不符仅警告
 * （CI 由安装步骤钉死；本地提示人工确认）。
 *
 * 用法：npm run ci（或 scripts/hooks/pre-push 自动调用——push 前本地必绿）。
 * 失败时保留临时 DSH_HOME 供排查，成功即清理。
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const run = (cmd, args, opts = {}) => {
	const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
	if (r.status !== 0) {
		console.error(`\nFAIL：${cmd} ${args.join(" ")} 退出码 ${r.status}`);
		process.exit(1);
	}
	return r;
};

// --- dsh 定位 ---
const dshBin = process.env.DSH_RUNTIME_BIN ?? "dsh";
const which = spawnSync("sh", ["-c", `command -v '${dshBin}'`], { encoding: "utf8" });
if (which.status !== 0) {
	console.error("FAIL：找不到 dsh。CI 外环境请 export DSH_RUNTIME_BIN=<运行时 dsh 可执行文件路径>（本机值见 local-env.md）");
	process.exit(1);
}
const ver = spawnSync(dshBin, ["--version"], { encoding: "utf8" });
const dshVersion = (ver.stdout + ver.stderr).trim();
if (!dshVersion.includes("0.2.0-rc.2")) console.warn(`warn：dsh 版本 ${dshVersion}，基线钉 0.2.0-rc.2（D2-amended；CI 会钉死安装，本地请自行确认）`);

// --- 1. 依赖 ---
if (!existsSync(join(root, "node_modules", "@deepseek-ai", "schemastery"))) {
	console.log("▶ npm ci --legacy-peer-deps");
	run("npm", ["ci", "--legacy-peer-deps"], { cwd: root });
}

// --- 2. 模块级 + 静态 ---
console.log("▶ verify-install");
run("node", [join(root, "scripts", "verify-install.mjs")]);

// --- 3. resolve 链逻辑测试 ---
console.log("▶ test（resolve 链 13 场景）");
run("npm", ["test", "--silent"], { cwd: root });

// --- 3. 干净 DSH_HOME 组合级 ---
const home = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "dsh-promptbook-ci-"));
console.log(`▶ 临时 DSH_HOME：${home}`);
const env = { ...process.env, DSH_HOME: home };
try {
	run(dshBin, ["ci", "--from-default-profile", "headless", "--dump-config"], { env, stdio: "ignore" });
	run(dshBin, ["plugin", "--profile", "ci", "add", root], { env });
	const dump = spawnSync(dshBin, ["--profile", "ci", "--dump-config"], { env, encoding: "utf8" });
	if (dump.status !== 0 || !dump.stdout.includes("- id: promptbook")) {
		console.error(`FAIL：组合树断言未过（exit ${dump.status}）`);
		process.exit(1);
	}
	console.log("  ✓ 组合树含 promptbook 条目");
	rmSync(home, { recursive: true, force: true });
} catch {
	/* run() 已 exit；占位 */
}
if (process.exitCode === undefined || process.exitCode === 0) {
	console.log("\nPASS：本地 CI 全链通过");
}
