---
title: "预测式 Foot IK 详解 — 从接触时间估计到落脚规划与骨盆补偿"
excerpt: "从普通 IK 与反应式贴地出发，逐步建立脚步相位、未来脚预测、环境候选、接触状态、移动表面锁定和骨盆可达补偿的完整模型。"
date: "2026-09-26"
category: "Animation"
subtopic: "ControlRigIK"
tags: ["预测式 IK", "Foot IK", "Control Rig", "接触规划", "动画"]
readTime: "阅读约55分钟"
kind: "algorithm"
level: "intermediate"
prerequisites: ["ue-linear-algebra-guide", "ue-animation-node-math"]
nextArticles: ["ue-fullbody-ik-math"]
---

## 学习位置

- **难度**：进阶积木（`intermediate`）
- **本文职责**：在已有骨骼空间和 IK 基础上，解释如何提前生成、选择并渐进应用脚部接触目标。
- **前置积木**：[UE 线性代数详解](/knowledge/ue-linear-algebra-guide/)和[UE 动画节点详解](/knowledge/ue-animation-node-math/)。
- **后续积木**：[UE FullBodyIK 插件详解](/knowledge/ue-fullbody-ik-math/)进一步解释可选的全身姿势求解器；本文的接触规划并不依赖它。

> 本文整理自指定的《预测 IK 原理》文档，讨论通用模型与公开的 Unreal Engine 接口。示例中的组件关系、执行顺序和参数是设计约定，不代表 NitePredIK 插件当前已有对应实现。

本文把预测式 Foot IK 拆成状态估计、短时运动预测、接触候选规划、当前帧目标生成和最终姿势求解五个积木。它是一个可实现的设计模型，不预设某个插件已经完整实现，也不依赖特定移动框架或 IK Solver。

---

## 从普通 IK 到预测 IK

### 1. 先从直觉理解预测 IK

普通 IK 解决的是：

> **目标已经确定以后，骨骼怎样到达它？**

普通反应式 Foot IK 解决的是：

> **脚现在下方是什么表面，我现在应该怎样贴上去？**

预测 IK 解决的是：

> **脚将要在什么时候、什么位置、以什么姿态接触哪个表面，我应该从现在开始怎样准备这次接触？**

三者最直观的差异是：

~~~text
普通 IK
  已知 Target
      ↓
  求骨骼姿势

反应式 Foot IK
  查询当前脚下方
      ↓
  生成当前 Target
      ↓
  求骨骼姿势

预测 IK
  估计未来脚和未来接触时间
      ↓
  查询未来落脚区域
      ↓
  验证、选择并承诺接触
      ↓
  把未来误差逐渐分配到当前姿势
      ↓
  求骨骼姿势
~~~

所以预测 IK 不是一种“更强的 IK Solver”。它主要增加的是 Solver 之前的状态估计、运动预测和接触规划：

$$
\boxed{
\mathrm{PreIKState}
\rightarrow
\mathrm{MotionPrediction}
\rightarrow
\mathrm{ContactPlanning}
\rightarrow
\mathrm{CurrentTarget}
\rightarrow
\mathrm{PoseSolve}
}
$$

最终骨骼怎样变化，仍可以交给 Two Bone IK、FBIK、PBIK 或项目自定义 Solver。


---

### 2. 普通 IK：从直观问题到通用约束

#### 2.1 一条腿的 IK 在做什么

考虑一条最简单的腿：

~~~text
Hip
 │
Thigh
 │
Knee
 │
Calf
 │
Foot
~~~

骨骼姿势由若干关节自由度决定，例如 Hip 和 Knee 的旋转。把全部自由度收集成向量：

$$
\mathbf q
=
\begin{bmatrix}
q_1 & q_2 & \cdots & q_n
\end{bmatrix}^{\mathsf T}
$$

给定 $\mathbf q$，Forward Kinematics 可以计算每根骨骼和末端执行器的位置、旋转：

$$
T_E
=
F_E(\mathbf q)
$$

IK 做的是反问题：

> 已知希望满足的末端条件，反过来寻找合适的 $\mathbf q$。

#### 2.2 用约束映射统一描述 IK

用一个统一函数表示全部等式约束：

$$
\boxed{
\mathbf C(\mathbf q)=\mathbf 0
}
$$

在关节自由度采用局部参数化的前提下，$\mathbf C:\mathbb R^n\rightarrow\mathbb R^m$ 表示由全部等式约束组成的约束映射。它可以由多个子约束按分量组合而成：

$$
\mathbf C(\mathbf q)
=
\begin{bmatrix}
\mathbf C_1(\mathbf q) \\
\mathbf C_2(\mathbf q) \\
\vdots \\
\mathbf C_k(\mathbf q)
\end{bmatrix}
$$

每个子约束描述一类需要满足的几何或运动学条件，例如：

- 脚的旋转；
- 手的位置；
- 头部朝向；
- 骨盆高度；
- 两脚同时接触；
- 两个骨骼之间的相对关系。

#### 2.3 Foot 位置约束

如果希望 Foot 到达目标位置 $\mathbf p_{\mathrm{target}}$，定义：

$$
\mathbf C_p(\mathbf q)
=
\mathbf p_E(\mathbf q)
-
\mathbf p_{\mathrm{target}}
$$

精确位置约束就是：

$$
\boxed{
\mathbf C_p(\mathbf q)=\mathbf 0
}
$$

也就是：

$$
\mathbf p_E(\mathbf q)
=
\mathbf p_{\mathrm{target}}
$$

当 IK 问题还包含旋转、骨盆或其他骨骼约束时，$\mathbf C_p$ 作为整体约束映射 $\mathbf C$ 的一个子约束参与组合。例如：

$$
\mathbf C(\mathbf q)
=
\begin{bmatrix}
\mathbf C_p(\mathbf q) \\
\mathbf C_R(\mathbf q) \\
\mathbf C_{\mathrm{other}}(\mathbf q)
\end{bmatrix}
=
\mathbf 0
$$

#### 2.4 Foot 旋转约束

若目标旋转为 $R_{\mathrm{target}}$，可以用旋转误差向量：

$$
\mathbf C_R(\mathbf q)
=
\operatorname{Log}
\left(
R_{\mathrm{target}}^{\mathsf T}
R_E(\mathbf q)
\right)
$$

要求：

$$
\mathbf C_R(\mathbf q)=\mathbf 0
$$

其中 $\operatorname{Log}$ 把旋转差转换成三维旋转向量。实际引擎 Solver 可能使用四元数误差、位置约束或 PBIK 内部形式，但语义相同：

> 当前旋转与目标旋转之间的误差应该趋近零。

#### 2.5 不等式约束

并非所有约束都要求等于零。例如关节角限制：

$$
\mathbf q_{\min}
\le
\mathbf q
\le
\mathbf q_{\max}
$$

腿的最大可达距离：

$$
\left\|
\mathbf p_E(\mathbf q)
-
\mathbf p_H(\mathbf q)
\right\|
\le
L_{\max}
$$

一般写成：

$$
\boxed{
\mathbf g(\mathbf q)\le\mathbf 0
}
$$

因此一个更完整的 IK 问题是：

$$
\text{寻找 }\mathbf q
$$

满足：

$$
\mathbf C(\mathbf q)=\mathbf 0
$$

$$
\mathbf g(\mathbf q)\le\mathbf 0
$$

#### 2.6 为什么现实中常写成最小化

目标可能不可精确满足。例如：

- 脚目标超过腿长；
- 左右脚目标与骨盆限制互相冲突；
- 同时要求脚完全贴地和身体完全保持动画姿势；
- 多个 Effector 对身体提出不相容要求。

这时不存在严格满足：

$$
\mathbf C(\mathbf q)=\mathbf 0
$$

的解。Solver 通常寻找残差最小的姿势：

$$
\mathbf q^*
=
\arg\min_{\mathbf q}
\frac12
\left\|
W_C\mathbf C(\mathbf q)
\right\|^2
$$

同时满足硬限制：

$$
\mathbf g(\mathbf q)\le\mathbf 0
$$

这里 $W_C$ 决定不同约束的重要程度。

等式约束 $\mathbf C(\mathbf q)=\mathbf 0$ 定义可行集。当某一约束允许以残差形式参与优化时，应将对应的子约束显式写入目标函数。例如，将 Foot 位置约束 $\mathbf C_p$ 作为软约束：

$$
J_p(\mathbf q)
=
\frac12
\left\|
W_p\mathbf C_p(\mathbf q)
\right\|^2
$$

$W_p$ 控制位置残差各分量的权重；是否将 $\mathbf C_p$ 作为硬约束或软约束，取决于可达性、约束优先级和求解器能力。

#### 2.7 Source Pose 也是优化目标

角色并不希望为了满足脚目标而完全丢失原动画。可以加入姿势保持项：

$$
J_{\mathrm{pose}}
=
\left\|
\mathbf q-\mathbf q_{\mathrm{source}}
\right\|_{W_P}^2
$$

于是典型目标变成：

$$
\mathbf q^*
=
\arg\min_{\mathbf q}
\left[
\frac12
\left\|
W_C\mathbf C(\mathbf q)
\right\|^2
+
w_P
J_{\mathrm{pose}}
\right]
$$

这解释了 Solver 中常见的：

- Effector Weight；
- Bone Stiffness；
- Preferred Angle；
- Position Alpha；
- Rotation Alpha。

这些参数影响约束优先级、可活动的自由度和关节偏好，但不一定都等价于上式中的单个权重。例如 Preferred Angle 指定偏好的弯曲方向，Bone Stiffness 限制关节的移动能力；具体语义取决于所选 Solver。

#### 2.8 普通 IK 的边界

普通 IK 可以很好地解决：

> 已经知道目标以后，骨架怎样尽量满足目标。

但普通 IK 不负责回答：

- Target 应该位于哪里；
- 这个 Hit 是否适合作为接触；
- 什么时候应该固定 Target；
- 未来目标应该怎样逐渐影响当前姿势；
- 移动平台上应该锁世界还是锁表面；
- 接触失败时应该怎样取消。

这些才是预测 IK 在 Solver 之前增加的部分。

#### 2.9 Prediction、Planning、Solving 必须分开

Prediction 回答：

> 如果当前动画和移动意图继续发展，脚在未来接触时刻原本可能到达哪里？

输出：

$$
\widehat{T}_E^W(t_c)
$$

Planning 回答：

> 未来脚附近的真实环境中，哪个接触合法、稳定且符合动作意图？

输出：

$$
T_A^W
$$

Solving 回答：

> 骨骼自由度 $\mathbf q$ 怎样变化，才能尽量满足接触约束？

因此：

$$
\boxed{
\mathrm{Prediction}
\neq
\mathrm{Planning}
\neq
\mathrm{Solving}
}
$$

把三层混在一起，会导致无法判断问题来自预测、接触选择还是最终姿势求解。

---

### 3. 统一符号与坐标约定

| LaTeX 符号 | 含义 |
|---|---|
| $W$ | World Space |
| $B$ | Trajectory Source Frame / Movement Body Frame，轨迹源实际描述的主体坐标系 |
| $M$ | Skeletal Mesh Component Space |
| $S$ | Surface Local Space，接触表面的局部坐标系 |
| $G$ | Control Rig Global Space；它属于 Rig 层级，不等同于 World Space |
| $E$ | Effector，脚或其他末端执行器 |
| $H$ | Hip，肢体根部 |
| $A$ | Contact Anchor |
| $t$ | 相对当前帧的未来时间 |
| $t_c$ | Time To Contact |
| $\Delta t$ | 相邻采样时间差 |
| $\phi$ | 归一化脚步相位，$\phi\in[0,1]$ |
| $T_X^Y$ | 对象或坐标系 $X$ 在空间 $Y$ 中的刚体变换 |
| $\mathbf p_X^Y$ | 点 $X$ 在空间 $Y$ 中的位置 |
| $\mathbf v_X^Y$ | 对象 $X$ 在空间 $Y$ 中的线速度 |
| $\boldsymbol\omega_X^Y$ | 对象 $X$ 在空间 $Y$ 中的角速度 |
| $\mathbf u$ | 角色上方向或反重力单位向量 |
| $\mathbf n$ | 接触表面单位法线 |
| $\mathbf q$ | Solver 的关节自由度向量 |
| $\mathbf q_{\mathrm{source}}$ | Pre-IK Source Pose 对应的关节状态 |
| $\mathbf C(\mathbf q)$ | 等式约束残差，理想状态为 $\mathbf C(\mathbf q)=\mathbf 0$ |
| $\mathbf g(\mathbf q)$ | 不等式约束，采用 $\mathbf g(\mathbf q)\le\mathbf 0$ 的约定 |
| $W_C$ | 约束残差的权重矩阵 |
| $W_P$ | Source Pose 保持项的权重矩阵 |
| $\widehat{x}$ | 预测值 |
| $\delta\mathbf p$ | 为满足未来接触而施加的修正 |
| $w_i$ | 目标函数中的非负权重 |
| $\mathcal C$ | 候选接触集合 |
| $z$ | 离散接触状态 |

位置和向量统一采用列向量含义。概念公式使用：

$$
T_E^W=T_M^WT_E^M
$$

即先用 Skeletal Mesh Component Space 表示动画产生的肢体运动，再通过 Skeletal Mesh Component 的世界变换映射到 World Space。

移动系统提供的轨迹不一定直接描述 Skeletal Mesh Component。若轨迹样本描述的是 Movement Body Frame，则必须显式转换：

$$
T_M^W(t)
=
T_B^W(t)T_M^B(t)
$$

因此完整变换链为：

$$
T_E^W(t)
=
T_B^W(t)T_M^B(t)T_E^M(t)
$$

只有在 Movement Body 与 Skeletal Mesh Component 确实使用同一坐标系时，才可以令 $T_M^B=I$。该关系必须由集成代码明确建立，不能依据 Actor、Root、Updated Component 或 Mesh 等名称进行推断。

工程命名采用 Unreal 常见后缀：`WS` 表示 World Space，`CS` 表示 Skeletal Mesh Component Space。`RigGlobal` 与 `SurfaceLocal` 使用完整名称，避免使用含义不明确的 `RS` 或容易与 Screen Space 混淆的 `SS`。

具体 C++ 实现必须再按照引擎的 Transform 乘法约定验证顺序，不能直接凭公式外观翻译。

---

### 4. 为什么只做“当前帧贴地”还不够

#### 4.1 最简单的 Foot IK

一个最常见的 Foot IK 流程是：

~~~text
Current Foot Position
        ↓
向下 Trace
        ↓
Current Ground Hit
        ↓
Foot Target
        ↓
IK Solver
~~~

站立或缓慢移动时，这套方法通常有效。因为当前脚位置和即将接触的位置相差很小，系统不需要知道太多未来信息。

问题出现在：

- 脚正在快速摆动；
- 地形高度即将突然变化；
- 角色正在急转或急停；
- 接触表面正在移动；
- 目标需要在真正接触前就稳定下来。

#### 4.2 上台阶：Target 为什么突然跳变

脚尚未进入台阶上方时，当前脚向下 Trace 看到的是低处地面：

~~~text
                         ┌────────
                         │
Ground ─────────────────┘

          Foot
            ↓ Trace
~~~

此时：

$$
h_{\mathrm{hit}}=0
$$

下一些帧，脚刚进入台阶的水平范围：

~~~text
                         Foot
                           ↓ Trace
                         ┌────────
                         │
Ground ─────────────────┘
~~~

命中高度突然变成：

$$
h_{\mathrm{hit}}=h_{\mathrm{step}}
$$

所以 Target 出现离散跳变：

$$
h_{\mathrm{target}}:
0
\rightarrow
h_{\mathrm{step}}
$$

Solver 只能在很短时间内强行修正腿部，于是可能出现：

- Foot Pop；
- Knee Pop；
- Pelvis Pop；
- 脚先穿进台阶再被推出；
- 高速移动时来不及完成修正。

这里 IK Solver 可能完全正确。真正的问题是：

> **Target 被发现得太晚。**

#### 4.3 下台阶：当前查询不知道脚将落空

脚还位于高台上方时，当前查询可能继续命中高台：

~~~text
High Ground ───────────┐
                      │
                      │
                      └──────── Low Ground

           Foot
             ↓
~~~

当脚越过边缘后，命中高度才突然下降。常见结果是：

- 脚沿旧高度向前摆动；
- 越过边缘后突然下探；
- 在真正接触前出现悬空；
- 骨盆在最后时刻突然下降。

预测系统应该在脚越过边缘之前，就查询未来落脚区域。

#### 4.4 斜坡与边缘：Hit 本身可能不连续

即使地形连续，碰撞三角形、台阶边缘或简化碰撞也可能让法线和命中点在相邻帧跳变：

$$
\left\|
\mathbf p_{\mathrm{hit},n}
-
\mathbf p_{\mathrm{hit},n-1}
\right\|
\gg0
$$

如果每帧都把最新 Hit 直接作为 Target，脚会追逐不断变化的目标。

因此仅仅“提前 Trace”仍然不够，还需要：

- Candidate Validation；
- 时间连续性；
- Commit；
- Lock；
- 滞回与释放。

#### 4.5 急转和急停：当前速度不等于未来运动

角色当前可能向前运动，但输入已经要求左转或停止：

~~~text
Current Velocity  →
Future Intent      ↖
~~~

如果只根据当前 Foot WS Velocity 外推，脚会继续沿旧方向预测。Future Mesh Component Trajectory 的意义不是补上遗漏的 Mesh Component 速度，而是提供移动系统所预测的未来整体运动。

#### 4.6 移动平台：当前世界位置不是稳定接触关系

脚已经踩在移动平台上时，如果只锁定：

$$
T_E^W=\mathrm{constant}
$$

平台移动后，脚会相对平台滑动。真正稳定的约束是：

$$
T_E^S=\mathrm{constant}
$$

也就是脚相对接触表面保持不变。

#### 4.7 反应式 IK 与预测 IK 不是互斥关系

反应式 IK 适合：

- 站立；
- 最终小范围贴地；
- 预测失败时的后备；
- 低 LOD。

预测 IK 适合：

- 摆动脚提前发现未来地形；
- 在剩余时间内平滑分配修正；
- 接触前稳定落点；
- 处理快速运动和未来移动意图。

常见组合是：

~~~text
Early Swing
  预测未来落脚区域

Late Swing
  减少 Replanning，逐渐应用接触修正

PreContact
  Commit

Planted
  Lock + 小范围反应式适配

LiftOff
  Release
~~~

#### 4.8 预测 IK 增加的不是另一个 Solver

普通 IK 已经能表示：

$$
\mathbf C(\mathbf q)=\mathbf 0
$$

预测 IK 增加的是约束目标的生成过程：

~~~text
Pre-IK Source Pose
        ↓
State Estimation
        ↓
Foot Phase / Time To Contact
        ↓
Future Mesh Component Transform × Future Component-Space Limb Motion
        ↓
Predicted Effector in World
        ↓
Environment Query
        ↓
Candidate Generation
        ↓
Hard Constraints + Soft Objective
        ↓
Contact Selection
        ↓
Commit → Contact → Surface-relative Lock
        ↓
Current-frame Solver Target
        ↓
Pose Solver
~~~

换句话说：

$$
\boxed{
\text{普通 IK 解决“怎样满足约束”}
}
$$

$$
\boxed{
\text{预测 IK 先解决“未来应该生成什么约束”}
}
$$

---

## 状态估计、时间与空间

### 5. Pre-IK Source Pose 是状态估计的起点

预测必须读取尚未经过本系统 IK、Foot Lock 和 Pelvis 修正的 Source Pose。

如果使用已求解脚的位置计算速度，Foot Lock 会制造：

$$
\mathbf v_E^W\approx\mathbf 0
$$

随后：

~~~text
Locked Foot
    ↓
Measured Velocity ≈ 0
    ↓
Prediction stays at old anchor
    ↓
IK reinforces the same lock
~~~

这形成反馈污染：

$$
\mathrm{IKOutput}
\rightarrow
\mathrm{StateEstimate}
\rightarrow
\mathrm{Prediction}
\rightarrow
\mathrm{IKOutput}
$$

因此必须保持：

$$
\boxed{
\mathrm{PredictionSource}
=
\mathrm{PreIKPose}
}
$$

至少应保存：

$$
T_E^W(t_n),
\qquad
T_E^W(t_{n-1})
$$

以及同一采样时刻的 $T_M^W$、必要时的 $T_B^W$ 与 $T_M^B$、Hip 变换和采样时间。跨帧求差的两个量必须处于同一坐标空间。

---

### 6. Foot Phase 与 Time To Contact

#### 6.1 Phase 是行为先验

速度告诉系统脚此刻怎样运动，Phase 告诉系统脚位于整个动作生命周期的哪个阶段。

可使用：

~~~text
LiftOff → EarlySwing → MidSwing → LateSwing → PreContact → Contact
~~~

连续表示为：

$$
\phi\in[0,1]
$$

Phase 可以来自以下输入，可信度取决于动画资产和系统时序：

1. 动画曲线；
2. Sync Marker 或 Notify；
3. Motion Matching 特征；
4. 局部高度和速度启发式；
5. 世界速度和地面距离启发式。

显式动画语义通常比继续增加高阶导数更可靠。

#### 6.2 Time To Contact

预测窗口不应固定，而应尽量等于预计接触时间：

$$
t_c=T_{\mathrm{contact}}-T_{\mathrm{now}}
$$

只有当 $\phi$ **只覆盖摆动阶段**、随真实播放速率线性推进，且剩余摆动时长已知时，才可近似：

$$
t_c \approx (1-\phi)T_s
$$

若步态速度、混合权重或状态切换改变，应优先使用动画事件或曲线给出的实际剩余时间。摆动阶段的预测窗口限制为：

$$
t_c=\operatorname{clamp}(t_{c,\mathrm{raw}},0,t_{\max})
$$

进入 Contact/Planted 后令 $t_c=0$；仅在分母或差分计算中使用正的数值下限 $\varepsilon_t$。把 $t_c$ 强制夹到正的 $t_{\min}$ 会使接触帧仍然预测“未来接触”，造成锁定目标偏移。

TTC 同时决定：

- 应从轨迹采样哪个时刻；
- 速度应外推多远；
- 查询应该提前多少；
- 何时减少 Replanning；
- 何时 Commit；
- 当前帧应应用多少接触修正。

---

### 7. 不同问题使用不同空间

#### 7.1 Skeletal Mesh Component Space

Component Space 是以 SkeletalMeshComponent 为基准的坐标空间。Pre-IK 骨骼姿势、动画产生的局部肢体运动以及步幅分析都应在这个明确的空间中表达。

适合处理：

- Pre-IK Foot Transform；
- 动画产生的脚部摆动；
- 步幅和肢体相对运动；
- 从 Control Rig Global Space 映射后的骨骼变换；
- 与未来 Mesh Component Transform 组合前的局部运动。

Component Space 不等于 Bone Local Space。Bone Local Space 以父骨骼为基准；Component Space 中的骨骼变换已经累积了父级变换。

#### 7.2 Trajectory Source Frame / Movement Body Frame

Trajectory Source Frame 是对轨迹输出坐标系的统一称呼，不是 Unreal Engine 额外提供的内置空间。集成时必须把它绑定到一个具体对象，例如移动系统的 Updated Component、胶囊体或其他被预测的根组件；本文将该主体记为 Movement Body。

它只用于描述移动轨迹的来源语义。进入预测 IK 的空间组合前，应将它转换为未来 Skeletal Mesh Component 世界变换：

$$
\widehat{T}_M^W(t)
=
\widehat{T}_B^W(t)\widehat{T}_M^B(t)
$$

如果 $T_M^B$ 不是恒定关系，例如视觉 Mesh 存在独立平滑、旋转偏置或动态挂接，那么必须明确选择并实现对应的预测策略，不能把 $B$ 和 $M$ 隐式视为同一空间。

#### 7.3 World Space

适合处理：

- 环境碰撞；
- 地面高度；
- 坡度；
- 接触候选；
- 静态世界锚点。

#### 7.4 Surface Local Space

适合处理：

- 移动平台；
- 旋转平台；
- 车辆或动态骨骼表面；
- 接触后的相对锁定。

Surface Local Space 同样不是额外的全局引擎空间，而是由命中的静态组件、移动组件或骨骼表面显式提供的局部坐标系。Contact Anchor 必须记录它所依附的具体对象和相对变换。

#### 7.5 Control Rig Global Space

适合连接：

- Control Rig Trace；
- Effector Target；
- 骨骼和 Control；
- 最终 Pose Solver。

Control Rig Global Space 是 Rig Hierarchy 中的全局空间，不是 World Space。对标准 Skeletal Mesh Control Rig，它通常与 Component Space 对齐；如果 Rig 映射中存在额外变换，则应显式使用 $T_G^M$ 转换。**本文的环境候选和接触代价均以 World Space 定义**；若调用 Control Rig 的 Sphere Trace 节点，需要先把查询起终点从 World 转到 Rig Global，再把命中点和法线转换回 World。官方节点参考将该 Trace 的输入和输出标为 Rig/Global Space，不能把它们直接当作 World Space：

$$
T_E^M=T_G^MT_E^G
$$

不同问题应在其自然空间中表达，并在边界处显式转换：

$$
\boxed{
\mathrm{LocalMotion}
\rightarrow
\mathrm{ComponentSpace}
}
$$

$$
\boxed{
\mathrm{MovementTrajectory}
\rightarrow
\mathrm{MovementBodyFrame}
\rightarrow
\mathrm{MeshComponentTransform}
}
$$

$$
\boxed{
\mathrm{Contact}
\rightarrow
\mathrm{World/SurfaceLocalSpace}
}
$$

$$
\boxed{
\mathrm{PoseSolve}
\rightarrow
\mathrm{RigGlobalSpace}
}
$$

---

## 预测未来脚的位置

### 8. 预测模型：从最低阶开始

#### 8.1 Level 0：Reactive

$$
\widehat{\mathbf p}_E^W(t_c)
=
\mathbf p_E^W(0)
$$

没有未来外推，只在当前脚附近查询。它是所有复杂模型的基线。

#### 8.2 Level 1：Foot WS 恒速

$$
\widehat{\mathbf p}_E^W(t_c)
=
\mathbf p_E^W(0)
+
\mathbf v_E^W(0)t_c
$$

精确位移其实是：

$$
\mathbf p_E^W(t_c)
=
\mathbf p_E^W(0)
+
\int_0^{t_c}
\mathbf v_E^W(\tau)
\,d\tau
$$

恒速模型假设：

$$
\mathbf v_E^W(\tau)
\approx
\mathbf v_E^W(0)
$$

它适合短预测窗口，不适合急停、急转和长摆动阶段。

需要特别纠正：

> 如果 Foot WS Velocity 来自正确的 Pre-IK 世界位置，它已经包含 Mesh Component 整体运动产生的速度分量。它的问题不是缺少整体运动，而是当前瞬时速度不一定等于未来平均速度。

#### 8.3 平面预测

把速度投影到与上方向 $\mathbf u$ 垂直的平面：

$$
\mathbf v_{\parallel}
=
\mathbf v
-
\left(
\mathbf v\cdot\mathbf u
\right)\mathbf u
$$

然后：

$$
\widehat{\mathbf p}_{E,\parallel}^W(t_c)
=
\mathbf p_E^W(0)
+
\mathbf v_{\parallel}t_c
$$

上式只给环境查询提供水平搜索中心，保留当前高度作为扫掠起点的参考；它不是最终接触高度。真实高度和法线由环境查询确定。

#### 8.4 Level 2：加速度

$$
\widehat{\mathbf p}(t_c)
=
\mathbf p_0
+
\mathbf v_0t_c
+
\frac12\mathbf a_0t_c^2
$$

加速度来自二次数值差分，容易放大帧时间、混合和网络修正噪声。除非误差数据证明有价值，否则不应默认增加。

#### 8.5 最低足够阶数原则

更高阶模型：

$$
\mathbf p(t)
=
\mathbf p_0
+
\mathbf v_0t
+
\frac12\mathbf a_0t^2
+
\frac16\mathbf j_0t^3
$$

同时提高表达能力和噪声敏感度。

预测 IK 通常更应优先使用：

$$
\mathrm{Trajectory}
+
\mathrm{Phase}
+
\mathrm{Velocity}
$$

而不是盲目增加 Acceleration 和 Jerk。

---

### 9. 核心分解：Future Mesh Component Transform × Future Component-Space Limb Motion

设 Skeletal Mesh Component 的未来世界变换为：

$$
T_M^W(t)
$$

Foot 在 Component Space 中的未来变换为：

$$
T_E^M(t)
$$

则：

$$
\boxed{
\widehat{T}_E^W(t)
=
\widehat{T}_M^W(t)
\widehat{T}_E^M(t)
}
$$

这将两个不同来源的信息分开：

~~~text
Future Mesh Component Transform
    = 移动系统预测的角色整体运动，经空间映射后得到

Future Component-Space Limb Motion
    = 动画在 Skeletal Mesh Component Space 中产生的脚步运动
~~~

如果轨迹源直接输出 $T_M^W(t)$，可以直接参与组合。如果轨迹源输出 Movement Body 的 $T_B^W(t)$，则先计算：

$$
\widehat{T}_M^W(t)
=
\widehat{T}_B^W(t)\widehat{T}_M^B(t)
$$

预测 IK 的核心组合只接收语义明确的 $T_M^W(t)$，不在公式中隐式猜测轨迹属于 Actor、Capsule、Updated Component 还是 Mesh。

#### 9.1 更严格的速度关系

脚世界速度不是简单的组件平移速度加局部速度。对旋转中的 Mesh Component：

$$
\mathbf v_E^W
=
\mathbf v_M^W
+
\boldsymbol\omega_M^W
\times
\mathbf r_{ME}^W
+
R_M^W\mathbf v_E^M
$$

其中：

$$
\mathbf r_{ME}^W
=
\mathbf p_E^W-\mathbf p_M^W
$$

第二项是 Mesh Component 旋转产生的切向速度。

这说明：

- Foot WS Velocity 是合法的整体观测；
- 将 Mesh Component 的世界速度再次叠加到 Foot WS Velocity 上可能重复计算；
- 显式组合未来 Mesh Component Transform 与 Component-Space Foot Transform，比手工相加多个速度更清楚。

---

### 10. Future Mesh Component Trajectory

预测 IK 使用的 Future Mesh Component Trajectory 是一组带相对时间的 Skeletal Mesh Component 世界空间样本：

$$
\mathcal T
=
\left\{
\left(
t_i,
T_M^W(t_i),
\mathbf v_M^W(t_i),
\boldsymbol\omega_M^W(t_i)
\right)
\right\}
$$

来源可以是：

- Mover；
- Character Movement；
- Motion Matching 提供的轨迹特征（仅作为意图线索，除非已确认与实际移动预测一致）；
- Root Motion；
- AI 路径；
- 网络预测；
- 自定义 Gameplay 预测；
- 简单速度外推。

不同系统可能产生 Movement Body、Actor Root、Updated Component 或其他主体的轨迹。这些来源属于集成边界；进入预测 IK 核心前，必须统一转换为具有明确时间戳的 $T_M^W(t_i)$。转换之后，核心算法不再依赖原始轨迹来自哪一种移动框架。

#### 10.1 时间插值

当：

$$
t_i\le t_c\le t_{i+1}
$$

插值系数：

$$
\lambda
=
\frac{
t_c-t_i
}{
t_{i+1}-t_i
}
$$

位置：

$$
\mathbf p_M^W(t_c)
=
\operatorname{Lerp}
\left(
\mathbf p_i,
\mathbf p_{i+1},
\lambda
\right)
$$

旋转：

$$
R_M^W(t_c)
=
\operatorname{Slerp}
\left(
R_i,
R_{i+1},
\lambda
\right)
$$

#### 10.2 Mover 的位置

如果项目真实移动由 Mover 决定，使用 Mover 的 PredictedTrajectory 通常比另写一个近似角色预测器更一致：

$$
\boxed{
\mathrm{PredictionModel}
\approx
\mathrm{ActualMotionModel}
}
$$

使用前必须确认 PredictedTrajectory 样本所描述的对象。如果它描述的是 Movement Body 而不是 Skeletal Mesh Component，则应在 Mover 集成层应用 $T_M^B$，输出统一的 $T_M^W(t)$。这个转换是坐标语义适配，不属于另一套运动预测。

但 Mover 的公开 `Get Predicted Trajectory` 文档说明它投影的是**未进行完整模拟和碰撞**的理想运动。因此它不能直接证明未来接触一定发生；环境查询和接触规划仍由预测 IK 完成。

#### 10.3 Provider 不是原理前提

统一 Provider 是多轨迹来源项目的合理工程抽象，但不是数学模型的一部分。

如果项目只有一个来源，直接提供未来 Mesh Component 轨迹样本也完全成立。只有出现真实的多来源、共享采样或重复转换时，才需要 Provider、Adapter 或缓存。

---

### 11. Future Component-Space Limb Prediction

理想输入是未来动画在 Skeletal Mesh Component Space 中的 Foot Transform：

$$
T_E^M(t_c)
$$

如果不可得，可以逐级近似。

#### 11.1 零阶保持

$$
\widehat{T}_E^M(t_c)
=
T_E^M(0)
$$

#### 11.2 Component-Space 恒速

$$
\widehat{\mathbf p}_E^M(t_c)
=
\mathbf p_E^M(0)
+
\mathbf v_E^M(0)t_c
$$

#### 11.3 Phase-aware Component-Space 预测

$$
\widehat{\mathbf p}_E^M(t_c)
=
\mathbf p_E^M(0)
+
w_v(\phi,t_c)
\mathbf v_E^M(0)t_c
$$

其中 $w_v$ 在 Mid Swing 可以较大，在 PreContact 应逐渐减小，避免继续外推即将停止的脚。

#### 11.4 未来动画采样

如果动画系统可以查询未来姿势，可以直接取得：

$$
\widehat{T}_E^M(t_c)
=
T_{E,\mathrm{animation}}^M(t_c)
$$

但必须考虑未来状态机切换、Motion Matching 重选、Blend 权重变化和求值成本。

---

### 12. 短时模型与轨迹模型的融合

短时 Foot WS 预测：

$$
\widehat{\mathbf p}_{\mathrm{short}}
=
\mathbf p_E^W
+
\mathbf v_E^Wt_c
$$

轨迹组合预测：

$$
\widehat{\mathbf p}_{\mathrm{trajectory}}^W
=
\widehat R_M^W(t_c)
\widehat{\mathbf p}_E^M(t_c)
+
\widehat{\mathbf p}_M^W(t_c)
$$

上式把局部点经过旋转和平移映射到 World Space；若工程中还允许非单位缩放，必须在约定的变换语义中一并处理。只有两个预测都指向**同一未来时刻、同一空间**时，才可以根据预测时间或置信度融合：

$$
\widehat{\mathbf p}_{\mathrm{final}}
=
\left(
1-\beta
\right)
\widehat{\mathbf p}_{\mathrm{short}}
+
\beta
\widehat{\mathbf p}_{\mathrm{trajectory}}
$$

其中：

$$
\beta
=
\operatorname{smoothstep}
\left(
t_{\mathrm{short}},
t_{\mathrm{long}},
t_c
\right)
$$

含义是：

- 极短期更相信当前实际导数；
- 较长期更相信 Future Mesh Component Trajectory 和 Component-Space 动画模型。

基础实现可以只保留主模型和清晰的后备路径：

~~~text
Mesh Component Trajectory × Component-Space Limb Motion
        ↓ unavailable
Foot WS Short Prediction
        ↓ unavailable
Reactive Query
~~~

---

### 13. 滤波与不确定性

#### 13.1 帧率无关的一阶滤波

$$
\mathbf v_f
=
\mathbf v_f^{\mathrm{prev}}
+
\alpha
\left(
\mathbf v_{\mathrm{raw}}
-
\mathbf v_f^{\mathrm{prev}}
\right)
$$

$$
\alpha
=
1-e^{-2\pi f_c\Delta t}
$$

#### 13.2 滤波的代价

滤波降低噪声，同时引入延迟。急转和急停时，过强滤波会保留已经过时的速度。

因此应让：

- 轨迹承担低频意图；
- Component-Space Foot 速度承担动画脚摆动；
- Commit 阻止临近接触时继续追逐；
- 轻度滤波只解决采样噪声。

#### 13.3 预测不确定性随时间增长

可以把下面的表达式用作**经验性不确定性模型**，其系数必须按长度与时间单位标定，并非由本文的运动方程自动推导出的协方差：

$$
\sigma_p^2(t)
=
\sigma_0^2
+
k_vt^2
+
k_mt^4
$$

其中：

- $\sigma_0$ 表示当前状态观测误差；
- $k_v$ 表示速度估计误差；
- $k_m$ 表示模型与真实运动不一致造成的误差。

不确定性可以用于：

- 增大远期查询半径；
- 降低远期 Candidate 的承诺强度；
- 延迟 Commit；
- 在高误差场景回退到 Reactive。

不必一开始实现完整概率模型，但应该承认远期预测不是同等可信的。

---

## 环境查询与接触规划

### 14. Environment Query 生成候选集

预测位置只是查询中心，不是目标。

沿重力单位方向：

$$
\mathbf d
=
\frac{\mathbf g}{\|\mathbf g\|}
$$

查询起终点：

$$
\mathbf s
=
\widehat{\mathbf p}_E^W(t_c)
-
h_{\mathrm{up}}\mathbf d
$$

$$
\mathbf e
=
\widehat{\mathbf p}_E^W(t_c)
+
h_{\mathrm{down}}\mathbf d
$$

Sphere Sweep 通常比无限细的 Line Trace 更能容忍：

- 台阶边缘；
- 小范围预测误差；
- 三角面边界；
- 小障碍和碰撞简化。

查询输出形成候选集合：

$$
\mathcal C
=
\left\{
c_1,c_2,\ldots,c_m
\right\}
$$

每个候选至少包含：

$$
c_i
=
\left(
\mathbf p_i,
\mathbf n_i,
S_i,
t_{\mathrm{query},i}
\right)
$$

即世界空间位置、法线、表面身份和**查询发生的绝对时间** $t_{\mathrm{query},i}$。它与相对当前帧的未来接触时间 $t_c$ 不同；若需要预测移动表面，还应单独记录候选对应的未来表面时刻。一个单次 Sphere Trace 通常只返回首个阻挡命中，不能凭这一次命中构造多个候选。多个候选需要多位置采样、多次 Sweep 或明确支持多命中的查询。

---

### 15. 接触规划是约束优化问题

预测 IK 的核心决策可以写成：

$$
c^*
=
\arg\min_{c_i\in\mathcal C}
J(c_i)
$$

同时要求：

$$
g_j(c_i)\le0
$$

$$
h_k(c_i)=0
$$

这里：

- $J$ 是软目标代价；
- $g_j$ 是不等式硬约束；
- $h_k$ 是等式硬约束。

实际工程不一定需要通用非线性优化器。常见做法是：

1. Query 产生少量候选；
2. 先用硬约束拒绝；
3. 对剩余候选计算归一化代价；
4. 选择最低代价；
5. 通过状态机和滞回决定是否 Commit。

这种离散候选枚举比在连续世界中盲目搜索更稳定、可控。

---

### 16. 硬约束：不满足就拒绝

#### 16.1 表面约束

接触点必须位于有效表面：

$$
S(c_i)\in\mathcal S_{\mathrm{allowed}}
$$

#### 16.2 坡度约束

$$
\mathbf n_i\cdot\mathbf u
\ge
\cos\theta_{\max}
$$

等价于：

$$
\theta_i
=
\arccos
\left(
\operatorname{clamp}
\left(
\mathbf n_i\cdot\mathbf u,
-1,
1
\right)
\right)
\le
\theta_{\max}
$$

#### 16.3 高差约束

相对地面基准点 $\mathbf p_B$：

$$
\Delta h_i
=
\left(
\mathbf p_i-\mathbf p_B
\right)
\cdot\mathbf u
$$

要求：

$$
-h_{\mathrm{down,max}}
\le
\Delta h_i
\le
h_{\mathrm{up,max}}
$$

#### 16.4 动画偏差约束

候选中的 $\mathbf p_i$ 是表面命中点，预测的 $\widehat{\mathbf p}_E^W$ 是脚部 Effector；二者不能在存在脚底厚度或踝骨偏移时直接相减。先由候选接触变换 $T_{A,i}^W$ 和已校准的脚底到 Effector 偏移 $T_E^A$ 构造：

$$
T_{E,i}^W=T_{A,i}^W T_E^A
$$

再比较同一个 Effector 参考点。候选不能离无环境约束的未来脚过远：

$$
\left\|
\operatorname{Proj}_{\perp\mathbf u}
\left(
\mathbf p_{E,i}^W
-
\widehat{\mathbf p}_E^W(t_c)
\right)
\right\|
\le
d_{\mathrm{horizontal,max}}
$$

也可以增加：

$$
\left|
\left(
\mathbf p_{E,i}^W
-
\widehat{\mathbf p}_E^W(t_c)
\right)
\cdot\mathbf u
\right|
\le
d_{\mathrm{vertical,max}}
$$

#### 16.5 腿部可达约束

令有效腿长为：

$$
L_{\mathrm{allowed}}
=
\eta
\left(
L_{\mathrm{thigh}}
+
L_{\mathrm{calf}}
\right)
$$

其中通常：

$$
0<\eta<1
$$

保留膝盖弯曲和骨盆余量。这里仍使用由候选接触生成的 **Effector 目标** $\mathbf p_{E,i}^W$，不是裸命中点。要求：

$$
\left\|
\mathbf p_{E,i}^W-\widehat{\mathbf p}_H^W(t_c)
\right\|
\le
L_{\mathrm{allowed}}
$$

该球形距离只是快速上界；通过它不保证膝盖限位、脚朝向和另一条腿同时可解，还需由最终姿势求解或更精细的可达性测试验证。

#### 16.6 支撑面积约束

先把脚掌区域 $\mathcal F$ 和候选表面支撑区域 $\mathcal S_i$ 投影到**同一个接触切平面**，再比较重叠面积：

$$
\frac{
\operatorname{Area}
\left(
\mathcal F\cap\mathcal S_i
\right)
}{
\operatorname{Area}
\left(
\mathcal F
\right)
}
\ge
\rho_{\min}
$$

基础实现可以使用脚掌前后或四角的附加采样近似支撑面积，无需直接计算多边形交集。

#### 16.7 状态和时序约束

候选必须足够新：

$$
0
\le
t_{\mathrm{now}}-t_{\mathrm{query},i}
\le
t_{\mathrm{age,max}}
$$

并且所引用表面仍然有效。

---

### 17. 软目标：合法候选之间怎样选择

对通过硬约束的候选，定义无量纲代价：

$$
J(c_i)
=
w_aJ_{\mathrm{animation}}
+
w_sJ_{\mathrm{slope}}
+
w_rJ_{\mathrm{reach}}
+
w_hJ_{\mathrm{height}}
+
w_eJ_{\mathrm{edge}}
+
w_tJ_{\mathrm{temporal}}
+
w_mJ_{\mathrm{motion}}
$$

所有权重满足：

$$
w_k\ge0
$$

#### 17.1 动画偏差

同样比较候选所对应的 Effector 目标，而非表面原始命中点：

$$
J_{\mathrm{animation}}
=
\frac{
\left\|
\mathbf p_{E,i}^W
-
\widehat{\mathbf p}_E^W(t_c)
\right\|^2
}{
d_{\mathrm{animation}}^2
}
$$

#### 17.2 坡度代价

$$
J_{\mathrm{slope}}
=
\left(
\frac{
\theta_i
}{
\theta_{\max}
}
\right)^2
$$

#### 17.3 Reach 代价

令：

$$
r_i
=
\frac{
\left\|
\mathbf p_{E,i}^W-\widehat{\mathbf p}_H^W(t_c)
\right\|
}{
L_{\mathrm{allowed}}
}
$$

可以使用接近伸直时快速增大的代价：

$$
J_{\mathrm{reach}}
=
\frac{
r_i^2
}{
\max
\left(
\varepsilon,
1-r_i
\right)
}
$$

#### 17.4 高差代价

$$
J_{\mathrm{height}}
=
\left(
\frac{
\Delta h_i
}{
h_{\mathrm{scale}}
}
\right)^2
$$

#### 17.5 边缘代价

设候选到可支撑边缘的最短距离为 $d_{\mathrm{edge},i}$：

$$
J_{\mathrm{edge}}
=
\left[
\max
\left(
0,
1-
\frac{
d_{\mathrm{edge},i}
}{
d_{\mathrm{safe}}
}
\right)
\right]^2
$$

#### 17.6 时间连续性

相对上一候选 $\mathbf p_{\mathrm{prev}}$：

$$
J_{\mathrm{temporal}}
=
\frac{
\left\|
\mathbf p_i-\mathbf p_{\mathrm{prev}}
\right\|^2
}{
d_{\mathrm{jump}}^2
}
$$

#### 17.7 表面运动风险

对于移动表面，应关注**候选点相对角色的运动**，而不是表面原点的绝对速度。若已知表面原点速度和角速度，候选点速度为：

$$
\mathbf v_{S,i}=\mathbf v_{S,0}+\boldsymbol\omega_S\times(\mathbf p_i-\mathbf p_{S,0})
$$

一个可选风险项是：

$$
J_{\mathrm{motion}}
=
\frac{\|\mathbf v_{S,i}-\mathbf v_{B,i}\|^2}{v_{\mathrm{safe}}^2}
+
\frac{\|\boldsymbol\omega_S\|^2}{\omega_{\mathrm{safe}}^2}
$$

其中 $\mathbf v_{B,i}$ 是角色在同一候选点附近的参考速度；第二项单独评价表面朝向变化的风险。两项都只是候选评分设计，不是接触合法性的物理定律。

#### 17.8 为什么必须归一化

距离、角度和速度单位不同。若不归一化，权重无法解释，并且角色尺寸改变后评分失效。

正确形式是：

$$
\left(
\frac{\mathrm{measurement}}{\mathrm{meaningfulScale}}
\right)^2
$$

然后再用 $w_k$ 表示设计偏好。

---

### 18. 硬约束与软约束怎样划分

适合作为硬约束：

- 表面无效；
- 坡度超过绝对上限；
- 明确不可达；
- 高差超过角色能力；
- 接触帧失效；
- 输入包含非有限值。

适合作为软目标：

- 更接近动画预测；
- 更平坦；
- 更靠近支撑中心；
- 更连续；
- 更少骨盆修正；
- 更少姿势偏离。

不要用巨大惩罚权重假装实现绝对安全约束，也不要把所有审美偏好都做成硬拒绝。

---

## 从未来落点到当前姿势

### 19. 未来 Anchor 不能直接成为当前脚目标

规划中的“锚点”必须是由接触几何转换后的 **Foot Effector 目标**，不能把 Sphere Trace 的原始命中点直接当作踝骨位置。以下 $\mathbf p_A^W$ 均指这个校准后的目标。未来接触时刻的世界空间锚点：

$$
\mathbf p_A^W(t_c)
$$

静态地面上可近似使用当前表面变换；移动平台需要估计其在 $t_c$ 的变换，再把 Surface Local Anchor 映射到 World Space。若未来平台姿态不可得，应降低远期候选置信度或缩短预测窗口，不能把当前命中点当作已确认的未来世界锚点。

与无环境约束的未来脚：

$$
\widehat{\mathbf p}_E^W(t_c)
$$

之差为终端修正：

$$
\Delta\mathbf p_{\mathrm{contact}}
=
\mathbf p_A^W(t_c)
-
\widehat{\mathbf p}_E^W(t_c)
$$

它描述的是：

> 到接触时刻为止，脚轨迹总共需要积累多少环境修正。

当前帧只应用其中一部分：

$$
\mathbf p_{\mathrm{target}}^W(0)
=
\mathbf p_{\mathrm{source}}^W(0)
+
w_c(\phi,t_c)
\Delta\mathbf p_{\mathrm{contact}}
$$

其中 $w_c$ 在 Early Swing 较小，在 Late Swing 和 PreContact 逐渐增大。接触发生时 $t_c=0$，若预测退化为当前 Source Pose 且 $w_c=1$，当前目标就收敛到锚点；这也是 TTC 必须允许归零的原因。

**数值小例子**：假设预测的无环境约束落脚高度为 $10\,\mathrm{cm}$，台阶接触高度为 $20\,\mathrm{cm}$，终端竖直修正为 $10\,\mathrm{cm}$。当当前摆动权重为 $0.25$ 时，当前脚目标只在 Source Pose 上增加 $2.5\,\mathrm{cm}$，而不是立即跳到台阶顶。

如果直接令：

$$
\mathbf p_{\mathrm{target}}^W(0)
=
\mathbf p_A^W(t_c)
$$

脚会在空中被提前吸向落点，破坏原动画摆动。

---

### 20. 多帧修正分配也是优化问题

简单权重 $w_c(\phi,t_c)$ 是多帧优化的低成本近似。

设剩余 $N$ 帧的修正为：

$$
\delta\mathbf p_0,
\delta\mathbf p_1,
\ldots,
\delta\mathbf p_N
$$

设 $\Delta\delta\mathbf p_k=\delta\mathbf p_k-\delta\mathbf p_{k-1}$，$\Delta^2\delta\mathbf p_k=\Delta\delta\mathbf p_k-\Delta\delta\mathbf p_{k-1}$；边界差分使用上一帧已经应用的修正。各项需要按帧时间和长度尺度归一化，才能在帧率变化时保持权重含义。可以求解：

$$
\min_{\delta\mathbf p_0,\ldots,\delta\mathbf p_N}
\sum_{k=0}^{N}
\left[
w_p
\|\delta\mathbf p_k\|^2
+
w_v
\|\Delta\delta\mathbf p_k\|^2
+
w_a
\|\Delta^2\delta\mathbf p_k\|^2
\right]
$$

终端约束：

$$
\mathbf p_{\mathrm{source},N}^W
+
\delta\mathbf p_N^W
=
\mathbf p_A^W(t_c)
$$

可选初始连续性：

$$
\delta\mathbf p_0
=
\delta\mathbf p_{\mathrm{previous}}
$$

可达约束：

$$
\left\|
\mathbf p_{\mathrm{source},k}^W
+
\delta\mathbf p_k^W
-
\mathbf p_{H,k}^W
\right\|
\le
L_{\mathrm{allowed}}
$$

这个目标同时最小化：

- 总修正量；
- 修正速度突变；
- 修正加速度突变；
- 接触时终端误差。

实时实现不必运行完整优化器。可以预先构造满足端点条件的平滑权重，例如 Quintic Smoothstep：

$$
w_c(s)
=
6s^5
-
15s^4
+
10s^3
$$

其中：

$$
s
=
\operatorname{clamp}
\left(
\frac{
t_{\mathrm{lead}}-t_c
}{
t_{\mathrm{lead}}
},
0,
1
\right)
$$

该多项式在 $s=0$ 和 $s=1$ 的一阶、二阶导数均为零。它能平滑**固定终端修正**的进入与退出；如果锚点、$t_c$ 或相位中途跳变，仍需 Commit、滞回或重新规划保证目标连续。

---

### 21. Candidate、Commit、Contact 与 Lock

#### 21.1 Candidate

当前信息下可能使用的接触。摆动前段允许持续变化。

#### 21.2 Commit

系统决定本步将使用哪个接触。Commit 发生在真实接触之前。

#### 21.3 Contact

脚到达接触窗口，动画、距离或外部观测确认接触发生。

#### 21.4 Lock

接触发生后，锚点相对世界或表面保持稳定。

所以：

$$
\boxed{
\mathrm{Candidate}
\neq
\mathrm{Committed}
\neq
\mathrm{Locked}
}
$$

---

### 22. 接触系统是 Hybrid System

连续状态：

$$
\mathbf x
=
\left[
\mathbf p,
\mathbf v,
\phi,
t_c,
w,
\sigma
\right]
$$

离散状态：

$$
z
\in
\left\{
\mathrm{Searching},
\mathrm{Committed},
\mathrm{Planted},
\mathrm{Releasing}
\right\}
$$

状态更新可以写成：

$$
\mathbf x_{k+1}
=
f_z
\left(
\mathbf x_k,
\mathbf u_k
\right)
$$

离散切换：

$$
z_{k+1}
=
G
\left(
z_k,
\mathbf x_k,
\mathrm{events}
\right)
$$

推荐 Guard：

~~~text
Searching
  ├─ Candidate valid and stable
  ├─ TTC inside commit window
  └─ confidence sufficient
        ↓
Committed
  ├─ contact confirmed → Planted
  ├─ commit timeout → Searching/Releasing
  ├─ phase leaves contact window → Searching/Releasing
  └─ surface invalid → Releasing
        ↓
Planted
  ├─ lift-off intent
  ├─ unreachable
  ├─ surface invalid
  └─ interrupted
        ↓
Releasing
  └─ weight reaches zero → Searching
~~~

必须有：

- 滞回；
- Candidate 稳定时间；
- Commit 超时；
- 明确的取消条件；
- Release 完成条件。

否则系统会在阈值附近抖动，或者永久停留在 Committed。

---

### 23. Surface-relative Contact Frame

静态世界中：

$$
T_A^W
=
\mathrm{constant}
$$

移动表面接触瞬间保存：

$$
T_A^S
=
\left(
T_S^W
\right)^{-1}
T_A^W
$$

后续：

$$
T_A^W(t)
=
T_S^W(t)
T_A^S
$$

表面法线同样存入 Surface Local Space：

$$
\mathbf n_A^S
=
\left(
R_S^W
\right)^{-1}
\mathbf n_A^W
$$

后续：

$$
\mathbf n_A^W(t)
=
R_S^W(t)
\mathbf n_A^S
$$

需要释放的情况：

- Surface Identity 改变；
- 表面实例销毁；
- 变换发生不连续跳变；
- 锚点变得不可达；
- 动画进入 LiftOff；
- 网络校正超过阈值。

Contact Frame 解决接触后的跟随，不等同于预测平台未来运动。摆动期若要在移动平台上提前选择落点，还必须另行估计 $T_S^W(t_c)$；已锁定时则使用当前表面变换 $T_S^W(t)$ 更新锚点。

---

### 24. Foot Orientation 也是一个受限优化

目标旋转需要同时满足：

1. 脚底 Up 尽量对齐表面法线；
2. 脚的 Forward 尽量保留动画或角色朝向；
3. Pitch/Roll 不超过允许范围；
4. 相邻帧旋转连续。

设脚局部 Up 轴为 $\mathbf a_u$，Forward 轴为 $\mathbf a_f$，目标旋转为 $R$。

可以写成：

$$
R^*
=
\arg\min_R
\left[
w_n
\left\|
R\mathbf a_u-\mathbf n
\right\|^2
+
w_f
\left\|
\operatorname{Proj}_{\mathbf n^\perp}
\left(
R\mathbf a_f
\right)
-
\widehat{\mathbf f}
\right\|^2
+
w_t
d_R^2
\left(
R,
R_{\mathrm{prev}}
\right)
\right]
$$

约束：

$$
\operatorname{Tilt}
\left(
R,
R_{\mathrm{source}}
\right)
\le
\theta_{\mathrm{align,max}}
$$

低成本实现：

1. 将期望 Forward 投影到接触平面并归一化；若投影长度近零，则沿用上一稳定朝向或选取备用切向轴；
2. 用 Normal、Projected Forward 构造旋转；
3. Clamp 最大倾斜；
4. 按相位或接触权重 Slerp；
5. 必要时对法线轻度滤波。

---

## 骨盆、求解器与数据职责

### 25. Pelvis Compensation 的约束优化

Pelvis 不应简单追随地面高度。它的核心职责是让多个腿目标同时可达，并尽量少破坏原动画。

#### 25.1 一般形式

令骨盆修正为：

$$
\delta\mathbf p_P
$$

求：

$$
\delta\mathbf p_P^*
=
\arg\min_{\delta\mathbf p_P}
\left[
w_p
\|\delta\mathbf p_P\|^2
+
w_c
\|\delta\mathbf p_P-\delta\mathbf p_P^{\mathrm{prev}}\|^2
+
w_b
J_{\mathrm{balance}}
\right]
$$

下式中的 Foot Target、Hip 和骨盆修正必须取自**同一时刻、同一坐标空间**。若规划的是未来接触可达性，三者都取 $t_c$；若生成当前帧补偿，三者都取当前时刻。每条腿满足：

$$
\left\|
\mathbf p_{E,i}
-
\left(
\mathbf p_{H,i}
+
\delta\mathbf p_P
\right)
\right\|
\le
L_i
$$

并限制骨盆移动：

$$
\delta\mathbf p_{\min}
\le
\delta\mathbf p_P
\le
\delta\mathbf p_{\max}
$$

#### 25.2 只优化竖直方向的闭式区间

仅优化骨盆竖直位移时，可令：

$$
\delta\mathbf p_P
=
\delta z\,\mathbf u
$$

对第 $i$ 条腿，定义 Hip 到目标的水平距离：

$$
\rho_i
=
\left\|
\operatorname{Proj}_{\mathbf u^\perp}
\left(
\mathbf p_{E,i}
-
\mathbf p_{H,i}
\right)
\right\|
$$

竖直差：

$$
d_i
=
\left(
\mathbf p_{E,i}
-
\mathbf p_{H,i}
\right)
\cdot\mathbf u
$$

可达约束：

$$
\rho_i^2
+
\left(
d_i-\delta z
\right)^2
\le
L_i^2
$$

若：

$$
\rho_i>L_i
$$

仅靠竖直骨盆修正无法使该腿可达。

否则：

$$
\delta z
\in
\left[
d_i-\sqrt{L_i^2-\rho_i^2},
\;
d_i+\sqrt{L_i^2-\rho_i^2}
\right]
$$

左右腿和骨盆限制共同形成区间交集：

$$
\mathcal I
=
\mathcal I_L
\cap
\mathcal I_R
\cap
\mathcal I_{\mathrm{pelvis}}
$$

若 $\mathcal I$ 非空，选择最接近零的修正：

$$
\delta z^*
=
\operatorname{Proj}_{\mathcal I}(0)
$$

这给出了一个无需迭代优化器的双腿骨盆**球形可达上界**。它没有编码最小伸展、膝盖弯曲方向、骨盆旋转和双脚朝向，因此非空区间不保证最终 IK 一定有解。

若区间为空，说明约束互相冲突，系统必须按优先级放松：

- 降低某只脚的 Position Alpha；
- 允许有限腿部拉伸；
- 调整接触点；
- 引入水平骨盆或角色根控制器修正；
- 放弃低置信度接触。

---

### 26. 最终 Pose Solver 的优化形式

给定一个或多个 Effector Target，Solver 可以抽象为：

$$
\mathbf q^*
=
\arg\min_{\mathbf q}
\left[
\sum_i
w_{p,i}
\left\|
\mathbf p_i(\mathbf q)
-
\mathbf p_{i,\mathrm{target}}
\right\|^2
+
\sum_i
w_{r,i}
d_R^2
\left(
R_i(\mathbf q),
R_{i,\mathrm{target}}
\right)
+
w_{\mathrm{pose}}
\left\|
\mathbf q-\mathbf q_{\mathrm{source}}
\right\|_W^2
\right]
$$

约束包括：

$$
\mathbf q_{\min}
\le
\mathbf q
\le
\mathbf q_{\max}
$$

以及关节刚度、首选角度和骨骼长度等。

预测 IK Planner 输出：

- Target Transform；
- Position Alpha；
- Rotation Alpha；
- Contact State；
- Normal；
- 可选 Pelvis Hint。

Solver 决定骨架怎样满足这些约束。

如果实现目标是可替换的接触 Planner，接口可以只输出目标、权重和状态，由用户在 Control Rig 中选择 Two Bone IK、FBIK、PBIK 或其他 Solver。这个解耦是架构选择，并非由优化公式单独推出的必然结论。

---

### 27. Control Rig 的合理职责

Control Rig 适合：

- 读取当前 Pre-IK 骨骼；
- 调用或承载轻量预测节点；
- 接收 Query 结果；
- 可视化 Source、Prediction、Candidate 和 Target；
- 将目标连接到任意 Solver；
- 处理最终脚掌朝向、膝盖引导和骨盆。

不应默认要求 Control Rig 负责：

- 生成 Gameplay 移动轨迹；
- 管理 Mover 生命周期；
- 复制或网络预测；
- 构建复杂跨角色缓存；
- 决定项目移动模型。

如果插件定位为 Control Rig 节点集合，可以让用户提供必要的 Future Mesh Component Transform 和相位数据；但节点仍应拥有其算法所必需的历史和接触状态。

---

## 实现、调试与迭代

### 28. 一帧的推荐执行顺序

~~~text
1. Read Pre-IK Source Pose
2. Validate time and detect discontinuity
3. Update Source history
4. Read Foot Phase and TTC
5. Sample Future Mesh Component Trajectory
6. Predict Future Component-Space Limb Motion
7. Compose Future Effector World Transform
8. Generate environment query
9. Build contact candidates
10. Apply hard constraints
11. Evaluate soft objective
12. Select candidate
13. Update hybrid contact state
14. Commit or cancel
15. Update surface-relative lock
16. Build current-frame correction target
17. Compute optional pelvis feasible interval
18. Send targets and weights to Pose Solver
19. Record debug and prediction error data
~~~

顺序中的关键点：

- 必须先读 Source，再运行相关 Solver；
- Candidate Selection 先于 Commit；
- Commit 先于 Lock；
- Future Anchor 必须先转为 Current-frame Target；
- Solver 不反向污染下一帧 Source。

---

### 29. 状态、纯函数和数据所有权

#### 29.1 适合纯函数

- Transform 组合；
- 轨迹插值；
- 平面投影；
- 未来脚预测；
- 坡度和 Reach 计算；
- Candidate 代价；
- Orientation 构造；
- Pelvis 可行区间。

#### 29.2 必须持有状态

- 上一帧 Pre-IK Source；
- 滤波速度；
- Candidate 稳定时间；
- Committed Candidate；
- Commit 计时；
- Contact State；
- Surface-relative Anchor；
- Release 进度；
- Reset Generation；
- 预测误差历史。

#### 29.3 每个量必须回答四个问题

1. 它属于哪个空间？
2. 它属于哪个时间？
3. 它来自 Source Pose 还是 Solved Pose？
4. 谁持有并更新它？

推荐命名：

~~~text
SourceFootCS
SourceFootWS
PredictedFootCS
PredictedFootWS
TrajectorySourceWS
MeshComponentWS
MeshRelativeToTrajectorySource
AnchorSurfaceLocal
TargetRigGlobal
~~~

---

### 30. Reset 与不连续事件

必须 Reset：

- 第一帧；
- Teleport；
- Respawn；
- Hierarchy 或 Mesh 替换；
- 动画重新初始化；
- Sample Time 倒退；
- 帧间隔过大；
- Movement Body 或 Mesh Component Transform 突跳；
- 移动模式发生不连续变化；
- 网络大幅校正；
- 重力或参考系语义切换。

Reset 应清除：

- 速度历史；
- 滤波器；
- Candidate；
- Commit；
- Lock；
- Surface 引用；
- Release 状态；
- 预测误差队列。

如果 Predictor 自己发现 Hierarchy 或 Source 不连续，必须把这个事件传播到 Contact State，不能只清空 Predictor 内部速度。

---

### 31. Debug 与定量评价

#### 31.1 可视化完整因果链

至少显示：

- Pre-IK Source；
- 原始和滤波速度；
- Phase 与 TTC；
- Future Mesh Component Transform；
- Future Component-Space Foot；
- Predicted Foot WS；
- Query Volume；
- 原始 Hit；
- 被拒绝 Candidate 和 Reject Reason；
- 候选代价分项；
- Selected Candidate；
- Committed Anchor；
- Surface-relative Anchor；
- Current Solver Target；
- Contact State；
- Reachability Sphere；
- Pelvis 可行区间。

#### 31.2 成熟预测误差

在 $t_0$ 预测 $t_0+h$：

$$
\widehat{\mathbf p}
\left(
t_0+h
\mid
t_0
\right)
$$

到达该时刻后比较真实 Pre-IK Source：

$$
E_{\mathrm{prediction}}
=
\left\|
\widehat{\mathbf p}
\left(
t_0+h
\mid
t_0
\right)
-
\mathbf p_{\mathrm{source}}
\left(
t_0+h
\right)
\right\|
$$

不能与 Solved Foot 比较，否则会把 IK 强行到达目标误认为预测准确。

#### 31.3 接触误差

$$
E_{\mathrm{contact}}(t)
=
\left\|
\mathbf p_{\mathrm{foot,solved}}^W(t)
-
\mathbf p_A^W(t)
\right\|
$$

它评价 Solver 和目标应用，不等于预测误差。

#### 31.4 连续性

直接比较相邻帧的世界目标位置会把角色正常移动也算作跳变。应先减去同帧 Source Pose，再比较相邻帧的**修正量**：

$$
\delta\mathbf p_n
=
\mathbf p_{\mathrm{target},n}^W
-
\mathbf p_{\mathrm{source},n}^W
$$

$$
E_{\mathrm{jump}}
=
\left\|
\delta\mathbf p_n-\delta\mathbf p_{n-1}
\right\|
$$

若需要比较不同帧率，再将相邻修正差除以采样间隔；接触锁定阶段也可以改在 Surface Local Space 中评估漂移。

#### 31.5 统计

按动作和地形分类统计：

- Mean；
- Median；
- P95；
- Max；
- Commit Failure Rate；
- Lock Drift；
- Candidate Rejection 分布。

这样才能判断增加轨迹、Phase Weight 或复杂优化是否真的改善系统。

---

### 32. LOD 与计算预算

| LOD | 推荐能力 |
|---|---|
| LOD 0 | 完整轨迹、多个候选、状态机、Surface Lock、全身 Solver |
| LOD 1 | 单候选、简化评分、Surface Lock、腿部或全身 Solver |
| LOD 2 | Foot WS 短时预测、单次 Sweep、简化 Solver |
| LOD 3 | Reactive Foot IK 或关闭 |

优化原则：

1. 先测量；
2. 在不可能接触的 Phase 降低 Query 频率；
3. Locked 状态不必持续搜索新接触；
4. 远处角色减少候选；
5. 再考虑错帧、批处理或异步查询。

LOD 切换必须平滑并清理不再合法的状态。

---

### 33. 推荐实现路线

#### Phase 1：Reactive 基线

- Pre-IK Bone Source；
- 当前地面 Query；
- Candidate Validation；
- 任意 Solver；
- 坐标空间 Debug。

#### Phase 2：Short Horizon

- Foot WS Velocity；
- TTC；
- 平面预测；
- 成熟预测误差。

#### Phase 3：Hybrid Contact State

- Candidate；
- Stable Time；
- Commit；
- Commit Timeout；
- Plant；
- Release。

#### Phase 4：Current-frame Correction

- 未来 Anchor；
- 终端环境误差；
- Phase-aware 修正；
- 位置和旋转独立权重。

#### Phase 5：Future Mesh Component Transform × Component-Space Limb Motion

- Mesh Component 轨迹采样；
- Component-Space Foot 预测；
- 转向和急停测试；
- 与 Foot WS 基线比较。

#### Phase 6：Constraint Planning

- 硬约束；
- 归一化软代价；
- 多候选；
- 支撑面积；
- Candidate 代价 Debug。

#### Phase 7：Moving Surface 与 Pelvis

- Surface-relative Lock；
- 双腿骨盆可行区间；
- 冲突约束降级。

#### Phase 8：商业完善

- LOD；
- 网络校正；
- Error Statistics；
- Profile；
- Debug Commands；
- 特殊步态和任意重力。

每个阶段必须先有误差证据，再增加下一层复杂度。

---

## 结论与参考

### 34. 结论与检查表

预测式 Foot IK 是短时域的**混合接触规划**：连续量描述脚、轨迹和表面，离散状态描述候选、承诺、着地与释放。前文的候选枚举和相位权重属于低成本近似；只有显式优化未来多帧控制序列时，才应称为完整的模型预测控制（MPC）。

落地时依次检查：

1. 预测输入是否来自同一时刻、同一空间的 Pre-IK Source Pose？
2. TTC 在着地后是否归零，并与动画相位和实际播放速率一致？
3. 未来 Mesh Component 与未来 Component-Space 肢体运动是否分开？
4. 环境查询能否产生并验证多个候选，且每个候选记录表面身份和采样时刻？
5. Candidate、Commit、Contact 与 Lock 是否具有清楚的切换和失败退出条件？
6. 未来锚点是否先转成当前帧渐进目标，移动表面是否保存在自身局部空间？
7. 预测、规划、Solver 和 Lock 的误差能否分别测量？

从反应式基线开始，只有测到相应误差后才增加轨迹、相位、多候选或更复杂的优化。

---

### 35. 官方参考

- [Control Rig 概览](https://dev.epicgames.com/documentation/unreal-engine/control-rig-in-unreal-engine)
- [Control Rig Full Body IK](https://dev.epicgames.com/documentation/unreal-engine/control-rig-full-body-ik-in-unreal-engine)
- [Full Body IK 节点参考](https://dev.epicgames.com/documentation/unreal-engine/node-reference/ControlRig/FullBodyIK)
- [Sphere Trace By Trace Channel 节点参考](https://dev.epicgames.com/documentation/unreal-engine/node-reference/ControlRig/SphereTraceByTraceChannel?lang=en-US)
- [IK Rig](https://dev.epicgames.com/documentation/unreal-engine/ik-rig-in-unreal-engine)
- [Motion Trajectory API](https://dev.epicgames.com/documentation/unreal-engine/API/PluginIndex/MotionTrajectory)
- [Mover：Get Predicted Trajectory](https://dev.epicgames.com/documentation/unreal-engine/BlueprintAPI/Mover/GetPredictedTrajectory)
- [Control Rig：From World](https://dev.epicgames.com/documentation/en-us/unreal-engine/node-reference/ControlRig/FromWorld)
