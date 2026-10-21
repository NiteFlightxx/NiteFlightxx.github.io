# 知识库文档维护流程

## 组织原则

知识库采用直接阅读的文档形式，不是课程平台。内容按理解所需的先后关系排列，但不添加学习目标、练习验收、完成打卡或空白规划课节。

每个概念只保留一份完整解释。其他文章保留理解当前上下文必需的符号、公式与短摘要，再链接主文。不为了缩短篇幅删除独特的源码证据、推导或交互。

## 文件与 URL

正文放在 `src/content/knowledge/<slug>.md`，规范 URL 为 `/knowledge/<slug>/`。已公开文件名不随标题修改；改变标题时，把旧标题放入 aliases，保留检索能力。

`/knowledge/` 直接显示入口文档；`/knowledge/library/` 提供搜索、筛选、收藏和最近阅读。旧课程和领域地址只是兼容别名，不新增介绍页。

`src/data/reading-order.json` 是侧栏和上一篇/下一篇的顺序来源。每篇公开文章恰好出现一次；没有正文的主题不进入目录。`prerequisites` 表示真正必要的概念依赖，不能把“可能相关”都写成先修要求，也不能形成循环。

## 标题与摘要

标题使用明确的主题与范围，例如“数值积分：方法、误差与稳定性”。不再强制“详解 — 从……到……”句式，不使用“终极、统一框架、全掌握”等无法兑现的表述。

- 标题原则上不超过 48 字符，保留 UE、GJK、XPBD 等可检索术语。
- 摘要用一句话说明独特内容，不枚举全文所有章节。
- 开头直接说明问题、模型或范围，可补必要的站内链接。
- 不再使用“学习位置、前置积木、本文模块”等全库重复模板。
- 章节标题直接命名概念，不写“第一块积木、顺水推舟”等引导话术。
- 内容顺序自然展开，不强制所有文章套相同章节结构。

## Frontmatter

从 `src/content/knowledge/_template.md` 复制，完整填写后再将 draft 改为 false。

~~~yaml
title: "技术主题：明确范围"
excerpt: "一句话说明问题和本文采用的解释方式。"
date: "2026-10-21"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["约束", "数值方法", "刚体"]
readTime: "阅读约15分钟"
draft: false
kind: "algorithm"
level: "intermediate"
pageType: "guide"
aliases: []
prerequisites: []
nextArticles: []
related: []
sources:
  - title: "实际阅读的一手资料"
    url: "https://example.com/primary-source"
~~~

category 与 subtopic 必须使用 `src/content/config.ts` 与 `src/lib/taxonomy.ts` 中的配对枚举。tags 为 3–6 项。date 采用 ISO 日期，readTime 是估算，不表示完整运行验证耗时。

kind 可用 theory、source、algorithm、comparison、practice、experiment；level 为 foundation、intermediate、advanced。它们用于检索与范围判断，不用于考试或完成度。

源码文章优先设为 pageType: source-analysis，注明快照、文件、函数与行号。不要为了补来源面板加入没读过或并不能支持结论的链接。

## 正文、公式与代码

正文不再写 H1，从 H2 开始，层级不跳级；文章标题由布局渲染，目录自动从正文标题生成。不要手写第二份目录。

所有数学统一使用 LaTeX：行内 `$...$`；块级 `$$` 独占行，前后留空行。公式不能放进普通代码块来冒充排版；单位、向量、矩阵和符号首次出现时就地说明。

代码区分可运行示例、伪代码与真实源码。积分阶段、矩阵空间、法线方向、单位与容差必须一致。出现稳定性或精度结论时，写清模型、步长、光滑性与求解收敛条件。

独立示例若用于数值对比，优先让审计直接执行文中的代码，不再复制一套“测试专用算法”。不能据此宣称真实引擎场景或 GPU 性能已经验证。

## 源码与资料

明确分开：

- 源码事实：来自指定版本的文件和直接调用链。
- 一般原理：数学推导或论文模型，不代表引擎已经采用。
- 工程建议：有假设的配置方向，需要场景测试。
- 待验证：运行性能、网络行为、资产接入或证据不足的推断。

项目专题定义仍位于 `src/content/topics/`。通过 topics 的 id、stage、role、order 关联文章，不复制完整正文。领域描述文件在 `src/content/knowledgeDomains/`，不是第二套完整文章。

## 修改已有内容

改写前先检查入站链接、标题锚点、交互挂载与源码出处。删除重复展开时，要留下准确摘要和目标链接；改章名时更新站内深链接，必要时保留旧锚点到新对应章节。

标题修改不更新文件名。不要把发布日期全部改成当天；版本核对日期可以在源码范围段单独记录。旧历史方案不反向约束当前标题和 UI。

## 验证

~~~sh
npm run check
npm run audit:knowledge-learning
npm run audit:topics
npm run audit:knowledge-nav
npm run audit:reading-order
npm run audit:document-examples
npm run build
git diff --check
~~~

构建包含公式/关系审计、Astro、Pagefind、阅读界面与文章 HTML 审计。浏览器补查长标题换行、中文检索、KaTeX、目录锚点、移动端溢出与已有交互。

静态构建与数学示例通过不等于 UE 运行时或 WebGL 性能测试通过；交付时分别报告。
