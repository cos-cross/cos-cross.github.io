---
title: 让文章里的代码真的跑起来:构建期执行的可运行笔记
date: 2026-09-25 11:30:00
categories: 编程
tags: [Hexo, Python, 工具链, 博客]
---

博客是纯静态的,GitHub Pages 上没有后端可以执行代码。但我还是想让文章里的代码块**真的跑一遍、把结果贴在下面** —— 就像 Jupyter Notebook 那样。这篇讲讲怎么做到的,以及它和"浏览器里跑 Python"的区别。

<!-- more -->

## 做法:在构建期执行

思路很直接:**渲染文章的时候,把带标记的代码块拿去真的跑一次,把 stdout/stderr 一起写进 HTML。**

所以读者看到的是已经算好的结果 —— 打开就有,不需要等任何东西加载,也不需要装 Python。这和 `jupyter nbconvert` 导出 HTML 是同一个思路:notebook 在本地跑,输出被固化进文档。

代价是输出是"死"的:读者不能改参数重跑。后面会讲什么时候值得上浏览器里跑。

## 怎么写

在代码围栏的 info 串里加一个 `exec` 标记就行:

````markdown
```python exec
print(2 ** 10)
```
````

渲染出来是这样:

```python exec
print(2 ** 10)
```

不需要输出的时候(比如只想起个展示作用),把 `exec` 去掉,它就是一个普通的高亮代码块:

```python
print(2 ** 10)
```

## 它不是只能打印

因为是真的在执行,画图、算数值、跑算法都可以。比如算一下前 20 个斐波那契数的比值,看看收敛到黄金分割有多快:

```python exec
fib = [1, 1]
while len(fib) < 22:
    fib.append(fib[-1] + fib[-2])

phi = (1 + 5 ** 0.5) / 2
print(f"真实值 φ = {phi:.10f}")
print()
for n in (5, 10, 15, 21):
    ratio = fib[n] / fib[n - 1]
    print(f"F({n:>2})/F({n-1:>2}) = {ratio:.10f}   误差 {abs(ratio - phi):.2e}")
```

试试更贴近日常的:验证一下"音游判定误差服从正态分布"那个模型里的几个数字到底是多少。

```python exec
import math

def perfect_rate(p, sigma, mu=0.0):
    """p: PERFECT 窗口半宽(ms); sigma: 点击误差标准差; mu: 系统性偏移"""
    Phi = lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2)))
    return Phi((p - mu) / sigma) - Phi((-p - mu) / sigma)

print("窗口 ±25ms 时,不同手感的 PERFECT 率:")
for sigma in (10, 15, 20, 25, 30):
    bar = "█" * round(perfect_rate(25, sigma) * 40)
    print(f"  σ={sigma:>2}ms  {perfect_rate(25, sigma):6.1%}  {bar}")
```

输出里的 `█` 是纯文本画的条形图 —— 不需要图表库,`print` 就够了。

## 别的语言也行

`exec` 不限于 Python。下面是真正的 Node.js 在跑:

```node exec
const langs = ['JavaScript', 'Python', 'Kotlin', 'C++'];
const shout = (s) => s.toUpperCase();

console.log('我会的语言:');
for (const [i, lang] of langs.entries()) {
  console.log(`  ${i + 1}. ${shout(lang)}  (${lang.length} 个字符)`);
}

// Node 里也能做点数学
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
console.log('\ngcd(1071, 462) =', gcd(1071, 462));
```

## 报错也会如实显示

这是它比"贴一张截图"好的地方:**代码错了,页面就会显示真实的 traceback**,而不是我手抄的一段。故意写一段会崩的代码:

```python exec
data = {'a': 1}
print(data['b'])
```

stderr 会以红底显示在输出区,退出码也记着。所以如果你想验证文章里的例子确实能跑,把它标成 `exec` 就是最诚实的做法 —— 跑不过去,页面自己会暴露。

## 一些工程上的细节

**1. 输出会缓存。** 每格的缓存键是 `语言 + 代码内容` 的哈希,没改过的格子重新构建时直接复用,不会重复执行:

```text
notebook: 本次执行 2 格,命中缓存 3 格
```

**2. 子进程的输出重定向到文件,而不是管道。** 这是踩过的坑:受限环境下命名管道会被拦,重定向到文件在沙箱和普通终端里都能跑。

**3. 强制 UTF-8。** Windows 上 Python 默认用 GBK 编码 stdout,不加 `PYTHONIOENCODING=utf-8` 的话中文输出全是乱码。

**4. 超时保护。** 单格默认 20 秒,写了个死循环也不会把构建卡死,页面会显示"执行超时"。

## 那"读者自己跑"呢?

构建期执行解决的是"**看到**结果",解决不了"**改**参数再跑"。

真要让读者在浏览器里执行,唯一的路子是把 CPython 编译成 WebAssembly —— 也就是 **Pyodide**。它的取舍很明确:

| | 构建期执行(当前方案) | Pyodide(浏览器内执行) |
| --- | --- | --- |
| 读者要下载 | 0 | 首次约 10~20 MB |
| 能否改代码重跑 | 不能 | 能 |
| 依赖 | 构建机装好解释器 | 读者的浏览器 |
| 国内网络 | 无影响 | 需要能访问 CDN,或者自己托管 |

对一个博客来说,90% 的场景其实只需要"看到真实输出"。真要上 Pyodide,也应该做成**点按钮才加载** —— 让不想跑的人零成本,想跑的人等十几秒。

## 小结

- 代码围栏加 `exec`,构建时真跑,输出写进页面;
- 支持 Python / Node / PowerShell / Bash 等,靠 `_config.yml` 里的 `runners` 配置;
- 结果缓存、超时保护、错误如实展示;
- 想要交互式执行,再考虑 Pyodide,并且一定要做成懒加载。
