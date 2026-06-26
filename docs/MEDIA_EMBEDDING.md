# 媒体嵌入标准（图片 / GIF / MP4）

> 本文档规定在知识库 / 实验室文章中插入静态图片、GIF 动图、MP4 视频的目录约定、语法标准与管线限制。添加新文章的整体流程见 [`ADDING_ARTICLES.md`](ADDING_ARTICLES.md)，本文是其「正文约定」在媒体部分的展开。
>
> **当前定位：以静态图片和 GIF 为主**，MP4 作为体积超限时的备选（需先开管线，见 §4）。

---

## 0. 先搞清楚管线能吃什么

正文 Markdown 由 `src/lib/content.ts` 的统一管线渲染：

```js
const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)      // ← 默认丢弃裸 HTML
  .use(rehypeKatex)
  .use(rehypeStringify);  // ← 默认转义裸 HTML
```

关键事实（已实测验证）：管线只认 **Markdown 原生语法**，**裸 HTML 标签会被静默丢弃**。`![](url)` 能用，但 `<img>`、`<video>`、`<figure>` 等裸 HTML 全部不渲染。

| 写法 | 管线行为 | 渲染结果 |
|---|---|---|
| `![alt](/images/x.png)` | ✅ Markdown 原生图片语法，保留 | `<img src="..." alt="...">` |
| `![alt](/gifs/x.gif)` | ✅ 同上（GIF 本质是图片） | `<img ...>`，浏览器自动循环 |
| `<img src="...">` 裸 HTML | ❌ 被 remark-rehype 丢弃 | 空段落 |
| `<video ...></video>` 裸 HTML | ❌ 被 remark-rehype 丢弃 | 空段落 |
| `<source ...>` 裸 HTML | ❌ 被 remark-rehype 丢弃 | 空段落 |

> ⚠️ 这就是为什么**静态图片和 GIF 现在就能用**，而 **MP4 必须先改管线**（见 §4）。

---

## 1. 目录约定

所有媒体文件放 `public/` 下（Astro 静态目录，构建时原样拷贝到站点根）。**不要**放 `src/assets/`——那是 Astro 图片优化管线的目录，本站的自定义管线不走它，放进去读不到。

| 类型 | 目录 | URL | 状态 |
|---|---|---|---|
| 静态图片（PNG/JPG/WebP/SVG） | `public/images/` | `/images/<file>` | ✅ 已建 |
| 动图 GIF | `public/gifs/` | `/gifs/<file>` | ✅ 已建 |
| 视频 MP4/WebM | `public/videos/` | `/videos/<file>` | ⏳ 待 MP4 启用后建 |

URL 规则：`public/` 下的路径就是 URL 根路径，所以 `public/images/foo.png` → URL `/images/foo.png`（**不是** `public/images/foo.png`）。

> ⚠️ **base 路径注意**：当前部署目标是用户页 `niteflightxx.github.io`，`astro.config.mjs` 推导 `base = "/"`，绝对路径 `/images/...` 正常。若日后部署到项目页（`base = "/<repo>/"`），markdown 里的绝对路径不会被自动加前缀（自定义管线不重写 URL），届时需统一处理路径。

---

## 2. 静态图片（PNG / JPG / WebP / SVG）

### 2.1 语法

标准 Markdown 图片语法，**alt 文本必填**：

```markdown
![雅可比迭代收敛过程的网格热力图](/images/jacobi-convergence-heatmap.png)
```

渲染为：

```html
<img src="/images/jacobi-convergence-heatmap.png" alt="雅可比迭代收敛过程的网格热力图">
```

### 2.2 格式选择

| 内容 | 推荐格式 | 理由 |
|---|---|---|
| 截图 / 照片 | WebP 或 JPG | WebP 比 PNG 小 25–35%；JPG 适合色彩丰富的照片 |
| 线稿 / 图表 / 公式截图 | PNG 或 SVG | 锐利边缘、透明背景；SVG 矢量无损缩放 |
| 图标 / 简单几何 | SVG | 矢量、可着色、体积最小 |
| 已有的 PNG | 直接用 | 不必批量转换，能用就行 |

> 💡 **优先 WebP**：同画质比 PNG 小约 30%、比 JPG 小约 25%，GitHub Pages 全支持。

### 2.3 命名

- 全小写、短横线分词：`red-black-coloring.png`、`pid-step-response.png`
- 语义化（描述内容），不要 `1.png` `image2.png`
- 多文章共用图加领域前缀：`ik-retargeter-skeleton.png`、`quadcopter-frame-body.png`

### 2.4 尺寸

图片在正文里被 `.article-body img` 约束为 `max-width: 100%`（不溢出列宽），所以源文件宽度做到 **800–1600px** 即可，无需 4K。线稿图建议导出 2x（Retina），CSS 自动缩放。

---

## 3. GIF 动图

### 3.1 语法

与静态图片完全相同（GIF 本质是图片），浏览器原生循环播放，无需任何额外属性：

```markdown
![Red-Black 染色两阶段 sweep 过程](/gifs/red-black-coloring.gif)
```

### 3.2 适用场景

GIF 适合**短循环**（≤ 5 秒、≤ 2MB）的过程演示：

- ✅ 迭代收敛过程（雅可比 / GS 逐步逼近）
- ✅ Red-Black 染色、波前并行的两阶段 sweep
- ✅ 算法分步演示（矩阵分裂、着色顺序）

### 3.3 体积警告

GIF 是最大的坑：256 色限制 + 无压缩帧，5 秒动画常达 2–5MB。GitHub Pages 是静态托管、无转码，大 GIF 会**拖慢首屏 + 膨胀 git 仓库**（`public/` 进 git，`.gitignore` 未排除）。

| 时长 / 内容 | 建议 |
|---|---|
| ≤ 3s、简单循环 | GIF，没问题 |
| 3–8s、画面复杂 | 先尝试 GIF，> 3MB 则转 MP4 |
| > 8s 或画面丰富 | **直接用 MP4**（见 §4），体积可砍到 1/5–1/10 |

### 3.4 压缩建议

提交前压缩，别直接扔原始录屏：

- 降帧率到 10–15fps
- 降分辨率到 480–720p
- 减色到 64–128 色
- 工具：`gifsicle --optimize=3 --colors 128`、在线 ezgif.com

---

## 4. MP4 视频

### 4.1 现状：当前管线不支持

如 §0 所述，`<video>` 是裸 HTML，会被当前管线**静默丢弃**。直接在 markdown 里写 `<video>` 渲染出来是空的。**要用 MP4，必须先开管线。**

### 4.2 启用方法（已验证）

在 `src/lib/content.ts` 给两个插件加 `allowDangerousHtml: true`（无需装新依赖）：

```js
const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })    // 保留裸 HTML
  .use(rehypeKatex)
  .use(rehypeStringify, { allowDangerousHtml: true }); // 输出不转义
```

实测：改后 `<video>` 原样输出，`![](url)` 图片照常，KaTeX 公式不受影响。

> ⚠️ `allowDangerousHtml` 会让正文里**所有**裸 HTML 直通。本站文章正文都是自己写的、无外部投稿，风险可控；但要注意别在 markdown 里混入未闭合的 HTML 段落，可能干扰后续公式 / 标题解析。
>
> 若还希望裸 HTML 里的标题能被 `rehype-slug` 加锚点、被 `rehype-katex` 处理公式，需另装 `rehype-raw`（把裸 HTML 字符串解析成 HAST 节点），插在 `remarkRehype` 之后、`rehypeKatex` 之前。单纯播 `<video>` 用不到这步。

### 4.3 启用后的写法

启用后用裸 HTML `<video>`（Markdown 无视频语法）：

```markdown
<video autoplay loop muted playsinline src="/videos/jacobi-convergence.mp4"></video>
```

或带 `<source>` 多源写法（兼容性更好）：

```html
<video autoplay loop muted playsinline>
  <source src="/videos/jacobi-convergence.webm" type="video/webm">
  <source src="/videos/jacobi-convergence.mp4" type="video/mp4">
</video>
```

四个属性缺一不可：

| 属性 | 作用 |
|---|---|
| `autoplay` | 自动播放（静默视频才能自动播） |
| `loop` | 循环 |
| `muted` | 静音（浏览器策略：不静音不让 autoplay） |
| `playsinline` | 移动端内联播放，不全屏接管 |

### 4.4 何时启用

**默认不启用。** 只有当出现「GIF 压到极限仍 > 3MB」或「需要 > 8s 的长动画」时再开。开了之后，此前所有文章的 GIF 写法无需改动。

---

## 5. 选型决策表

| 你要展示的内容 | 时长 | 体积预期 | 选什么 |
|---|---|---|---|
| 公式截图、架构图、静态示意 | — | < 500KB | **PNG/WebP**（§2） |
| 短循环过程（收敛、染色、分步） | ≤ 3s | < 2MB | **GIF**（§3） |
| 中等过程 | 3–8s | 2–3MB | GIF，超 3MB 转 MP4 |
| 长动画 / 高清录屏 / 画面丰富 | > 8s | — | **MP4**（需先 §4.2 启用） |

---

## 6. alt 文本与无障碍

- **alt 必填**，描述图片传达的信息，不是文件名
- ✅ `![雅可比迭代第 10 步的误差热力图，误差已从 1.0 降至 0.02]`
- ❌ `![图片]` `![1]` `![]()`
- 装饰性图（纯氛围、无信息）可 `alt=""`，但知识库正文几乎不存在这种

---

## 7. 体积预算（GitHub Pages 约束）

`public/` 全部进 git 并部署，无 LFS、无转码：

| 项 | 软上限 | 硬限制 |
|---|---|---|
| 单个文件 | < 5MB | GitHub 禁 > 100MB 文件推送 |
| 单篇文配图总和 | < 10MB | — |
| 仓库总量 | < 1GB | GitHub 推荐 < 5GB |

超限处理：WebP 替换 PNG、GIF 转 MP4、降分辨率 / 帧率。宁可少而精。

---

## 8. 占位与未就绪图

图还没做好但想先占位（像 `iterative-linear-solvers.md` §5.4.5 那样）：用 blockquote 提示 + 正常图片语法指向**尚未存在**的文件。构建不会失败（断链图片渲染为破图），发布前补上真实文件即可：

```markdown
> 📺 **占位动图**：演示红节点先并行更新、黑节点再并行更新的两阶段 sweep。把 `red-black-coloring.gif` 放进 `public/gifs/` 后即显示。

![Red-Black 染色两阶段 sweep 过程](/gifs/red-black-coloring.gif)
```

---

## 9. 检查清单

- [ ] 文件放 `public/images/` 或 `public/gifs/`（MP4 见 §4）
- [ ] 用 Markdown `![](url)` 语法，不用裸 `<img>`（除非已开 §4.2 且是 `<video>`）
- [ ] alt 文本描述内容，非空非文件名
- [ ] 文件名小写短横线、语义化
- [ ] 单文件 < 5MB；GIF 压过帧率 / 分辨率 / 色数
- [ ] `npm run build` 成功，图片在 `dist/` 对应路径出现
- [ ] 占位图发布前已补上真实文件

---

## 附：相关文件

| 文件 | 作用 | 何时要改 |
|---|---|---|
| `public/images/` | 静态图片目录 | 放图 |
| `public/gifs/` | GIF 目录 | 放动图 |
| `public/videos/` | 视频目录 | MP4 启用后建 |
| `src/lib/content.ts` | Markdown→HTML 管线 | 启用 MP4 时加 `allowDangerousHtml`（§4.2） |
| `src/index.css` `.article-body img` | 图片响应式基线（max-width / 居中 / 圆角） | 调整图片外观时 |
