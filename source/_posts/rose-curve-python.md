---
title: 极坐标玫瑰线:用几行 Python 画一朵花
date: 2026-08-30 20:40:00
categories: 数学
tags: [数学, Python, 可视化, 极坐标]
math: true
---

有个特别适合当壁纸的曲线族,叫**玫瑰线**(rose curve),方程短到一行:

$$r = a\cos(k\theta)$$

但它有个反直觉的性质:参数 $k$ 决定花瓣数的方式,**取决于 $k$ 是奇数还是偶数**。这篇把这个性质讲清楚,再用 Python 把它画出来。

<!-- more -->

## 先复习极坐标

平面上一个点可以用两种方式描述:

- 直角坐标 $(x, y)$:横着走多少,竖着走多少;
- 极坐标 $(r, \theta)$:朝哪个角度 $\theta$ 看过去,离原点多远 $r$。

两者的换算关系是:

$$x = r\cos\theta, \qquad y = r\sin\theta$$

玫瑰线的玩法是:**让 $r$ 随着 $\theta$ 的变化而振荡**。$\theta$ 转一圈,$r$ 正负来回摆几次,画出来就是几瓣花。

## 花瓣数定理

对整数 $k \ge 1$,曲线 $r = a\cos(k\theta)$ 的花瓣数是:

| $k$ | 奇偶 | 花瓣数 | 说明 |
| --- | --- | --- | --- |
| 1 | 奇 | 1 | 其实是个圆 |
| 2 | 偶 | 4 | 四叶草 |
| 3 | 奇 | 3 | 三叶草 |
| 4 | 偶 | 8 | 八瓣花 |
| 5 | 奇 | 5 | 五瓣花 |
| 6 | 偶 | 12 | 十二瓣花 |

规律很整齐:

- $k$ 是**奇数** → 花瓣数等于 $k$;
- $k$ 是**偶数** → 花瓣数是 $2k$。

奇数的情况容易理解:$\theta$ 从 $0$ 走到 $\pi$,$k\theta$ 扫过 $k\pi$,余弦完成 $k$ 个完整的"正向凸起",每画一个凸起就是一瓣。$\theta$ 继续走到 $2\pi$ 时,轨迹会**原路重描一遍**,不产生新花瓣。

真正让人困惑的是偶数的情况:明明是 $k$ 个凸起,为什么花瓣翻倍了?

## 关键在"负半径"

症结在于**极坐标允许 $r < 0$**。

当 $r$ 取负值时,标准约定是把它翻转 $180°$:

$$(-r,\ \theta) \equiv (r,\ \theta + \pi)$$

也就是说,负半径的点会落到**相反方向**上去。而 $r = a\cos(k\theta)$ 在 $\theta$ 增大时,一半时间在正半轴,一半时间在负半轴 —— 负的那一半,被翻到对面,于是补出了另外 $k$ 瓣。

举个具体的例子。取 $k = 2$:

- $\theta = 0$ 时,$r = a$,点在角度 $0$;
- $\theta = \pi/4$ 时,$r = 0$,回到原点;
- $\theta = \pi/2$ 时,$r = -a$,点在角度 $\pi/2$ 但半径是负的,所以实际落在角度 $3\pi/2$ 的位置,距离 $a$。

第一段在 $[0, \pi/2]$ 画出右侧的瓣,负半径那段则在下方补出另一瓣。四段凸起 × 2 = **4 瓣**。

奇数的情况之所以不翻倍,是因为把 $\theta$ 增加 $\pi$ 之后,$k\theta$ 增加的是 $k\pi$;只有当 $k$ 是**奇数**时 $\cos(k\theta + k\pi) = -\cos(k\theta)$,负号和角度旋转 $\pi$ **正好抵消**,点回到同一个位置 —— 所以重复描线,花瓣不增加。$k$ 为偶数时两个效果不抵消,才有新花瓣。

## 代码

```python
import numpy as np
import matplotlib.pyplot as plt

def rose(a=1.0, k=3, n=2000):
    """生成玫瑰线 r = a*cos(k*theta)。

    k 为奇数时 theta 取 [0, pi] 就够;为偶数时必须取 [0, 2pi],
    否则会丢掉一半花瓣(那段落在负半径上)。
    """
    theta = np.linspace(0, np.pi if k % 2 else 2 * np.pi, n)
    r = a * np.cos(k * theta)
    return r * np.cos(theta), r * np.sin(theta)

fig, axes = plt.subplots(2, 3, figsize=(11, 7.5),
                         subplot_kw={'aspect': 'equal'})

for ax, k in zip(axes.ravel(), range(1, 7)):
    x, y = rose(k=k)
    ax.plot(x, y, lw=1.6, color='#9b7bff')
    ax.fill(x, y, color='#2ee6ff', alpha=0.12)
    petals = k if k % 2 else 2 * k
    ax.set_title(f'k = {k}  →  {petals} 瓣', fontsize=11)
    ax.set_axis_off()

plt.tight_layout()
plt.show()
```

有一行值得单独说:

```python
theta = np.linspace(0, np.pi if k % 2 else 2 * np.pi, n)
```

**$k$ 取奇数时用 $[0, \pi]$ 就够了。** 如果偷懒一律用 $[0, 2\pi]$,图是对的(多描一遍而已),但会多花一倍的点数;反过来,对偶数 $k$ 只取 $[0, \pi]$ 就会画错 —— 因为负半径补出来的那几瓣还没画到。

## 顺手的亲戚:心形线

同一个套路上,把 $r$ 换成不带振荡的形式,能得到别的名曲线。比如**心形线**:

$$r = a(1 - \cos\theta)$$

```python
theta = np.linspace(0, 2 * np.pi, 1000)
r = 1 - np.cos(theta)
x, y = r * np.cos(theta), r * np.sin(theta)
```

$r$ 在这里永远非负(因为 $1 - \cos\theta \ge 0$),所以画出来是单支闭合曲线,在 $\theta = \pi$ 处离原点最远,距离为 $2a$。

## 一点延伸

玫瑰线只是"用三角函数调制半径"这一招里最有名的一个。同样的思路换几种调制方式,还能得到:

- $r = a + b\cos\theta$($a \neq b$):蜗牛线(limaçon),$a < b$ 时带内圈;
- $r^2 = a^2\cos(2\theta)$:双纽线(lemniscate),一个横躺的 $\infty$;
- $r = e^{0.1\theta}$:对数螺线,永远不会闭合,自然界里从鹦鹉螺到星系都有它。

想验证花瓣数到底是不是 $k$(奇)或 $2k$(偶),最好的办法不是背结论,而是改一下 $k$,顺便把 $\theta$ 的范围也改掉,看图形什么时候会缺一块 —— 缺的那块就是负半径补出来的部分。

> 附带一个数学上的小提醒:$k$ 取无理数时,曲线永远不会闭合,会在圆盘里越描越密。玫瑰线的漂亮,恰恰依赖 $k$ 是整数这个条件。
