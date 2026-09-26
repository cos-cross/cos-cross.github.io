# 函数图像预览(`plot2d` / `plot3d`)

在 **VSCode 自带的 Markdown 预览**里直接渲染 `plot2d` / `plot3d` 代码块,和博客上用的是**同一个渲染核心**:

````markdown
```plot2d x=[-7,7] y=[-2,2]
sin(x)
cos(x)
```

```plot3d x=[-2,2] y=[-2,2] z=[-2,2] grid=34
sphere(0, 0, 0, 1) where z >= 0
```
````

`Ctrl+Shift+V` 打开预览就能看到图 —— 滚轮缩放、拖动旋转、双击重置,和网站上完全一样。

## 装法

### 方式一:用打好的 .vsix(最省事)

仓库根目录跑一次:

```bash
npm run vscode:package
```

会在 `vscode-plot-preview/` 下生成 `plot-preview-1.0.0.vsix`。然后:

- **VSCode 里装**:扩展面板右上角「…」→「从 VSIX 安装…」,选那个文件;
- **命令行装**:`code --install-extension vscode-plot-preview/plot-preview-1.0.0.vsix`

装完重启 VSCode。

(`npm run vscode:package` 做的事就是 `npx @vscode/vsce package` ——
额外做了两件事:先核对副本是不是最新的,以及带上 `--no-dependencies`。
后者是因为这个扩展**没有任何运行时依赖**,而 vsce 默认会去 spawn `npm ls`,
在受限环境里那一步会被拦掉直接失败。)

### 方式二:直接从仓库文件夹跑(改插件代码时用这个)

1. 用 VSCode 打开这个仓库根目录(不是 `vscode-plot-preview/`);
2. 按 <kbd>F5</kbd> —— 仓库里已经放好 `.vscode/launch.json`,会弹出一个新的
   VSCode 窗口(扩展开发宿主);
3. 在那个新窗口里打开任意 `.md`,按 `Ctrl+Shift+V` 即可。

### 方式三:不打包,手动拷进扩展目录

把整个 `vscode-plot-preview` 文件夹复制到扩展目录:

| 系统 | 路径 |
| --- | --- |
| Windows | `%USERPROFILE%\.vscode\extensions\cos-cross.plot-preview-1.0.0` |
| macOS / Linux | `~/.vscode/extensions/cos-cross.plot-preview-1.0.0` |

重启 VSCode 生效。

## 支持的写法

**和网站上完全一致** —— 因为容器的 JSON 就是同一个 `scripts/plot.js` 生成的:

- `plot2d` / `plot3d`,选项写在围栏那一行:`x= y= z= grid= alpha= ratio= equal= n=`;
- 表达式一行一个,`#` 开头当注释;
- `y = sin(x)`、`sin(x)`、`x^2 + y^2 = 1`(隐式)、`f(x,y,z)=0`(等值面);
- `point(1, 2) A`、`segment(A, B)`、`polygon(A, B, C)`、`sphere(A, 1)`;
- `centers`、`links(2)`;
- `where x > 0`,以及独立成行的全局约束;
- 隐式曲面伸出 `x/y/z` 范围时会自动撑开(和构建期同一套逻辑)。

## 它是怎么接进去的

```
VSCode Markdown 预览
  └─ markdown-it ──(extension.js 覆盖 fence 规则)──> <div class="plot"> 容器 + JSON
                                                       ↑
                                       vendor/plot-build.cjs(= scripts/plot.js)
                                                       ↑
                                          preview/plot.js(= 主题的渲染核心)
                                                       └─ markdown.previewScripts 注入
```

三个关键点:

1. **解析规则只有一份。** `vendor/plot-build.cjs` 和 `preview/plot.js` 是从
   `scripts/plot.js` / `themes/cos-cross/source/js/plot.js` 同步过来的,不手写第二套。
   所以"编辑器里看到的"永远等于"网站上看到的"。
2. **必须声明 `markdown.markdownItPlugins: true`。** ⚠️ 这条最容易漏:
   VSCode 只对声明了它的扩展调用 `extendMarkdownIt`。
   少了它,扩展照样会被激活(`markdown.previewScripts` / `previewStyles` 也照常注入),
   **但那个钩子一次都不会被调用** —— 预览里就一直是代码块原文。
   如果没有输出面板日志,几乎不可能从现象上看出来。`tools/test-vscode.mjs` 里有一条测试守着它。
3. **渲染器靠 `previewScripts` 注入。** 预览的 CSP 不允许正文里的内联 `<script>`,
   所以不能把渲染代码塞在 markdown-it 的输出里 —— 只能走 `contributes.markdown.previewScripts`。
4. **`preview/bootstrap.js` 盯着 DOM 变化。** 预览在编辑时只替换 body 的 HTML、
   **不会重新加载脚本**,所以新生成的图没人挂载。那个 MutationObserver 就是干这个的。

顺带一个反直觉的地方:**围栏里的选项没法从 HTML 里捞回来。** markdown-it 只把语言名
(第一个词)写进 `class="language-plot2d"`,`x=[-7,7] grid=48` 这些全丢了。所以
"在 webview 里自己解析代码块"这条兜底路是走不通的(会静默用默认参数画出错误的图),
`extendMarkdownIt` 是唯一正确的接入点。

## 改了主题的绘图代码之后

同步一下,不然插件用的还是旧的:

```bash
npm run vscode:sync     # 从主题同步三份文件过来
npm run vscode:check    # 只检查是否一致(CI / npm run check 会跑)
```

`npm test` 里也有一条测试盯着这件事,忘了同步会直接红。

## 预览里还是代码块原文?三步定位

预览里的"没画出来"只有一种表现,但原因可能有三层。装完先按顺序排:

**① 装完必须重载窗口。** VSCode 是在打开预览时**创建 markdown-it 实例**并把扩展挂上去的;
扩展在**已经打开的预览**里不会立刻生效。

```
Ctrl+Shift+P → Developer: Reload Window
```

**② 看扩展有没有真的加载。**

```
Ctrl+Shift+P → 开发人员:显示正在运行的扩展(Show Running Extensions)
```

里面应该能看到 `plot-preview`,而且状态是 activated。看不到就是没装上 / 被禁用 /
VSCode 版本低于 `engines.vscode`(`^1.75.0`)。

**③ 看「输出 → 函数图像预览」面板。** 这是 1.0.1 新加的,每一步都记在里面:

```
[激活] plot-preview 1.0.1,VSCode 1.9x.x
[激活] 渲染核心 已加载
[激活] 代码块构建器 已加载
[钩子] extendMarkdownIt 第 1 次被调用(markdown-it 14.1.0)
[围栏] 3d /path/note.md → 容器 826 字节
```

对着日志就能判断:

| 日志里看到 | 说明 | 怎么办 |
| --- | --- | --- |
| 什么都没有 | 扩展根本没激活 | 回到 ①② |
| 有「激活」没有「钩子」 | VSCode 没调用 `extendMarkdownIt` | 确认用的是**自带**的 Markdown 预览(`Ctrl+Shift+V`),不是 Markdown Preview Enhanced 之类的第三方预览 |
| 有「钩子」没有「围栏」 | 钩子装上了,但没收到 plot 围栏 | 检查围栏那一行:三个反引号后面**紧跟** `plot2d` / `plot3d`,中间不能有空格 |
| 有「围栏 → 容器」但预览还是空的 | 解析没问题,是浏览器端的事 | 「帮助 → 切换开发人员工具」看 Console 有没有 `[plot-preview]` 报错 |
| 「围栏 ❌ 画不出来」 | 表达式有问题 | 红框和日志里都写了原因 |

还有一个命令可以直接打印全部状态:

```
Ctrl+Shift+P → 函数图像预览:诊断
```

它会把上面这些数字连同一份"下一步该查什么"的建议打进输出面板。

## 已知限制

- 只在 VSCode **自带的** Markdown 预览里生效。用 Markdown Preview Enhanced 之类
  自己实现预览的扩展时,它们不一定会调用 `extendMarkdownIt`(方案②的日志里能看出来);
- 不渲染 KaTeX 公式(那是博客构建期的事,预览里 VSCode 自己会处理数学);
- 预览里的画布宽度跟着编辑区走,窗口很窄时图会小 —— 拖宽一点就好;
- 站内相对链接、主题配色之类不会跟着来,这里只负责把图**画出来**。
