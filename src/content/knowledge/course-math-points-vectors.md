---
title: "点、方向与位移"
excerpt: "区分位置、位移和单位方向，用平移交互观察它们在空间变换中的不同含义。"
date: "2026-10-21"
category: "Mathematics"
subtopic: "LinearAlgebra"
tags: ["工程数学", "向量", "空间变换"]
readTime: "阅读约12分钟"
redirectTo: "ue-linear-algebra-guide"
contentRole: "lesson"
kind: "theory"
level: "foundation"
prerequisites: []
nextArticles: ["course-animation-pose-spaces"]
pageType: "guide"
aliases: ["点、方向与位移：同样三个数，为什么不能混用？"]
---
位置描述“在哪里”，位移描述“移动了多少”，方向只描述“朝哪里”。三者可以使用相同的数据结构，却不能套用相同的运算规则。下面先用平移实验区分这些语义，再讨论长度、单位与零向量。

## 先回答一个具体问题

角色位于点 $P$，目标位于点 $Q$。坐标以厘米计：

$$
\mathbf p=(100,20,0)\,\mathrm{cm},\qquad
\mathbf q=(130,60,0)\,\mathrm{cm}.
$$

“向目标移动”不是把目标坐标直接当速度。目标坐标描述**在哪里**，我们先要算“从角色到目标差多少”：

$$
\mathbf d=\mathbf q-\mathbf p=(30,40,0)\,\mathrm{cm}.
$$

长度是：

$$
\|\mathbf d\|=\sqrt{30^2+40^2}=50\,\mathrm{cm}.
$$

如果只要“朝哪里”，再去掉距离：

$$
\widehat{\mathbf d}=\frac{\mathbf d}{\|\mathbf d\|}
=(0.6,0.8,0).
$$

这里三个对象含义不同：位置依赖坐标原点；位移有方向和长度；单位方向只描述朝向，不携带距离。

如果指定移动速度为 $200\,\mathrm{cm/s}$，才得到速度：

$$
\mathbf v=200\,\mathrm{cm/s}\;\widehat{\mathbf d}
=(120,160,0)\,\mathrm{cm/s}.
$$

这还不是完整移动系统：它没有停止距离、碰撞或加速度限制。本文只建立输入的语义，不承诺这种追踪方式可直接用于游戏角色。

## 为什么两个位置相减得到向量？

把角色和目标都向同一个方向平移：

$$
\mathbf t=(70,-10,0)\,\mathrm{cm},\qquad
\mathbf p_{\mathrm{moved}}=\mathbf p+\mathbf t,\qquad
\mathbf q_{\mathrm{moved}}=\mathbf q+\mathbf t.
$$

此时角色和目标的坐标改变，但相对关系没变：

$$
\mathbf q_{\mathrm{moved}}-\mathbf p_{\mathrm{moved}}
=(\mathbf q+\mathbf t)-(\mathbf p+\mathbf t)
=\mathbf q-\mathbf p.
$$

因此“从角色指向目标的位移”不应再加一次平移。如果把位移也加上角色世界位置，就把“差多少”误当成了“在哪里”。

**另一个容易混淆的问题：移动物体，不等于移动坐标原点。**

保持物体不动，把新原点放在旧坐标中的 $\mathbf o=(70,-10,0)\,\mathrm{cm}$，并保持轴方向不变，新坐标应为：

$$
\mathbf p'=\mathbf p-\mathbf o,\qquad
\mathbf q'=\mathbf q-\mathbf o.
$$

两种操作的符号相反，但两点的位移都不变。说“平移坐标”时，必须说明究竟移动了物体还是参考系。

## 小实验：只改变一个变量

<div data-demo="course-points">无 JavaScript 时：令共同平移的 X 分量依次为 0、50、100 厘米，分别计算两点坐标；每次位移应仍为 (30,40,0) 厘米，长度仍为 50 厘米。</div>

先只改变共同平移，观察位置和位移。再保持角色不动，单独移动目标，这次位移才应该变化。这个对照能检查你到底在算绝对位置，还是两点的相对关系。

## 旋转与缩放进入之后

对于一个仿射变换，用 $\mathbf A$ 表示线性部分、$\mathbf t$ 表示平移：

$$
\mathbf p_{\mathrm{out}}=\mathbf A\mathbf p_{\mathrm{in}}+\mathbf t,\qquad
\mathbf d_{\mathrm{out}}=\mathbf A\mathbf d_{\mathrm{in}}.
$$

向量没有平移项，但可以被旋转或缩放。**单位方向经过非均匀缩放后，长度一般不再为一**；如果业务需要单位长度，必须重新归一化。法线的变换有额外条件，不在这里把它与普通方向混为一谈。

还要处理退化输入：当 $\mathbf p=\mathbf q$ 时，位移为零，归一化分母为零。零位移没有唯一方向。停止、保持上一次有效方向、返回失败状态，都是不同的业务策略，不能由数学替你决定。

## 与 Unreal Engine 对照

**已核对的源码事实**：本地源码根为 E:\UnrealEngine\UnrealEngine_Source，Engine/Build/Build.version 声明 5.9.0，检查时 HEAD 为 e28561eab454。这只是本地快照标识，不代表所有 UE 版本的行为。

在 `Engine/Source/Runtime/Core/Public/Math/TransformNonVectorized.h`：

- 第 1428–1432 行：`TTransform::TransformPosition` 先缩放、旋转，再加平移。
- 第 1444–1448 行：`TTransform::TransformVector` 只缩放和旋转，不加平移。
- 第 1436–1440、1452–1456 行：相应 `NoScale` 版本不应用缩放。

这确认了位置与向量 API 的语义区别；这里没有证明动画运行时会走非向量化实现，也没有执行 UE 场景测试。实际代码路径和特殊缩放问题需另行验证。

## 容易混淆的边界

目标坐标不能一般地当成移动方向，应先计算两点之差。两点共同平移不会改变这段位移；但如果改变坐标原点，位置的新坐标需要减去原点偏移，而不是加上偏移。

例如，把原点放到原来的目标位置，角色坐标变为 $(-30,-40,0)\,\mathrm{cm}$，位移仍指向原来的目标。归一化后的单位方向不携带厘米单位；两点重合时，则必须选择明确的退化处理策略。

## 深入参考

需要完整变换与 UE 约定时，查阅[线性代数与空间变换](/knowledge/ue-linear-algebra-guide/)；不熟悉数学记号时，查阅[数学符号参考](/knowledge/mathematical-notation-reference/)。更完整的推导与工程约定见对应文档。
