# Nite — 个人研发实验室

> Unreal Engine 工程师的个人作品 / 知识库站点。工程能力 · 研究能力 · 系统设计能力。

基于 **Astro 5 + React 19** 的静态站点：首页为 React SPA 单页应用（`client:only="react"`），知识库文章为 Astro 原生静态路由页（独立 URL、左侧目录、KaTeX 公式）。部署于 GitHub Pages。

线上地址：<https://niteflightxx.github.io/>

---

## 技术栈

| 领域 | 选型 |
|---|---|
| 框架 | Astro 5（静态输出 `output: 'static'`） |
| UI 岛 | React 19（`@astrojs/react`），首页 SPA shell |
| 样式 | Tailwind CSS v4（CSS-first `@theme` 配置，`@tailwindcss/vite`） |
| 动画 | Motion（Framer Motion v12，`motion/react`） |
| 图形 | OGL（WebGL，`DynamicLinesBg` 动态线条背景） |
| 图标 | lucide-react |
| 数学 | remark-math + rehype-katex + KaTeX（构建时渲染，非客户端） |
| 标题锚点 | rehype-slug（自动给 Markdown 标题生成 `id`） |
| 字体 | Source Han Sans CN（思源黑体，全站 weight 900）+ JetBrains Mono + Noto Sans SC |

---

## 项目结构

```
src/
├── App.tsx                    # SPA 入口：tab 路由（hash 初始 tab）+ 各 View 切换
├── index.css                  # Tailwind @theme + 全站样式 + .article-body 正文排版
├── translations.ts            # 项目 / 技能 / 时间线数据 + UI 文案（中文）
├── types.ts
│
├── components/                # SPA 视图组件（React）
│   ├── Header.tsx / Footer.tsx
│   ├── HomeView.tsx           # 首页：精选系统 + 最新知识
│   ├── ProjectsView.tsx       # 项目卡片 + ProjectDetailModal 详情弹窗
│   ├── KnowledgeView.tsx      # 知识库 feed（卡片 → 新标签页打开文章）
│   ├── ArchiveView.tsx        # 档案：技能矩阵
│   ├── ArticleToc.tsx         # 文章页左侧目录（分级折叠 + scroll-spy）
│   ├── BorderGlow.tsx         # 卡片边框光效
│   ├── SideRays.tsx           # 背景光线层
│   └── DynamicLinesBg.tsx     # WebGL 动态线条背景
│
├── layouts/
│   ├── Layout.astro           # SPA 页面骨架
│   └── ArticleLayout.astro    # 文章页布局（背景层 + 顶栏 + 左 TOC + 正文）
│
├── pages/
│   ├── index.astro            # 首页（挂载 React App）
│   └── knowledge/[slug].astro # 知识库文章静态路由
│
├── content/
│   ├── config.ts              # 内容集合 schema（knowledge，zod）
│   └── knowledge/*.md         # 知识库文章
│
└── lib/
    ├── content.ts             # SPA 端内容加载器（import.meta.glob）
    └── taxonomy.ts            # 分类中文映射（单一真相源）

scripts/
└── fence-math.py              # 把单行 $$...$$ 批量转为围栏式（修正旧文档用）

docs/
├── ADDING_ARTICLES.md         # 添加新文章的标准工作流（必读）
└── MEDIA_EMBEDDING.md         # 图片 / GIF / MP4 嵌入标准
```

---

## 内容集合

一个 Astro Content Collection，由 `src/content/config.ts` 的 zod schema 约束：

| | 知识库 `knowledge` |
|---|---|
| 定位 | 知识沉淀 / 技术分析 / 教学内容 |
| 分类字段 | `category` + `subtopic` |
| 分类取值 | Engine / Physics / Animation / Rendering / Gameplay / AI / Mathematics |
| 路由 | `/knowledge/<slug>/` |
| `readTime` | 必填 |

每篇文章点击后在**新标签页**打开，拥有独立可分享的永久链接；文章页左侧带分级折叠目录（每个 `##` 可独立折叠其 `###` 子项）+ scroll-spy 高亮。分类的中文显示名由 `src/lib/taxonomy.ts` 单一映射，frontmatter 只写英文枚举。

**添加新文章请严格遵循 [`docs/ADDING_ARTICLES.md`](docs/ADDING_ARTICLES.md)**，其中规定了 frontmatter 模板、正文约定（不写手动目录、围栏式 `$$` 公式、标题层级）与发布前检查清单。`src/content/knowledge/_template.md` 提供了可直接复制的模板。

---

## 本地开发

**前置**：Node.js 20+（与 GitHub Actions 部署一致）

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器（默认 http://localhost:4324/，端口占用自动顺延）
```

常用命令：

```bash
npm run build    # 生产构建 → dist/
npm run preview  # 预览构建产物
npm run check    # astro check（类型检查，期望 0 errors 0 warnings）
```

> 无需任何环境变量或 API key。`astro.config.mjs` 的 `base` 在本地为 `/`，部署时由 `GITHUB_REPOSITORY` 自动推导。

---

## 部署

通过 `.github/workflows/deploy.yml` 自动部署到 GitHub Pages：

- 触发：push 到 `master` 分支，或手动 `workflow_dispatch`
- 流程：`npm ci` → `npm run build` → 上传 `dist/` 为 Pages artifact → 部署
- 目标仓库：`NiteFlightxx/NiteFlightxx.github.io`（用户页，根路径部署）

`base` 路径在构建时根据 `GITHUB_REPOSITORY` 推导：用户页（`*.github.io`）为 `/`，项目页为 `/<repo>/`，因此同一份配置可部署到任意仓库。

---

## 文章阅读体验

文章页（`ArticleLayout.astro`）与首页共享同一套视觉语言：固定黑色背景 + SideRays 光线层 + DynamicLinesBg WebGL 线条 + grain 颗粒叠加，glass-panel 玻璃面板容器，lime 强调色，思源黑体 weight 900。

- **左侧目录**（`ArticleToc.tsx`）：按 H2 分级折叠，每个一级标题独立展开/收起其 H3 子项；IntersectionObserver scroll-spy 跟踪视口顶部最近标题并高亮；点击目录项平滑滚动 + 更新 URL hash
- **正文排版**（`index.css` 的 `.article-body`）：标题、段落、列表、代码块、表格、引用、分割线、KaTeX 公式全套暗色主题样式；块级公式居中（围栏式 `$$`）
- **返回导航**：顶栏「← 返回知识库」链接回 `/#knowledge`，首页读取 `location.hash` 落到对应 tab

---

## 许可

本项目为个人作品集，未声明开源许可证。
