---
title: 重新开站:这个博客是怎么搭起来的
date: 2026-04-12 21:30:00
categories: 随笔
tags: [博客, Hexo, 前端, GitHub Pages]
---

之前这个域名下面只有一个 README,一直想有个正经写字的地方。这次干脆自己搭一个:**Hexo 做生成器,主题手写,GitHub Pages 托管**。

这篇就当作第一篇,把整个搭建过程记下来,以后想改的时候不用重新回忆。

<!-- more -->

## 为什么不用现成主题

现成的 Hexo 主题生态很好,装一个改改配置十分钟就能上线。但我想要的东西比较具体:

- 深色霓虹的配色,因为看代码和谱面都在暗色环境里;
- 判定线、连击数这种音游味道的小细节;
- 打开页面不要先等一堆外部资源加载。

第三条基本排除了大部分主题 —— 它们往往会引入 Google Fonts、Font Awesome、jQuery、各种 CDN 的统计脚本。在国内访问这些资源,体验是抽奖。所以最后决定:**除文章内容外,零外部依赖**,字体用系统字体栈,CSS 和 JS 全部自己写在主题里。

## 技术栈

| 部分 | 选型 | 原因 |
| --- | --- | --- |
| 生成器 | Hexo | Node 生态,Markdown 写文章,构建快 |
| 主题 | 手写(EJS + CSS) | 完全掌控样式,不带冗余 |
| 托管 | GitHub Pages | 免费、支持 HTTPS、和仓库直接绑定 |
| 部署 | 源码在 `main`,产物在 `gh-pages` | 不需要 CI,本地构建完直接推 |

没有用 GitHub Actions,是因为本地构建只需要几秒,而 Actions 排队 + 构建 + 部署经常要一两分钟。本地跑完直接推产物,页面刷新就能看到结果,改样式的时候这个差距很明显。

## 目录结构

```text
cos-cross.github.io/
├── _config.yml          # 站点配置(标题、导航、分页、RSS……)
├── package.json
├── source/
│   ├── _posts/          # 文章,一篇一个 .md
│   ├── _data/
│   │   └── projects.yml # 项目清单,首页和 /projects/ 都读它
│   ├── about/
│   └── projects/
├── themes/cos-cross/
│   ├── _config.yml      # 主题配置(头像、社交链接、开关)
│   ├── layout/          # EJS 模板
│   └── source/          # css / js / 图片
└── public/              # 构建产物(不提交,单独推到 gh-pages)
```

站点配置和主题配置分开放,是因为这两类东西改动的频率不一样:导航项、社交链接这种东西会经常动,放主题配置里,不用碰模板代码。

## 写一篇新文章

流程就是普通的 Markdown:

```bash
# 新建一篇文章(会在 source/_posts/ 下生成 .md)
npx hexo new "文章标题"

# 本地预览,http://localhost:4000
npm run server

# 构建静态文件到 public/
npm run build

# 构建并推送到 gh-pages 分支
npm run deploy
```

文章的头部是 front-matter:

```yaml
---
title: 文章标题
date: 2026-04-12 21:30:00
categories: 随笔
tags: [博客, Hexo]
math: true      # 需要渲染公式时打开
---
```

正文里在合适的位置插入一行 `<!-- more -->`,首页摘要就截到这里,不然首页会直接把全文铺出来。

## 部署是怎么走的

思路很简单:**`main` 分支只放源码,`gh-pages` 分支只放构建产物**。

```bash
# 1. 构建
npx hexo clean && npx hexo generate

# 2. 把 public/ 推成 gh-pages 分支
cd public
git init -b gh-pages
git add -A
git commit -m "deploy"
git push -f <repo> gh-pages:gh-pages
```

然后在仓库的 Pages 设置里,把发布源指向 `gh-pages` 分支即可。产物目录里会额外放一个空的 `.nojekyll` 文件,告诉 GitHub 不要再拿 Jekyll 处理一遍 —— 否则以 `_` 或 `.` 开头的文件会被它悄悄跳过。

> 一个容易踩的坑:如果你在 `main` 里同时放源码和产物,再让 Pages 直接发布 `main`,Jekyll 会去处理 `source/` 下面那些 Markdown,生成一堆和产物重名的页面。用两个分支能彻底避开这个问题。

## 接下来想做的

- 文章页加代码复制按钮和目录高亮(**已经做了**);
- 数学公式支持 KaTeX(**已经做了**,写数学文章的时候打开 `math: true`);
- 评论系统,暂时还没想好要不要加;
- 给项目页加个自动从 GitHub API 拉 star 数的小脚本。

写博客最难的从来不是搭建,是坚持写下去。这篇算是个开始。
