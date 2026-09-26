/**
 * 公式抽取的单测。
 *
 * 这是修了一个真 bug 之后加的:marked 会在我们的插件之前
 * 把 `\\` 吃成 `\`、把公式里的换行变成 `<br>`,所以公式必须在 Markdown 之前抽出来。
 * 抽取是纯字符串处理,所以能脱离 Hexo 单独验证。
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { extractMath, decodeTex, PLACEHOLDER_RE } = require(path.join(root, 'tools', 'math-scan.cjs'));

let pass = 0;
let fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass += 1; console.log(`PASS  ${label}`); } else {
    fail += 1;
    console.log(`FAIL  ${label}${extra !== undefined ? '  → ' + extra : ''}`);
  }
}

/** 把占位符还原成 TeX 数组(顺便验证占位符真的能被认回来) */
function texes(text) {
  const re = new RegExp(PLACEHOLDER_RE, 'g');
  return [...text.matchAll(re)].map((m) => ({ tex: decodeTex(m[1]), display: m[2] === '1' }));
}

console.log('=== 行内公式 ===');
{
  const r = extractMath('设 $a^2+b^2=c^2$ 成立');
  const t = texes(r.text);
  ok('抽出一条', r.count === 1 && t.length === 1, String(r.count));
  ok('内容是行内', t[0].display === false);
  ok('TeX 原样保留', t[0].tex === 'a^2+b^2=c^2', t[0].tex);
  ok('正文还在', r.text.includes('设 ') && r.text.includes(' 成立'));
  ok('原文里的 $ 被换掉了', r.text.indexOf('$') === -1);
}

console.log('\n=== 行内公式里的反斜杠(就是那个 bug) ===');
{
  const r = extractMath('$\\alpha \\\\ \\beta$');
  const t = texes(r.text);
  ok('双反斜杠原样带过去', t[0] && t[0].tex === '\\alpha \\\\ \\beta', t[0] && t[0].tex);
}

console.log('\n=== 行间公式 ===');
{
  const src = '多行:\n\n$$\na = b \\\\\nc = d\n$$\n\n结束。';
  const r = extractMath(src);
  const t = texes(r.text);
  ok('抽出一条且是行间', r.count === 1 && t[0].display === true);
  ok('换行和 \\\\ 都留着', t[0].tex.indexOf('a = b \\\\\nc = d') !== -1, JSON.stringify(t[0].tex));
  ok('没有 <br> 混进来', r.text.indexOf('<br>') === -1);
  ok('周围的正文没被吃掉', r.text.includes('多行:') && r.text.includes('结束。'));
}

console.log('\n=== aligned / array ===');
{
  const src = '$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$';
  const r = extractMath(src);
  const t = texes(r.text);
  ok('单行 aligned 也完整保留', t[0] && t[0].tex.includes('a &= b \\\\ c &= d'), t[0] && t[0].tex);
  const src2 = '$$\\begin{array}{l} x = 1 \\\\ y = 2 \\end{array}$$';
  ok('array 环境一样', texes(extractMath(src2).text)[0].tex.includes('\\\\'));
}

console.log('\n=== 不该被当成公式的 ===');
{
  const r1 = extractMath('花了 $5 到 $10 吧');
  ok('金额不会被误判', r1.count === 0, String(r1.count));
  ok('金额原文不动', r1.text === '花了 $5 到 $10 吧');

  const r2 = extractMath('转义:\\$x\\$ 不是公式');
  ok('转义的 $ 不抽', r2.count === 0, String(r2.count));

  const r3 = extractMath('单个 $ 落单');
  ok('落单的 $ 不抽', r3.count === 0);

  const r4 = extractMath('$ x$ 和 $x $ 首尾是空白');
  ok('首尾空白的 $...$ 不抽', r4.count === 0, String(r4.count));

  const r5 = extractMath('$$\n\n$$');
  ok('空的 $$ 不抽', r5.count === 0, String(r5.count));

  const r6 = extractMath('行内 $a\nb$ 跨行');
  ok('行内公式不跨行', r6.count === 0, String(r6.count));
}

console.log('\n=== 代码里的 $ 不能动 ===');
{
  const code = '<hexoPostRenderCodeBlock><figure class="highlight python">'
    + '<pre><span class="line">x = "$1 + $2"</span></pre></figure></hexoPostRenderCodeBlock>';
  const r1 = extractMath(`正文\n\n${code}\n\n完`);
  ok('代码块里的 $ 不抽', r1.count === 0, String(r1.count));
  ok('代码块原样保留', r1.text.includes('x = "$1 + $2"'));

  const r2 = extractMath('代码 `$notmath$` 后面有真公式 $a+b$');
  const t = texes(r2.text);
  ok('反引号里的不抽、外面的照抽', r2.count === 1 && t[0].tex === 'a+b', `${r2.count}`);
  ok('反引号内容原样', r2.text.includes('`$notmath$`'));

  const r3 = extractMath('``带`反引号 $x$ `` 结束');
  ok('双反引号代码段也保护', r3.count === 0, String(r3.count));
}

console.log('\n=== 一段里混着多种 ===');
{
  const src = '开头 $a$ 中间\n\n$$\nb \\\\\nc\n$$\n\n代码 `$d$` 结尾 $e$';
  const r = extractMath(src);
  const t = texes(r.text);
  ok('抽出 3 条(a、b\\c、e)', r.count === 3, String(r.count));
  ok('顺序正确', t[0].tex === 'a' && t[0].display === false
    && t[1].display === true && t[2].tex === 'e', t.map((x) => x.tex).join(' | '));
  ok('代码段里的 $d$ 没被抽', !t.some((x) => x.tex === 'd'));
}

console.log('\n=== 占位符本身 ===');
{
  const r = extractMath('$x$');
  ok('占位符是自包含的(TeX 就在属性里)', /data-tex="[A-Za-z0-9+/=]+"/.test(r.text), r.text);
  ok('没有全局状态可串', extractMath('$x$').text === extractMath('$x$').text);
  ok('没有 $ 的文本原样返回', (() => {
    const r2 = extractMath('普通文本,没有公式');
    return r2.count === 0 && r2.text === '普通文本,没有公式';
  })());
  ok('decodeTex 能还原中文和反斜杠', decodeTex(Buffer.from('\\cfrac{π}{6}', 'utf8').toString('base64')) === '\\cfrac{π}{6}');
}

console.log(`\n${pass} 通过,${fail} 失败`);
process.exit(fail ? 1 : 0);
