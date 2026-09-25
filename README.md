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
├── tools/
│   ├── deploy.mjs            # 部署到 gh-pages
│   ├── check.mjs             # 构建产物自检
│   └── vendor-katex.mjs      # 复制 KaTeX 运行时资源
└── public/                   # 构建产物(不进版本库)
```

`tools/` 这个名字是刻意的:**Hexo 会自动把根目录下的 `scripts/` 当作插件加载**,里面放 ESM 脚本会直接报错,所以辅助脚本统一放在 `tools/`。

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
| `npm run new "标题"` | 新建一篇文章 |
| `npm run vendor:katex` | 从 `node_modules/katex` 重新复制运行时资源 |

## 写一篇文章

```bash
npm run new "文章标题"
```

生成的 `.md` 头部是 front-matter:

```yaml
---
title: 文章标题
date: 2026-04-12 21:30:00
categories: 随笔
tags: [博客, Hexo]
math: true      # 需要渲染公式时加上
---
```

正文里插入一行 `<!-- more -->`,首页摘要就截到那里。

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
