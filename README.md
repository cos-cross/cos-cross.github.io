# Cos-Cross 的 个人博客

> OI · MO · Rhythm Game —— 把灵感写成代码,把热爱打成 PERFECT。

线上地址:**https://cos-cross.github.io**

基于 [Hexo](https://hexo.io) 构建,主题是手写的(没有用现成模板),托管在 GitHub Pages。

## 特点

- **零外部依赖**:字体用系统字体栈,CSS / JS / 图标全部内置,不加载任何 CDN 资源;
- **二次元音游风**:深色霓虹配色、玻璃拟态卡片、判定线动效、滚动连击彩蛋;
- **深浅色主题**:跟随系统,可手动切换并记住选择;
- **数学公式**:直接写 `$...$` / `$$...$$` 就行,**构建期**用 KaTeX 渲染成静态 HTML —— 不需要开关、不依赖 JS、不会闪一下原文;
- **函数图像**:`plot2d` / `plot3d` 代码块生成可交互的 2D 曲线与 3D 曲面,鼠标缩放 / 旋转,自己实现、零依赖;
- **代码高亮**:Hexo 内置 highlight.js,带行号和复制按钮;
- **响应式 + 无障碍**:移动端抽屉导航,尊重 `prefers-reduced-motion`。

## 目录结构

```text
.
├── _config.yml               # 站点配置(标题、导航、分页、RSS)
├── package.json              # "hexo" 字段是必需的,hexo-cli 靠它识别站点根目录
├── mdblog/                   # 随手写的笔记放这里,部署时自动变成文章
│   ├── _说明.md              # 以下划线开头 → 同步时跳过
│   └── 数学/fibonacci-golden-ratio.md
├── files/                    # 要分享的文件放这里,部署时自动上架到 /files/
│   ├── _说明.md              # 以下划线开头 → 同步时跳过
│   └── 博客维护/命令速查.txt
├── source/
│   ├── _posts/               # 文章:手写的 + mdblog/ 生成的都在这里
│   ├── _data/projects.yml    # 项目清单,首页和 /projects/ 都读它
│   ├── images/mdblog/        # mdblog 笔记里引用的图片(同步时自动搬过来)
│   ├── media/                # 背景视频 / 图片(npm run wallpaper 导入)
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
│   ├── empty-site-fallback.js  # Hexo 插件:零文章时兜底生成首页 / 归档 / RSS
│   ├── math.js                 # Hexo 插件:构建期用 KaTeX 渲染公式
│   ├── plot.js                 # Hexo 插件:plot2d / plot3d 代码块 → 可交互函数图像
│   └── notebook.js             # Hexo 插件:代码围栏加 exec 即可执行并输出结果
├── assets/
│   └── avatar-source.jpg      # 头像原图(不进主题目录 → 不会被发布到线上)
├── tools/
│   ├── deploy.mjs            # 部署到 gh-pages
│   ├── check.mjs             # 构建产物自检
│   ├── verify-live.mjs       # 线上站点验证
│   ├── sync-mdblog.mjs       # mdblog/ → source/_posts/ 同步
│   ├── sync-files.mjs        # files/ → source/files/ 同步并生成下载页数据
│   ├── import-wallpaper.mjs  # 从 Wallpaper Engine 导入壁纸当背景
│   ├── import-avatar.mjs     # 从 B 站同步头像 / 网站图标
│   ├── manage-projects.mjs   # 项目清单校验与生成
│   └── vendor-katex.mjs      # 复制 KaTeX 的 CSS 与字体(不需要客户端 JS)
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
| `npm run wallpaper -- 2903241954` | 从 Wallpaper Engine 导入壁纸当背景 |
| `npm run wallpaper -- --list` | 列出本机所有 Wallpaper Engine 壁纸 |
| `npm run mdblog` | 把 `mdblog/` 里的笔记同步成文章 |
| `npm run files` | 把 `files/` 里的文件同步上架到 `/files/` |
| `npm run projects -- check` | 校验项目清单(揪出私有仓库) |
| `npm run projects -- list` | 列出所有公开仓库及收录状态 |
| `npm run projects -- add <仓库名>` | 从 GitHub 生成一条项目清单骨架 |
| `npm run avatar -- 388480733` | 把 B 站头像同步成网站图标 |
| `npm run new "标题"` | 新建一篇文章 |
| `npm run vendor:katex` | 从 `node_modules/katex` 重新复制运行时资源 |

## 把背景换成 Wallpaper Engine 的壁纸

先说清楚**为什么不能直接把壁纸拿来用**:Wallpaper Engine 的壁纸分三种类型,能用的程度完全不一样。

| 壁纸类型 | 文件 | 能不能当网页背景 |
| --- | --- | --- |
| `video` | `xxx.mp4` | ✅ **直接能用**,而且效果和 WE 里一模一样 |
| `web` | `index.html` + 一堆资源 | ⚠️ 本质是个网页,得自己嵌 iframe |
| `scene` | `scene.pkg`(打包的) | ❌ 动作是 WE 引擎用 DirectX 实时算的,**导不出来** |

`scene` 是最常见的类型,也是最麻烦的 —— 它不是一个视频文件,而是一堆贴图 + 着色器,离开 WE 引擎就是一堆素材。想用只有两条路:用自带预览图(见下面的坑),或者**录屏**。

### 用法

```bash
# 先看看本机有哪些壁纸,以及每张是什么类型
npm run wallpaper -- --list

# 导入指定壁纸(Steam 创意工坊 ID)
npm run wallpaper -- 2903241954
```

工具会自动:定位 Steam 库 → 读 `project.json` 判断类型 → 压视频 → 抽封面 → 改好主题配置。

对 `video` 类型,它会用 ffmpeg 压成 720p / 无音轨 / faststart 的 mp4,通常能压到原文件的 **5%~10%**:

```text
源视频:咲弥 电脑.mp4  8.7 MB   (4K / 12 秒 / 6 Mbps)
视频:/media/background.mp4  0.5 MB
封面:/media/background.jpg  152 KB
```

想进一步控制体积:

```bash
npm run wallpaper -- 2903241954 --width 960 --crf 32 --duration 10
npm run wallpaper -- 2903241954 --width 1920 --crf 26      # 要更清晰
```

没装 ffmpeg 也能跑,只是会原样复制(体积可能大到不适合当背景),工具会打印出可手动执行的命令。

### 调效果

改 `themes/cos-cross/_config.yml`:

```yaml
background:
  mode: media
  video: '/media/background.mp4'
  poster: '/media/background.jpg'
  overlay: 0.62     # 压暗程度。文字看不清就调大,壁纸太淡就调小
  blur: 3           # 模糊像素。3~6 能明显提升文字可读性
  mobile: poster    # 手机上只显示封面图,不下载视频
  control: true     # 右下角显示「暂停背景」按钮
```

几个已经做好的取舍:

- **手机上不加载视频**(`mobile: poster`),只显示 152 KB 的封面图;
- 系统开了「减少动态效果」就不自动播放,只留封面;
- 切到别的标签页自动暂停,不白烧电;
- 视频在首屏渲染完之后才加载,不挡首屏。

### 两个坑

1. **`scene` 类型的预览图只有 160×160 左右。** 那是 Wallpaper Engine 列表里的缩略图,拉到全屏会糊成一团。工具会检测尺寸并提醒你;这时要么把 `blur` 开到 40 当抽象色块用,要么老老实实录屏。
2. **壁纸版权。** 创意工坊的壁纸是别人画的 / 别人剪的,自己电脑上随便用,但**公开挂到网站上属于二次分发**,最好先确认作者允许,或者换成自己有权限的素材。


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
---
```

正文用普通 Markdown。几个约定:

| 写法 | 效果 |
| --- | --- |
| `<!-- more -->` | 首页摘要截到这里,不写就是全文摘要 |
| `## 二级标题` | 自动生成锚点,并出现在右侧目录里 |
| ` ```js ` 代码块 | 高亮 + 行号 + 悬停复制按钮 |
| `$x^2$` / `$$...$$` | 行内 / 独立公式,**直接写就会渲染**,不需要任何开关 |
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

## 把网站图标 / 头像换成 B 站头像

```bash
# 只换浏览器标签页图标
npm run avatar -- 388480733

# 顺便把站内头像(导航 + 首页那个圆形)也换掉
npm run avatar -- 388480733 --avatar

# 32px 的图标太小、细节糊成一团时,放大裁切到人物
npm run avatar -- 388480733 --zoom 1.8 --avatar
```

参数可以是 **B 站 UID**、任意图片 URL,或本地文件路径:

```bash
npm run avatar -- https://example.com/avatar.png
npm run avatar -- "D:\pictures\me.png"
```

工具会调 B 站的公开接口拿到头像原图,然后生成:

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `favicon-32.png` | 32×32 | 浏览器标签页图标 |
| `apple-touch-icon.png` | 180×180 | iOS 添加到主屏 |
| `avatar.jpg` | 256×256 | 站内头像(`--avatar` 时启用) |

并自动改好 `themes/cos-cross/_config.yml` 里的 `profile.avatar` / `profile.favicon` / `profile.appleTouchIcon`。

**为什么要缩放**:B 站头像原图是 512×512、240 KB 的 JPEG,而标签页图标只需要 32px。不缩的话每次打开页面都要多下两百多 KB。缩放用 ffmpeg(环境变量 `FFMPEG` → PATH),没装会原样复制并给出提示。

**原始文件放在 `assets/avatar-source.jpg`,故意不放进主题目录** —— 主题 `source/` 下的东西会被原样发布到线上,一张 240 KB 的原图没必要让每个访客都下。放 `assets/` 既留了底,又不会被发布。

顺带修了一件事:`og:image` 原来指向 `avatar.svg`,而社交平台基本都不支持 SVG 缩略图 —— 换成 `avatar.jpg` 之后分享链接才会有正常的预览图。



网站上的项目展示**只有一个数据源**:`source/_data/projects.yml`。想改就去改它,不需要动任何模板代码。

### 删除

把那一整段 `- name: xxx` 删掉就行。比如不想展示 `FinalShellActivator`:

```yaml
# 整段删掉 ↓
- name: FinalShellActivator
  desc: 一个用于激活 FinalShell 的小工具。
  lang: Kotlin
  link: ''
  repo: https://github.com/cos-cross/FinalShellActivator
  tags: [Kotlin, 工具]
  icon: code
  accent: violet
  group: 小玩意
```

### 暂时隐藏(不想删掉配置)

在那一项里加一行 `hidden: true`:

```yaml
- name: FinalShellActivator
  hidden: true          # ← 加这一行,首页和 /projects/ 都不再展示
  desc: ...
```

### 添加

两种方式,任选:

```bash
# ① 自动拉取仓库信息,生成骨架(推荐)
npm run projects -- add GuessLetter
```

```yaml
# ② 手动复制一段改字段
- name: 新项目
  desc: 一句话介绍
  lang: JavaScript
  link: ''                                   # 有在线地址才填
  repo: https://github.com/cos-cross/新项目
  tags: [标签1, 标签2]
  icon: code                                 # code / star / music / link
  accent: cyan                               # cyan / violet / pink / lime / gold
  group: 在线工具                             # /projects/ 页面按它分组
```

**数组顺序就是展示顺序。** 首页只显示前几个,数量在 `themes/cos-cross/_config.yml` 的 `home.projects` 里改。

### ⚠️ 别把私有仓库写进去

`projects.yml` 会提交到公开仓库,渲染出来人人可见。**私有仓库的仓库名和描述写进去就等于泄露。**

为此加了一道校验:

```bash
npm run projects -- check
```

它请求的是 GitHub 的**公开**接口 `/users/<你>/repos` —— 未认证请求天然看不到任何私有仓库,所以「清单里有、公开列表里没有」就等价于「私有 / 已删除 / 已改名」,三种情况都会被报出来:

```text
❌ 有 1 个必须修的问题:
   - 「某个项目」不在 cos-cross 的公开仓库里 —— 它可能是私有仓库、已删除或已改名。
     私有仓库出现在公开站点上等于泄露,请删掉这一项或加 hidden: true。
```

`npm run projects -- add` 同样会拦截:往私有仓库加会得到 404,直接拒绝并在输出里说明原因。

**这道校验已经内置进 `npm run deploy`**,所以私有仓库泄露不出去。如果只是想跳过网络校验(比如 GitHub API 暂时不通),可以直接跑:

```bash
npx hexo generate && node tools/deploy.mjs
```

## 在文章里插可运行的代码块

在代码围栏的 info 串里加一个 `exec` 标记,**构建时会真正执行这个格子,并把输出一起渲染进文章**:

````markdown
```python exec
print(2 ** 10)
```
````

渲染出来是这样:

```python exec
print(2 ** 10)
```

读者打开网页直接看到真实结果 —— 不需要装 Python、不需要后端、不需要等任何东西加载。这和 `jupyter nbconvert` 导出 HTML 是一个思路:notebook 在本地跑,输出被固化进文档。

### 支持的语言

| 写什么 | 用什么执行 |
| --- | --- |
| `python exec` | `python`(可在配置里换成 `py -3` 或绝对路径) |
| `javascript exec` / `node exec` / `js exec` | 当前 Node(`process.execPath`,不会解析到别的版本) |
| `pwsh exec` / `powershell exec` | `pwsh` |
| `bash exec` / `sh exec` | `bash` |
| `ruby exec` | `ruby` |

执行用的解释器和显示用的高亮是分开的 —— 比如 `node` 这个词在 highlight.js 里不存在,会降级成无高亮,所以代码显示时用的是 `javascript` 的词法。

### 配置

`_config.yml`:

```yaml
notebook:
  enable: true
  timeout: 20000        # 单格最长运行时间,超时终止并在页面上说明
  cache: true           # 按「语言+代码」哈希缓存输出,没改过的格子重建时不重复执行
  max_output: 20000     # 输出截断阈值
  runners:
    python: python      # 换成 py -3 / C:\Python314\python.exe 之类的都行
```

### 几个已经处理掉的坑

- **输出会缓存**,第二次构建是 `本次执行 0 格,命中缓存 5 格`;
- **子进程输出重定向到文件而不是管道**,受限环境和普通终端都能跑;
- **强制 UTF-8**(`PYTHONIOENCODING`),否则 Windows 上中文输出是乱码;
- **traceback 里的本机路径会被抹掉**,只留 `cell.py`;
- **报错如实显示**:代码写错了,页面就显示真实 traceback(输出区红底),这比贴截图诚实得多;
- **超时保护**:写死循环也不会卡住构建。

### 改插件后不生效?

Hexo 的 `db.json` 渲染缓存会**跳过整个过滤器链** —— 文章内容没变时它直接复用上次的渲染结果。改了 `scripts/notebook.js` 想验证:

```bash
rm -f db.json && npm run build
```

### 想让读者自己改代码重跑?

那就得在浏览器里跑 Python,唯一的路子是 **Pyodide**(CPython 编译成 WebAssembly),首次要下 10~20 MB。取舍很清楚:

| | 构建期执行(当前方案) | Pyodide |
| --- | --- | --- |
| 读者要下载 | 0 | 首次 10~20 MB |
| 能改代码重跑 | 不能 | 能 |
| 国内网络 | 无影响 | 要能访问 CDN,或自己托管 |

博客场景里 90% 的需求是"**看到**真实输出",构建期执行就够了。真要上 Pyodide,务必做成**点按钮才加载**,别让不想跑的人陪着下十几 MB。

## 随手写笔记:`mdblog/` 文件夹

`mdblog/` 里的所有 Markdown 都会在 `npm run deploy` 时**自动转换成博客文章**。

```bash
# 1. 往 mdblog/ 里丢一个 .md(可以建子文件夹)
# 2. 正常写 Markdown,不用写 front-matter
# 3. 发布
npm run deploy
```

| 你写的 | 自动变成 |
| --- | --- |
| 正文第一个 `# 标题` | 文章标题(那一行会从正文里去掉,避免出现两个大标题) |
| 没写 `# 标题` | 用文件名当标题 |
| 文件修改时间 | 文章日期 |
| 子目录名 | 分类:`mdblog/数学/xxx.md` → 分类「数学」 |
| 相对路径的图片 | 复制到 `source/images/mdblog/<slug>/` 并改写路径 |
| 文件名 | 网址:`mdblog/数学/fibonacci.md` → `posts/fibonacci/` |

想自己指定就加 front-matter(写了以你写的为准,**其余字段原样保留**,包括多行 `tags:` 和自定义字段):

```markdown
---
title: 自定义标题
date: 2026-09-25 20:00:00
categories: 随笔
tags: [Hexo, 笔记]
slug: my-own-url        # 自定义网址
---
```

### 单独跑同步

```bash
npm run mdblog               # 只同步,不构建不发布
npm run mdblog -- --dry-run  # 只看会做什么,不落盘
```

`npm run build` / `npm run check` / `npm run deploy` 都会自动先跑一次,平时不用手动执行。

### 规则

- **单向同步。** `mdblog/` 是源;生成到 `source/_posts/` 的文章带 `mdblog_source:` 标记,
  是生成物,**改了会被下一次同步覆盖**。
- **手写文章不受影响。** 直接写在 `source/_posts/` 里的文章没有那个标记,同步时绝不会被碰。
- **删掉即下线。** 从 `mdblog/` 删掉一篇,对应文章也会被删掉(git 里能找回)。
- **`_` 和 `.` 开头的文件/文件夹会被跳过**,用来放说明和草稿(比如 `mdblog/_说明.md`)。
- 笔记里同样能用 `exec` 代码格和 `$公式$`,和正常文章没区别。

## 文章里的函数图像(2D / 3D,可交互)

用一个带 `plot2d` / `plot3d` 标记的代码块即可:

````markdown
```plot2d x=[-7,7] y=[-2,2]
sin(x)
cos(x)
```
````

````markdown
```plot3d x=[-5,5] y=[-5,5] grid=54
sin(sqrt(x^2+y^2))
```
````

- **2D**:滚轮缩放(以鼠标位置为锚点)、拖动平移、双击重置
- **3D**:拖动旋转、滚轮缩放、双击重置
- **触屏**:单指拖动、双指捏合缩放
- 每个图右上角有「重置」和「存为 PNG」

表达式**一行一个**,`#` 开头的行会被忽略(当注释用)。

### 选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `x=[a,b]` | 2D `[-10,10]` / 3D `[-5,5]` | 横轴范围 |
| `y=[a,b]` | 2D 自动适配 / 3D `[-5,5]` | 纵轴范围(3D 时是第二个自变量) |
| `z=[a,b]` | 自动 | 3D 颜色映射的高度范围 |
| `grid=n` | 46 | 3D 网格密度(8~90) |
| `n=n` | 900 | 2D 采样点数(100~2000) |

### 支持的函数

`sin` `cos` `tan` `asin` `acos` `atan` `atan2` `sinh` `cosh` `tanh` `asinh` `acosh` `atanh`
`exp` `log` `ln` `log2` `log10` `sqrt` `cbrt` `abs` `sign` `floor` `ceil` `round` `trunc`
`min` `max` `pow` `hypot` `mod` `clamp`,外加 `sinc(x)` 和 `gauss(x, σ)`。
常量:`pi` `e` `tau`。

写法上支持**隐式乘法**:`2x`、`3sin(x)`、`(x+1)(x-1)` 都能认,且优先级和显式乘法一致
(所以 `2x^2` 是 `2·(x²)`)。

### 为什么是自己写的,不是引库

| | plotly.js | three.js | 本项目 |
| --- | --- | --- | --- |
| 体积 | 2D ≈1 MB,3D 再加 ≈1.3 MB | ≈600 KB | **30 KB** |
| 国内 CDN | 要能访问,否则得塞进仓库 | 同左 | 不涉及 |
| 可验证 | 只能"看起来对" | 同左 | **数学核心能在 Node 里跑单测** |

最后一条是关键:表达式解析、网格生成、投影、深度排序全是纯函数,所以能脱离浏览器验证。
3D 用的是 **Canvas 2D + 画家算法**(按深度从远到近画四边形),不是 WebGL ——
对 `z = f(x,y)` 这种单值高度场足够,还避开了上下文丢失和移动端兼容的麻烦。

### 构建期就会检查表达式

表达式写错了不用等打开网页:`npm run build` 的日志里直接报出来。

```text
WARN  plot: 2 个问题:
WARN    - _posts/xxx.md:"sin(x" —— 函数调用缺少 ")"
WARN    - _posts/xxx.md:"foo(x,y)" —— 未知函数:"foo"
```

绘制代码只在**含图像的页面**加载(`layout.ejs` 靠正文里有没有 `class="plot"` 判断),
其他页面完全不受影响。



直接写就行,**不需要任何开关**:

```markdown
行内公式 $E = mc^2$,块级公式:

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$
```

渲染发生在**构建期**(`scripts/math.js` 调 KaTeX,输出静态 HTML):

- **不需要 `math: true`。** 之前就是因为忘了在 front-matter 里加这个标记,公式一直没被渲染出来 —— 现在这个坑从设计上就不存在了;
- **不依赖 JS**,页面不会先闪一下 `$$...$$` 原文;
- **省掉 266 KB 客户端脚本** —— 浏览器端渲染需要 `katex.min.js` + `auto-render.js`,构建期渲染只需要 CSS 和字体(278 KB,且字体按需加载);
- 公式样式表只在**真的有公式**的页面引入(`head.ejs` 靠正文里有没有 `class="katex"` 判断)。

边界处理(都测过):

| 情况 | 行为 |
| --- | --- |
| 代码块 / 行内代码里的 `$` | 原样保留,不解析 |
| HTML 注释、`<script>` 里的 `$` | 原样保留 |
| 散文里的金额"价格 $5 到 $10" | 不误判(`$` 必须紧跟非空白字符) |
| 公式语法写错 | 渲染成红色错误标记,构建不中断,日志里报数 |

一个仍然存在的坑:**公式里的下划线会被 Markdown 当成斜体**。写 `\sigma_x` 请改成 `\sigma`,或者用 `\sigma_{x}` 之外的方式绕开。这是 Markdown 与数学混排的经典问题,和渲染方式无关。

## 文件下载区:`files/` 文件夹

把要分享的文件丢进 `files/`,部署后自动上架到 **`/files/`** 下载页:

```bash
npm run files                # 只同步
npm run files -- --dry-run   # 只看会做什么
npm run deploy               # 同步 + 构建 + 发布
```

```text
files/
├── 数学/三角函数速查.pdf   →  /files/数学/三角函数速查.pdf
├── 代码/oi-template.zip   →  /files/代码/oi-template.zip
└── 说明.txt               →  /files/说明.txt
```

子目录名就是页面上的分组名。每个条目自动带**大小、日期、sha256 前 8 位**,页面顶部有输入框可以按文件名筛选。下载就是直接下,没有登录、没有跳转页、没有限速。

### ⚠️ 这套方案的硬限制

**它是"把文件提交进 git 仓库",不是对象存储。**

| 限制 | 数值 |
| --- | --- |
| GitHub 单文件上限 | **100 MB**(超了推不上去,同步时会提醒) |
| 仓库建议体积 | 1 GB 以内 |
| 体积放大 | 文件在 `main`(`files/`)和 `gh-pages`(`public/files/`)各存一份,**仓库占用约等于文件体积 ×2** |

- ✅ PDF、课件、代码包、图片、字体 —— 没问题
- ❌ 视频、游戏包、系统镜像 —— 请用真正的对象存储

### 为什么不能做"访客上传"

**GitHub Pages 是纯静态托管,没有任何后端。** 上传总得有个地方接收文件、有个地方存,静态站两样都没有。所以只靠这个仓库,访客上传在原理上就做不到。

能做的是下面这些,按"是否值得"排序:

| 方案 | 访客能上传吗 | 代价 | 说明 |
| --- | --- | --- | --- |
| `files/` 文件夹(当前方案) | ❌ 只有你能"上传"(丢文件 + deploy) | 0 | 够用:分享自己的资料,不需要别人传 |
| 第三方网盘 / Alist | ✅ | 0 | 上传在网盘那边,博客只放链接或 iframe。国内可用阿里云盘、蓝奏云;Alist 能自建在 Vercel / Cloudflare 上,带完整网盘 UI |
| Cloudflare R2 + Worker | ✅ | 0(10 GB 免费额度) | 写几十行 Worker 换上传签名,前端直传。真正可控的对象存储 |
| Supabase Storage | ✅ | 0(1 GB 免费) | 前端用 anon key 直传,配 RLS 策略控制权限 |
| Decap CMS + GitHub OAuth | ⚠️ 只有仓库协作者能传 | 一个 OAuth 中转 | 标准做法:网页后台写文章/传图,提交到仓库。需要 serverless 函数做 OAuth 交换 |
| GitHub API + 个人令牌放前端 | ❌ **不要这么做** | — | 令牌会随 JS 一起发到浏览器,任何人都能拿到它推你的仓库 |

需要"别人也能上传"的话,推荐 **Cloudflare R2 + Worker**(真对象存储,免费额度够用)。

## 部署

**一条命令搞定:**

```bash
npm run deploy
```

它按顺序做四件事:

```text
1. 校验项目清单        → 防止私有仓库混进公开站点
2. hexo generate       → 把 source/ 和主题渲染成 public/
3. 源码提交并推送       → main 分支(文章、主题、配置的长期备份)
4. 产物推送到 gh-pages → 用临时 git 仓库强推,GitHub Pages 对外提供的内容
```

第 4 步之前会在 `public/` 里放一个空的 `.nojekyll`,告诉 GitHub 不要再拿 Jekyll 处理一遍产物。

**为什么是两个分支:** `main` 存源码,`gh-pages` 存构建结果。分开是为了不让 Jekyll 去处理 `source/` 里的 Markdown 源文件 —— 否则会生成一堆和产物重名的页面。

### 常用参数

```bash
npm run deploy -- -m "写了篇音游判定分析"   # 自定义源码提交信息
npm run deploy -- --no-source              # 只发站点,不动源码提交
GITHUB_TOKEN=ghp_xxx npm run deploy        # 用令牌认证(CI / 无凭据管理器的环境)
BLOG_REPO=https://github.com/u/r.git npm run deploy   # 临时换目标仓库
```

第 3 步是**全自动**的:它 `git add -A` 把工作区所有变更提交上去(提交信息默认是 `publish: <时间>`)。所以如果你手动改了配置或文章,直接 `npm run deploy` 就会一起带上。想自己控制提交信息就用 `-m`。

### 只改文档、不想发布站点

源码推送和站点发布是解耦的,直接走普通 git 操作即可:

```bash
git add -A && git commit -m "改了下 README" && git push
```

### 发布之后

```bash
npm run verify        # 等 20~60 秒,逐页验证线上与本地构建是否一致
```

GitHub Pages 的构建需要一点时间,`npm run verify` 会拿本地 `public/` 里的路由逐页去线上请求,所以增删文章之后不用改这个脚本。

### 认证

默认走 Git 凭据管理器(Windows 上是 Git Credential Manager)。如果环境里没有可用的凭据管理器,用令牌:

```bash
GITHUB_TOKEN=ghp_xxx npm run deploy
```

令牌只从环境变量读取,**不会写进任何配置文件**。这也是不用 `hexo-deployer-git` 的原因 —— 那个插件要求把仓库地址(可能带令牌)写进 `_config.yml`。

### 如果 Pages 没更新

1. 先看 GitHub 仓库的 **Actions / Settings → Pages** 里最新一次构建状态;
2. 构建报错的话,`npm run check` 能在本地提前发现大部分问题(死链、模板残留、关键结构缺失);
3. 产物确实推上去了但线上没变 → 大概率是浏览器缓存,`Ctrl+Shift+R` 强刷。

## 主页上的字都在哪改

首页所有文字都来自配置,**不需要动模板**。三个地方:

| 页面上看到的位置 | 改哪里 |
| --- | --- |
| 浏览器标签页 | `_config.yml` → `title` / `subtitle` |
| 导航栏品牌名 | `_config.yml` → `title`(或主题配置 `profile.name` 覆盖) |
| 导航栏头像下面的小字 | 主题配置 → `profile.bio` |
| 导航菜单项(首页/文章/项目/关于) | 主题配置 → `menu` |
| 头像右下角小角标(`LV.99`) | 主题配置 → `profile.level`(留空则不显示) |
| 大屏徽章(`PLAYER 1 · READY`) | 主题配置 → `hero.greeting` + `hero.status` |
| 大屏大标题 | `_config.yml` → `title`(或主题配置 `hero.title` 覆盖) |
| 大屏副标题 | `_config.yml` → `subtitle`(或主题配置 `hero.subtitle` 覆盖) |
| 大屏标语 | 主题配置 → `hero.desc`(留空则用 `_config.yml` 的 `description`) |
| 两个按钮的文字和链接 | 主题配置 → `hero.buttons` |
| 技能标签(JavaScript / Python / …) | 主题配置 → `hero.tags` |
| 板块标题「最新文章」「项目 / 作品」「标签」 | 主题配置 → `text.section_posts` / `section_projects` / `section_tags` |
| 板块右上角「全部 N 篇」「全部项目」 | 主题配置 → `text.section_posts_more` / `section_projects_more` |
| 没有文章时的提示 | 主题配置 → `text.empty_posts_title` / `empty_posts_desc` |
| 文章卡片内容 | 文章自己的 front-matter;项目卡片来自 `source/_data/projects.yml` |
| 页脚标语 | 主题配置 → `footer.slogan` |
| 页脚「已经坚持了 N 天」 | 主题配置 → `text.footer_days` |
| 页脚三列标题(导航/找到我/订阅) | 主题配置 → `text.footer_col_nav` / `footer_col_find` / `footer_col_sub` |
| 页脚右下角彩蛋 `ALL PERFECT` | 主题配置 → `text.footer_combo`(留空则整块隐藏) |

三个好用的点:

**1. `{count}` / `{days}` 会被自动替换成实际数字。**

```yaml
text:
  section_posts_more: 全部 {count} 篇      # → 全部 12 篇
  footer_days: 已经坚持了 {days} 天        # → 已经坚持了 260 天
```

**2. 留空 = 隐藏那一块**,不用去删模板代码:

```yaml
text:
  section_tags: ''        # 首页不再出现标签板块
  footer_combo: ''        # 页脚彩蛋整块消失
```

**3. 改完先本地看效果,满意了再发:**

```bash
npm run server          # http://localhost:4000,改配置自动刷新
npm run deploy          # 满意了再发布
```

YAML 缩进写错会导致整段配置失效,`npm run server` / `npm run build` 启动时会打印 `Validating config` 相关的报错 —— 改完先跑一下。

## 自定义

**站名和副标题只有一处来源:`_config.yml` 的 `title` / `subtitle`。** 改完这几处会自动跟着变 —— 浏览器标签页、导航栏品牌名、首页大屏标题、页脚品牌名和版权行,全部一致。

| 想改什么 | 改哪里 |
| --- | --- |
| 站点标题、副标题、描述 | `_config.yml` 的 `title` / `subtitle` / `description`(唯一来源) |
| 分页、RSS、归档 | `_config.yml` |
| 导航项、头像、社交链接、动效开关 | `themes/cos-cross/_config.yml` |
| 首页大屏的标语、按钮、技能标签 | `themes/cos-cross/_config.yml` 的 `hero` |
| 项目清单 | `source/_data/projects.yml` |
| 配色 / 圆角 / 间距 | `themes/cos-cross/source/css/style.css` 顶部的 CSS 变量 |
| 头像、站点图标 | `npm run avatar -- <B站UID>` |

主题配置里的这几项**默认是注释掉的**,因为它们会自动取站点配置的值:

```yaml
profile:
  # name: Cos-Cross        # 注释着 → 用 _config.yml 的 title
hero:
  # title:                # 注释着 → 用 _config.yml 的 title
  # subtitle:             # 注释着 → 用 _config.yml 的 subtitle
  desc: "把灵感写成代码,把热爱打成 PERFECT。"   # 留空则用 _config.yml 的 description
```

只有当你**想让某个位置显示得和站点标题不一样**时才需要打开它们。比如站名是「Cos-CrossのBlogger」,但导航栏嫌太长想只显示「Cos-Cross」,就打开 `profile.name` 填短的:

```yaml
profile:
  name: Cos-Cross          # 只有导航和页脚用它
```

所有配色都收在 `:root` 和 `[data-theme="light"]` 两组 CSS 变量里,换整套皮肤只需要改那几十行。

## 关于

- GitHub:[cos-cross](https://github.com/cos-cross)
- Bilibili:[@Cos_Cross](https://space.bilibili.com/388480733)
- 邮箱:coscross@126.com
- 小工具站:[IdealizedPreviewer](https://cos-cross.github.io/IdealizedPreviewer/)

## 许可

博客内容(文章、图片)版权归 Cos-Cross 所有;主题代码可以自由参考和使用。
