---
title: "UE Motion Matching 源码详解 — Pose Search、Query、Cost 与 Blend Stack"
excerpt: "基于当前 Unreal Engine 源码，追踪 Motion Matching 从 Pose History、Trajectory、Schema、Database、Cost Search 到 Anim Node 与 Blend Stack 的完整运行链路。"
date: "2026-09-23"
category: "Animation"
subtopic: "MotionMatching"
tags: ["Motion Matching", "Pose Search", "AnimGraph", "Blend Stack", "Trajectory", "UE源码"]
readTime: "阅读约60分钟"
kind: "source"
level: "advanced"
---

> 本文以 `E:\UnrealEngine\UnrealEngine_Source` 的当前 `ue5-main` 快照为事实边界。Graphify/GitNexus 只用于定位关系，最终结论以源码路径和行号为准。文中标签含义为：**源码事实**＝当前文件直接可见；**工程经验**＝可落地但需结合项目验证；**推测/需要验证**＝源码没有提供足够证据。

## 先给结论

Motion Matching 不是“播放一条最像的动画”，而是把角色当前的**历史姿态、当前姿态和未来运动意图**编码成 Query，再从离线建立的 Pose Search Database 中选择总 Cost 最低、且满足跳转/重选/通知过滤的离散 Pose，最后交给 `FAnimNode_MotionMatching` 的 Blend Stack 输出。当前实现中，搜索、姿态切换和最终求值都走 AnimGraph 的 AnyThread 路径；数据库索引通常在编辑器异步构建，运行时只读查询。

最重要的工程结论：

1. Query 与数据库 Pose 必须使用同一 Schema、骨骼/Role 映射、单位、坐标系和采样语义；否则 Cost 数字仍然“正常”，结果却会错。
2. Trajectory 负责“想往哪里走”，Pose History 负责“刚才身体怎样运动”；只配其中一个，起步、转向和急停都会缺信息。
3. Cost 不是单一权重：当前实现把加权特征差异、Notify Cost、Continuing Pose/Interaction Bias 相加（`FPoseSearchCost` 构造函数）。
4. `PoseJumpThresholdTime`、`PoseReselectHistory`、`SearchThrottleTime` 和 Continuing Pose 是稳定器，不是“让搜索更聪明”的替代品；先修 Query/数据库覆盖，再调稳定器。
5. `FAnimNode_MotionMatching` 继承 `FAnimNode_BlendStack_Standalone`，新结果通过 `BlendTo` 切入；`MaxActiveBlends==0` 时改用 Inertialization。
6. 当前快照中未找到可读的 AnimNextPoseSearch 源码：目录只有 DLL/PDB/Intermediate 生成物，因此不能把其 trait 的内部调度写成源码事实。

### 一张可执行链路图

```text
Character / Movement State
        │ 速度、加速度、朝向、控制器意图、Gameplay 状态
        ▼
Trajectory + Pose History Collector
        │ 当前/过去/未来样本，统一到角色或世界坐标
        ▼
FSearchContext
        │ AddRole、缓存 Query、Continuing Pose、过滤状态
        ▼
UPoseSearchSchema::BuildQuery
        │ Channel 依次写入位置/速度/旋转/轨迹/曲线等特征
        ▼
UPoseSearchDatabase::Search
        │ BruteForce / VPTree / PCAKDTree / EventOnly
        ▼
CompareFeatureVectors + Cost Addends + Filters
        │ 得到 FSearchResult（Database、PoseIdx、AssetTime、Cost、Mirror）
        ▼
FAnimNode_MotionMatching::UpdateAssetPlayer
        │ Continuing / Jump / Throttle / Interrupt / PlayRate
        ▼
FAnimNode_BlendStack_Standalone::BlendTo
        │ 多个 AnimPlayer，或 Inertialization
        ▼
Evaluate_AnyThread → Final Pose / Root Motion
```

---

## 一、整体原理

### 1. Motion Matching 解决什么问题

传统动画图先决定“状态”（Idle、Walk、Run、Turn），再在状态内部播放资产；Motion Matching 反过来把候选动画的每个采样 Pose 都视为可进入点，用 Query 的相似度选择“现在最合适的时间点”。这直接解决了状态边界爆炸、转向组合不足、起步/停止接缝差和脚步不连续的问题。

**源码事实**：`FSearchResult` 明确保存 `SelectedAnim/SelectedTime/WantedPlayRate` 的蓝图结果语义；注释说它匹配的是 trajectory + historical pose（`PoseSearchResult.h:L192-L231`）。索引器以 `Schema.SampleRate` 生成每个 Pose 的元数据和特征（`PoseSearchAssetIndexer.cpp:L191-L227、L250-L258`）。

**工程经验**：Motion Matching 不会凭空创造未采集的动作。数据库没有“左脚急停”样本，就只能选一个近似样本；结果抖动通常先说明资产覆盖或 Query 语义有问题。

### 2. 与传统节点的区别

| 方案 | 决策单位 | 适合 | 主要限制 | 与 Motion Matching 的关系 |
|---|---|---|---|---|
| State Machine | 离散状态和 Transition | 明确的战斗/装备/受击流程 | 状态与过渡数随组合增长 | 可作为高层模式门，内部状态接 MM |
| Blend Space | 参数空间插值 | 速度、方向等低维连续变化 | 插值网格不能理解历史/未来 | MM 可选 Blend Space 作为数据库资产，并输出 Blend Parameters |
| Montage/Slot | 由 Gameplay/Ability 驱动的片段 | 攻击、技能、叙事动作 | 接缝和打断由作者安排 | 用 Montage 锁定不可被 MM 抢走的动作，或作为查询过滤资产 |
| Pose Blend | 固定姿态/曲线混合 | 瞄准、受伤、表情 | 不负责时间点选择 | 常放在 MM 后处理上半身或局部骨骼 |
| Motion Matching | 数据库 Pose 时间点 | 走跑转停、丰富 locomotion | 依赖高质量覆盖、Schema 和调试 | 通过 Query→Cost→Blend 自动选入口 |

**源码事实**：State Machine 和通用 AnimNode 都公开 `Update_AnyThread` / `Evaluate_AnyThread`（`AnimNode_StateMachine.h:L119-L248`；`AnimNodeBase.h:L746-L754`），差别是决策策略，不是线程模型。Blend Space 的公共播放接口位于 `Engine/Source/Runtime/AnimGraphRuntime/Public/BlendSpacePlayerLibrary.h`；当前快照未找到一个可替代 Pose Search Cost 的统一 Blend Space 评分接口，不能把二者的内部实现混写。

### 3. 完整执行链路、时机和线程

| 阶段 | 当前实现 | 时机/线程 | 必须一致的内容 |
|---|---|---|---|
| Character / Movement State | `AnimInstanceProxy` 可读的速度、加速度、控制器 yaw、Gameplay 输入 | 游戏线程准备数据；线程安全 Update 前复制到 Proxy | DeltaTime、角色根变换、速度单位、网络预测帧 |
| Trajectory | `FPoseSearchTrajectoryData` + `UPoseSearchTrajectoryLibrary` 生成 `FTransformTrajectory` | AnimGraph Update/线程安全函数；预测通常基于上一帧状态 | 样本时间、世界/角色空间、历史/预测数量、朝向约定 |
| Pose History | `FAnimNode_PoseSearchHistoryCollector_Base` 收集 component-space bone/curve | Update/Evaluate 期间由 collector/Provider 提供；不能跨帧读未同步对象 | BoneContainer、采样间隔、Root recovery、同一角色坐标系 |
| Search Context | `FSearchContext` 持有 Role、Chooser Context、PoseHistory、Continuing Pose 和 Query cache | `FAnimNode_MotionMatching::UpdateAssetPlayer` 构造；搜索期间只读/局部缓存 | Schema、Role、数据库、Continuing Pose 的 Database/PoseIdx |
| Schema Query | `UPoseSearchSchema::BuildQuery` 遍历 FinalizedChannels | Update 阶段按需缓存；同一 Context 可复用 | Channel 顺序、cardinality、归一化和权重布局 |
| Database Search | `UPoseSearchDatabase::Search` 分派 BruteForce/VPTree/PCAKDTree/EventOnly | Update 阶段；索引是离线/编辑器异步构建，运行时只读 | 索引版本、Schema、采样率、过滤器和动态权重 |
| Result | `FSearchResult` 保存 PoseIdx、AssetTime、Cost、Mirror、Loop 等 | Update 阶段写入 `FMotionMatchingState` | 与当前播放资产、角色 Role、MirrorTable 对应 |
| Motion Matching Node | 处理 throttle、continuing、jump、play rate、blend | `UpdateAssetPlayer`；最终采样在 Evaluate | `BlendTime`、InterruptMode、MaxActiveBlends、Root Motion 来源 |
| Blend Stack | `BlendTo` 插入 AnimPlayer；评估多个活跃 blend 或请求 inertialization | Update 注册，Evaluate_AnyThread 混合 | Additive 类型、BlendProfile、同步组、最大活跃数 |
| Final Pose | `Evaluate_AnyThread` 采样动画并应用 Root Motion/Role 对齐 | Worker thread 可执行 | Proxy/Context 中的骨骼容器和 root motion provider |

**源码事实**：Motion Matching 的 Update 在 `AnimNode_MotionMatching.cpp:L72-L296`；Pose History 缺失会在 `L137-L145` 报错；普通路径在 `L180-L209` 构造 `FSearchContext` 并调用 `UPoseSearchLibrary::MotionMatch`；新结果在 `L255-L278` 通过 `BlendTo`，最终 Evaluate 在 `L301-L359`。AnimInstance 明确说明线程安全更新、Proxy 访问和 worker-thread evaluation（`AnimInstance.h:L376-L388、L1407-L1445、L1719-L1794`）。

**一致性红线**：`FSearchContext` 注释特别说明 Continuing Pose Values 可能来自共享 Schema 的另一数据库，Database/PoseIdx 和向量来源必须成对维护（`PoseSearchContext.h:L394-L414`）。这也是“继续播放却突然跳姿态”最常见的隐蔽原因。

---

## 二、源码结构与关键类型

### 1. `FAnimNode_MotionMatching` 与 `FMotionMatchingState`

`FAnimNode_MotionMatching` 继承 `FAnimNode_BlendStack_Standalone`（`AnimNode_MotionMatching.h:L18`），所以它既是搜索节点也是资产播放器/混合器。关键默认值：`BlendTime=0.2s`（L113-L115）、`PoseJumpThresholdTime=[0,0]`（L125-L127）、`PoseReselectHistory=0.3s`（L130-L131）、`SearchThrottleTime=0s`（L133-L135）、`PlayRate=[1,1]`（L138-L139）、`bUseInertialBlend=false`（L145-L146）、`bResetOnBecomingRelevant=true`（L149-L150）、`bShouldSearch=true`（L152-L154）。

`UpdateAssetPlayer` 生命周期：初始化数据库/状态 → 从 `FPoseHistoryProvider` 取得历史 → 交互分支或普通搜索 → 判断是否跳 Pose → 更新 Blend Stack/PlayRate/BlendSpace 参数 → 更新 PoseIndicesHistory（`AnimNode_MotionMatching.cpp:L84-L104、L137-L145、L155-L237、L248-L296`）。`FMotionMatchingState` 保存当前搜索结果、上次搜索时间和 Blend 相关状态；完整字段以该头文件 `L162-L216` 为准。

### 2. `FAnimNode_BlendStack_Standalone`

它维护 `AnimPlayers`、主播放器和采样 Pose Link。`MaxActiveBlends` 默认 4（`AnimNode_BlendStack.h:L230-L236`），`BlendTo` 在 `AnimNode_BlendStack.cpp:L1163-L1172` 注册新动画；同一帧多次请求时最后一次胜出（L1278-L1279）。`Evaluate_AnyThread` 在 L677-L792 处理活跃播放器数量；`MaxActiveBlends==0` 时 L941-L946 走 Inertialization。过多连续跳转会丢弃旧播放器并产生 pop，这是性能与视觉的共同边界。

### 3. `UPoseSearchSchema`

Schema 是 Query 与数据库特征的契约，不是单纯的骨骼列表：`SampleRate=30`（`PoseSearchSchema.h:L71-L73`）、`Channels`/`FinalizedChannels`（L79-L85）、`DataPreprocessor=Normalize`（L90-L91）、`NumberOfPermutations=1`（L99-L109），可选择数据 padding（L112-L114）。`BuildQuery` 在 L169；骨骼/Role 兼容性 API 在 L161-L180。FinalizedChannels 还可能注入默认或调试 channel，因此不要只按编辑器里看到的 Channels 计算 cardinality。

### 4. `UPoseSearchDatabase` 与索引

Database 持有 Schema、动画资产列表、搜索模式和运行时 SearchIndex。默认 bias：`ContinuingPoseCostBias=-0.01`、`BaseCostBias=0`、`LoopingCostBias=-0.005`（`PoseSearchDatabase.h:L509-L528`）；搜索模式默认 `PCAKDTree`、主成分数 4、KNN 邻居 200（L581-L598）。Search API 在 L688-L696；实现先等待/检查索引，再按模式分派（`PoseSearchDatabase.cpp:L1518-L1554`）。

索引器对每个采样时间生成 `FPoseMetadata`，读取 `PoseSearchBlockTransition` 和 `PoseSearchModifyCost` Notify，并调用每个 Channel 的 `IndexAsset`（`PoseSearchAssetIndexer.cpp:L191-L227、L229-L258`）。因此 Block Transition 和 Base Cost 是数据库构建阶段写入、查询阶段消费的两类不同机制。

### 5. `FSearchContext` 与 `FSearchResult`

`FSearchContext` 负责角色映射、Chooser Context、Pose History、Query cache、Continuing Pose Values、Pose Jump 阈值和候选跟踪。构造器和 Role API 在 `PoseSearchContext.h:L187-L220`；缓存 Query 在 L232-L235；Continuing Pose 在 L249-L266；调试候选在 L435-L499。它不是 UObject，不应跨帧持有指向临时 Context 的引用。

`FSearchResult` 继承 `FDatabasePoseIdx`，包含 `PoseCost`、`AssetTime`、`bIsContinuingPoseSearch`、事件 PoseIdx（`PoseSearchResult.h:L22-L58`）。蓝图结果还暴露 `SelectedAnim/SelectedTime/WantedPlayRate/bLoop/bIsMirrored/BlendParameters/SearchCost`（L192-L231）。

### 6. Pose History、Trajectory 和 Asset Sampler

- `FPoseHistoryEntry` 保存 component-space rotations、positions、scales、curves 和累计秒数（`PoseSearchHistory.h:L102-L127`）；`FPoseIndicesHistory::Update` 记录已播放 Pose 的时间（L50-L57）。
- Collector 暴露 `HistorySize、SamplingInterval、CollectedBones/Curves、RootBoneRecovery、bGenerateTrajectory、TrajectoryHistoryCount=10、TrajectoryPredictionCount=8`（`AnimNode_PoseSearchHistoryCollector.h:L21-L34、L45-L57、L67-L100`）。
- `FPoseSearchTrajectoryData::FSampling` 控制历史/预测数量与每个样本的秒数；Character 轨迹生成函数默认历史间隔 0.04s、10 个历史样本、预测间隔 0.2s、8 个预测样本（`PoseSearchTrajectoryLibrary.h:L50-L60、L174-L180`）。
- `FPoseSearchAssetSamplerPose` 同时保存 RootTransform、Local Pose 和 ComponentSpacePose；`SamplePose` 与空间转换 API 在 `PoseSearchAssetSamplerLibrary.h:L43-L103`。它适合调试“数据库 Pose 与角色当前 Pose 是否在同一空间”，不是替代 Database Search 的播放器。

### 7. `MotionMatchingAnimNodeLibrary`、Chooser、Proxy

蓝图库提供读取 Search Result/Blend Settings、替换数据库、设置 InterruptMode 和检测本帧新 Blend（`MotionMatchingAnimNodeLibrary.h:L18-L127`）。Pose Search Chooser 的 `FPoseSearchColumn` 是实验性 Pose Match 列，要求结果资产带 `PoseSearchBranchIn`，并建议放在 Chooser 最右侧（`PoseSearchChooserColumn.h:L84-L147`）；映射器递归遍历 nested chooser、校验数据库与行资产一致性（`PoseSearchChooserColumnMapping.h:L181-L256`）。

`AnimInstanceProxy` 是跨线程的工作副本/暂存区，AnimInstance 文档要求通过 `GetProxyOnGameThread` 或 `GetProxyOnAnyThread` 遵守任务边界（`AnimInstance.h:L1719-L1794`）。不要在 worker thread 直接访问可能被游戏线程修改的 Actor、Component 或 UObject 容器；跨角色 Interaction 还需要正确 tick dependency（`PoseSearchResult.h:L246-L258`）。

---

## 三、参数逐项说明

下表将参数按“采集、索引、查询、评分、切换/混合”阶段归类。默认值只写当前源码中直接可见的值。

| 参数 | 所属/类型 | 当前默认值 | 阶段与作用 | 对结果/性能的影响 | 常见错误与调参方向 | 源码证据 |
|---|---|---:|---|---|---|---|
| `SampleRate` | `UPoseSearchSchema::int32` | 30 | 索引采样间隔；Query 与 Pose 的时间量化基准 | 高：细粒度更准、索引/内存更大 | 把 30Hz 数据库与不同采样语义的 Query 混用；先 30Hz，脚步/急停不够再升 | `PoseSearchSchema.h:L71-L73` |
| `Channels` / `FinalizedChannels` | Schema 数组 | 空/Finalize 后生成 | 定义骨骼、轨迹、曲线和特征顺序 | Channel 越多，cardinality、索引内存和 Cost 计算越大 | 只加位置不加速度/朝向；忘记 Finalized 注入；先保证 root/feet/trajectory 最小闭环 | `PoseSearchSchema.h:L79-L85、L129-L169` |
| Bone / Role | Schema skeleton/Role 映射 | 资产定义 | 把同一特征绑定到具体角色骨骼 | 映射错误会让 Cost 稳定地错 | 多角色 schema 复用但骨骼不兼容；检查 `AreSkeletonsCompatible` | `PoseSearchSchema.h:L161-L180` |
| Position | Feature Channel | 由 Channel 权重给出 | 匹配关节相对位置/根空间位置 | 对姿态形状敏感 | 绝对世界坐标导致角色移动量污染；使用角色/根相对空间 | `PoseSearchContext.h:L213-L215` |
| Velocity | Feature Channel | 由 Channel 权重给出 | 匹配关节或根速度 | 对起步、停止、脚滑很敏感 | 用未归一化世界速度跨角色比较；先检查单位与 Normalize | `PoseSearchContext.h:L217-L221` |
| Rotation / Facing | Feature Channel | 由 Channel 权重给出 | 匹配骨骼朝向/轨迹面对方向 | 转向质量取决于权重和时间点 | 只看位置不看 facing，倒走/转身会选错；增加 facing/角速度 | `PoseSearchContext.h:L207-L210`；`PoseSearchTrajectoryTypes.h:L79-L89` |
| `DataPreprocessor` | Schema enum | `Normalize` | 预处理特征分布；另有 `NormalizeWithCommonSchema` | 归一化改变每维相对影响；常规化可提升跨库可比性 | 不同 Database 独立 Normalize 却直接比 Cost；需要 common schema 或单库 | `PoseSearchSchema.h:L16-L30、L90-L91` |
| `NumberOfPermutations` / offset | Schema | 1 | 在不同时间偏移重复采样资产 | 增加索引体积与覆盖，可能减少时间量化盲点 | 偏移与 Query 时间语义不一致；先维持 1 | `PoseSearchSchema.h:L99-L109` |
| `bAddDataPadding` | Schema bool | false | 16-byte 对齐，换内存优化 | 小幅增加内存，利于 SIMD | 低端内存预算无检查；只在 profile 证明有收益时启用 | `PoseSearchSchema.h:L112-L114` |
| History count / interval | Collector/Trajectory Sampling | History 资产默认由配置；Trajectory 10 / 0.04s | 记录过去姿态和轨迹 | 更长历史提高相位识别但增加采集/Query 维度 | 历史间隔与帧率强绑定；以脚步周期覆盖 2–4 个样本起步 | `AnimNode_PoseSearchHistoryCollector.h:L21-L34、L90-L100`；`PoseSearchTrajectoryLibrary.h:L174-L180` |
| Prediction count / interval | Trajectory Sampling | 8 / 0.2s（Character API） | 描述未来意图 | 长预测利于转向/制动，误预测会反向误导 | 预测方向与角色 yaw 约定相反；先画轨迹再调权重 | `PoseSearchTrajectoryLibrary.h:L174-L180` |
| `TrajectorySpeedMultiplier` | Collector float | 代码声明值见 `AnimNode_PoseSearchHistoryCollector.h:L86-L88` | 统一轨迹速度尺度 | 直接改变速度特征 Cost | 与角色真实速度重复缩放；只保留一处 remap | 同上 |
| Database assets | `UPoseSearchDatabase` | 无固定默认 | 资产/Blend Space/多角色资产进入索引 | 覆盖范围决定“能不能选对” | 把攻击/受击/locomotion 混在无过滤库；按 locomotion、转向、特殊动作分库 | `PoseSearchDatabase.h:L504-L548`；`PoseSearchAssetIndexer.cpp:L191-L258` |
| `BaseCostBias` | Database float | 0 | 所有 Pose 的常数偏置，可被 Notify 修改 | 只改变库/片段整体先验，不改变局部特征 | 用大负数掩盖坏特征；应小量使用 | `PoseSearchDatabase.h:L520-L523`；`PoseSearchAssetIndexer.cpp:L199-L226` |
| `LoopingCostBias` | Database float | -0.005 | 对可循环资产的偏置 | 轻微偏好循环段 | 循环段被过度偏爱；与停止动作混库时设为 0 或分库 | `PoseSearchDatabase.h:L525-L528`；`PoseSearchAssetIndexer.cpp:L217-L220` |
| `ContinuingPoseCostBias` | Database float | -0.01 | Continuing Pose 搜索的偏置 | 抑制无意义跳转；过大可能锁死旧动画 | 结果总不切换；先减小绝对值、再看 Jump/Throttle | `PoseSearchDatabase.h:L513-L518`；`PoseSearchDatabase.cpp:L1797-L1831` |
| Channel weights / `WeightsSqrt` | Schema Channel → SearchIndex | 由 Channel 填充，未赋值维度初始 1 | 加权特征差异；运行时使用 sqrt(weight) | 核心质量旋钮；维度越多成本越高 | 权重随意跨数量级；一次只改一组并记录 Cost | `PoseSearchDerivedData.cpp:L663-L707`；`PoseSearchIndex.cpp:L8-L28` |
| Search mode | Database enum | `PCAKDTree` | BruteForce、VPTree、PCAKDTree、EventOnly | 速度/近似程度取舍 | 小库误用 PCA 导致近似误差；先 BruteForce 做基线 | `PoseSearchDatabase.h:L581-L598`；`PoseSearchDatabase.cpp:L1541-L1554` |
| PCA components | Database int | 4 | PCAKDTree 降维维数 | 少则快但可能漏候选，多则更准更慢 | 未用 PCA 时无效；用 BruteForce 对照验证 | `PoseSearchDatabase.h:L586-L588` |
| `KDTreeQueryNumNeighbors` | Database int | 200 | 近似邻居数，随后做完整 Cost | 越大越准/越慢 | 小于动作多样性导致选错；逐步增加并 profile | `PoseSearchDatabase.h:L595-L598`；`PoseSearchDatabase.cpp:L2428-L2448` |
| `PosePruningSimilarityThreshold` / PCA pruning | Database float | 0 | 删除相似 Pose/主成分点 | 降内存与搜索量，可能丢关键脚步 | 阈值过大导致数据库空洞；先 0 建基线 | `PoseSearchDatabase.h:L601-L609` |
| `SearchThrottleTime` | MM node float | 0s | 两次完整搜索的最小间隔 | 降 CPU，但会延迟响应 | 高速转向仍用 0.2s；按角色速度/输入变化自适应验证 | `AnimNode_MotionMatching.h:L133-L135`；`.cpp:L184-L194` |
| `PoseJumpThresholdTime` | MM node `FFloatInterval` | [0,0] | 当前资产中一段时间范围内的 Pose 不可选 | 防止极短时间跳来跳去；实现换算为 `SampleRate` 的 PoseIdx 区间 | 设太大使合理跳转被过滤；先 [0,0] 基线，再加 0.1–0.3s | `AnimNode_MotionMatching.h:L125-L127`；`PoseSearchDatabase.cpp:L1623-L1663` |
| `PoseReselectHistory` | MM node float | 0.3s | 历史已选 Pose 在时间窗内不可重选 | 抑制循环抖动 | 库小导致无候选；缩短窗口或扩充资产 | `AnimNode_MotionMatching.h:L130-L131`；`PoseSearchDatabase.cpp:L1667-L1685` |
| `bShouldSearch` | MM node bool | true | 是否执行新搜索 | 关闭时沿用 continuing pose | Gameplay 锁定时可关；别用来掩盖 Query 错 | `AnimNode_MotionMatching.h:L152-L154`；`.cpp:L187-L218` |
| Interrupt Mode | Node/Chooser/Blueprint enum | Chooser 未设置时 DoNotInterrupt（源码注释） | 控制数据库切换是否打断 continuing search | 影响响应和技能抢占 | 把 DoNotInterrupt 用在需要立即转向的 locomotion；按动作类别分组 | `PoseSearchChooserColumn.h:L127-L131`；`MotionMatchingAnimNodeLibrary.h:L115-L120` |
| `BlockTransition` | AnimNotifyState | 无 | 将采样 Pose 标为不可跨过的转场边界 | 过滤候选，避免中段切入 | 在整条动画上误标导致无候选；只标不可切入口 | `PoseSearchAssetIndexer.cpp:L199-L227`；`PoseSearchFilter.cpp:L374-L412` |
| `BlendTime` | MM/BlendStack float | 0.2s（MM） | 新 Pose 切入时间 | 大则平滑但响应慢，小则 pop | 与动作速度成比例；急停/落地用短 blend 或 inertial | `AnimNode_MotionMatching.h:L113-L115`；`AnimNode_BlendStack.cpp:L1163-L1172` |
| `MaxActiveBlends` | Blend Stack int | 4 | 最大并行 AnimPlayer 数；0 表示 inertial | 越大可连续叠加但 CPU/内存更高 | 高频跳转仍保持 4 造成堆积；观察 L767-L792 丢弃日志 | `AnimNode_BlendStack.h:L230-L236`；`AnimNode_BlendStack.cpp:L767-L792、L941-L946` |
| `PlayRate` / `PlayRateMultiplier` | MM node interval/float | [1,1] / 1 | 结果资产播放速率；WantedPlayRate 通常由轨迹速度比估计 | 修正速度，过大产生脚滑/变形 | 用 rate 代替缺失速度资产；限制到 0.8–1.2 后再扩 | `AnimNode_MotionMatching.h:L138-L143`；`PoseSearchResult.h:L209-L211` |
| Mirror / Rate Scale | Database asset + Result | 资产设置 | 镜像候选、速率缩放 | 扩大覆盖但依赖 MirrorDataTable/对称骨骼 | 左右脚标记错会使相位反转；逐资产验证 | `PoseSearchAssetSamplerLibrary.h:L15-L36`；`PoseSearchResult.h:L217-L223` |
| Root Motion | Asset sampler / MM Evaluate | 无统一默认 | 资产 root transform 与最终 Root Motion provider 对齐 | 影响轨迹、脚步和网络位置 | In-place 与 Root Motion 混库且未统一；分库或显式转换 | `PoseSearchAssetSampler.h:L35-L47`；`AnimNode_MotionMatching.cpp:L301-L359` |
| Interaction Bias | Database float / Notify | 0 | 多角色 continuing interaction 的先验 | 保持同一角色对齐与连续性 | 未设置角色 Context 或跨线程读取 Actor；先验证 tick dependency | `PoseSearchDatabase.h:L530-L542`；`PoseSearchResult.h:L233-L258` |

### 用户点名但当前源码未找到的名称

- **“Pose Cost Bias”** 不是当前公开属性名；当前实现对应 `BaseCostBias`、`LoopingCostBias`、`ContinuingPoseCostBias` 和 Notify 的 CostAddend。
- **“Trajectory History / Prediction”** 不是一个单独的 MM node 属性，而是 Collector/`FPoseSearchTrajectoryData::FSampling` 的采样设置。
- **AnimNext Pose Search 参数**：当前 `AnimNextPoseSearch` 目录没有 `.h/.cpp` 源码，只有二进制/Intermediate；无法从本快照确认 trait 默认值、线程调度或与经典 PoseSearch 的字段一一对应。

---

## 四、Cost 和搜索机制

### 1. Query 与数据库 Pose

Query 构建可抽象为：

```text
for channel in Schema.FinalizedChannels:
    channel.BuildQuery(SearchContext, QueryVector[offset:])
```

`FSearchContext` 提供相对骨骼位置、旋转、速度采样（`PoseSearchContext.h:L207-L221`）；Schema `BuildQuery` 负责按固定 cardinality 写入向量（`PoseSearchSchema.h:L161-L169`）。数据库索引器在每个 `SampleTime = min(CalculateSampleTime(SampleIdx), PlayLength)` 抽取动画 Pose，再让每个 Channel 写入 PoseVector（`PoseSearchAssetIndexer.cpp:L191-L227、L250-L258`）。

必须匹配的时间语义：轨迹的零时间样本代表上一帧仿真姿态（Collector 注释，`AnimNode_PoseSearchHistoryCollector.h:L81-L83`），而不是“刚更新完的未来姿态”。如果 Query 用当前帧、索引 Pose 用上一帧，Cost 会整体偏移。

### 2. Cost 公式

`PoseSearchIndex.cpp:L8-L28` 给出核心公式（以权重平方根存储）：

\[
D(q,p)=\sum_i\left((q_i-p_i)\sqrt{w_i}\right)^2
\]

当前总 Cost 是：

\[
C(p)=D(q,p)+c_{notify}(p)+c_{continue}+c_{interaction}+c_{context}
\]

对应 `FPoseSearchCost` 构造函数（`PoseSearchCost.h:L20-L27、L77-L99`）和 `EvaluatePoseKernel`（`PoseSearchDatabase.cpp:L165-L175`）。因此负 Bias 是先验奖励，不能替代错误的单位/坐标变换。

### 3. 搜索模式

- **BruteForce**：逐 Pose 完整评分，最适合验证正确性和小库。
- **VPTree**：用欧氏距离平方根满足三角不等式；源码注释在 `PoseSearchIndex.cpp:L992-L995`。
- **PCAKDTree**：先在主成分空间找近邻，再对候选做完整 Cost；`KDTreeQueryNumNeighbors` 决定候选宽度（`PoseSearchDatabase.cpp:L2428-L2468`）。
- **EventOnly**：只按 Event Notify 搜索，不是普通 locomotion 的默认模式。

工程上应先用 BruteForce 建立“正确性基线”，再切 PCAKDTree，打开编辑器比较 BruteForce 的调试 Cost（`PoseSearchDatabase.cpp:L1556-L1579`）。

### 4. Continuing、Jump、Interrupt、Throttle 如何稳定

1. `ContinuingPoseCostBias` 让当前 Pose 在相似候选中占优；`SearchContinuingPose` 仍会计算当前 Pose 的完整特征 Cost。
2. `PoseJumpThresholdTime` 将当前资产附近的 PoseIdx 加入 NonSelectable；实现按 `floor/ceil(interval * SampleRate)` 换算（`PoseSearchDatabase.cpp:L1623-L1663`）。
3. `PoseReselectHistory` 读取 `FPoseIndicesHistory::IndexToTime`，过滤短时间内重选的 Pose（L1667-L1685）。
4. `SearchThrottleTime` 直接跳过本次完整搜索并沿用 Continuing Pose（`AnimNode_MotionMatching.cpp:L184-L218`）。
5. InterruptMode 决定 Blueprint/Chooser 更换数据库时是否允许打断；它不改变特征距离，只改变生命周期。

这几层共同避免“每帧最低 Cost 都不同”的抖动，但若 Query 预测方向错误，它们只会把错误结果保持得更久。

### 5. 为什么会跳错脚、滑步或频繁换动画

- **频繁切换**：轨迹噪声、权重没有 continuing 先验、数据库覆盖有空洞、Throttle=0 且 Jump=0。
- **脚步错误**：没有采集足部位置/速度/相位，或左右 Mirror 映射错。
- **滑步**：Query 速度与 root motion 不一致，WantedPlayRate 被迫拉伸，或 In-place/Root Motion 混用。
- **转身不自然**：未来 facing/角速度 channel 权重太低，数据库缺少原地转向片段。
- **倒走错误**：只比较速度大小/位置，不比较 facing 与速度符号。

这些诊断首先检查 Query 绘制、Feature Vector 和 BruteForce 候选，而不是直接调 BlendTime。

---

## 五、最佳实践

### 数据库与资产

1. 先按 locomotion、转向、起步/停止、特殊动作分库，再用 Chooser/BranchIn 做高层选择；避免一个库同时承担不可抢占的攻击和可连续的走跑。
2. 每种速度、方向、转弯半径、停止距离至少有多个相位样本；数据库覆盖比高采样率更重要。
3. Root Motion 与 In-Place 二选一作为主契约。若必须混用，给不同数据库/Schema，或在索引前显式统一 root transform。
4. Mirror 只用于左右语义真正对称的资产；检查 MirrorDataTable 的骨骼对和事件/脚步标记。
5. 采样率先 30Hz；只有脚步或高速急停出现量化误差时才升高，并同步评估 DDC/内存/搜索成本。

### 轨迹、步态和动作边界

1. Trajectory history 覆盖至少一个脚步相位，prediction 覆盖制动/转向提前量；先画世界空间和角色空间两条轨迹。
2. 速度、加速度、controller yaw rate 使用同一单位（UE cm/s、deg/s）；`MaxControllerYawRate` 当前默认 70 deg/s（`PoseSearchTrajectoryLibrary.h:L64-L73`）只是数据类默认，不能当作所有项目的最佳值。
3. 起步、停止、急停和原地转向要有独立样本，不要指望 Blend Space 插值补齐。
4. 通过 PoseSearchBlockTransition 标记不可切入口，通过 ModifyCost 做局部先验；不要把整段动画都 Block。

### 角色比例、Retarget、IK 和 Motion Warping

- Retarget 后重新验证脚长、root 高度和骨盆轨迹；Schema 的相对位置特征对比例差异敏感。
- MM 负责选时间点，IK 负责接触修正，Motion Warping 负责目标对齐；三者顺序通常是 MM → 局部 IK → Warping/Root Motion 消费，具体要以项目 root motion ownership 验证。
- 同时使用 Motion Warping 和 MM 时，不能让 Warping 改变的 root 轨迹又被当成未经修正的 Query；需要明确“先预测、后 warp”或“warp 结果回写 Query”的单一契约（**工程经验，需要运行时验证**）。

### 网络、性能和调试

- 网络只同步输入、Movement State、选定资产/时间、Mirror/PlayRate 或确定性 seed，不要每帧同步整套 Pose。
- 客户端和服务端必须使用同一 Schema、数据库版本、采样率和归一化参数；否则相同 Query 也会得到不同 Pose。
- 先 BruteForce profile，再 PCAKDTree；降低 KNN、减少无效 Channel、合理 Throttle，最后才考虑减少采样率。
- 开启 Pose Search Trace/候选跟踪，绘制 Query/Trajectory/History；`FSearchContext::Track` 和 `FDebugDrawParams` 为源码提供的调试入口（`PoseSearchContext.h:L435-L499`）。

---

## 六、常见问题诊断

| 现象 | 可能原因 | 检查项 | 修复方法 |
|---|---|---|---|
| 频繁切换动画 | Query 噪声、权重失衡、无 continuing bias | 画 Query、查看候选 Cost、确认 `SearchThrottleTime` | 先修轨迹/权重，再加小幅 Continuing Bias 与 0.1–0.2s Jump |
| 动画选择延迟 | Throttle 过大、预测样本过稀、异步索引未完成 | Trace 搜索时间、`SetAsyncBuildIndexInProgress`、预测采样间隔 | 减小 throttle、提高关键预测采样、确保 cook/index 完成 |
| 脚步滑动 | root motion/速度不一致、缺足部速度特征 | 对比 RootTransform、WantedPlayRate、足部速度 | 统一 In-place/Root Motion，增加足部 position/velocity，限制 rate |
| 转身不自然 | facing/角速度权重低、缺原地转身资产 | 轨迹 yaw 与动画 root yaw | 增加 facing/rotation channel，补转身资产 |
| 停止时脚步错位 | 预测没有制动、停止样本不足 | 看未来 0.2–1s 轨迹和停止 Pose | 加制动预测/停止库，避免只按当前速度匹配 |
| 向后走选错 | 只有速度大小，没有方向/facing | Query 中 velocity sign 与 facing | 增加相对速度和 facing，补 backward 资产 |
| 轨迹预测方向错误 | 世界/角色空间混用，controller yaw 符号反 | 绘制 `FTransformTrajectory`、检查根变换 | 统一空间和 yaw 约定，先关闭 Warped Trajectory |
| 姿态突然跳变 | Jump/Reselect 过滤无效、BlendTime 太短、Mirror 错 | Candidate flags、Blend Stack player 数、MirrorTable | 修过滤窗口和骨骼对，增加 blend 或启用 inertialization |
| 搜索不稳定 | PCA/KDTree 候选不足、归一化跨库不一致 | BruteForce 对照、KNN、Schema cardinality | BruteForce 基线；增 KNN 或 common schema |
| CPU 占用过高 | BruteForce 大库、Channel 太多、Throttle=0 | Unreal Insights/PoseSearch cycle counters | PCAKDTree、降 KNN、拆库、适度 throttle |
| 网络姿态不一致 | 数据库/Schema 版本或浮点输入不同 | 记录选定 Database/PoseIdx/AssetTime | 同步资产版本与关键输入，必要时服务端权威结果 |
| MM + Motion Warping 冲突 | 两者分别解释 root motion | 比较 Query trajectory、warp 后 root、最终位移 | 明确单一 root-motion owner，必要时回写 warped trajectory |

---

## 七、推荐调参流程

按顺序推进，每一步不通过就回退，不要跨层同时改参数。

1. **骨骼和比例**：检查 root、骨盆、脚、朝向轴和 Retarget；用 `FPoseSearchAssetSamplerLibrary::Draw` 看 component/world transform。正确现象是左右脚长度和 root 高度合理；错误就先修 Skeleton/Retarget。
2. **动画资产**：逐条预览起步、走跑、转向、停止、倒走；确认 root motion 契约和循环边界。缺动作就补库，不调权重。
3. **Schema**：先 30Hz、Normalize、root/骨盆/双脚位置与速度、root facing/trajectory；确认 `FinalizedChannels` cardinality。若 Query/Index 维度不等，回退 Schema。
4. **Query 和 Trajectory**：绘制历史/预测轨迹、检查零时间样本、空间和单位。正确现象是轨迹贴合控制意图；方向错就回到运动状态/空间转换。
5. **Database 覆盖**：用 BruteForce，记录不同速度/转弯/停止的最佳 Pose。若所有场景都选同一条资产，回到资产筛选。
6. **特征权重**：一次只改位置、速度、facing、轨迹一组；用候选 Cost 和视觉结果对照。先解决大方向，再解决脚步。
7. **Continuing / Jump**：从 `ContinuingPoseCostBias=-0.01`、Jump=[0,0]、Reselect=0.3s 开始，小步增加 Jump/Reselect。若没有候选，回退窗口。
8. **Blend Stack**：先 `MaxActiveBlends=1–2`、BlendTime=0.15–0.2s，再评估 4 的收益；若出现堆积或 pop，检查同帧多次 BlendTo。
9. **特殊动作**：加入起步、停止、急转、跳跃、落地、蹲伏和 Montage/Slot 边界，并用 BlockTransition/Chooser 过滤。
10. **Motion Warping / IK**：只在 MM 结果稳定后接入；验证 root motion ownership、脚接触和 warp 后轨迹。
11. **性能/网络**：BruteForce 与 PCAKDTree 对照，记录 KNN、采样率、Throttle、CPU；再做客户端/服务端相同输入重放。任何不一致先回到第 4–6 步。

---

## 八、三套可落地配置

### A. 第三人称普通人形角色

- **数据库**：Idle/Walk/Run、8 向起步/停止、原地 90/180 度转向、倒走；攻击和受击单独库。
- **Schema**：root/骨盆位置与速度、左右脚位置/速度、root facing、Trajectory position/facing/velocity；Normalize。
- **轨迹**：历史 10×0.04s，预测 8×0.2s；预测总长 1.6s 覆盖常规制动。
- **采样**：30Hz；PCAKDTree，主成分 4，KNN 先 200，再按 Insights 调整。
- **权重方向**：速度/轨迹略高于上身姿态；双脚接触段增加脚位置/速度。
- **Blend 策略**：BlendTime 0.15–0.2s，Continuing bias 小负值，Jump 0.1–0.2s，MaxActiveBlends 2–4。
- **风险**：资产覆盖不足时会用 Walk 代替 Stop；先补停止库，不要把 BaseCostBias 调成大负数。

### B. 高速角色或大型生物

- **数据库**：按速度区间拆分冲刺、急停、急转、跳跃/落地；大型生物增加身体重心和前肢/后肢接触特征。
- **Schema**：root velocity/acceleration、未来轨迹位置/heading、重心/主要接触肢体位置；减少与高速无关的手指/面部 channel。
- **轨迹**：历史 8–10×0.02–0.04s，预测 10–12×0.1–0.15s；总预测覆盖完整制动距离。
- **采样**：30Hz 起步，急停量化不足再升 60Hz；PCA KNN 逐步提高，保持 BruteForce 对照。
- **权重方向**：未来轨迹和 root velocity 最高，重心/接触其次，细节姿态较低。
- **Blend 策略**：BlendTime 0.08–0.15s，Jump 窗口短，Throttle 接近 0；必要时 `MaxActiveBlends=0` + inertialization。
- **风险**：预测误差会被高速放大；先验证输入延迟和控制器 yaw rate，再调整权重。

### C. 网络多人游戏角色

- **数据库**：客户端和服务端使用同一 cooked Database/Schema；特殊 Gameplay 动作由 Montage/Ability 权威驱动。
- **Schema**：尽量选择可由同步 Movement State 重建的 root/trajectory 特征，少依赖本地不可复现的曲线。
- **轨迹**：历史长度与网络快照/预测回滚窗口一致；预测由服务端或确定性 movement model 生成。
- **采样**：30Hz、PCAKDTree；KNN 和权重固定在版本资产，不允许客户端动态改。
- **权重方向**：根速度/方向和未来轨迹优先，局部姿态次之；服务端结果可同步 `DatabaseId + PoseIdx/AssetTime + Mirror + PlayRate`。
- **Blend 策略**：Continuing bias 小幅，Jump/Reselect 保守；Gameplay 事件使用明确 InterruptMode。
- **风险**：不同帧率/浮点误差会造成选择分叉；必要时服务端只同步高层结果，客户端负责平滑 Blend，不要强求每个骨骼 bitwise 一致。

---

## 九、结论与源码边界

### Motion Matching 核心原则（10 条）

1. Schema 是 Query 与 Database 的 ABI。
2. 先保证轨迹空间和时间语义，再调权重。
3. 历史姿态描述相位，未来轨迹描述意图。
4. 数据库覆盖决定上限，Cost 只负责排序。
5. 用 BruteForce 建正确性基线，再用 KD/PCA 优化。
6. Continuing/Jump/Reselect/Throttle 是稳定器，不是数据修复器。
7. Root Motion、In-place、Warping 必须有单一清晰契约。
8. Mirror、Role、Retarget 错一处，Cost 就会系统性偏差。
9. Blend Stack 的活跃播放器数是视觉与 CPU 的共同预算。
10. 网络同步优先同步可重建输入或选择结果，而不是整套 Pose。

### 最重要的参数排序

1. Schema 特征与坐标/单位；
2. 数据库资产覆盖与采样率；
3. Trajectory history/prediction；
4. Position/Velocity/Facing/Foot 权重；
5. ContinuingPoseCostBias、PoseJumpThresholdTime、PoseReselectHistory；
6. 搜索模式、PCA 维数和 KNN；
7. BlendTime、MaxActiveBlends、PlayRate 限制；
8. Mirror、Root Motion、Chooser/Interrupt。

### 最容易误调的参数

`ContinuingPoseCostBias`、`PoseJumpThresholdTime`、`PoseReselectHistory`、`SearchThrottleTime`、`KDTreeQueryNumNeighbors` 和 `PlayRate`。它们都能让画面“暂时稳定”，却可能掩盖错误的 Query 或数据库空洞。

### 推荐最小可行配置

一个 30Hz locomotion Database；root/骨盆/双脚 position + velocity；root facing；10 个历史轨迹样本、8 个预测样本；Normalize；先 BruteForce；BlendTime 0.2s；Continuing bias 使用当前默认小负值；Jump/Reselect 从 0 和 0.3s 基线开始；确认结果后再切 PCAKDTree。

### 必须结合项目测试才能确定的内容

角色速度范围、预测模型、脚步权重、Jump/Reselect 时间窗、BlendTime、PlayRate 上限、PCA 维数/KNN、客户端/服务端同步策略，以及 Motion Warping 与 MM 的 root ownership。当前源码给出机制和默认值，但没有为你的角色提供“正确”数值。

### 当前源码已经确认的事实

- `FAnimNode_MotionMatching` 继承 Blend Stack，并在 Update 中构造 Search Context、调用搜索、通过 `BlendTo` 切换（`AnimNode_MotionMatching.h:L18`；`.cpp:L180-L296`）。
- Schema 默认 SampleRate=30、Normalize；Database 默认 PCAKDTree、4 个主成分、KNN=200（`PoseSearchSchema.h:L71-L91`；`PoseSearchDatabase.h:L581-L598`）。
- Cost 是加权特征平方差加 Notify/Continuing/Interaction 偏置（`PoseSearchIndex.cpp:L8-L28`；`PoseSearchCost.h:L20-L27`）。
- Jump/Reselect 通过 NonSelectable PoseIdx 过滤；索引器读取 BlockTransition/ModifyCost Notify（`PoseSearchDatabase.cpp:L1623-L1685`；`PoseSearchAssetIndexer.cpp:L199-L227`）。
- Blend Stack 默认最多 4 个活跃 blend，0 表示 Inertialization，且同帧多次 BlendTo 最后一次胜出（`AnimNode_BlendStack.h:L230-L236`；`AnimNode_BlendStack.cpp:L941-L946、L1278-L1279`）。

### 当前源码无法确认、需要运行时验证的内容

- AnimNextPoseSearch trait 的内部字段、调度和默认值：当前目录缺少可读 `.h/.cpp`。
- 不同 UE 小版本之间的编辑器显示名、Chooser UI 默认值和 cooked DDC 行为。
- 具体角色的最佳权重、预测模型、网络重放确定性和 Motion Warping 顺序。
- 某些项目自定义 Channel、Retarget、IK 或 Gameplay Ability 对 Query 的额外修改；必须在项目运行时 Trace/Insights 中核对。

**落地顺序只有一句话：先让 Query、Trajectory、History、Schema 和 Database 在 BruteForce 下稳定，再逐层加入过滤、Blend、IK、Warping、性能和网络。**
