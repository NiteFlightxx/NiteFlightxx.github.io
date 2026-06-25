# 添加新文章标准工作流

> 本文档是向网站「知识库 / 实验室」添加新文章的唯一权威流程。每篇新文档都必须按此流程执行，以保证分类、路由、目录、公式渲染与样式全部一致。

---

## 0. 两个集合的差异

| | 知识库 Knowledge | 实验室 Lab |
|---|---|---|
| 目的 | 知识沉淀 / 技术分析 / 经验总结 / 教学内容 | 研究记录 / 数学推导 / 算法探索 / 原型开发 |
| 目录 | `src/content/knowledge/*.md` | `src/content/lab/*.md` |
| 分类字段 | `category` + `subtopic` | `topic` |
| 分类取值 | Engine / Physics / Animation / Rendering / Gameplay / AI / Mathematics | Simulation / Motion / Rendering / Gameplay / AI |
| 子主题取值 | 见下方「知识库子主题词表」（受控枚举，与 category 配对） | — |
| 路由 | `/knowledge/<slug>/` | `/lab/<slug>/` |
| 返回链接 | `/#knowledge`（落到知识库 tab） | `/#lab`（落到实验室 tab） |
| `readTime` 字段 | **必填** | 不需要 |

分类的中文显示名由 `src/lib/taxonomy.ts` 的 `KNOWLEDGE_CATEGORIES` / `LAB_TOPICS` 单一映射，**不要**在前matter 里写中文，写英文枚举即可。知识库的 `subtopic` 同理，中文显示名由 `KNOWLEDGE_SUBTOPICS` 映射。

### 知识库子主题词表（受控枚举）

`subtopic` 必须从下表对应分类中选取，写英文枚举值。新增子主题需同步登记到 `src/content/config.ts` 的 `KNOWLEDGE_SUBTOPICS` 与 `src/lib/taxonomy.ts` 的 `KNOWLEDGE_SUBTOPICS`。

| 分类 | 可用 subtopic |
|---|---|
| Engine | SourceArchitecture / ModuleSystem / MemoryManagement / JobSystem / AssetPipeline / ReflectionSerialization |
| Physics | ConstraintSolver / ChaosPhysics / Collision / RigidBodyDynamics / VehicleDynamics / FlightController / Fluid |
| Animation | AnimationNode / ControlRigIK / Retargeting / MotionMatching / PoseSearch / ProceduralAnimation |
| Rendering | RDG / Shader / Nanite / Lumen / Material / PostProcess |
| Gameplay | GAS / Combat / Interaction / StateMachine / Networking |
| AI | Agent / BehaviorTree / Pathfinding / MCP / RAG |
| Mathematics | LinearAlgebra / Calculus / Optimization / NumericalMethods / Probability / DifferentialEquations |

---

## 1. 创建 Markdown 文件

文件名即 slug，会直接出现在 URL 中。使用英文短横线命名：

```
src/content/knowledge/<slug>.md        # 如 ue-fullbody-ik-math.md
src/content/lab/<slug>.md              # 如 chaos-constraint-solver.md
```

> ⚠️ 文件名一旦发布即为永久链接的一部分，不要事后改名（会导致外链失效）。

## 2. 编写 Frontmatter

复制对应模板，逐字段填写。**所有字段值用引号包裹**。

### 知识库模板

```markdown
---
title: "UE FullBodyIK 插件数学原理详解"
excerpt: "基于 UE 5.9 FullBodyIK 插件源码，梳理 Humanoid IK、Goal、Effectors、收敛迭代的数学原理与实现。"
date: "2026-07-01"
category: "Animation"
subtopic: "ControlRigIK"
tags: ["UE5", "IK", "FullBodyIK", "数学", "C++"]
readTime: "阅读约35分钟"
---
```

### 实验室模板

```markdown
---
title: "Chaos 约束求解器推导"
excerpt: "从约束雅可比出发推导 Chaos 物理约束求解器的 PBD/XPBD 数学形式。"
date: "2026-07-01"
topic: "Simulation"
tags: ["Chaos", "物理", "PBD", "数学"]
---
```

### 字段规则

| 字段 | 必填 | 规则 |
|---|---|---|
| `title` | 是 | 文章标题，纯文本 |
| `excerpt` | 是 | 一句话摘要，用于卡片预览 + `<meta description>` |
| `date` | 是 | ISO 日期 `YYYY-MM-DD`，发布日 |
| `category` / `topic` | 是 | 必须是上方枚举值之一（区分大小写） |
| `subtopic` | 知识库必填 / 实验室无 | 必须是对应 category 下的子主题枚举（见上表，区分大小写） |
| `tags` | 是 | 字符串数组，3–6 个，混合中文标签可 |
| `readTime` | 知识库必填 / 实验室无 | 显示串如 `"阅读约40分钟"` |
| `draft` | 否 | `true` 则不生成路由、不出现在卡片列表（默认 `false`） |

## 3. 编写正文 — 关键约定

### 3.1 不要写手动「目录」章节

左侧导航目录由 `ArticleToc` 组件根据 `##` / `###` 标题**自动生成**（含 scroll-spy 高亮 + 锚点跳转）。正文里**不要**再写 `## 目录` + 一堆链接列表——那是旧写法，会与左侧目录重复。直接从正文第一个真实章节开始。

### 3.2 标题层级

| 层级 | 用途 | 示例 |
|---|---|---|
| `#` H1 | **不要写**（标题由布局渲染，写正文 H1 会重复） | — |
| `##` H2 | 一级章节，进左侧目录 | `## 一、IK 类节点` |
| `###` H3 | 二级章节，进左侧目录（缩进） | `### 2.1 TwoBoneIK` |
| `####`+ | 不进目录，仅正文小标题 | `#### 数学原理` |

`rehype-slug` 会自动给标题生成 `id`（中文标题也会被转成 URL 安全 slug），无需手写锚点。

左侧目录按层级折叠:每个 `##` 自带一个箭头,点击只折叠/展开其下的 `###` 子项(整个目录不会被一次性隐藏)。因此写正文时**保持 H2→H3 的嵌套结构**,目录的折叠分组才有意义——不要让 H3 跨越到另一个 H2 之外。

### 3.3 数学公式 — 必须用围栏式

这是**最重要的渲染规则**。`remark-math` 只在 `$$` 独占一行时才解析为块级（居中、显示样式）公式。

✅ 正确（块级公式，居中渲染）：

```markdown
$$
\vec P_{joint}^{new} = \vec P_{root} + \text{proj}\cdot\vec d_{des}
$$
```

❌ 错误（单行 `$$...$$` 会被当成**行内公式**，左对齐、不居中）：

```markdown
$$\vec P_{joint}^{new} = \vec P_{root} + \text{proj}\cdot\vec d_{des}$$
```

行内公式用单 `$`：`每个骨骼 $b$ 的权重 $w_b$`。

### 3.4 公式常见错误

| 错误 | 示例 | 修正 |
|---|---|---|
| 双重下标 | `\text{Layer}_{s(b)}_b` | `{\text{Layer}_{s(b)}}_b`（用 `{}` 分组） |
| `\text{}` 内含 Unicode 数学符 | `\text{a × b}` | `\text{a} \times \text{b}` |
| 未闭合环境 | `\frac{a}{b}` 漏 `}` | 检查每个 `\frac\{\}\{\}`、`\left(\right)` 配对 |

公式渲染失败时 KaTeX 会输出**红色文字**。本地预览时如果看到红色公式，对照上表排查。已渲染的公式不会变红。

### 3.5 其他元素

- **表格**：标准 Markdown 表格，会自动套用暗色面板样式（表头 mono 大写、隔行底纹、横向滚动）。
- **代码块**：` ```cpp ` 等围栏代码块，自动暗色面板 + mono 字体。
- **引用**：`>` 块引用，左侧绿色竖线 + 灰色文字，用于源码路径说明、版本说明等。
- **分割线**：`---`，细绿色分隔线。

## 4. 本地验证（必做）

```bash
npm run dev
```

打开 `http://localhost:4324/`（端口被占用会自动顺延，看终端输出）：

1. 进入对应 tab（知识库 / 实验室），确认卡片出现
2. 点击卡片 → **新标签页打开**文章页
3. 检查：
   - 左侧目录列出所有 `##` / `###`
   - 点击目录项 → 平滑滚动到对应章节
   - 滚动正文 → 目录高亮跟随（scroll-spy）
   - 公式**居中**显示，无红色错误
   - 顶部「← 返回知识库/实验室」回到对应 tab

类型 + 构建检查：

```bash
npx astro check      # 0 errors 0 warnings
npm run build        # 应生成对应路由 HTML
```

## 5. 检查清单（发布前逐项确认）

- [ ] frontmatter 字段完整、分类枚举正确、`date` 为 ISO 格式
- [ ] 正文**无手动 `## 目录` 章节**
- [ ] 正文**无 H1**（`#`），从 `##` 开始
- [ ] 所有块级公式为**围栏式** `$$`（独占行）
- [ ] 本地预览**无红色公式**
- [ ] `npx astro check` 0 errors
- [ ] `npm run build` 成功，`dist/<collection>/<slug>/index.html` 存在
- [ ] 卡片点击新标签页打开，URL 可独立分享
- [ ] 左侧目录、scroll-spy、返回链接正常

---

## 附：涉及文件索引（添加文章通常**无需**改动这些）

| 文件 | 作用 | 何时要改 |
|---|---|---|
| `src/content/config.ts` | 集合 schema 定义 | 新增分类枚举时 |
| `src/lib/taxonomy.ts` | 分类中文映射（单一真相源） | 新增分类时同步 |
| `src/pages/knowledge/[slug].astro` | 知识库文章路由 | 一般不动 |
| `src/pages/lab/[slug].astro` | 实验室文章路由 | 一般不动 |
| `src/layouts/ArticleLayout.astro` | 文章页布局（TOC + 正文） | 调整版式时 |
| `src/components/ArticleToc.tsx` | 左侧目录（折叠 + scroll-spy） | 调整目录行为时 |
| `src/index.css` `.article-body` 段 | 正文排版样式 | 调整正文样式时 |
| `astro.config.mjs` | remark/rehype 插件（math + slug + katex） | 不动 |
| `scripts/fence-math.py` | 把单行 `$$` 批量转围栏式（历史文档修正用） | 修正旧文档时 |
