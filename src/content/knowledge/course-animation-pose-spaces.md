---
title: "骨骼姿态与父子空间"
excerpt: "用简化骨架观察局部姿态如何传播到组件空间，再区分组件空间和世界空间。"
date: "2026-10-21"
category: "Animation"
subtopic: "AnimationNode"
tags: ["角色动画", "骨骼姿态", "坐标空间"]
readTime: "阅读约13分钟"
redirectTo: "ue-animation-node-math"
contentRole: "lesson"
kind: "theory"
level: "foundation"
prerequisites: ["course-math-points-vectors"]
nextArticles: []
pageType: "guide"
aliases: ["骨骼姿态与父子空间：移动父骨骼会改变什么？"]
---
骨骼局部变换不变，组件空间位置仍然可能随着父骨骼运动而改变。下面用纯平移的三节点骨架观察这条传播关系，再区分组件空间和世界空间。点与位移的语义见[空间量](/knowledge/course-math-points-vectors/)，完整矩阵与旋转约定见[UE 空间数学](/knowledge/ue-linear-algebra-guide/)。

## 为什么脚的局部位置没变，画面里却移动了？

先定义一个简化骨架：

~~~text
root
└─ pelvis
   └─ foot
~~~

它只是三个带名字的节点，不是生产角色的完整骨骼结构。每个节点记录相对父节点的变换；没有父节点的 root，相对骨骼组件空间定义。

为了先看清层级传播，本例所有旋转都取单位旋转、所有缩放都取一，单位用厘米。初始数据：

$$
\mathbf r_C=(100,0,0),\qquad
\mathbf p_{P}=(0,0,90),\qquad
\mathbf f_{P}=(20,0,-90).
$$

下标 $C$ 表示组件空间，$P$ 表示各自的父空间。这里两个 $P$ 不是同一个参考系：pelvis 的父空间是 root，foot 的父空间是 pelvis。

## 从局部重建组件空间

在纯平移的特殊情形，父子位置可直接相加：

$$
\mathbf p_C=\mathbf r_C+\mathbf p_P=(100,0,90),
$$

$$
\mathbf f_C=\mathbf p_C+\mathbf f_P=(120,0,0).
$$

现在只把 root 沿 X 轴移动 $30\,\mathrm{cm}$：

$$
\mathbf r_C^{\mathrm{new}}=(130,0,0),\qquad
\mathbf f_C^{\mathrm{new}}=(150,0,0).
$$

foot 相对 pelvis 的局部位置没变，组件空间位置却变了。不是“脚自己多播放了一段动画”，而是父子变换传播的结果。

**局部姿态不是一组独立的世界坐标。** 修改父节点，会影响后代重建出的组件空间姿态。

## 小实验：移动根节点

<div data-demo="course-pose">无 JavaScript 时：root 的 X 坐标取 100、130、160 厘米，保持子节点局部位置不变。foot 的组件空间 X 坐标应分别为 120、150、180 厘米。</div>

只改变 root 的平移，检查 foot 的局部位置是否保持不变。如果你同时改了 foot 的局部数据，就失去了判断层级传播的对照条件。

## 组件空间不是世界空间

骨骼组件本身也有世界变换。再假设组件世界变换只有平移：

$$
\mathbf c_W=(1000,0,0).
$$

在**最初的** root X 坐标为 100 的状态下：

$$
\mathbf f_W=\mathbf c_W+\mathbf f_C=(1120,0,0).
$$

如果 root 再移动 30 厘米，foot 的世界位置才变为 $(1150,0,0)$。Actor 的世界位置只有在组件相对 Actor 的变换为单位变换时，才可直接代替这里的组件世界位置；一般情况必须使用完整组件变换。

因此调试时至少要写清三件事：这是什么骨骼、数据在哪个空间、对应哪个时刻。把不同空间的数据直接相减，往往会得到看似合理但完全错误的修正量。

## 加入旋转以后，不能再只加位置

设 $T_{i\to P}$ 把节点局部空间转换到父空间；$T_{P\to C}$ 把父空间转换到组件空间。函数复合关系是：

$$
T_{i\to C}=T_{P\to C}\circ T_{i\to P}.
$$

即先走到父空间，再走到组件空间。父旋转会改变子平移在组件空间中的方向；父缩放也会改变距离。

本文先停在这个关系，不要求此刻推导矩阵。尤其注意：函数复合记号、列向量矩阵记号和具体引擎的乘法记号，不能只凭书写顺序判断执行顺序。

## 层级重建的示例代码

在本例的纯平移模型中，父索引数组为 [-1, 0, 1]，节点已按父先于子的顺序排列：

~~~js
for (let i = 0; i < local.length; i++) {
  const parent = parentIndices[i];
  component[i] = parent < 0
    ? local[i]
    : add(component[parent], local[i]);
}
~~~

这里的 add 是三维逐分量相加。这段代码不是 UE 实现，只适用于本文的无旋转、无缩放例子。

一般骨架不能假定父索引总是当前索引减一。循环有效还依赖父节点已经求出、层级无环。若存储顺序不同，就必须先拓扑排序或采用其他有序遍历。

## 与 Unreal Engine 对照

**已核对的源码事实**：本地源码根为 E:\UnrealEngine\UnrealEngine_Source，版本文件声明 5.9.0，检查时 HEAD 为 e28561eab454。

`Engine/Source/Runtime/Core/Public/Math/TransformNonVectorized.h` 第 19–23 行说明：位置按缩放、旋转、平移处理；代码组合 `C = A * B` 的语义是先 A 后 B。因此使用该 API 记号描述局部到组件的组合时，写作 `LocalToParent * ParentToComponent`，不能直接照搬列向量矩阵的书写顺序。

这只是变换 API 的已核对契约，不等于已经追踪了 AnimGraph 的完整执行链，也没有覆盖非均匀缩放与旋转组合无法由简单 TRS 精确表达的情形。

**必须区分**：root 骨骼移动不自动等于角色发生 Root Motion 移动；还涉及根运动提取、消费与角色移动系统。当前计算的是骨骼坐标，也不是蒙皮后每个顶点的位置。相应工程链路应在后续专课中核对，而不是从本例推断。

## 排查空间混用

root 沿 X 移动 $30\,\mathrm{cm}$ 后，foot 的局部 X 坐标仍是 $20\,\mathrm{cm}$。如果只移动组件的世界变换，foot 的组件空间坐标不会变化，改变的是世界位置。

加入父旋转后，不能再直接相加三组平移。此时要应用完整变换，而不是把局部平移当作世界位移。

所以，一个骨骼的世界位置变了，并不能证明它的局部动画轨道变了；父骨骼或组件变换同样可能导致这个结果。

## 深入参考

需要完整变换与组合约定时，查阅[UE 线性代数](/knowledge/ue-linear-algebra-guide/)；需要理解姿态采样和节点数学时，查阅[动画节点数学原理](/knowledge/ue-animation-node-math/)。
