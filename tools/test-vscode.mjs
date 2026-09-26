/**
 * VSCode 预览插件的测试。
 *
 * 这里能验的是"插件核心"这部分:markdown-it 的 fence 钩子有没有把
 * plot2d / plot3d 换成和网站上一模一样的容器,以及插件里那几份副本是不是最新的。
 * 至于"VSCode 里真的显示出来了没",那得装上去用眼睛看 —— 沙箱里没有 VSCode。
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
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

console.log('\n=== 用真的 markdown-it 跑一遍 ===');
{
  // 上面那一段用的是个假 md 对象,只能证明"我的钩子逻辑对";
  // 这一段把插件挂到**真的 markdown-it** 上渲染,才能排除"真库里的行为不一样"。
  // (markdown-it 只是 devDependency,缺了就跳过,不影响构建。)
  let MarkdownIt = null;
  try { MarkdownIt = require('markdown-it'); } catch { /* 没装 */ }

  if (!MarkdownIt) {
    console.log('SKIP  没装 markdown-it(在仓库里跑 npm install 就会有)');
  } else {
    const doc = [
      '# 标题',
      '',
      '正文 $\alpha$ 一段。',
      '',
      '```plot2d x=[-7,7] y=[-2,2]',
      'sin(x)',
      '```',
      '',
      '```plot3d x=[-2,2] y=[-2,2] z=[-2,2] grid=24',
      'sphere(0, 0, 0, 1)',
      '```',
      '',
      '```python',
      'print(1)',
      '```',
      '',
      '```plot2d',
      'nope(',
      '```',
      '',
    ].join('\n');

    // 完全按 VSCode 的用法:先建实例,再把扩展返回的 md 拿去 render
    const md = MarkdownIt({ html: true, linkify: true, breaks: true });
    const api = require(path.join(extDir, 'extension.js')).activate(null);
    const html = api.extendMarkdownIt(md).render(doc);

    const count = (re) => (html.match(re) || []).length;
    ok('渲染出 2 个容器', count(/<div class="plot"/g) === 2, `${count(/<div class="plot"/g)} 个`);
    ok('2D / 3D 各一个', count(/data-kind="2d"/g) === 1 && count(/data-kind="3d"/g) === 1);
    ok('容器里带着可解析的 JSON', (() => {
      const m = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
      return !!m && JSON.parse(m[1].replace(/\\u003c/g, '<')).items.length >= 1;
    })());
    ok('python 代码块原样保留', /language-python/.test(html) && /print\(1\)/.test(html));
    ok('没有漏网的 plot 围栏', count(/language-plot2d/g) === 0 && count(/language-plot3d/g) === 0);
    ok('坏表达式变成红框', count(/plot-preview-error-title/g) === 1);
    ok('正文没被动过', html.includes('<h1>标题</h1>') && html.includes('正文'));
  }
}

console.log('\n=== 打包 (.vsix) 的前置条件 ===');
{
  const pkg = JSON.parse(readFileSync(path.join(extDir, 'package.json'), 'utf8'));

  // 就是这一条:VSCode 只对声明了 markdownItPlugins 的扩展调用 extendMarkdownIt。
  // 少了它,扩展照样被激活(previewScripts / previewStyles 也会照常注入),
  // 但那个钩子**一次都不会被调用** —— 预览里就一直是代码块原文。
  // 这是实际踩过的坑,别再删。
  ok('声明了 markdown.markdownItPlugins(VSCode 靠它才会调 extendMarkdownIt)',
    pkg.contributes['markdown.markdownItPlugins'] === true,
    String(pkg.contributes['markdown.markdownItPlugins']));

  ok('有 name / publisher / version', !!(pkg.name && pkg.publisher && /^\d+\.\d+\.\d+$/.test(pkg.version)),
    `${pkg.publisher}.${pkg.name}@${pkg.version}`);
  ok('声明了 engines.vscode', !!pkg.engines && !!pkg.engines.vscode, pkg.engines && pkg.engines.vscode);
  ok('入口文件存在', existsSync(path.join(extDir, pkg.main)), pkg.main);
  ok('许可证文件在(LICENSE 会被改名成 LICENSE.txt 进包)',
    existsSync(path.join(extDir, 'LICENSE')));
  ok('有 README(市场页和「详情」都用它)', existsSync(path.join(extDir, 'README.md')));

  // 没有运行时依赖 —— tools/package-vscode.mjs 就是靠这一点才敢用 --no-dependencies
  ok('没有运行时依赖(所以能用 --no-dependencies 打包)',
    !pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
    JSON.stringify(pkg.dependencies));

  // contributes 里写到的每个文件都必须真的在,不然装上是个哑巴扩展
  const declared = [
    ...(pkg.contributes['markdown.previewStyles'] || []),
    ...(pkg.contributes['markdown.previewScripts'] || []),
  ];
  const missing = declared.filter((rel) => !existsSync(path.join(extDir, rel)));
  ok('contributes 里声明的文件都存在', missing.length === 0, missing.join(', '));

  // .vscodeignore 把不该带的排掉,但别把要用的也排掉了
  const ignore = readFileSync(path.join(extDir, '.vscodeignore'), 'utf8')
    .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const needed = [pkg.main.replace(/^\.\//, ''), 'package.json', 'README.md', 'LICENSE',
    ...declared.map((r) => r.replace(/^\.\//, ''))];
  const wronglyIgnored = needed.filter((f) => ignore.some((pat) => {
    if (pat.endsWith('/**')) return f.startsWith(pat.slice(0, -3));
    if (pat.startsWith('*.')) return f.endsWith(pat.slice(1));
    return f === pat;
  }));
  ok('.vscodeignore 没把要用的文件排掉', wronglyIgnored.length === 0, wronglyIgnored.join(', '));

  const vsix = path.join(extDir, `${pkg.name}-${pkg.version}.vsix`);
  if (existsSync(vsix)) {
    ok('已经打过包了,而且不是空的', readFileSync(vsix).length > 10000,
      `${Math.round(readFileSync(vsix).length / 1024)} KB`);
  } else {
    console.log('SKIP  还没打过包(跑 npm run vscode:package)');
  }
}

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
