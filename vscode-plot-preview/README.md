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

这是仓库里自带的一个**本地扩展**,没有发布到市场。

### 方式一:直接从仓库文件夹跑(改代码时用这个)

1. 用 VSCode 打开这个仓库根目录(不是 `vscode-plot-preview/`);
2. 创建 `.vscode/launch.json`:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "跑预览插件",
         "type": "extensionHost",
         "request": "launch",
         "args": ["--extensionDevelopmentPath=${workspaceFolder}/vscode-plot-preview"]
       }
     ]
   }
   ```

3. 按 <kbd>F5</kbd>,会弹出一个新的 VSCode 窗口(扩展开发宿主),在里面打开任意 `.md` 按 `Ctrl+Shift+V` 即可。

### 方式二:装进日常用的 VSCode

把整个 `vscode-plot-preview` 文件夹复制到扩展目录:

| 系统 | 路径 |
| --- | --- |
| Windows | `%USERPROFILE%\.vscode\extensions\cos-cross.plot-preview-1.0.0` |
| macOS / Linux | `~/.vscode/extensions/cos-cross.plot-preview-1.0.0` |

重启 VSCode 就行。

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
2. **渲染器靠 `previewScripts` 注入。** 预览的 CSP 不允许正文里的内联 `<script>`,
   所以不能把渲染代码塞在 markdown-it 的输出里 —— 只能走 `contributes.markdown.previewScripts`。
3. **`preview/bootstrap.js` 盯着 DOM 变化。** 预览在编辑时只替换 body 的 HTML、
   **不会重新加载脚本**,所以新生成的图没人挂载。那个 MutationObserver 就是干这个的。

## 改了主题的绘图代码之后

同步一下,不然插件用的还是旧的:

```bash
npm run vscode:sync     # 从主题同步三份文件过来
npm run vscode:check    # 只检查是否一致(CI / npm run check 会跑)
```

`npm test` 里也有一条测试盯着这件事,忘了同步会直接红。

## 已知限制

- 只在 VSCode **自带的** Markdown 预览里生效。用 Markdown Preview Enhanced 之类
  自己实现预览的扩展时,它们不一定会调用 `extendMarkdownIt`;
- 不渲染 KaTeX 公式(那是博客构建期的事,预览里 VSCode 自己会处理数学);
- 预览里的画布宽度跟着编辑区走,窗口很窄时图会小 —— 拖宽一点就好;
- 站内相对链接、主题配色之类不会跟着来,这里只负责把图**画出来**。
