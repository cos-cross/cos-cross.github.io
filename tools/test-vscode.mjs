/**
 * VSCode 预览插件的测试。
 *
 * 这里能验的是"插件核心"这部分:markdown-it 的 fence 钩子有没有把
 * plot2d / plot3d 换成和网站上一模一样的容器,以及插件里那几份副本是不是最新的。
 * 至于"VSCode 里真的显示出来了没",那得装上去用眼睛看 —— 沙箱里没有 VSCode。
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extDir = path.join(root, 'vscode-plot-preview');

let pass = 0;
let fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass += 1; console.log(`PASS  ${label}`); } else {
    fail += 1;
    console.log(`FAIL  ${label}${extra !== undefined ? '  → ' + extra : ''}`);
  }
}

console.log('=== 插件里的副本是不是最新的 ===');
{
  // 直接跑同步脚本的 --check 模式,和 `npm run check` 用的是同一个判据
  const log = path.join(root, '.deploy-tmp', 'vscode-sync-check.log');
  const fd = openSync(log, 'w');
  const res = spawnSync(process.execPath, [path.join(root, 'tools', 'sync-vscode-ext.mjs'), '--check'], {
    cwd: root, stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  const out = readFileSync(log, 'utf8').trim();
  ok('三份副本与主题一致(改完主题别忘了 npm run vscode:sync)', res.status === 0, out);
}

console.log('\n=== markdown-it 的 fence 钩子 ===');
{
  const extension = require(path.join(extDir, 'extension.js'));
  const md = { renderer: { rules: {} } };
  const returned = extension.activate();
  ok('activate 返回了 extendMarkdownIt', returned && typeof returned.extendMarkdownIt === 'function');

  const self = { renderToken: () => 'DEFAULT-TOKEN' };
  returned.extendMarkdownIt(md);
  ok('装上了 fence 规则', typeof md.renderer.rules.fence === 'function');

  const render = (info, content) => md.renderer.rules.fence(
    [{ info, content }], 0, {}, { path: 'note.md' }, self,
  );

  const html2d = render('plot2d x=[-3,3] y=[-3,3]', 'x^2 + y^2 = 1');
  ok('plot2d 换成了容器', html2d.includes('<div class="plot" data-kind="2d" data-mount'), html2d.slice(0, 80));
  ok('容器里带着 JSON 载荷', /<script type="application\/json">\{/.test(html2d));
  ok('载荷能被解析', (() => {
    const m = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html2d);
    try { return JSON.parse(m[1].replace(/\\u003c/g, '<')).items.length === 1; } catch { return false; }
  })());

  const html3d = render('plot3d x=[-2,2] y=[-2,2] z=[-2,2] grid=24', 'sphere(0, 0, 0, 1)');
  ok('plot3d 也认', html3d.includes('data-kind="3d"'));
  ok('sphere 展开成隐式方程', html3d.includes('"type":"implicit"'));
  ok('标签是人话', html3d.includes('球 · 球心 (0, 0, 0) · r = 1'), /plot-kind">([^<]*)/.exec(html3d)[1]);

  ok('别的语言照常走默认渲染', render('python', 'print(1)') === 'DEFAULT-TOKEN');
  ok('大小写不敏感', render('Plot2D x=[-1,1]', 'x').includes('data-kind="2d"'));
  ok('plot2dfoo 这种不会被误认', render('plot2dfoo', 'x') === 'DEFAULT-TOKEN');

  const bad = render('plot2d x=[-1,1]', 'nope(');
  ok('表达式错时给红框而不是空白', bad.includes('plot-preview-error'), bad.slice(0, 80));
  ok('红框里写了原因', bad.includes('未知函数') || bad.includes('nope'), bad.slice(0, 200));
  ok('红框里回显源代码', bad.includes('nope('));

  const empty = render('plot3d', '');
  ok('空代码块也有提示', empty.includes('plot-preview-error'));

  // 连续渲染多块时,问题收集不能串到下一块
  render('plot2d', 'nope(');
  const clean = render('plot2d x=[-1,1]', 'x');
  ok('上一次的问题不会漏到这一块', !clean.includes('plot-preview-error'));
}

console.log('\n=== 预览脚本 ===');
{
  const boot = readFileSync(path.join(extDir, 'preview', 'bootstrap.js'), 'utf8');
  ok('盯着 DOM 变化(预览只换 body,不重载脚本)', boot.includes('MutationObserver'));
  ok('调用的是 PlotKit.boot', boot.includes('PlotKit') && boot.includes('boot()'));
  const pkg = JSON.parse(readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  ok('渲染器是注入进去的(预览 CSP 不允许正文内联 script)',
    pkg.contributes['markdown.previewScripts'].some((p) => p.endsWith('plot.js')));
  ok('样式也注入了', pkg.contributes['markdown.previewStyles'].includes('./preview/plot.css'));
  ok('入口文件写对了', pkg.main === './extension.js');
  const css = readFileSync(path.join(extDir, 'preview', 'plot.css'), 'utf8');
  ok('样式里带着主题的设计变量', css.includes('.plot {') && css.includes('--grad-main'));
  ok('浅色主题的覆盖映射到了 vscode-light', css.includes('body.vscode-light'));
  ok('样式不污染预览的全局作用域', !/^:root\s*\{/m.test(css));
}

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
