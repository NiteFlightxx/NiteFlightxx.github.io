---
title: "three-avbd：WebGPU 刚体求解流水线"
excerpt: "沿 GPU 时间步追踪碰撞、CSR、染色、原对偶迭代和速度更新，分析排程与容量边界。"
date: "2026-10-18"
category: "Physics"
subtopic: "ConstraintSolver"
tags: ["AVBD", "WebGPU", "刚体动力学", "碰撞检测", "图染色", "源码精读"]
readTime: "阅读约65分钟"
kind: "source"
level: "advanced"
pageType: "source-analysis"
aliases: ["GpuSolver3D","three-avbd GPU","WebGPU AVBD","three-avbd GPU 求解器详解 — 从碰撞、图染色到 AVBD 原对偶迭代与 WebGPU 优化"]
prerequisites: ["vbd-avbd-math", "avbd-demo3d-implementation", "iterative-linear-solvers"]
nextArticles: ["gpu-physics-plugin"]
related: ["collision-detection-gjk-epa-sat", "jacobian-matrix", "numerical-integration-methods", "gpu-physics-plugin"]
topics:
  - id: "ue-chaos-physics"
    stage: "parallel"
    role: "source"
    order: 35
sources:
  - title: "three-avbd 固定版本：GpuSolver3D"
    url: "https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts"
  - title: "three-avbd 固定版本：WGSL 原对偶求解"
    url: "https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts"
  - title: "three-avbd 固定版本：优化实验记录"
    url: "https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md"
featured: false
---

本文解释 three-avbd 的真实 GPU 执行链，关注各阶段读写什么、依赖怎样建立，以及哪些优化改变排程或数值行为。理论见[VBD 与 AVBD](/knowledge/vbd-avbd-math/)，原生参考见[avbd-demo3d](/knowledge/avbd-demo3d-implementation/)。[GPUPhysicsLab](/knowledge/gpu-physics-plugin/)是独立移植实现，不能直接继承这里的验证结论。

## 一、先给结论：它究竟在 GPU 上求什么

three-avbd 的公开 World 三维运行时，是一个以 WebGPU 为计算后端、以 AVBD 为约束求解框架的刚体系统。它不是“把 CPU 的物体循环搬到 shader”那么简单：碰撞、邻接关系、染色、颜色桶、原对偶迭代和速度更新都形成了 GPU 流水线；Three.js 再直接读取同一份刚体状态绘制。CPU 仍负责创建资产、配置、上传变更、编码命令以及异步回读。[World:578–611、838–874](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L578-L874) [GPU step:1450–1613](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1450-L1613) [BodyMesh:79–135](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/mesh.ts#L79-L135)

理解这个实现，先记住八个事实。

1. **求解块是单个刚体的六个自由度。** 每次局部求一个 $6\times6$ 系统，而不是组装并求解全场景大矩阵。[wgsl-solve:383–501](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L383-L501)
2. **并行的是同色刚体，不是所有刚体无条件并行。** 不同颜色依次调度，后面的颜色可以读到前面颜色的新位姿。[GPU step:1568–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1568-L1581)
3. **每个物理步先碰撞，再做惯性预测。** 接触不在每轮 AVBD 迭代中重新检测，迭代依靠已有接触的局部约束近似。[GPU step:1514–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1514-L1581)
4. **宽相不是 LBVH，凸体窄相也不是 GJK/EPA。** 当前主线是两级空间哈希、球/AABB/面轴筛选、盒体 SAT 与多点流形；凸包走凸多面体 SAT。[wgsl-collision:78–315、646–672](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L78-L672) [wgsl-hull:138–186、318–340](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-hull.ts#L138-L340)
5. **AVBD 原变量与对偶变量交替更新。** 一轮包含所有颜色的位姿更新，再统一更新关节和接触的乘子、罚参数；没有等原问题完全收敛才更新对偶。[GPU step:1568–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1568-L1581)
6. **静止初值不等于睡眠。** 慢速刚体仍有惯性目标、仍参与约束与速度重建，不能把 startAtRest 当作 native sleeping islands。[wgsl-solve:269–310](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L269-L310)
7. **公开 World 没有透明 CPU 回退。** 仓库有 CPU reference 作为对照，但 World.create 的 WebGL 路径会报错，不会自动改用 CPU 解算。[World:591–611](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L591-L611)
8. **某些优化不能默认打开。** 整体流形复用需要调用方明确请求；稀疏颜色融合默认关闭，仓库记录了真实破坏场景的长期回放分歧。[GPU solver:491、1450–1472](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L491-L1472) [FINDINGS:1492–1500](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L1492-L1500)

### 1.1 版本、证据与文章边界

本文基于本地 E:\UnrealProjects\three-avbd，固定提交为：

~~~text
2bb1a318e9aad03640b4bce5b5d222484f0925f7
~~~

正文引用的源码行号属于这个版本，不能直接套到以后版本。文件路径均相对于该仓库，文末列出完整索引。

范围聚焦三维公开 World 与 GpuSolver3D，包含它们实际复用的二维基础设施；不是对仓库所有二维实验求解器逐一展开。

- **源码事实**：可以从当前 TypeScript/WGSL 的控制流、布局和公式直接确认。
- **工程判断**：对代码行为、风险和适用场景的解释，不等于项目作者承诺。
- **历史测量**：来自仓库 FINDINGS，不是本文环境重新跑出的结果。
- **需要验证**：目标硬件性能、长时间稳定性、特定业务场景效果。

本文没有运行新的 WebGPU 物理测试，也不宣称跨设备确定性、生产级 CCD 或通用物理引擎完整性已经得到验证。

基础理论请先读 [VBD 与 AVBD](/knowledge/vbd-avbd-math/)，CPU 参考工程见 [avbd-demo3d 实现](/knowledge/avbd-demo3d-implementation/)，矩阵算法见 [迭代线性求解器](/knowledge/iterative-linear-solvers/)。本文只展开 GPU 实现新增的机制与取舍。

## 二、先分清四个层次

### 2.1 CPU reference：用于对照，不是公开运行时后备

src/avbd3d/ref 中保留 CPU 求解实现与默认参数。它帮助比较公式、逐步状态和不同执行顺序，但 CPU 顺序求解与 GPU 染色求解不能简单视为逐浮点指令完全一致。当前 GPU 构造函数从 reference 导入基础默认值。[ref/solver:29–54](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/ref/solver.ts#L29-L54) [gpu/solver:589–598](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L589-L598)

### 2.2 World：应用和 GPU 之间的事务入口

World 管理固定步进、对象句柄、增删改批处理、力与冲量、运动学移动、查询以及回读。它决定“这一物理步应当看到哪些输入”，不在 JavaScript 中遍历接触来求解。[World:838–1042](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L838-L1042)

### 2.3 GpuSolver3D：资源与命令图

solver.ts 分配 storage/uniform/indirect buffer，建立计算管线与 bind group，按依赖顺序编码 kernel，并维护容量、双缓冲和异步诊断。真正逐刚体/逐接触的计算在 WGSL 中。[gpu/solver:601–835、1450–1613](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L601-L1613)

三维代码复用了 src/avbd2d/gpu 中的 scan、topology、indirect args 模板。看到二维目录名，不代表三维没有使用这些算法。[gpu/solver:687–739](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L687-L739) [3D layout:291–340](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L291-L340)

### 2.4 BodyMesh：消费 GPU 状态

BodyMesh 的实例变换直接读取刚体 buffer 中的位置、旋转、尺寸与形状。渲染不必先将全部位姿读回 CPU，再写到每个 Object3D。[mesh:1–5、79–135](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/mesh.ts#L1-L135)

这是**物理状态到实例绘制的零位姿回读**，不是“整个应用从不上传/回读数据”：参数上传、查询、事件和容量统计仍有 CPU/GPU 交换。

## 三、一次完整物理步的真实执行顺序

默认路径可以压缩成下面的命令链；括号里的扫描不是 CPU 操作。

~~~text
World.update(realDt)
  └─ 固定步循环 → World.step()
      ├─ flush：增删改、过滤、关节
      ├─ push：GPU 施加力与冲量
      └─ GpuSolver3D.step()
          ├─ 上传本步参数 / 清计数与工作区
          ├─ Collision
          │   beginFrame → updateRefs → argsPrev → hashInsert
          │   → gridCount → scan → gridScatter
          │   → findPairs → [findFixedLarge]
          │   → argsPairs → narrowphase → argsContacts
          ├─ Adjacency
          │   degree → scan → fill → sortAdjacency
          ├─ Colouring
          │   compact → mark → 多轮 AB/BA 染色
          │   → count → scan → starts → args → scatter
          ├─ Solve
          │   warmStartJoints → warmStartBodies
          │   → 重复 iterations 次：
          │       primal(color 0), primal(color 1), ...
          │       → dual(joints + manifolds)
          │   → updateVelocities
          └─ submit / 翻转接触缓冲 / 按需异步计时
~~~

执行位置：[World:855–874](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L855-L874) [gpu/solver:1450–1613](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1450-L1613)。

三个容易讲反的地方：

- **碰撞先于本步预测。** 新的碰撞几何使用进入本步时的位姿，不是先把所有物体移动到目标位置后再检测。
- **一次物理步只建一次邻接与染色。** 对偶循环中不会重新构建图。
- **一个颜色一次 primal dispatch。** 不是每轮仅一次“所有刚体”dispatch；颜色数直接进入调度成本。

这些决定了该实现是离散碰撞、固定接触集合的迭代求解器。增加 iterations 能更好解当前集合，却不能找回本步根本没有发现的高速碰撞。

## 四、数据布局：算得快之前，先决定读写什么

### 4.1 刚体是紧凑记录，不是纯 SoA

Body 有十个 vec4，共 40 个 32 位字，即 160 字节：

- pos / rot：当前位置、旋转；pos.w 存摩擦系数。
- initialPos / initialRot：物理步开始位姿。
- size：尺寸，w 为质量；质量零用于固定体。
- moment：三个主惯量，w 为包围半径。
- inertialPos / inertialRot：惯性目标；inertialPos.w 还编码参考位姿变化的步号。
- vel / angVel：速度；vel.w 记上一物理步沿 up 的速度，angVel.w 编码形状。

接触需要的当前/初始位姿集中在记录前 64 字节。此布局更接近按访问模式组织的 AoS，而不是每个属性独立大数组的纯 SoA。[layout:8–25、168–180](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L8-L180)

### 4.2 把“一对物体”与“该对的多个点”拆开

Pair 候选是两个索引，8 字节。Manifold 是 32 字节，保存两体、首点、点数、生成步号、法向与摩擦。Contact 是 64 字节，保存局部锚点、特征键、初始误差、三个罚参数和三个乘子。[layout:82–101、195–218](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L82-L218) [gpu/solver:767–800](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L767-L800)

求一个流形时，可以只加载一次 partner 与接触基，然后遍历多个点；不必每个点都重复存同一法向与两体编号。与此同时，单点接触很多的场景并不一定获得与多点堆叠相同的收益。[wgsl-solve:383–445](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L383-L445) [FINDINGS:660–688、849–910](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L660-L910)

### 4.3 关节与接触历史

每个 Joint/Spring 记录 160 字节，另有 16 字节信息；记录中包括初始误差、乘子、罚参数、锚点、当前 rest 与初始 restStart。Manifold/Contact 使用双缓冲，以读取上步历史、生成本步结果。[layout:27–101](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L27-L101) [gpu/solver:742–800](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L742-L800)

若各 $N$ 表示分配容量而非活跃数量，主要记录显存可粗估为：

$$
M_{\mathrm{records}}\approx160N_b+176N_j+8N_p+64N_m+128N_c
$$

其中流形与接触系数包含双缓冲；尚未包含 CSR、网格、颜色、凸包、参数、扫描 scratch、回读 staging 和渲染资源。用活跃接触数估算实际分配显存，会漏掉预留容量。

## 五、初始化：GPU 执行前，CPU 仍承担哪些工作

### 5.1 设备与资源能力

World 可从渲染器取得同一个 GPUDevice，也支持 headless device。凸包管线要求每 shader stage 至少支持九个 storage buffer；timestamp-query 只有设备支持才启用。[World:591–611](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L591-L611) [gpu/solver:616–627](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L616-L627)

因此不能把“浏览器支持 WebGPU”直接等同于“所有可选形状与诊断功能都可用”。

### 5.2 凸包预处理

hull.ts 在 CPU 上建立凸包，计算质量属性、质心和主惯性轴。输入可以超过 32 个点，但最终凸包顶点超过 32 时，会用分散采样选择顶点再建简化凸包；不是简单截断输入数组。它不是任意复杂凹三角网格的精确碰撞表示。[hull:44–190、195–387](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/hull.ts#L44-L387)

**工程取舍**：CPU 初始化成本换取运行时更小且规则的几何数据。凸化会填平源模型的孔洞、凹槽；超过上限后再采样简化，也可能相对完整凸包略微内缩。这两种几何变化都不是增加迭代能修复的问题。

### 5.3 Morton 排序与预估容量

构造时默认按 Morton 编码重排初始物体，使空间相近对象更可能拥有相近内存索引。这里没有建立 radix tree，也没有每步维护 BVH。后续添加对象不意味着进行实时全局 Morton 重排。[gpu/solver:410–431、634–638、1158–1176](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L410-L1176)

CPU 还估计候选对、接触和图度数来选择初始容量。最低 pair 为 4096、contact 为 8192、manifold 为 4096，并结合 body capacity 与估计 touching 数放大；这只是初始化估计，不是复杂场景永不溢出的证明。[gpu/solver:288–408、648–676](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L288-L676)

## 六、应用输入与固定步进

### 6.1 固定步与掉帧策略

World 默认时间步 $h=1/60$ 秒、十次求解迭代、重力向量为 $[0,-9.81,0]$。单次 update 最多追赶四个物理步，超出后限制欠账，避免无限追帧拖垮下一帧。[World:525、578–588、838–852](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L525-L852)

这意味着：

- 固定步不等于渲染帧率固定。
- 长卡顿后不保证把全部真实时间完整补算。
- substeps 是时间细分，iterations 是同一时间步的约束精化，两者不能互换。

低层 GpuSolver3D 从 reference 得到的重力标量默认是 $-10$；公开 World 会配置自己的重力。比较两个入口时必须先统一参数。[ref/solver:29–54](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/ref/solver.ts#L29-L54) [gpu/solver:589–598](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L589-L598)

### 6.2 flush：先形成一致输入快照

新增体、改写体、过滤和关节变更先经 World.flush 批量同步。射线/状态缓存与句柄版本也需要与增删保持一致，不能在一半更新时将另一半旧数据作为完整世界读取。[World:926–1000、1096–1152](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L926-L1152)

### 6.3 力、冲量与运动学

持续力先乘以时间步形成冲量，一次性冲量使用后清除；pusher 在 GPU 上更新速度：

$$
\Delta\mathbf v=\frac{\mathbf J}{m}
$$

角向更新把力矩冲量变换到当前主惯性轴系、除以主惯量，再变换回来。CPU 合并每个体的 pushes，GPU 线程独占更新该体，避免多个施力线程争写同一速度。[World:907–923](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L907-L923) [push:1–41、79–120](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/push.ts#L1-L120)

运动学 moveTo 通过对应速度表达移动。带排队运动学移动的 World.step 不直接复用用户的整体流形选项；固定体移动时旧接触不能无条件当成当前几何。[World:855–865、1008–1042](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L855-L1042)

## 七、开始新步：计数器、参考位姿与双缓冲

beginFrame 保存上一步需要的计数并清理本步计数。前一帧流形被放入配对哈希表，本帧窄相从另一份缓冲读历史、向当前输出写新结果。step 提交后翻转 parity。[wgsl-collision:65–76、336–370](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L65-L370) [gpu/solver:1478–1531、1590–1592](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1478-L1592)

updateRefs 将当前位置/旋转与参考位姿比较；超过 $0.002$ 米或 $0.002$ 弧度阈值，就记录该体最后变化的步号。旧流形生成时间是否晚于两体最近移动时间，是接触复用的关键判断。[layout:124–129](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L124-L129) [wgsl-collision:14–47、696–707](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L14-L707)

这里存在三种不同状态：

1. 仍有历史记录，可用于匹配与热启动。
2. 两体几何足够没变化，可直接复用该对接触点。
3. 调用方明确允许复用整个流形集合，可绕过本步宽相/窄相。

第一种不等于第二种，第二种也不等于第三种。

## 八、宽相：两级空间哈希，而不是全对测试

### 8.1 网格建立

每个普通物体按中心进入一个格子，格坐标与 coarse/fine level 一起参与哈希。GPU 分三步形成桶内紧凑列表：

1. gridCount 原子累加每个桶的对象数。
2. exclusive scan 将桶计数变成区间偏移。
3. gridScatter 将物体索引写入桶区间。

这是计数排序式的桶构建，不是对所有对象作比较排序。[wgsl-collision:78–115](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L78-L115)

哈希相等只表示落到同一个桶，探测时仍校验真实格坐标和 level，防止哈希冲突被误当成空间邻接。[wgsl-collision:235–274](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L235-L274)

### 8.2 为什么要分两级

CPU 根据半径分布选择 fine/coarse 尺寸，另将特别大的对象放入 large 列表。粗细两级共用表但有 level 区分。动态体半径参与 fine level 的选择，阈值取半径间中点以避免 f32 舍入将对象分到相反一侧。[gpu/solver:975–1034](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L975-L1034)

半径分位数使用 Wirth selection；large 策略含 LARGE_FACTOR=2、MAX_LARGE=64 等实现常量，不是无限层级自适应树。[radii:1–56](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/radii.ts#L1-L56)

**工程判断**：均匀尺寸对象适合规则网格；尺度跨度很大时，分级和 large 旁路降低单一粗网格的候选爆炸，但 large 数量、固定/动态比例及场景分布仍会影响成本。

### 8.3 谁负责生成一对

findPairs 主要由动态体主动探测，每级查询相邻 $3\times3\times3$ 格：

- 同级动态体对由索引约定的一方生成。
- 动态体与固定体由动态体负责。
- fine/coarse 对由 fine 一侧负责。
- large 对象走旁路；findFixedLarge 补齐固定 fine 对动态 coarse、固定 small 对动态 large 等组合。

固定体仍然进入网格，只是不主动跑普通查询。不能将 dynamic-only probe 理解成“地板从宽相消失”。[wgsl-collision:235–315](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L235-L315)

### 8.4 廉价拒绝到昂贵检测

testPair 按顺序排除固定—固定、双向过滤不匹配、包围球不交、世界 AABB 不交、面轴分离以及显式 ignored pair，剩余才追加候选。[wgsl-collision:117–225](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L117-L225)

ignored pair 可以关联关节状态：若原来禁碰撞的关节已经断裂，过滤判断允许它重新碰撞。过滤不是永久写死在一张不变表里。

候选使用原子计数分配写入位置，超容量会设置溢出标记。**原子 append 保证分配索引不重复，不保证容量无限，也不保证跨设备追加顺序完全相同。**

## 九、前缀和：三个阶段共用的基础设施

对计数数组 $n_i$，exclusive scan 生成：

$$
s_i=\sum_{j<i}n_j
$$

于是第 $i$ 组写入 $[s_i,s_i+n_i)$，不再需要为每个元素保留独立动态数组。

当前 scan 每块 512 个 u32，由 256 个线程各处理两个元素；局部使用共享内存 Hillis–Steele 型扫描，块和递归向上扫描，再逐级向下加块偏移。不是依赖 subgroup 的特定硬件实现，也不应误写成 Blelloch scan。[scan:1–55、64–122](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/scan.ts#L1-L122)

它至少服务三处：

- 网格桶的计数到偏移。
- 每体邻接度数到 CSR 行偏移。
- 颜色 histogram 到稳定桶地址。

scratch 随递归层级分别分配，避免同一工作区在上下层存在错误别名。[scan:64–122](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/scan.ts#L64-L122)

## 十、窄相：从相交判定到可稳定求解的接触流形

### 10.1 盒体的十五轴 SAT

两个 OBB 的候选分离轴包含六个面轴和九个叉积轴。对于单位轴 $\mathbf n$，盒体投影半径为：

$$
r(\mathbf n)=\sum_{k=1}^{3}h_k|\mathbf a_k\cdot\mathbf n|
$$

两盒中心差为 $\mathbf d$，分离量为：

$$
s=|\mathbf d\cdot\mathbf n|-r_A(\mathbf n)-r_B(\mathbf n)
$$

存在 $s>0$ 的有效轴即拒绝；接近平行造成的退化叉积轴会跳过。通过所有轴后，还要选出最合适的接触轴，不只是返回 true。[wgsl-collision:373–430、646–672](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L373-L672)

faceBias 对面轴与边轴的竞争做偏置，避免数值噪声使本应稳定的面接触频繁切成边接触。这改变的是接触表示选择，不是增加求解迭代次数。[wgsl-collision:659–672](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L659-L672)

### 10.2 面接触：裁剪出多个支撑点

面—面路径采用 Sutherland–Hodgman 裁剪：选参考面和入射面，将入射多边形依次对参考侧平面裁剪。局部用最多八顶点的 ping-pong 数组，结果合并近重复点，最多生成八个接触点。[wgsl-collision:438–535](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L438-L535)

多个点为平面支撑提供力臂。只保留“最深一点”会改变抗倾覆和摩擦力矩能力，不能仅因接触数少就认定是无损优化。

### 10.3 边接触与球

边—边路径计算两条线段的最近点。Sphere–sphere 与 sphere–box 使用专门几何路径；球心位于盒内时，选最近退出面，而不是把盒内最近点退化成零法向。[wgsl-collision:538–642](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L538-L642)

球涉及的流形只有一个点，其锚点持久化策略也不同于盒体。后面求解中的球体旋转特殊处理，是为了避免滚动把法向误差“算出来”。

### 10.4 凸包不是 GJK/EPA

凸多面体路径测试面法向，并通过 Gauss-map 条件筛选有效边对，再做边轴 SAT。接触裁剪后优先保留最深点，并用最远点选择扩大覆盖，最终保留最多八点。Sphere–hull 另有表面最近点和内部最浅退出面处理。[wgsl-hull:127–186、211–290、318–404](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-hull.ts#L127-L404)

需要通用 GJK/EPA 的背景可读 [碰撞检测算法](/knowledge/collision-detection-gjk-epa-sat/)。但不能因为算法常见，就把它写成当前源码已经实现的路径。

## 十一、持久化接触：跨帧继承什么，比“能碰撞”更重要

### 11.1 配对哈希找到上步流形

上步流形按两体编号插入哈希表。当前实现通过 atomicExchange 交换槽位，将旧占位继续向后探测；不是简单的 compareExchange 空槽插入。源码说明这一选择包含 Safari/Metal 编译兼容考虑。[wgsl-collision:336–370](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L336-L370)

找到旧流形后，并不代表所有旧点都可照搬。新旧接触还要建立点级对应。

### 11.2 特征键优先，最近点补救

新点先按 feature key 匹配旧点，失败时可使用 nearest 匹配；距离阈值为较小盒体最短边的 5%。匹配成功可以继承乘子和罚参数。[layout:130–131](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L130-L131) [wgsl-collision:823–857](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L823-L857)

非球体若上一帧处于 stick 状态，还会保留旧局部锚点，避免每帧重新生成接触点时把静摩擦的参考位置擦掉。球体不采用这套旧锚点保留，但仍可继承数值历史。[wgsl-collision:858–880](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L858-L880)

**工程判断**：缓存必须同时维护“几何身份”和“力学历史”。仅恢复一个几何点，不能声称成功恢复了静摩擦与热启动。

### 11.3 热启动衰减与质量相关下限

跨步乘子和罚参数的基本衰减关系为：

$$
\boldsymbol\lambda_{\mathrm{start}}=\alpha\gamma\boldsymbol\lambda_{\mathrm{prev}},
\qquad
\mathbf k_{\mathrm{start}}\sim\gamma\mathbf k_{\mathrm{prev}}
$$

还要施加行对应的上下限。开启 massPenalty 时，接触法向罚参数下限来自较轻动态体的质量：

$$
k_{\min,n}=
\operatorname{clamp}\left(
\frac{\min(m_A^{\mathrm{dynamic}},m_B^{\mathrm{dynamic}})}{h^2},
1,10^{10}
\right)
$$

质量零的固定体不参与“较轻质量”竞争。这个下限使重物接触不至于从绝对很小的刚度缓慢爬升，但不能防止高速物体在碰撞检测之间穿过薄板。[wgsl-collision:689–744、871–880](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L689-L880)

摩擦系数使用两体摩擦系数的几何平均：

$$
\mu=\sqrt{\mu_A\mu_B}
$$

法向记录由 B 指向 A；后续符号必须与这一约定一起理解。[wgsl-collision:803–817](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L803-L817)

## 十二、CSR 邻接：让刚体能快速找到全部约束

局部刚体求解需要访问“连接到我身上的所有关节与流形”。GPU 先统计 degree，前缀和生成偏移，再填约束索引，组成 CSR：

~~~text
offsets[i] ... offsets[i+1]     第 i 个刚体的邻接区间
adjacency[该区间]             关节或流形的索引
~~~

仅动态端点拥有求解邻接行；无效、断裂、关闭的关节不进入活跃图。三维拓扑项是 Manifold，不是每个 Contact 独立一条图边。[topology:61–107](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L61-L107) [3D accessors:291–311](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L291-L311)

填充后，每体使用插入排序整理邻接：关节 ID 在前，接触按另一体编号及 secondary 排序；三维 secondary 恒为零。[topology:109–151](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L109-L151)

为什么值得额外排序？浮点加法不满足结合律；原子填表的时间顺序若直接成为梯度累加顺序，就会把调度变化带入解。排序降低这种顺序噪声，但不能单独证明跨硬件位级一致。

**取舍**：插入排序对短邻接行简单有效；高连接度刚体的局部排序和之后的累加仍可能成为长尾。这是按体并行架构固有的负载不均衡来源。

## 十三、图染色：在保留局部顺序性的同时获得并行

### 13.1 图的点与边

图顶点是动态刚体，图边来自两动态体之间的有效关节或流形。同色体不能共享直接约束，因而可以并行就地写各自状态。

两个箱子都接触固定地板，并不因此互为动态图邻居：地板不参与动态状态更新。否则一块大地板会把大量互不接触的物体人为串行化。[topology:61–107、165–169](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L61-L169) [3D accessors:303–311](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L303-L311)

当前 step 中没有单独的连通分量/Island 构建阶段。颜色分组不能直接称为传统 island solver，也不意味着已经具备整岛睡眠。

### 13.2 Jones–Plassmann 风格轮次

每个体有由索引哈希得到的优先级，索引提供 tie-break。colorCompact 尝试整理旧颜色，colorMark 标记冲突或待处理体；随后在 AB/BA 双状态间交替：

1. 检查未完成邻居的优先级。
2. 最高优先级的候选成为本轮 winner。
3. 从已稳定邻居颜色中选择最小可用颜色。
4. 等待体留给后续轮次。

可用颜色集合使用两个 u32 位掩码，最多 64 色。默认初始执行 16 轮，容量/轮次之后可根据诊断调整。[topology:155–260](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L155-L260) [gpu/solver:594、1680–1706](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L594-L1706)

### 13.3 轮次不足不能伪装成安全回退

颜色容量不足或轮次没完成时，代码会保留待处理状态、使用末端颜色并报告 clashes。**如果同色仍有直接相连的动态体，就地位姿读写不再满足无冲突前提。** 不能把这种状态解释为已经自动切换到安全 Jacobi。

所以 clashes=0 是重要诊断条件；但它只验证染色层面的前提，不代表几何缓存、跨 dispatch 可见性、数值稳定性都已经证明正确。[topology:179–260](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L179-L260)

### 13.4 稳定颜色桶

颜色统计采用 256 线程 workgroup，计算组内同色 rank，按 color-major histogram 扫描，再 scatter 到颜色桶。相比完全依赖全局原子抢位置，它可以稳定桶内顺序。[topology:262–323](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L262-L323)

**工程判断**：少颜色减少串行深度，大颜色提高吞吐；“尽可能少颜色”与“每桶负载均衡”不完全相同。应同时观察颜色数、桶大小分布和最大体邻接度。

## 十四、间接调度：哪些决定留在 GPU

GPU 根据当前 pair/manifold 数和颜色桶大小写 dispatch 参数。CPU 预先编码各阶段，但不用每次读取接触数量，等待 mapAsync 完成后才决定下一阶段工作组数。[gpu/solver:1502–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1502-L1581) [shared layout:236–283](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/layout.ts#L236-L283)

三维 IA_CONTACTS 实际用 manifold count，IA_CONSTRAINTS 是 joint + manifold。dual 的一条流形任务会在内部处理多个接触点，不能将这些名字直接等同于逐点 dispatch。[3D layout:334–340](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L334-L340)

同一 command encoder 内的先后 dispatch 保留阶段依赖；workgroupBarrier/storageBarrier 只能解决工作组范围问题，不能拿来替代任意工作组之间的全局阶段顺序。原主线通过不同颜色的独立 dispatch 表达这类边界；后面的稀疏融合会改变它。

## 十五、求解前准备：惯性目标与初值是两件事

### 15.1 关节热启动

warmStartJoints 计算本步开始约束误差，衰减乘子和罚参数，并将罚参数限制在数值范围及材料刚度以内。只回写改变的字段，避免把整个 160 字节记录反复写回。[wgsl-solve:219–236](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L219-L236)

### 15.2 惯性目标

动态体的位置惯性目标为：

$$
\mathbf y=\mathbf x_n+h\mathbf v_n+h^2\mathbf a
$$

这里**没有**匀加速运动学公式的 $1/2$；这是该离散变分目标的形式，不应为了“符合常识”在源码讲解里补上。角向目标通过 qadd 积分角速度。[wgsl-solve:269–288](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L269-L288)

局部求解中的惯性能量可以概括为：

$$
E_{\mathrm{inertia}}=
\frac{m}{2h^2}\|\mathbf x-\mathbf y\|^2+
\frac{1}{2h^2}\Delta\boldsymbol\theta^\mathsf T
\mathbf I_{\mathrm{diag}}\Delta\boldsymbol\theta
$$

这里角向是源码使用的小角度差与主惯量对角近似，不是完整流形上的精确旋转 Hessian。[wgsl-solve:383–405](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L383-L405)

### 15.3 初值：自适应重力与 startAtRest

求解初值通常外推速度，并根据沿 up 的历史加速度估计重力参与程度。慢速判据为：

$$
\|\mathbf v\|+\|\boldsymbol\omega\|r<0.1
$$

开启 startAtRest 时，这些体从步初位姿开始迭代，避免低迭代堆叠反复外推再纠正造成泵能。但是惯性目标仍包含重力，约束仍然计算。[wgsl-solve:290–310](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L290-L310)

**不能解释成**“静止体清零速度、跳过求解”。它只改变迭代起点，不删除物理目标。

### 15.4 帆板风力不是流体求解

SHAPE_SAIL 按盒体碰撞，在局部 z 面受压差阻力，叠加较小的切向阻力与时空阵风；法向速度依赖使用近似隐式线性化以改善轻板稳定性。没有风场网格、压力 Poisson 或双向流固求解。[wgsl-solve:238–267](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L238-L267)

## 十六、原问题：每体组装一个局部六维系统

### 16.1 块坐标下降的局部视角

固定其他刚体当前位姿，只更新刚体 $i$：

$$
\Delta\mathbf q_i=
\begin{bmatrix}\Delta\mathbf x_i\\\Delta\boldsymbol\theta_i\end{bmatrix},
\qquad
\mathbf H_i\Delta\mathbf q_i=\mathbf g_i
$$

求解后位置减去线性增量，旋转用负角增量更新。这里右侧按能量梯度累积，因此更新是减号。[wgsl-solve:383–501](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L383-L501)

Acc 保存线性、角向、交叉块及两个右端向量，不显式生成全场景稀疏矩阵。惯性先贡献 $m/h^2$ 和主惯量除以 $h^2$ 的对角项，再累加本体所有约束。

### 16.2 单行约束如何进入局部矩阵

设一行 Jacobian 为：

$$
\mathbf J=
\begin{bmatrix}\mathbf l\\\mathbf a\end{bmatrix},
\qquad
f=kC+\lambda
$$

对应局部贡献的主干为：

$$
\mathbf g\mathrel{+}=\mathbf Jf,\qquad
\mathbf H\mathrel{+}=k\mathbf J\mathbf J^\mathsf T
$$

这形成线性块 $k\mathbf l\mathbf l^\mathsf T$、角向块 $k\mathbf a\mathbf a^\mathsf T$ 与交叉块 $k\mathbf l\mathbf a^\mathsf T$。[wgsl-solve:40–59](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L40-L59)

需要 Jacobian 基础可读 [雅可比矩阵](/knowledge/jacobian-matrix/)。这里的关键不是再推一次线性代数，而是看 GPU 如何将短小、固定尺寸的块累加进寄存器。

### 16.3 关节与弹簧不是同一套行数

- 球铰位置约束使用三条行，角向力臂来自锚点叉积。
- 角度锁定在启用时增加角向行，torqueArm 负责将角向量纲与力/阈值联系起来。
- 弹簧沿当前长度方向一条行，直接使用材料刚度；后面的 dual 不为它做普通关节式乘子更新。
- 关节部分几何刚度采用对角 lump 处理，不是完整无近似二阶导。

实现位置：[wgsl-solve:63–149、506–510](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L63-L510)。因此“所有约束都按同一个 ALM 硬约束公式跑”是不准确的。

## 十七、接触求解：线性化误差、单边法向与圆形摩擦锥

### 17.1 从旧锚点估计当前约束

对于接触基的一条轴 $\mathbf l$，代码的误差结构是：

$$
C^*=(1-\alpha)C_0+
\mathbf l\cdot(\Delta\mathbf x_A-\Delta\mathbf x_B)
+(\mathbf r_A\times\mathbf l)\cdot\Delta\boldsymbol\theta_A
+(\mathbf r_B\times(-\mathbf l))\cdot\Delta\boldsymbol\theta_B
$$

$C_0$ 是步开始时的接触误差，含接触 margin；$\Delta$ 相对于本步 initial pose。法向与两条切向分别计算。[wgsl-solve:180–205](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L180-L205)

盒体力臂使用当前旋转；涉及球的接触使用步开始旋转，避免球的滚动使 Taylor 法向行产生虚假分离并注入能量。[wgsl-solve:181–190](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L181-L190)

### 17.2 单边法向的负号

先计算 $\mathbf F=\mathbf k\odot\mathbf C^*+\boldsymbol\lambda$，再：

$$
F_n\leftarrow\min(F_n,0)
$$

此实现用负法向标量表示承载分支。不能脱离法向、Jacobian 与梯度更新约定，将负数误解为“吸引力”。

### 17.3 摩擦锥投影

切向二维向量整体约束到圆盘：

$$
\|\mathbf F_t\|\le\mu|F_n|
$$

超界时按长度比例缩放，而不是分别将两条切向裁剪为方形区域。dual 再据此区分滑动与粘着状态。[wgsl-solve:206–214、580–601](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L206-L601)

**重要近似**：组装矩阵仍以原罚参数计算行外积，没有求出 clamp 与摩擦锥投影的完整精确导数。因此应称作带投影力的局部近似牛顿系统，不能说是精确摩擦非线性 Hessian。

## 十八、局部线性求解：展开 LDLᵀ 与数值保护

每体使用手工展开的六维 LDLᵀ 分解，避免通用动态矩阵库和循环寻址。分解、前代、对角求解、回代都在 shader 内完成。[wgsl-solve:447–501](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L447-L501)

其数学骨架为 $\mathbf H=\mathbf L\mathbf D\mathbf L^\mathsf T$。在做数值保护前，递推关系是：

$$
D_k=H_{kk}-\sum_{j<k}L_{kj}^2D_j,\qquad
L_{ik}=\frac{H_{ik}-\sum_{j<k}L_{ij}L_{kj}D_j}{D_k}
$$

随后依次解 $\mathbf L\mathbf y=\mathbf g$、$\mathbf D\mathbf z=\mathbf y$、$\mathbf L^\mathsf T\Delta\mathbf q=\mathbf z$。矩阵固定为六维，代码直接展开这些表达式，不需要为每体动态分配矩阵存储。

f32 下，密集接触的消去可能出现很小或负 pivot。当前对第二到第六个 pivot 使用：

$$
D_k\leftarrow\max(D_k,10^{-5}A_{kk}),
\qquad k=2,\ldots,6
$$

第一个 pivot 直接来自首对角项，不应写成“所有 pivot 都统一 clamp”。实现没有通用选主元、线搜索或自适应信赖域。

这一保护是数值正则化，不是对所有坏输入的物理正确性证明。若状态因容量截断、无效几何或极端步长出错，pivot floor 不能替代上游诊断。[FINDINGS:254–285](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L254-L285) [pivot regression:15 起](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/tests-gpu/pivot.gpu.test.ts#L15)

### 18.1 四元数不是精确 log/exp

当前 qsub 与 qadd 分别近似：

$$
\operatorname{qsub}(a,b)=2\,\operatorname{vec}(ab^{-1})
$$

$$
\operatorname{qadd}(q,\boldsymbol\theta)=
\operatorname{normalize}\left(q+\frac12(\boldsymbol\theta,0)q\right)
$$

这是小角度差与一阶旋转向量积分后归一化，不是精确 quaternion logarithm/exponential。[layout:266–274](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L266-L274)

大角速度、单步大旋转时，应优先测试减小物理步长，而不是把该近似当作任意大旋转下都精确的 Lie-group 方法。

## 十九、颜色顺序与多 lane 协作

### 19.1 颜色间像 Gauss–Seidel，颜色内并行

一轮先执行颜色 0，再颜色 1，直到末色。相邻颜色读取前面刚体已更新的位姿，相比把所有刚体统一读旧状态，有更强的信息传播；同色独立刚体则并行。[gpu/solver:1568–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1568-L1581)

这不等同于 CPU reference 的固定逐体次序。若需要逐步比较，应统一色序或建立染色版本 oracle，而不是把执行次序差异都判成错误。

### 19.2 为什么一个刚体不总只占一个线程

大颜色桶有足够刚体填满 GPU；小桶可能只有少数高连接度体，单线程逐一读取所有邻居会形成依赖长链。实现据桶大小为每体分配 1、2、4 或 8 个 lane：

1. 各 lane 分担不同 CSR 邻接项。
2. 每项流形内部再遍历它的接触点。
3. 部分 Acc 写共享内存并归约。
4. lane 0 完成 LDLᵀ 并回写。

并不是给每个接触点分一个线程，也不是八个线程同时写同一刚体位姿。[layout:314–332](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L314-L332) [wgsl-solve:347–445](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L347-L445)

主机 primalLanes 阈值默认是 $2^{31}$、$2^{15}$、$2^{12}$，具体 lane 选择由打包规则传给 shader。因此默认配置下，常规规模颜色桶通常走 2/4/8 lane，不能把“支持一体一线程”误读成它是所有常见场景的实际默认选择。[gpu/solver:481–487](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L481-L487)

**工程取舍**：更多 lane 缩短单体累加链，却增加共享内存、归约、屏障与活跃线程开销。最佳阈值依赖颜色分布、邻接度和 GPU，而不是“越多线程越快”。

## 二十、对偶更新：让下一轮更强地满足约束

### 20.1 硬关节、有限刚度与弹簧

硬关节行的核心可概括为：

$$
\lambda^{k+1}=\lambda^k+k^kC^*
$$

罚参数按违反量提高：

$$
k^{k+1}=\min(k^k+\beta|C^*|,\ k_{\mathrm{limit}})
$$

但必须加上条件：硬行与有限材料刚度行的乘子处理不同，罚参数受材料上限和数值上限限制；Spring 不走普通关节 dual。因此不能用上面两式覆盖全部约束类型。[wgsl-solve:506–578](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L506-L578)

### 20.2 接触对偶

每个流形重新计算接触力，将经过单边/摩擦锥投影的结果写为新乘子。法向实际承载时才增加法向罚参数；切向仍在摩擦锥内部时才按误差增加对应罚参数，stick 标记还检查切向误差阈值。[wgsl-solve:580–601](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L580-L601)

这避免对滑动方向无休止增加静摩擦罚刚度。并不是“每一行每轮都无条件变硬”。

### 20.3 固定预算，不是残差早停

主机按 iterations 跑固定次数，没有每轮将全局残差读回 CPU 以判断收敛。优点是预算可预期、无迭代内回读；代价是复杂场景可能未收敛，简单场景也不会自动提前结束。[gpu/solver:1568–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1568-L1581)

“能在十次内看起来稳定”与“数学上达到指定误差阈值”是两个不同验收标准。

## 二十一、屈服、塑性和断裂：约束状态也在 GPU 演化

角向关节可配置 yield、fracture 与 breakBend。超过 yield 时，角向力被裁到阈值，当前相对旋转成为新的 rest，角向初始误差被重置，避免下一轮仍强拉回原始姿态。[wgsl-solve:506–578](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L506-L578)

restStart 保留建立关节时的相对旋转，当前 rest 则能塑性改变。bend 描述 restStart 到 rest 的**净偏转**，不是将每次弯曲角度累加成疲劳损伤。[layout:27–80](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L27-L80)

断裂后相关 stiffness、penalty、lambda 清零，下一物理步拓扑与过滤便可反映约束失活。GPU 已发生断裂，不必等待 JavaScript 回调才停止施力；应用侧断裂通知要等异步回读。[wgsl-solve:506–578](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L506-L578) [World:1096–1152](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L1096-L1152)

能力边界：

- 当前塑性重点是角向 rest 演化，不是通用连续体弹塑性。
- breakBend 不是低周疲劳模型。
- fracture 阈值须按代码的 angular force、torqueArm 与负阈值分支理解，不可直接当作任意单位的扭矩。
- 没有从这些关节参数自动得到 FEM 断裂或裂纹扩展。

相关设计记录：[FINDINGS:68–252](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L68-L252)。

## 二十二、速度重建、提交与资源生命周期

所有原对偶迭代结束后，以位置差重建线速度，以 qsub 重建角速度：

$$
\mathbf v_{n+1}=\frac{\mathbf x_{n+1}-\mathbf x_n}{h},
\qquad
\boldsymbol\omega_{n+1}=
\frac{\operatorname{qsub}(q_{n+1},q_n)}{h}
$$

这是一步后向差分式重建。vel.w 保留用于下一步自适应预测的沿 up 历史速度。[wgsl-solve:613–624](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L613-L624)

随后 queue.submit，翻转接触输出缓冲；若请求且支持 timestamp-query，则异步 map 计时结果。submit 返回不代表 GPU 已完成，不能立即把 CPU snapshot 当作当前 GPU 状态。[gpu/solver:1590–1613](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1590-L1613)

destroy 还需要处理未完成的 timing map，源码对忙碌计时资源延迟释放。GPU 资源生命周期不只是“对象不用了就立即 destroy 所有 buffer”。[gpu/solver:1728–1764](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1728-L1764) [FINDINGS:287–302](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L287-L302)

## 二十三、解算器之外：渲染、读回、射线和碰撞事件

### 23.1 按需回读，不是每帧全量同步

BodyMesh 直接消费 GPU buffer。应用需要 CPU 状态时，World.readBodies 会将目标索引排序、去重并合并连续 copy；每个完整体仍按 160 字节记录读取。stateOf 返回 CPU 侧最近 snapshot，调用它本身不会自动完成一次 GPU 同步。[mesh:79–135](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/mesh.ts#L79-L135) [World:1172–1208](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L1172-L1208)

### 23.2 射线查询没有复用 LBVH

当前 raycast 在 GPU 上对 ray×body 测试，使用非负浮点位模式的 atomicMin 选择最近距离，再确定命中物体并生成结果。它有 ignore 列表和最大射线数限制，但不是沿 BVH 遍历。[raycast:1–12、110–137、178 起](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/raycast.ts#L1-L178)

**工程判断**：少量拾取射线可以接受；大量传感器、激光雷达或高密度查询的成本必须单独测量。物理宽相快，不代表公开 raycast 自动具有相同空间加速。

### 23.3 接触事件是旁路观察

contact watcher 用配对哈希比较 begin/end，结合接触法向力乘时间步给出冲量估计，再异步回读有限容量事件。它不是每个点、每轮迭代都调用 JavaScript。[contacts:85–118、175–232](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/contacts.ts#L85-L232)

不要把这些估计量解释成完整高频测量传感器。事件容量、回读延迟与 watch 频率都是应用可观察性的一部分。

## 二十四、优化手段按瓶颈分类

### 24.1 减少无效碰撞工作

两级网格、large 旁路、dynamic-only probe、过滤级联与仍静止配对的接触复用，分别减少候选数量、过大格子影响、重复探测和窄相重算。[wgsl-collision:117–315、696–744](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L117-L744)

它们的收益取决于场景。如果大部分体高速运动、接触集合频繁变化，静止接触缓存的命中率自然下降。

### 24.2 减少内存流量

- Morton 初始排序改善索引局部性。
- Manifold/Contact 拆分，避免重复加载 pair 元数据。
- 字段级读写，避免复制完整 Body/Joint。
- BodyMesh 直读位姿，避免 CPU 中转。

位置：[gpu/solver:634–638](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L634-L638) [layout:82–101](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L82-L101) [wgsl-solve:219–236、269–310、383–445](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L219-L445) [mesh:79–135](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/mesh.ts#L79-L135)。

**取舍**：更小的记录不等于更快。若压缩需要更多解包、额外寻址或更长寄存器存活期，吞吐可能下降；应同时观察带宽与寄存器压力。

### 24.3 减少调度与同步成本

间接 dispatch 将活跃任务数保留在 GPU；多个阶段通常编码到同一 compute pass；按需 splitPasses/计时才分阶段 pass；每色常量按 alpha 变化和容量增长更新，而非每次无条件重写。[gpu/solver:1428–1500、1502–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1428-L1581)

一次 compute pass 里可以有很多 dispatch。**减少 pass 数、减少 dispatch 数、减少 CPU/GPU 往返是三种优化，不能混成一个指标。**

### 24.4 减少串行长尾

多 lane 每体分担 CSR 累加，稳定颜色桶降低次序噪声和散乱分配。与此同时，颜色太多会增加串行阶段，小桶太碎会让 GPU 吃不满。[topology:262–323](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts#L262-L323) [wgsl-solve:347–445](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L347-L445)

### 24.5 改善有限预算下的数值表现

startAtRest、massPenalty、faceBias、持久化 stick 锚点与 pivot floor，分别面向初值、质量尺度、接触表示、静摩擦历史和 f32 分解稳定性。

这些不全是“减少毫秒”的优化；部分是在相同迭代预算下减少可见错误，甚至可能增加单步成本。评价时应报告**同等质量下耗时**与**同等预算下误差**两个维度。

## 二十五、四类容易混淆的复用，以及不能推荐的优化

### 25.1 热启动：继承力学历史

仍然重新检测碰撞，但将匹配接触的乘子、罚参数和部分锚点带到下一步。它解决的是重新从零建立承载和摩擦的问题。

### 25.2 reuseContacts：默认开启的局部几何复用

正常宽相仍建立配对；只有配对与两体变化步号满足条件时，才绕过该对接触点重建。缓存的 $C_0$、乘子、罚参数仍要刷新。[wgsl-collision:696–744](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L696-L744)

它不是“全场景一静止就跳过全部碰撞”。

### 25.3 reuseManifolds：显式请求的整体集合复用

只有 options.reuseManifolds 为真、manifoldsValid 有效且入口存在，才绕过 grid 与 narrowphase，沿用旧流形集合。添加、改写、过滤与约束变更会使有效性失效。[gpu/solver:1335–1376、1450–1452、1519–1531](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1335-L1531)

**风险**：旧集合外的新碰撞不会凭空出现。源码有效标记只是一部分保护，不是对任意运动和调用时机的 CCD 证明。仓库将它保持为 opt-in。[FINDINGS:28–66](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L28-L66)

### 25.4 fuseSparseColors：默认关闭的实验路径

它试图让尾部稀疏颜色在单工作组内串行处理，用 storageBarrier 衔接，减少许多很小的 dispatch。主机仅在活跃体数和尾部体数受限时选择这条路径。[gpu/solver:1458–1472](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1458-L1472) [wgsl-solve:333–345](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L333-L345)

但是固定版本最新记录明确指出：真实 destruction 回放在第 816 帧出现分歧，当时 clashes 为零；关闭融合后，前 900 帧重新一致，根因未解。[FINDINGS:1492–1500](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L1492-L1500)

因此本文的结论是：**保留默认关闭；不能用前面合成场景的速度收益推导其安全性。** 零染色冲突不能排除其他执行/缓存/数值问题。

### 25.5 实验失败同样有价值

仓库记录过保留静止 pair 的宽相尝试、dual/primal 融合、相对 offset 缓存，以及将所有迭代放单工作组等路线；有的回退、有的更慢。f16 也不是当前已经完成的默认优化。[FINDINGS:508–536、559–608、743–813](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L508-L813)

工程判断：更多融合、更少字节、更多共享内存不自动等于更快；必须在真实负载、完整稳定性和正确生命周期下比较。

## 二十六、参数：区分公开配置与编译期常量

### 26.1 时间与迭代预算

- **dt**：World 默认 $1/60$ 秒。影响碰撞间隔、惯性刚度 $m/h^2$、质量相关罚参数与速度差分。变 dt 是改变离散问题，不是单纯调速度。
- **iterations**：默认 10。增加时主要提高已有约束集合的求解充分程度，同时线性增加多色 primal + dual 工作。
- **maxSubsteps**：World 默认 4。限制单次 update 追帧预算，不是“一帧始终固定做四次”。

默认来源：[World:525、578–588、838–852](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L525-L852)。

### 26.2 AVBD 跨步参数

- **alpha=0.99**：同时影响误差中的 $(1-\alpha)C_0$ 与热启动乘子衰减，不能简单命名为“混合系数”。
- **gamma=0.999**：跨步衰减罚参数，并与 alpha 一起衰减乘子；过快遗忘会损害已建立的承载。
- **betaLin=10000、betaAng=100**：按违反量增长罚参数的系数。两类量纲和力臂不同，不能以同一倍率盲调。

这是三维 reference 的默认值，经 GPU 构造导入；不要混入二维的 alpha 默认。[ref/solver:29–54](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/ref/solver.ts#L29-L54) [gpu/solver:589–598](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L589-L598) [wgsl-solve:219–236、506–601](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L219-L601)

**建议**：先固定 dt、资产尺寸、质量和连接方式，再调这些参数；否则看到的改变可能源于尺度，而非某个系数本身。

### 26.3 默认布尔策略

matchNearest、faceBias、reuseContacts、startAtRest、massPenalty 均默认为 true；windSpeed=0、windAngle=0、windGust=0.4、windPressure=0.72。方向须区分入口：gpuParams3D() 返回 Y-up；低层 GpuSolver3D 为 reference 场景构造时设为 Z-up；公开 World 随后重置参数，并从重力向量设置方向。不能在复现时混用这三层默认值。[gpu/solver:165–239、589–598](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L165-L598) [World:578–588](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L578-L588)

禁用某个策略适合做隔离对比，不代表一定获得“更纯物理”。例如取消 faceBias 可能增加接触拓扑抖动，取消 startAtRest 可能使低迭代堆叠更差。

### 26.4 几何与数值常量

当前 shader 常量包括：

- COLLISION_MARGIN=0.01：初始接触误差中的偏置，不是 swept 碰撞。
- REUSE_LIN_TOL=0.002、REUSE_ANG_TOL=0.002：参考位姿变化门槛。
- NEAREST_FRACTION=0.05：最近点补配对门槛。
- REST_SPEED=0.1：初值策略速度门槛。
- PENALTY_MIN=1、PENALTY_MAX=$10^{10}$。
- PIVOT_FLOOR=$10^{-5}$。
- STICK_THRESH=$10^{-5}$。

位置：[layout:112–147](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L112-L147)。这些不是都已经暴露为 WorldOptions 滑块；修改编译期常量需要重新构造对应 shader/pipeline。

GPU 不保存 JavaScript Infinity：BIG=$3\times10^{38}$ 表示无界刚度，HARD=$10^{30}$ 用于硬行分类。这是有限哨兵与分支约定，不是把 $10^{38}$ 当实际罚参数无限增大。[shared layout:1–9、76–100](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/layout.ts#L1-L100)

### 26.5 图、容量与协作参数

初始 colorRounds=16；最大颜色表示为 64；capacity 是预留内存，不是场景目标数量；primalLanes 是按颜色桶大小选择线程协作方式的阈值。fuseSparseColors 与 reuseManifolds 不属于默认安全提速按钮。[gpu/solver:481–494、594、648–676](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L481-L676)

调参顺序建议：先消除 overflow/clashes，再比较迭代预算与接触质量，最后才调 lane 和颜色容量。用更少颜色掩盖冲突不能算优化成功。

## 二十七、自适应、溢出与确定性的真实边界

### 27.1 异步诊断不是同步安全网

World 默认每十步发起一次 adapt；求解器读取计数、clashes、颜色和接触容量压力，再决定下一阶段资源规模。[World:195、855–874](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L195-L874) [gpu/solver:1680–1725](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1680-L1725)

当前策略包括：

- 冲突时增加染色轮次，上限 32。
- 颜色容量不足时增长；连续安静后可以收缩，轮次最低 4。
- 容量使用超过约 80% 时增长，目标结合需求两倍及至少原容量 1.25 倍。
- pair/contact/manifold overflow 分别用位 1/2/4 报告。
- 资源上限仍受设备 maxStorageBufferBindingSize 约束。

**容量溢出的那一步不能自动称为完整正确。** 候选或接触被截断的影响可能已经进入当前解；稍后扩容只避免未来继续截断，不是回滚重算该步。

### 27.2 扩容要保留两份历史

allocateContacts 分配新缓冲时复制两份 contact/manifold 历史，保留相关计数并重建 bindings，同时使整体流形缓存失效。只复制当前可见一份会破坏下一步跨帧匹配。[gpu/solver:767–800](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L767-L800)

CSR 与扫描资源也需跟随容量调整；buffer handle 变化后，旧 bind group 不会自动指向新对象。[gpu/solver:803–835](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L803-L835)

### 27.3 可复现条件

稳定邻接、稳定颜色桶有助于同设备重复运行，但：

- overflow 会截断集合。
- 异步 adapt 触发时间影响容量与颜色预算。
- 初始排序、seed、参数与新增对象时机影响索引/执行顺序。
- GPU/驱动的浮点实现可能不同。
- 已知实验性融合路径存在长回放分歧。

仓库建议确定性测试中预分配足够容量、避免 overflow、约束 async adapt；它没有由此证明跨浏览器、跨 GPU 的位级确定性。[FINDINGS:345–371、1492–1500](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L345-L1500)

对于联网锁步，不能把“同机固定 seed 测试通过”直接当作架构承诺。若业务需要权威状态、重演或回滚，应另建误差容忍和状态校正验证。

## 二十八、性能模型：先归因，再谈优化百分比

单步成本可粗略拆为：

$$
T_{\mathrm{step}}\approx
T_{\mathrm{collision}}+
T_{\mathrm{adjacency}}+
T_{\mathrm{coloring}}+
I\left(\sum_{c=0}^{C-1}T_{\mathrm{primal},c}
+T_{\mathrm{dual}}\right)+
T_{\mathrm{velocity}}
$$

$I$ 为 iterations，$C$ 为颜色桶数量。这个模型解释了为什么只比较 body count 不够：

- 同数量稀疏球体与密集盒堆，候选和点数不同。
- 同数量刚体，链、网、全局高连接结构的 degree 与色数不同。
- 大量固定体影响宽相，却不一定同等增加 primal。
- 高度不均衡的颜色桶会造成串行长尾。
- 回读和渲染的开销可能在 solver timestamp 之外。

### 28.1 现有计时能力

timestamp-query 将 collision、adjacency、colouring、solve 分阶段计时，异步回调。它不是默认每个 kernel 都有独立细粒度计时；也不是用 CPU 编码耗时替代 GPU 执行时间。[gpu/solver:620–627、1488–1500、1586–1613](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L620-L1613) [shared PHASES:288–293](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/layout.ts#L288-L293)

对端到端页面还应分别记录：

1. CPU World 输入整理与命令编码。
2. GPU 解算四阶段。
3. 渲染及其阴影/后处理。
4. 射线、事件、状态回读。
5. 初始化、扩容与 shader 编译尖峰。

### 28.2 历史测量如何引用

FINDINGS 中有 M4 Max 的多 lane 历史结果，例如约 11 万体 ring 在四次迭代下约 10.4ms，以及其他大规模 joints 场景。这些数值只能作为该记录的硬件、场景与配置下的实验，不是本机新测，也不是任意浏览器的性能保证。[FINDINGS:610–641](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L610-L641)

不同章节的优化百分比不能直接累加：基线可能已变，瓶颈也会迁移。对照实验需固定提交、硬件、浏览器、seed、场景、dt、iterations、接触上限和渲染配置。

### 28.3 场景名字不等于物理模型相同

bench-scenes 的 jointedDrop 是关节刚体 stand-in；ragdollCloth 使用薄刚体和球铰构网，不是与论文相同的逐粒子连续布料模型。因此不能拿这些场景直接做跨引擎“同等布料”速度结论。[bench-scenes:131–137、320–342](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/bench-scenes.ts#L131-L342)

## 二十九、怎样验证这条流水线

以下是针对本实现的验证建议，不是本文已执行的 GPU 测试结果。

### 29.1 第一层：记录与局部公式

验证 Body/Joint/Manifold/Contact 步长、字节偏移和 shader struct 一致；检查形状标记、点数/步号打包、有限刚度哨兵没有混淆。然后分别测试局部 Jacobian、六维求解、球体力臂和硬/软关节分支。

### 29.2 第二层：碰撞与缓存

用静态配置验证 face/edge/sphere/hull 接触，比较生成点、feature 与法向。然后让物体跨越参考位姿门槛，确认缓存失效；测试 stick 锚点保留、球体滚动不保留旧锚点以及新增接触进入集合。

### 29.3 第三层：拓扑与并发前提

检查 CSR degree/fill 一致、邻接排序稳定、所有有效图边端点颜色不同。构造高 degree 和不足颜色轮次的场景，确认 clashes 能被观测，而不是看着没崩就通过。

### 29.4 第四层：多步物理与回放

测试静止堆叠、质量比、运动学平台、滚动球、摩擦斜面、关节链、屈服/断裂、添加删除和扩容。对比 CPU 时先统一参数与求解顺序，区分公式误差和色序造成的收敛差异。

短时合成测试不能替代真实场景长回放，稀疏融合第 816 帧分歧就是反例。应固定输入序列，比较逐步位姿、速度、接触数、clashes、overflow 和有限性。[FINDINGS:1492–1500](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md#L1492-L1500)

### 29.5 第五层：设备与失败分类

分别报告：无 adapter 而跳过、shader 编译失败、GPU validation error、device lost、物理误差超限、性能未达标。不能将“不支持 WebGPU，所以没执行”记为通过。

本文只完成源码分析与知识站内容验证；目标 GPU 正确性和性能验收仍需在 three-avbd 测试环境进行。

## 三十、故障排查：沿链路定位，不先盲目加迭代

### 30.1 物体穿透或高速穿过薄墙

先看 pair/manifold/contact 数与 overflow，再验证 filter、形状和网格覆盖。若碰撞集合本来就没有该对，增加 iterations 无法修复。单步移动距离接近薄障碍厚度时，减小 dt/增加真正子步，或评估另行实现 swept/CCD；当前路径不能冒充 CCD。[gpu/solver:1514–1581](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts#L1514-L1581)

### 30.2 静止堆叠抖动或泵能

先确认 clashes=0、overflow=0，再检查 startAtRest、massPenalty、feature 匹配和 stick 历史。保持 dt 不变比较迭代数；不要先用额外阻尼或清速度掩盖问题。[wgsl-solve:290–310、580–601](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L290-L601)

### 30.3 接触看起来存在，却一直滑动

分别检查摩擦系数、圆形摩擦锥边界、切向误差、stick 标记、旧锚点是否被继承。新几何点存在，不等于旧静摩擦参考仍在；球体与盒体还不能用同一锚点保留规则。[wgsl-collision:816–880](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts#L816-L880)

### 30.4 突然 NaN 或极大位移

定位第一次非有限值，而不是只看最后散架。检查输入质量/惯量、退化形状、刚度哨兵、溢出和 pivot；pivot floor 是特定 f32 消去问题的保护，不是任意坏状态恢复器。[layout:142–147](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts#L142-L147) [wgsl-solve:447–501](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts#L447-L501)

### 30.5 少量物体却 CPU/帧耗时很高

分别测 dispatch 数、颜色碎片、查询回读、渲染、首次 shader 编译与资源重建。小场景可能主要受调度延迟影响，不是算术吞吐不够。不要因此直接打开已知有风险的 fuseSparseColors。

### 30.6 大场景突然丢接触或颜色暴涨

查看原始 overflow 位、capacity、最大 degree、large 数量与动态/固定比例；异步扩容之后恢复，不代表前面截断的物理步可以算通过。预分配与同场景重放可以帮助隔离容量问题。

### 30.7 断裂发生了，但 JavaScript 事件没到

先区分 GPU 约束是否已归零与 CPU 是否回读；再查 watcher/read 频率、事件容量和句柄版本。回调延迟不必然表示解算还在施加断裂前的力。[World:1096–1152](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts#L1096-L1152) [contacts:175–232](https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/contacts.ts#L175-L232)

## 三十一、总结：值得学习什么，不能误认为已经有什么

### 31.1 当前源码已确认的能力

这份实现最值得学习的是完整 GPU 数据流，而不仅是 AVBD 公式：

1. 以固定 ABI 将碰撞、拓扑、求解与渲染连成同一资源体系。
2. 两级网格与配对所有权减少重复候选。
3. 多点流形、特征匹配、stick 锚点维持接触连续性。
4. CSR 与稳定排序让局部块求解可并行、较易复现。
5. 动态图染色把“就地顺序收敛”与“同色并行”结合。
6. 局部六维系统避免全局矩阵求解。
7. 间接调度让活跃工作量留在 GPU。
8. 显式记录优化失败与长期回放风险，不把更快误当成更可靠。

### 31.2 当前主链路未找到的能力

本文追踪的三维 World/GpuSolver3D 路径没有找到：LBVH 宽相、GJK/EPA 凸体窄相、通用 CCD/TOI 阶段、显式 island 构建与整岛睡眠、基于全局残差的自适应早停、公开 World CPU 自动后备、任意凹三角网格精确碰撞，以及完整的粒子布料/FEM/流体求解。

这是对当前代码路径的范围判断，不是声称这些功能永远不会实现。若扩展 LBVH 或 GJK/EPA，应先保住 Manifold/Contact ABI、多点覆盖、feature identity 和热启动，而不是只比较相交布尔值。

### 31.3 仍必须运行时确定的内容

目标硬件上的最佳 dt/iterations/颜色轮次/lane 阈值、真实资产的接触质量、长期能量行为、跨设备重放误差、复杂尺度分布性能，以及任何实验性缓存/融合策略的安全性，都不能仅靠静态阅读给出通过结论。

最终原则是：**先保证候选与接触完整，再保证并行无冲突，再评价有限预算收敛，最后比较性能。** 这四层顺序倒过来，往往会把“少算了”误判成“优化了”。

## 源码索引

以下路径相对于 E:\UnrealProjects\three-avbd。编号对应正文引用；链接全部固定到本文提交，避免 main 更新后行号漂移。

- S01：[src/avbd3d/gpu/solver.ts][s01]：资源、主流水线、调度、自适应。
- S02：[src/avbd3d/gpu/layout.ts][s02]：记录布局、常量、四元数、三维拓扑适配。
- S03：[src/avbd3d/gpu/wgsl-collision.ts][s03]：网格、配对、SAT、接触历史。
- S04：[src/avbd3d/gpu/wgsl-solve.ts][s04]：原问题、LDLᵀ、对偶、速度。
- S05：[src/avbd3d/gpu/wgsl-hull.ts][s05]：凸多面体与球—凸包窄相。
- S06：[src/avbd2d/gpu/wgsl-topology.ts][s06]：三维复用的 CSR、染色与颜色桶。
- S07：[src/avbd2d/gpu/scan.ts][s07]：分层 exclusive scan。
- S08：[src/lib/world.ts][s08]：公开运行时、步进、变更与回读。
- S09：[src/lib/push.ts][s09]：GPU 力与冲量更新。
- S10：[docs/FINDINGS.md][s10]：实验过程与风险；与源码冲突时以当前代码为准。
- S11：[src/lib/mesh.ts][s11]：直接读取刚体 buffer 的实例绘制。
- S12：[src/avbd3d/hull.ts][s12]：CPU 凸包与质量属性预处理。
- S13：[src/avbd3d/ref/solver.ts][s13]：CPU reference 与三维基础默认参数。
- S14：[src/avbd3d/gpu/radii.ts][s14]：半径分位数与 large 策略。
- S15：[src/avbd2d/gpu/layout.ts][s15]：共享计数器、间接参数和有限哨兵。
- S16：[src/lib/raycast.ts][s16]：GPU 射线与异步结果。
- S17：[tests-gpu/pivot.gpu.test.ts][s17]：数值 pivot 回归入口，不代表本文已执行。
- S18：[src/lib/contacts.ts][s18]：接触事件旁路。
- S19：[src/avbd3d/bench-scenes.ts][s19]：基准场景与物理表示。

[s01]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/solver.ts
[s02]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/layout.ts
[s03]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-collision.ts
[s04]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-solve.ts
[s05]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/wgsl-hull.ts
[s06]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/wgsl-topology.ts
[s07]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/scan.ts
[s08]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/world.ts
[s09]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/push.ts
[s10]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/docs/FINDINGS.md
[s11]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/mesh.ts
[s12]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/hull.ts
[s13]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/ref/solver.ts
[s14]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/gpu/radii.ts
[s15]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd2d/gpu/layout.ts
[s16]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/raycast.ts
[s17]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/tests-gpu/pivot.gpu.test.ts
[s18]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/lib/contacts.ts
[s19]: https://github.com/sbobyn/three-avbd/blob/2bb1a318e9aad03640b4bce5b5d222484f0925f7/src/avbd3d/bench-scenes.ts
