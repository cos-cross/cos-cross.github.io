---
title: 一篇示例笔记:斐波那契与黄金分割
date: 2026-09-25 12:00:00
tags: [数学, 数列]
---

这篇笔记直接写在 `mdblog/` 文件夹里。执行 `npm run deploy` 时,它会被自动转换成
`source/_posts/` 下的博客文章,和手写的文章一起发布。

<!-- more -->

## 为什么放在 mdblog 里

因为写笔记和写博客是两种心态。放在 `mdblog/` 里,你只需要:

1. 新建一个 `.md` 文件;
2. 随手写,不用管 front-matter、不用管分类;
3. 想发的时候 `npm run deploy`。

标题会从正文第一个 `#` 标题取,日期取文件修改时间,分类取子目录名 ——
上面这几行 `---` 是可选的,不写也能用。

## 一个例子:斐波那契数列逼近黄金分割

相邻两项的比值会收敛到黄金分割比:

$$F(n) = F(n-1) + F(n-2)$$

比值的极限是:

$$\lim_{n \to \infty} \frac{F(n)}{F(n-1)} = \varphi = \frac{1 + \sqrt{5}}{2} \approx 1.6180339887$$

有意思的是收敛得并不快 —— 误差大致按 $\varphi^{-2n}$ 衰减,所以每往后一项,
精度只提高大约两位有效数字。

## 顺手用一下可运行单元格

`mdblog/` 里的笔记同样支持 `exec` 代码格(见 `scripts/notebook.js`):

```python exec
fib = [1, 1]
while len(fib) < 20:
    fib.append(fib[-1] + fib[-2])

phi = (1 + 5 ** 0.5) / 2
print(f"φ = {phi:.12f}")
print()
for n in (10, 15, 19):
    r = fib[n] / fib[n - 1]
    print(f"F({n:>2})/F({n-1:>2}) = {r:.12f}   误差 {abs(r - phi):.2e}")
```

可以看到第 19 项时误差还有 `1e-4` 量级 —— 收敛速度确实很慢。
