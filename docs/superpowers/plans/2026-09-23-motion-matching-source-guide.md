# Motion Matching 源码专题计划

## 目标

在知识库中新增一篇中文 Motion Matching 专题，基于当前 `E:\UnrealEngine\UnrealEngine_Source` 快照，追踪 Pose Search 从历史姿态与轨迹采集、Schema/Database 索引、Query 构建、Cost 评分到 Motion Matching Anim Node 与 Blend Stack 输出的公开运行时链路。

## 交付内容

- 新增 `src/content/knowledge/motion-matching-pose-search-source-guide.md`。
- 覆盖用户要求的九个部分：原理、源码类型、参数、Cost/搜索、最佳实践、诊断、调参流程、三套配置和结论。
- 每个源码事实附绝对路径及行号；将工程经验与推测分开。
- 明确记录当前快照中 AnimNextPoseSearch 只有二进制/中间产物、缺少可读源码的边界。

## 证据策略

1. 用 Graphify/GitNexus 定位关系，再以真实源码行号作为最终证据。
2. 重点引用 `AnimNode_MotionMatching.cpp/.h`、`PoseSearchContext.h`、`PoseSearchDatabase.cpp/.h`、`PoseSearchSchema.h`、`PoseSearchHistory.h`、`PoseSearchTrajectoryLibrary.h`、`PoseSearchIndex.cpp`、`AnimNode_BlendStack.cpp/.h` 和 `AnimInstance.h`。
3. 对未找到的参数、类型或源码注明“当前版本未找到”，不按旧版本资料臆造。

## 验证

- `git diff --check`
- `npm run check`
- `npm run build`
