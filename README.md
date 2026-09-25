# Cos-Cross 的个人博客

> 编程 · 数学 · 音游 —— 把灵感写成代码,把热爱打成 PERFECT。

线上地址:**https://cos-cross.github.io**

基于 [Hexo](https://hexo.io) 构建,主题是手写的(没有用现成模板),托管在 GitHub Pages。

## 特点

- **零外部依赖**:字体用系统字体栈,CSS / JS / 图标全部内置,不加载任何 CDN 资源;
- **二次元音游风**:深色霓虹配色、玻璃拟态卡片、判定线动效、滚动连击彩蛋;
- **深浅色主题**:跟随系统,可手动切换并记住选择;
- **数学公式**:任意文章在 front-matter 里写 `math: true` 即可用 KaTeX 渲染(本地内置,不走 CDN);
- **代码高亮**:Hexo 内置 highlight.js,带行号和复制按钮;
- **响应式 + 无障碍**:移动端抽屉导航,尊重 `prefers-reduced-motion`。

## 目录结构

```text
.
├── _config.yml               # 站点配置(标题、导航、分页、RSS)
├── package.json              # "hexo" 字段是必需的,hexo-cli 靠它识别站点根目录
├── source/
│   ├── _posts/               # 文章,一篇一个 .md
│   ├── _data/projects.yml    # 项目清单,首页和 /projects/ 都读它
│   ├── about/index.md        # 关于页
│   └── projects/index.md     # 项目页
├── themes/cos-cross/
│   ├── _config.yml           # 主题配置(头像、社交链接、动效开关)
│   ├── layout/               # EJS 模板
│   │   ├── layout.ejs        # 总骨架
│   │   ├── index.ejs         # 首页
│   │   ├── post.ejs          # 文章详情
│   │   ├── archive.ejs       # 归档 / 分类 / 标签
│   │   └── _partial/         # 导航、页脚、卡片等片段
│   └── source/               # css / js / 图片 / KaTeX
├── scripts/
│   └── empty-site-fallback.js  # Hexo 插件:零文章时兜底生成首页 / 归档 / RSS
├── tools/
│   ├── deploy.mjs            # 部署到 gh-pages
│   ├── check.mjs             # 构建产物自检
│   ├── verify-live.mjs       # 线上站点验证
│   └── vendor-katex.mjs      # 复制 KaTeX 运行时资源
└── public/                   # 构建产物(不进版本库)
```

`scripts/` 和 `tools/` 的分工要说清楚:

- **`scripts/` 是 Hexo 的插件目录**,会被自动加载。它必须是 **CommonJS**,因为 Hexo 把文件包进 `(function(exports, require, module, __filename, __dirname, hexo){...})` 执行 —— 写 `import` 会直接语法错误,而且 `hexo` 是**注入的函数参数**,不是模块导出,写 `module.exports = function (hexo) {}` 不会被执行。
- **`tools/` 是自己写的辅助脚本**,Hexo 不管,所以可以放心用 ESM。

`scripts/empty-site-fallback.js` 是必需的:Hexo 官方的 index / archive 生成器在**零文章**时什么都不输出,首页和导航里的「文章」会直接 404。这个插件只在没有文章时补上最小页面,有了文章就完全不介入。

## 安装

```bash
npm install --ignore-scripts
```

`--ignore-scripts` 是为了跳过 `hexo-util` 的 `postinstall`(它只是重新生成一份 `highlight_alias.json`,而 npm 包里已经带了这个文件),顺带也更快、更安全。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run server` | 本地预览,http://localhost:4000 |
| `npm run build` | 构建静态文件到 `public/` |
| `npm run check` | 构建并自检产物(死链、模板残留、关键结构) |
| `npm run deploy` | 构建并发布到 `gh-pages` 分支 |
| `npm run verify` | 部署后验证线上站点(页面 + 静态资源是否真的可达) |
| `npm run new "标题"` | 新建一篇文章 |
| `npm run vendor:katex` | 从 `node_modules/katex` 重新复制运行时资源 |

## 写一篇文章

### 1. 新建

```bash
npm run new "文章标题"          # → source/_posts/文章标题.md
```

**文件名决定网址。** Hexo 用文件名当 slug,所以中文标题会得到 `posts/文章标题/` 这样被百分号转义的长网址。想要干净的 URL,建完把文件改名成英文:

```bash
npm run new "音游判定与数学"
# 然后把 source/_posts/音游判定与数学.md 改名为 rhythm-judgement-math.md
# 网址就是 https://cos-cross.github.io/posts/rhythm-judgement-math/
```

`title` 写在 front-matter 里,和文件名无关,所以改文件名不影响页面标题。

### 2. 写内容

```yaml
---
title: 音游判定与数学:你的 PERFECT 为什么总是差一点点
date: 2026-09-25 21:30:00
categories: 音游
tags: [音游, 数学, 概率]
math: true              # 需要渲染 $公式$ 时才加,不加就不会加载 KaTeX
---
```

正文用普通 Markdown。几个约定:

| 写法 | 效果 |
| --- | --- |
| `<!-- more -->` | 首页摘要截到这里,不写就是全文摘要 |
| `## 二级标题` | 自动生成锚点,并出现在右侧目录里 |
| ` ```js ` 代码块 | 高亮 + 行号 + 悬停复制按钮 |
| `$x^2$` / `$$...$$` | 行内 / 独立公式(需要 `math: true`) |
| `categories: 音游` | 生成 `/categories/音游/` 页面 |
| `tags: [a, b]` | 生成 `/tags/a/` 页面,并进首页标签云 |

> 注意:公式里的下划线会被 Markdown 当成斜体。写 `\sigma_x` 请改成 `\sigma` 加文字说明,或者用 `\sigma_{x}` 之外的方式绕开 —— 这是 Markdown + 数学混排的经典坑。

### 3. 本地预览

```bash
npm run server      # http://localhost:4000,改文件会自动刷新
```

### 4. 发布

```bash
npm run check       # 先自检一遍(死链、模板残留、关键结构)
npm run deploy      # 构建 + 推送到 gh-pages
npm run verify      # 等 Pages 构建完(约半分钟),验证线上
```

前两步在本地几秒就能跑完,推上去之后 GitHub Pages 构建大约需要 20~60 秒。

## 部署

源码在 `main` 分支,构建产物推到一个独立的 `gh-pages` 分支,GitHub Pages 的发布源指向它。这样 Jekyll 不会去处理 `source/` 里的 Markdown 源文件。

```bash
npm run deploy
```

`tools/deploy.mjs` 做三件事:在 `public/` 里放一个空的 `.nojekyll`(让 GitHub 跳过 Jekyll)、临时 `git init` 一个仓库、强推到 `gh-pages`。认证默认走 Git 凭据管理器;也可以提供令牌:

```bash
GITHUB_TOKEN=ghp_xxx npm run deploy
```

令牌只从环境变量读取,不会写进任何配置文件。

## 自定义

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、描述、分页、RSS | `_config.yml` |
| 导航项、头像、社交链接、动效开关 | `themes/cos-cross/_config.yml` |
| 首页大屏文案、标签 | `themes/cos-cross/_config.yml` 的 `hero` |
| 项目清单 | `source/_data/projects.yml` |
| 配色 / 圆角 / 间距 | `themes/cos-cross/source/css/style.css` 顶部的 CSS 变量 |
| 头像、站点图标 | `themes/cos-cross/source/img/`(SVG) |

所有配色都收在 `:root` 和 `[data-theme="light"]` 两组 CSS 变量里,换整套皮肤只需要改那几十行。

## 关于

- GitHub:[cos-cross](https://github.com/cos-cross)
- Bilibili:[@Cos_Cross](https://space.bilibili.com/388480733)
- 邮箱:coscross@126.com
- 小工具站:[IdealizedPreviewer](https://cos-cross.github.io/IdealizedPreviewer/)

## 许可

博客内容(文章、图片)版权归 Cos-Cross 所有;主题代码可以自由参考和使用。
