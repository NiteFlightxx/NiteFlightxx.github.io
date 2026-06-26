# 媒体嵌入标准（图片 / GIF / SVG / 视频 / iframe）

> 本文档规定在知识库 / 实验室文章中插入静态图片、GIF 动图、内联 SVG 图表、本地视频、外部 iframe（GeoGebra / B 站）的目录约定与语法标准。添加新文章的整体流程见 [`ADDING_ARTICLES.md`](ADDING_ARTICLES.md)，本文是其「正文约定」在媒体部分的展开。
>
> **当前主力**：静态图片 + GIF。SVG 图表、MP4、iframe 已就绪，需要时直接用。

---

## 0. 先搞清楚管线能吃什么（已实测）

文章正文页（`/knowledge/<slug>`、`/lab/<slug>`）由 Astro SSG 渲染，走 `astro.config.mjs` 配的内置 Markdown 处理器（`@astrojs/markdown-remark`）：

```js
// astro.config.mjs
markdown: {
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeSlug, rehypeKatex],
}
```

关键事实（用真实处理器逐项验证过）：**裸 HTML 不会被剥离，会原样进入产物**。

| 写法 | 管线行为 | 结果 |
|---|---|---|
| `![alt](/images/x.png)` | ✅ Markdown 原生图片语法 | `<img>` |
| 裸 `<div>` / `<canvas>` | ✅ 原样保留 | 可直接在 .md 里写 |
| 裸 `<svg>` | ⚠️ **必须包 `<div>`**，否则子元素被拆散变黑/空（见 §4.2） | — |
| 裸 `<video autoplay loop muted>` | ✅ 原样保留 | 本地 MP4 直接播 |
| 裸 `<iframe src=...>` | ✅ 原样保留 | GeoGebra / B 站可直接嵌入 |
| 裸 `<script>` / `<style>` | ✅ 原样保留 | 可做局部样式 / 轻交互 |
| 行内 `$...$` 写在**裸 HTML 元素文本里** | ⚠️ **不渲染**，原样输出 | 见 §7 坑 |
| 块级 `$$...$$`（独立成行） | ✅ 渲染 | 即使夹在 HTML 块之间也行 |

> ⚠️ **无 CSP 限制**：`Layout.astro` / `ArticleLayout.astro` 未设 `Content-Security-Policy`，GitHub Pages 也不注入 CSP 头，所以外部 iframe（geogebra.org、player.bilibili.com）能自由加载。
>
> ℹ️ **两条管线**：首页列表卡片走 `src/lib/content.ts`（自定义 unified 管线，会剥 HTML），但卡片只用纯文本 `excerpt`，不影响正文。**正文嵌入只看上表**。

---

## 1. 目录约定

媒体文件放 `public/` 下（Astro 静态目录，构建时原样拷贝到站点根）。**不要**放 `src/assets/`——那是 Astro 图片优化管线的目录，正文不走它。

| 类型 | 目录 | URL | 状态 |
|---|---|---|---|
| 静态图片（PNG/JPG/WebP/SVG 文件） | `public/images/` | `/images/<file>` | ✅ 已建 |
| 动图 GIF | `public/gifs/` | `/gifs/<file>` | ✅ 已建 |
| 本地视频 MP4/WebM | `public/videos/` | `/videos/<file>` | ⏳ 用到再建 |
| 内联 SVG | 直接写在 .md 里 | — | ✅ 无需文件 |

URL 规则：`public/` 下的路径就是 URL 根路径，`public/images/foo.png` → `/images/foo.png`（**不是** `public/images/...`）。

> ⚠️ **base 路径**：当前部署用户页 `*.github.io`，`base = "/"`，绝对路径 `/images/...` 正常。若日后部署到项目页（`base = "/<repo>/"`），自定义管线不会自动给 markdown 里的 URL 加前缀，需届时统一处理。

---

## 2. 静态图片（PNG / JPG / WebP / SVG 文件）

### 2.1 语法

标准 Markdown，**alt 必填**：

```markdown
![雅可比迭代收敛过程的网格热力图](/images/jacobi-convergence-heatmap.png)
```

### 2.2 格式选择

| 内容 | 推荐 | 理由 |
|---|---|---|
| 截图 / 照片 | WebP 或 JPG | WebP 比 PNG 小 25–35% |
| 线稿 / 图表 / 公式截图 | PNG 或 SVG | 锐利边缘、透明背景 |
| 图标 / 简单几何 | SVG 文件 | 矢量、可着色、最小 |

> 💡 **优先 WebP**：同画质比 PNG 小约 30%，GitHub Pages 全支持。

### 2.3 命名

全小写、短横线分词、语义化：`red-black-coloring.png`、`pid-step-response.webp`。不要 `1.png`。

### 2.4 尺寸

`.article-body img` 约束为 `max-width: 100%`，源文件宽度 **800–1600px** 即可。线稿导出 2x（Retina），CSS 自动缩放。

---

## 3. GIF 动图

### 3.1 语法

与静态图片完全相同（GIF 本质是图片），浏览器原生循环：

```markdown
![Red-Black 染色两阶段 sweep 过程](/gifs/red-black-coloring.gif)
```

### 3.2 适用与体积

GIF 适合**短循环**（≤ 5s、≤ 2MB）：迭代收敛、染色演示、算法分步。

| 时长 / 内容 | 建议 |
|---|---|
| ≤ 3s、简单循环 | GIF |
| 3–8s、画面复杂 | 先试 GIF，> 3MB 转 MP4 |
| > 8s 或画面丰富 | **直接 MP4**（§5），体积砍到 1/5–1/10 |

### 3.3 压缩

提交前压缩：降帧率到 10–15fps、降分辨率到 480–720p、减色到 64–128 色。工具 `gifsicle --optimize=3 --colors 128`、ezgif.com。

---

## 4. 内联 SVG 图表（推荐用于数学曲线 / 示意图）

### 4.1 为什么用内联 SVG

直接在 .md 里写 `<svg>...</svg>`：矢量无损缩放、可用站点配色、与正文风格统一、零文件管理。适合**手绘的数学曲线、几何示意、流程图**。

### 4.2 写法（必须包一层 `<div>`）

⚠️ **关键陷阱**：`<svg>` 不在 CommonMark 的 HTML 块级标签白名单里（`div` 在、`svg` 不在）。**裸写 `<svg>...</svg>` 会被解析器拆散**——开标签后第一个子元素起的内容被踢出 SVG、包成 `<p>` 段落，浏览器渲染出的 SVG 内只剩最先绘制的元素（如背景 `<rect>`），整块变成黑/空矩形。**必须用 `<div>` 包裹**，整块才会作为 HTML 块原样保留：

````markdown
<div>
<svg class="inline-chart" viewBox="0 0 640 400" role="img" aria-labelledby="t d" xmlns="http://www.w3.org/2000/svg">
  <title id="t">图标题</title>
  <desc id="d">图描述（无障碍）</desc>
  <rect width="640" height="400" fill="#0d0d0d"/>
  <!-- ... 折线、坐标轴、文字 ... -->
</svg>
</div>
````

`class="inline-chart"` 在 `<svg>` 上（响应式 CSS 已作用：`max-width:640px`、居中、圆角、`height:auto` 由 `viewBox` 自动算高）。`<div>` 与 `<svg>` 之间**不要留空行**，保持一个连续 HTML 块。

### 4.3 站点配色（直接用）

| 用途 | 色值 | 变量 |
|---|---|---|
| 底色 | `#0d0d0d` | brand-gray-900 |
| 主强调（曲线 A / GS） | `#bcfd49` | Cyber Lime |
| 次强调（曲线 B / 雅可比） | `#6366f1` | indigo |
| 正文/标题文字 | `#e2e8f0` | silver |
| 轴标签 / 网格 | `#a1a1a1` / `#1f1f1f` | gray-400 / gray-700 |

### 4.4 注意

- **包 `<div>`（最重要）**：见 §4.2，裸 `<svg>` 会被拆散变黑，必须 `<div>` 包裹、中间不留空行。
- **字体**：SVG `<text>` 会继承全局 `font-weight: 900`，图表里显式写 `font-weight="400"` 避免糊成一团；`font-family="'Source Han Sans CN','Noto Sans SC',system-ui,sans-serif"` 保持统一。
- **scope**：用 `class="inline-chart"` 而非 `svg` 标签选择器——KaTeX 内部也用 SVG，class 作用域不会误伤。
- **别在 SVG `<text>` 里写 `$...$`**：SVG 文本不走 KaTeX，公式用 Unicode（²、⁻¹、≈、√）或截图。

---

## 5. 本地视频 MP4

### 5.1 现在就能用（无需改管线）

裸 `<video>` 原样保留。文件放 `public/videos/`（用到时建）：

```html
<video autoplay loop muted playsinline src="/videos/jacobi-convergence.mp4" style="width:100%"></video>
```

四个属性缺一不可：`autoplay`（自动播）、`loop`（循环）、`muted`（静音，否则浏览器不让 autoplay）、`playsinline`（移动端不全屏）。

### 5.2 何时用 MP4 而非 GIF

GIF 压到极限仍 > 3MB，或动画 > 8s、画面丰富时用 MP4，体积可砍到 GIF 的 1/5–1/10。短循环仍优先 GIF（语法更简单、自动循环）。

---

## 6. iframe 嵌入：GeoGebra 与 B 站视频

外部交互内容用 iframe，**现在就能用**。视频类用 `class="video-embed"`（16:9）；计算器类（Desmos / GeoGebra）用 `class="calc-embed"`（更高，放得下表达式列表 + 图像）。

### 6.1 Desmos 函数 / 计算器（首选）

```html
<iframe class="calc-embed" loading="lazy"
  src="https://www.desmos.com/calculator/<计算器ID>?embed"></iframe>
```

**取计算器 ID**：Desmos 计算器 URL `desmos.com/calculator/3l8c9bttav` 里的 `3l8c9bttav` 段。在 URL 末尾加 `?embed` 即为可嵌入版（去掉顶部 chrome，专注图像）。计算器须为「公开」状态，私有/未发布的不显示。

适合：函数曲线、参数滑块、数值关系可视化——做图比 GeoGebra 快，适合一次性曲线图。本站已验证 `?embed` 参数与 KaTeX 共存正常。

### 6.2 GeoGebra 交互画板

```html
<iframe class="calc-embed" loading="lazy"
  src="https://www.geogebra.org/material/iframe/id/<材料ID>/width/800/height/600"
  allowfullscreen></iframe>
```

**取材料 ID**：在 [geogebra.org](https://www.geogebra.org) 打开一个材料（或自己用 GeoGebra Classic 建并存盘），点「分享 → 嵌入」，复制 iframe 的 `src`，其中的 `id/XXXXX/` 就是材料 ID。

适合：可拖拽的几何构造、动态作图、需要自由操作点/线/面的交互演示（Desmos 更偏函数曲线，GeoGebra 更偏几何）。

### 6.3 B 站视频

```html
<iframe class="video-embed"
  src="//player.bilibili.com/player.html?bvid=BV1xxxxxxxx&page=1&autoplay=0&high_quality=1"
  scrolling="no" frameborder="0" allowfullscreen></iframe>
```

**取 bvid**：B 站视频 URL `bilibili.com/video/BV1xxxxxxxx` 里的 `BV...` 段。`autoplay=0` 不自动播（避免多视频页噪音）。`//` 协议相对 URL 在 https 站点自动走 https。

> ⚠️ 个别 B 站视频作者关闭了「允许嵌入」，会显示「拒绝连接」。换视频或在文中放普通外链即可。

### 6.4 通用 iframe

YouTube 等同理，用平台给的嵌入码，视频类套 `class="video-embed"`，画板类套 `class="calc-embed"`。

---

## 7. 唯一的坑：行内公式不能写在裸 HTML 元素里

```markdown
<div>系数 $k$ 的值</div>      ← $k$ 原样显示成字面文本，不渲染
```

原因：`remark-math` 只扫描普通文本节点，不进 HTML 块内部；`rehype-raw` 解析裸 HTML 时已晚于数学扫描。

**规避**：公式放普通段落（不在 HTML 元素内），或用独立成行的块级 `$$`。SVG/iframe 里需要符号用 Unicode（²、⁻¹、≈）。

---

## 8. 选型决策表

| 要展示的内容 | 时长 | 首选 |
|---|---|---|
| 公式截图、架构图、静态示意 | — | **PNG/WebP**（§2） |
| 手绘数学曲线 / 几何示意 | — | **内联 SVG**（§4） |
| 短循环过程（收敛、染色） | ≤ 3s | **GIF**（§3） |
| 中等过程 | 3–8s | GIF，超 3MB 转 MP4 |
| 长动画 / 高清录屏 | > 8s | **MP4**（§5） |
| 可拖拽交互画板 | — | **GeoGebra iframe**（§6.1） |
| 视频讲解 | — | **B 站 iframe**（§6.2） |

---

## 9. alt 文本与无障碍

- **alt 必填**，描述内容不是文件名
- ✅ `![雅可比第 10 步误差热力图，误差已降至 0.02]`
- ❌ `![图片]` `![]()`
- SVG 用 `<title id>` + `<desc id>` + `role="img" aria-labelledby`（见 §4.2）

---

## 10. 体积预算（GitHub Pages 约束）

`public/` 全部进 git 并部署，无 LFS、无转码：

| 项 | 软上限 | 硬限制 |
|---|---|---|
| 单文件 | < 5MB | GitHub 禁 > 100MB 推送 |
| 单篇配图总和 | < 10MB | — |
| 仓库总量 | < 1GB | GitHub 推荐 < 5GB |

超限：WebP 替换 PNG、GIF 转 MP4、降分辨率 / 帧率。内联 SVG 几乎不占体积，优先用它替代位图。

---

## 11. 占位与未就绪图

图没做好但想先占位：用 blockquote 提示 + 正常图片语法指向**尚未存在**的文件。构建不会失败（断链渲染为破图），发布前补上真实文件即可：

```markdown
> 📺 **占位动图**：演示红黑两阶段 sweep。把 `red-black-coloring.gif` 放进 `public/gifs/` 后即显示。

![Red-Black 染色两阶段 sweep 过程](/gifs/red-black-coloring.gif)
```

---

## 12. 检查清单

- [ ] 文件放 `public/images|gifs|videos/`；内联 SVG 直接写在 .md
- [ ] 图片用 `![](url)`；SVG/视频/iframe 用裸 HTML（加对应 class）
- [ ] alt / `<title>` 描述内容，非空非文件名
- [ ] 文件名小写短横线、语义化
- [ ] 单文件 < 5MB；GIF 压过帧率 / 分辨率 / 色数
- [ ] 行内 `$...$` 没写在裸 HTML 元素文本里
- [ ] `npm run build` 成功，媒体在 `dist/` 对应路径出现
- [ ] 占位图发布前已补上真实文件

---

## 附：相关文件

| 文件 | 作用 | 何时要改 |
|---|---|---|
| `public/images/` `public/gifs/` `public/videos/` | 媒体目录 | 放文件 |
| `src/content/knowledge/*.md` 等 | 正文，内联 SVG/iframe 直接写 | 嵌入媒体 |
| `src/index.css` `.article-body img/.inline-chart/.video-embed` | 响应式基线 | 调外观 |
| `astro.config.mjs` `markdown` | 正文 Markdown 管线 | 一般不用改 |
| `src/lib/content.ts` | 首页列表卡片管线（剥 HTML，仅影响卡片） | 一般不用改 |
