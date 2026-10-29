# 技术知识库配图 Skill 调研

核对日期：2026-10-24。目标是为现有 Astro 知识库选择知识结构图、物理几何示意与必要交互的制作方式。以下为仓库原始说明与 SKILL.md 的阅读结果，不表示已安装、运行或测评第三方工具的出图质量。

## 结论

适合本项目的组合是：关系与流程用可维护的结构图，物理几何与应力/压力示意用精确矢量图，参数变化确实影响理解时再用现有 React 演示挂载。对需要严格几何、箭头方向和中文符号的解释图，优先保留代码或矢量源。

本轮没有安装外部 skill，也未调用外部付费模型。已直接在知识库正文加入原生 HTML/SVG 图，主题色继承网站，窄屏堆叠展示，保留图注和可访问名称。调研是实现配图的依据，不构成安装全部候选的建议。

## svg-infographic

来源：[SKILL.md](https://github.com/kyungseo/skillstead/blob/main/skills/svg-infographic/SKILL.md)、[README](https://github.com/kyungseo/skillstead/blob/main/skills/svg-infographic/README.md)。

该 skill 生成可编辑 SVG，再通过浏览器导出 PNG，强调几何布局、文字预算、源文件检查和渲染检查。文档列出 CJK 文本支持与 Node 18+ 的标准库渲染入口，也明确其 Windows 验证范围。

对本项目最有价值的是知识地图、前后状态对照和数据流图的布局与校验流程。它不负责从力学资料证明物理关系；统计曲线也在其明确的非目标范围内。需要进一步验证本机浏览器发现、中文字体与网站主题适配，不能因 README 声明支持 Codex 就认为已在本机验收。

## Mermaid diagramming

来源：[softaworks/agent-toolkit 的 SKILL.md](https://github.com/softaworks/agent-toolkit/blob/main/dist/plugins/mermaid-diagrams/skills/mermaid-diagrams/SKILL.md)。

主要提供 Mermaid 的图类型选择、流程、时序、状态及软件模型规范。文本定义便于版本管理，适合“守恒基础 → 模型分支 → 数值工具”和求解时间步的结构关系。

它更偏软件结构与流程，不适合精确力臂、连续形变、空间网格或压力方向的主示意。当前网站没有 Mermaid 渲染插件，简单加入 mermaid 围栏会显示代码；若采用它，应补渲染或在构建阶段导出 SVG，并核对中文布局。该 skill 本身不会自动完成网站集成。

## generate-excalidraw

来源：[iruochen/excalidraw-diagram-skill](https://github.com/iruochen/excalidraw-diagram-skill)、[SKILL.md](https://github.com/iruochen/excalidraw-diagram-skill/blob/main/SKILL.md)。

该版本从紧凑 scene spec 构造可编辑 Excalidraw JSON，使用官方 exportToSvg 生成预览。仓库列出 Python、Node、npm 与 Git 前提；重点包括形状文字适配、箭头路由与输出后检查。

适合需要继续手动编辑的知识草图、系统图和白板式解释。额外成本是场景源、导出步骤、字体和手绘风格与当前网站的统一。中文标注应做实际渲染检查；不能把默认英文字体的效果推定为中文效果。

另核对了 [coleam00/excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill)：其说明强调图应表达关系与论证，配套渲染涉及 uv 与 Playwright。它与上述版本是不同包，不能混用脚本路径和安装方式。

## scientific-schematics

来源：[K-Dense-AI/scientific-agent-skills 的 SKILL.md](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/skills/scientific-schematics/SKILL.md)、[使用指南](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/docs/skill-guides/scientific-schematics.md)。

当前原文说明使用外部图像生成与视觉评审，依赖 Python、网络及 OpenRouter API Key，输出主要为 raster PNG。指南明确要求使用者提供有来源的组件与关系，并逐项核对最终图。

它适合科学工作流或概念插图草稿。对本项目的定量几何、公式标注和频繁修订，PNG 的可编辑性较弱，也增加外部模型配置与调用成本。自动视觉评分不代表力学正确性或出版验收。本轮未运行这些调用。

## 已有能力与不适用的候选

本会话已有 visualize，但其说明明确将“修改现有项目中的图表或组件”与“对话内可视化”区分；知识库配图应写入当前项目，不必另建聊天中的可视化副本。现有 DemoMount 已支持按需加载 React 演示，可用于后续交互。

另核对 [Anthropic algorithmic-art](https://github.com/anthropics/skills/blob/main/skills/algorithmic-art/SKILL.md)：其目标是 p5.js 生成艺术。流场或粒子外观不等于流体或动力学模型，因此不作为本项目教学配图的主要方案。

## 集成与验收方式

- 一张图先确定要解释的关系：模型分支、材料运动、形状变化、压力修正或作用交换。
- 物理图核对方向、单位、材料身份与参考/当前状态，必要时注明“示意，不按比例”。
- 静态图保留可编辑源，中文标签不依赖外部字体下载才能看见，主题切换与窄屏需要检查。
- 交互演示只在能说明参数影响时加入，并区分解析示意、数值实验与真实引擎验证。
- 构建检查图是否实际输出，浏览器检查文字重叠、箭头、图注和移动布局。

官方 skill-installer 的目录列表脚本在本机遇到 TLS EOF，GitHub 网页目录也未成功返回，因此本记录不宣称穷尽官方目录。候选均通过上列仓库原文核对；没有通过修改 TLS 校验或执行第三方安装脚本绕过该问题。
