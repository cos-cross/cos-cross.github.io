/**
 * 把 vscode-plot-preview 打成 .vsix(能用「从 VSIX 安装」直接装上的那种)。
 *
 * 用法:npm run vscode:package
 *
 * 几个参数为什么要这么给:
 *   --no-dependencies  这个扩展**没有任何运行时依赖**(纯 Node 内置模块 + 自己的文件),
 *                      vsce 每次都会去 spawn `npm ls` 检查依赖 ——
 *                      在受限环境(沙箱、某些 CI)里 spawn 会被拦掉,直接 EPERM 失败。
 *                      顺带也快一点。哪天真的加了 dependencies,下面会拦下来提醒。
 *   --out              输出到插件目录里,文件名带版本号。
 *
 * 没有用 vsce 的 --allow-missing-repository:package.json 里已经写了 repository。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'vscode-plot-preview');
const manifest = JSON.parse(readFileSync(path.join(extDir, 'package.json'), 'utf8'));

const outName = `${manifest.name}-${manifest.version}.vsix`;
const outPath = path.join(extDir, outName);

/* ---------- 打包前的检查 ---------- */

if (manifest.dependencies && Object.keys(manifest.dependencies).length) {
  console.error('❌ 这个扩展现在有运行时依赖了,不能用 --no-dependencies 打包。');
  console.error('   要么把依赖去掉,要么改这里的参数并确认打包机能在 vscode 里跑 npm。');
  process.exit(1);
}

// 副本必须是新的,不然打出来的包里是旧渲染器
const sync = spawnSync(process.execPath, [path.join(root, 'tools', 'sync-vscode-ext.mjs'), '--check'], {
  stdio: 'inherit',
});
if (sync.status !== 0) {
  console.error('\n❌ 先跑 `npm run vscode:sync` 把主题里的绘图代码同步过来。');
  process.exit(1);
}

/* ---------- 打包 ---------- */

if (existsSync(outPath)) rmSync(outPath);

console.log(`\n打包 ${outName} …\n`);
// 拼成一条命令交给 shell:Windows 上 npx 是 .cmd,Node 不允许直接 spawn;
// 而且整条命令里只有我们自己写死的字符串,不存在转义问题。
const cmd = `npx --yes @vscode/vsce@latest package --no-dependencies --out "${outName}"`;
const res = spawnSync(cmd, { cwd: extDir, stdio: 'inherit', shell: true });

if (res.status !== 0 || !existsSync(outPath)) {
  console.error('\n❌ 打包失败。可以先手动试一次看完整输出:');
  console.error(`   cd vscode-plot-preview && npx @vscode/vsce package --no-dependencies`);
  process.exit(1);
}

/* ---------- 装法 ---------- */

console.log(`\n✅ 打好了:${path.relative(root, outPath)}`);
console.log('\n装法(任选一个):');
console.log('  · VSCode 里:扩展面板右上角「…」→「从 VSIX 安装…」,选这个文件');
console.log(`  · 命令行:  code --install-extension "${path.relative(root, outPath)}"`);
console.log('\n装完重启 VSCode,打开任意 .md 按 Ctrl+Shift+V 即可。');
