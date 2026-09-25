---
title: 不写一行 JS,用纯 CSS 做一个下落式判定线
date: 2026-05-24 22:10:00
categories: 编程
tags: [CSS, 音游, 动效, 前端]
---

这个博客首页底部有一条会往下掉音符的判定线。它不是 Canvas,不是 JS 动画库,是 **9 个 `<span>` 加一段 CSS**。这篇把做法拆开讲清楚。

<!-- more -->

## 目标

想要的效果很朴素:一排竖条从上方匀速落下,落到一条发光的横线附近淡出,循环往复,像音游的判定区。

要求有三条:

1. 不能占 CPU —— 首页还有别的东西要跑;
2. 不能依赖 JS,关掉 JS 也要动;
3. 每根音符的节奏要错开,不然看起来像梳子。

## 结构

HTML 少到不能再少:

```html
<div class="lane-track">
  <span class="lane-note" style="--x: 6%;  --delay: 0s;    --dur: 2.4s"></span>
  <span class="lane-note" style="--x: 17%; --delay: 0.37s; --dur: 2.85s"></span>
  <!-- ...一共 9 根,由模板循环生成 -->
</div>
<div class="judge-line"><span class="judge-label">PERFECT</span></div>
```

**每根音符的横坐标、延迟、周期都由 CSS 变量从行内样式传进去。** 这样同一套 CSS 能长出九个不一样节奏的音符,而 JS 只需要在生成 HTML 时算三个数。

## 下落动画

核心就一个 `translateY` 补间:

```css
.lane-note {
  position: absolute;
  left: var(--x);
  top: -46px;              /* 从容器外面开始 */
  width: 3px;
  height: 34px;
  border-radius: 99px;
  background: linear-gradient(180deg, #2ee6ff, #9b7bff, #ff5fd0);
  box-shadow: 0 0 12px rgba(46, 230, 255, .8);
  animation: fall var(--dur, 2.6s) linear infinite;
  animation-delay: var(--delay, 0s);
}

@keyframes fall {
  0%   { transform: translateY(0);     opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translateY(112px); opacity: 0; }
}
```

三个细节决定了它看起来像不像音游:

- **`linear` 而不是 `ease`**。音游里音符是匀速下落的,加了缓动反而像在飘。
- **两头淡出**。开头和结尾各留 12% 做透明度过渡,音符就不会在容器边缘"啪"地出现又消失。
- **`translateY` 而不是 `top`**。位移走的是合成层,不触发重排,9 个一起跑也几乎不占 CPU。

## 判定线

判定线要"发光但不刺眼",所以用两端透明的渐变,再叠一层 `box-shadow`:

```css
.judge-line {
  position: absolute;
  left: 0; right: 0; bottom: 14px;
  height: 2px;
  background: linear-gradient(90deg, transparent, #2ee6ff, #ff5fd0, transparent);
  box-shadow: 0 0 16px rgba(255, 95, 208, .85);
}
```

右边的 `PERFECT` 字样是让它偶尔闪一下,而不是一直亮:

```css
.judge-label { animation: judge-flash 2.6s ease-in-out infinite; }

@keyframes judge-flash {
  0%, 84%, 100% { opacity: .35; }
  90%           { opacity: 1; }
}
```

`84% → 90%` 这一段突然变亮再回落,就是判定成功的那个瞬间。周期 2.6 秒是故意的 —— 和中间那根音符的周期对齐,看起来像是它踩中了线。

## 节奏错开的算法

九根音符如果周期都一样,会同时落下又同时消失。所以模板里用取模算周期:

```js
for (let i = 0; i < 9; i++) {
  const x     = 6 + i * 11;                 // 横向均匀铺开:6%, 17%, 28% ...
  const delay = (i * 0.37).toFixed(2);      // 依次错开 0.37 秒
  const dur   = (2.4 + (i % 4) * 0.45).toFixed(2); // 周期只有 4 种,循环使用
}
```

周期故意只取 4 种取值而不是 9 种。**周期种类太多会显得杂乱,太少又会看出重复**,4 种在 9 根上的组合已经足够"随机"了。

## 关掉动效

有前庭功能障碍或者单纯不喜欢动的用户,系统里会开着"减少动态效果"。这个设置必须尊重:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
```

一行 `!important` 解决全站动画,比在每个组件里写判断省事得多。

## 效果与取舍

| 指标 | 数值 |
| --- | --- |
| 元素数 | 10 个 `<span>` |
| JS | 0 行(生成 HTML 的模板逻辑除外) |
| 动画属性 | `transform` + `opacity`(均走合成层) |
| 额外请求 | 0 |

代价也有:纯 CSS 做不了"命中检测",音符永远落不到实处,判定线只能靠闪烁假装自己在工作。真要做能打的音游,还是得回到 Canvas 或者 WebGL,自己管时间轴和判定窗口 —— 那又是另一个话题了。
