---
title: AircraftLab：四旋翼动力学、轨迹规划与飞行控制
excerpt: 从牛顿—欧拉方程推导四旋翼的推力与姿态，再用源码和算例解释路径拟合、时间参数化、MPCC、串级 PID、旋翼分配及 Dataflow 路线预演。
date: '2026-10-13'
category: Physics
subtopic: FlightController
tags:
  - 飞控
  - Chaos
  - Autopilot
  - PID
  - MPCC
readTime: 阅读约40分钟
kind: source
level: advanced
pageType: source-analysis
aliases:
  - AircraftLab
  - 无人机飞控
  - Flight Controller
  - MPCC
prerequisites:
  - quadcopter-basics-interactive
  - classical-mechanics
  - differential-equations
  - iterative-linear-solvers
nextArticles: []
related: []
sources:
  - title: Geometric Tracking Control of a Quadrotor UAV on SE(3)
    url: https://mleok.science/LeLeMc2010_quadrotor.html
  - title: Minimum Snap Trajectory Generation and Control for Quadrotors
    url: https://doi.org/10.1109/ICRA.2011.5980409
  - title: Model Predictive Contouring Control for Time-Optimal Quadrotor Flight
    url: https://arxiv.org/abs/2108.13205
featured: true
---

给四旋翼三个航点，为什么机体往往会在转弯前就减速，越过拐角时又偏离航线？两种现象分别出现在闭环的不同位置。规划器预先估算转向和制动需要的距离。飞控根据误差调整推力方向，而姿态、转速和速度都要经过一段时间才能改变。把输入折线、计划轨迹和仿真飞行轨迹叠在一起，才能看出偏差从哪里产生。

本文以 AircraftLab 的 GASP57 源码为依据。推导采用右手坐标系和国际单位，数值算例采用便于复算的模型参数。阅读源码时，以各接口实际使用的坐标、单位和生效配置为准。

## 从意图到 Chaos 的完整执行链

~~~text
运动意图和当前能力 → 空间路径与计划 → 当前控制步的飞行参考
                              ↑                     ↓
                         状态与进度     位置/速度/姿态/角速度控制
                              ↑                     ↓
                           质心状态 ← Chaos ← 旋翼与电机 ← 控制分配
~~~

**运动意图**声明保持位置、保持速度、沿航点飞行、绕飞或跟踪外部时间轨迹。**运动计划**保存该任务需要的路径和时间化样本。**飞行参考**随控制步更新，给出此刻使用的位置、速度、加速度和航向。**仿真状态**来自正在执行的后端，包含质心位置、速度和机体姿态。

`FAircraftReferenceGenerator` 持有 `FAircraftMotionPlan`，由 `FAircraftTimedReferenceStrategy` 推进参考，并在允许的后端调用可选预测控制器。引用旧版文档时，应留意 Reactive 前视策略属于历史实现。当前 `SetIntent` 创建的是 Timed 策略，但不同意图仍走不同分支。`Route` 和 `Orbit` 构建空间路径及速度剖面，`TimedTrajectory` 使用外部提供的时间样本，`Velocity` 在线更新速度参考，`Hold` 根据当前状态与指定目标构建保持计划。

参考带有意图编号、版本和有效时间。生成器核对这些字段并验证数值有限性，再把参考交给后端。这样修改路线、暂停后恢复或切换飞行配置时，可以判断一条参考属于哪次命令。调用顺序见 `AircraftReferenceGenerator.cpp` 的 `SetIntent` 和 `Update`，各意图的分派见 `AircraftTimedReferencePolicy.cpp` 的 `BuildMotionPlan`。

## 坐标、单位和动力学边界

### 从质心平动和角动量出发

用 $p,v$ 表示世界坐标的质心位置和速度，$R$ 把机体系向量转到世界系，$e_3$ 为世界竖直上方向。$I$ 是关于质心、以机体系表达的惯量张量，$\omega$ 是机体角速度。单桨推力轴为 $d_i$，推力大小为 $T_i$，相对质心的安装位置为 $r_i$。

$$
\begin{aligned}
\dot p &= v,\\
m\dot v &= R\sum_i T_i d_i - mg e_3 + F_{\mathrm{ext}},\\
\dot R &= R[\omega]_\times,\\
I\dot\omega
 &= \sum_i \tau_i+\tau_{\mathrm{ext}}-\omega\times I\omega.
\end{aligned}
$$

$[\omega]_\times x=\omega\times x$。转动方程来自机体系角动量 $H_B=I\omega$。因为机体系本身在旋转，惯性观察者看到的角动量变化等于 $R(\dot H_B+\omega\times H_B)$。把外部力矩转回机体系，移项就得到上式。最后一项在旋转轴与角动量不平行时耦合三个转轴。四旋翼的模型与姿态控制也可参考 Lee 等在 $SE(3)$ 上的推导，阅读时需对齐其推力和竖直轴符号。 [Lee、Leok、McClamroch，Geometric Tracking Control of a Quadrotor UAV on SE(3)][se3]

以平行旋翼简化，机体总推力 $T=\sum_i T_i$ 沿当前机体上轴，世界推力为 $TRe_3$。力矩可以改变姿态，但同一帧的桨推力方向仍由当前姿态决定。横移要经历「产生俯仰或滚转力矩 → 倾转 → 竖直推力的一部分变成水平分量」。这一过程解释了外环跟踪中的延迟。

### 模型轴、控制轴与单位

网格的局部轴可以与飞控的前向、右向、上向有固定偏置。`AircraftFrameBinding` 负责模型、刚体和控制方向之间的转换。检查滚转或偏航符号时，应在同一坐标系比较旋翼产生的力矩与实测角速度。改变网格导入朝向或质心后，同一旋翼在分配矩阵中的列也可能变化。

AircraftLab 的位置、速度和加速度接口使用厘米、厘米每秒和厘米每二次方秒。旋翼推力、力矩与惯量计算使用 N、N·m 和 kg·m²。力臂进入叉乘前按米表达，向厘米制 Chaos 施力时再用 `AircraftPhysicsUnits` 转换。$1\,\mathrm{N}$ 对应 $100\,\mathrm{kg\,cm/s^2}$，$1\,\mathrm{N\,m}$ 对应 $10\,000\,\mathrm{kg\,cm^2/s^2}$。姿态通道里的度和度每秒还要与动力学中的弧度对齐。

### 实时能力参与参考计算

定高、无风时，推力要同时承担重力和平动所需的水平力。把推力长度和最大倾角分别写成约束，就能得到直飞加速的物理上限。

$$
\begin{aligned}
T\cos\theta &= mg,\\
T\sin\theta &= ma_h,\\
a_{h,\mathrm{tilt}} &= g\tan\theta_{\max},\\
a_{h,\mathrm{thrust}} &= \sqrt{(T_{\max}/m)^2-g^2},\\
a_h &\le \min(a_{h,\mathrm{tilt}}, a_{h,\mathrm{thrust}}).
\end{aligned}
$$

这里要求 $T_{\max}\ge mg$。若达不到这一条件，模型中的定高状态本身不可达。以 $m=1.5\,\mathrm{kg}$、$T_{\max}=24\,\mathrm N$、$\theta_{\max}=30^\circ$ 为例，两个上界分别约为 $5.66$ 和 $12.64\,\mathrm{m/s^2}$，因此这个算例先碰到倾角限制。悬停约需 $14.72\,\mathrm N$。倾斜 $30^\circ$ 后为了定高约需 $16.99\,\mathrm N$，留给其他动作的推力裕量随之减少。

实际能力快照还要考虑当前最大爬升与下降速度、水平制动力、角速度、阻力、可用力矩和电机响应。上升时，上式中的竖直项应换成所需的竖直推力加速度。速度高时还要为阻力补偿留出余量。任务约束限定想让飞机多快，能力快照限定当前后端可支持多快。

## 飞行参考如何生成

### Timed 空间路径与时间参数化

#### 航点拟合、连续性与弧长

`FAircraftSpatialPath::Build` 先过滤过近的相邻点，再沿输入折线重采样。固定开路径的首尾，对内点做有限次平滑。平滑的三种目标分别把点拉向重采样中心线、相邻两点的平均值和近似满足四阶差分为零的位置。以同一采样步长的一维分量为例，四阶差分为

$$
\begin{aligned}
\Delta^4 q_i
 &= q_{i-2}-4q_{i-1}+6q_i-4q_{i+1}+q_{i+2},\\
q_{i,\mathrm{snap}}
 &= \frac{-q_{i-2}+4q_{i-1}+4q_{i+1}-q_{i+2}}{6}.
\end{aligned}
$$

第二式由令第一式等于零得到。实现把三个目标按配置权重取平均，一整轮读取旧结点、写入新结点，到位移容差或迭代预算时停止。这里的高阶差分沿空间结点索引计算。对时间轨迹最小化 $\int\|d^4p/dt^4\|^2\,dt$ 是另一种规划问题，可以用 Mellinger 与 Kumar 的原文理解两类目标的差别。 [Mellinger、Kumar，Minimum Snap Trajectory Generation and Control for Quadrotors][minimum-snap]

平滑后，每段用局部参数 $u\in[0,1]$ 的五次多项式 $C(u)$ 连接两个结点。两端位置、一阶导数、二阶导数共给出六项条件，恰好确定六个向量系数。前半段的系数 $c_0,c_1,c_2$ 分别由起点位置、一阶导数和二阶导数的一半确定。令 $d_0,d_1,d_2$ 为在 $u=1$ 处这三个已知项与终点条件的差，剩下的线性方程为

$$
\begin{aligned}
c_3+c_4+c_5 &= d_0,\\
3c_3+4c_4+5c_5 &= d_1,\\
6c_3+12c_4+20c_5 &= d_2.
\end{aligned}
$$

下面是 `AircraftSpatialPath.cpp` 中用于求剩余系数的源码片段，`C0/C1/C2` 对应上面的 $d_0/d_1/d_2$。

~~~cpp
Segment.Coefficients[3] = 10.0 * C0 - 4.0 * C1 + 0.5 * C2;
Segment.Coefficients[4] = -15.0 * C0 + 7.0 * C1 - C2;
Segment.Coefficients[5] = 6.0 * C0 - 3.0 * C1 + 0.5 * C2;
~~~

相邻段共享结点处的一阶、二阶导数。光滑性仍取决于导数是否退化和采样是否足够。算法在每段把相邻小样本间的弦长累加起来建立弧长表，查询时用它近似求 $s\mapsto u$。由 $ds/du=\|C'(u)\|$ 与链式法则可推导曲率向量。设 $a=C'(u)$、$b=C''(u)$，则

$$
\begin{aligned}
\hat t &= \frac{a}{\|a\|},\\
\boldsymbol\kappa
 &= \frac{d\hat t}{ds}
  = \frac{b-\hat t(\hat t^\mathsf{T} b)}{\|a\|^2}.
\end{aligned}
$$

分子去掉了 $b$ 沿切线的分量，分母把对 $u$ 的导数换成对距离的导数。只有平滑后的曲线才具有这样的局部曲率。输入折线在拐角处的切向有跳变。几何平滑可能切进拐角内侧，曲率连续性也不给出场景净空保证。

#### 由曲率和制动约束得到速度剖面

记弧长路径为 $q(s)$，沿路径的标量速度为 $v_s=\dot s$。这时 $q'(s)=\hat t$。把 $p(t)=q(s(t))$ 对时间求导两次，有

$$
\begin{aligned}
v &= \hat t\,v_s,\\
a &= \hat t\,\dot v_s+\boldsymbol\kappa v_s^2,\\
v_s &\le \sqrt{a_{n,\max}/\|\boldsymbol\kappa\|}
\quad (\|\boldsymbol\kappa\|>0).
\end{aligned}
$$

切向项改变速度大小，法向项弯折速度方向。半径 $4\,\mathrm m$ 的弯道在法向加速度预算 $2\,\mathrm{m/s^2}$ 下，可得到 $v_s\le\sqrt{8}\approx2.83\,\mathrm{m/s}$。斜向路径还要根据 $\hat t$ 的水平和竖直分量折算爬升或下降速度约束。航向随路径变化时，相邻位置的航向差还会吃掉时间预算。运行时综合巡航、曲率、航向、阻力和能力储备，先给每个路径样本设速度上界。

接着把 $\dot v_s=v_s\,dv_s/ds$ 在相邻样本的 $\Delta s$ 上积分，以分段常加速度近似推出

$$
\begin{aligned}
v_{i+1}^2 &\le v_i^2 + 2a_{\mathrm{acc}}\Delta s,\\
v_i^2 &\le v_{i+1}^2 + 2a_{\mathrm{brake}}\Delta s,\\
\Delta t_i &\approx \frac{2\Delta s}{v_i+v_{i+1}}.
\end{aligned}
$$

正向扫描限制起步或出弯加速，反向扫描把终点或弯中的低速要求向前传递。第三式来自常加速时的平均速度，要求两端速度和为正。实现为近零速度和的路段单独估算时间，并继续做双向 jerk 传播，以压低需要过快改变切向加速度的速度样本。最终加速度包含切向项和曲率项，计划按累计时间发布。见 `FAircraftTimedReferencePolicy::BuildSpatialPlan`。

**复算一条简化直线。** 在 $0,2,4,6\,\mathrm m$ 处采样，首尾都设为静止，加速和制动上界均为 $1\,\mathrm{m/s^2}$，巡航上界为 $3\,\mathrm{m/s}$。只做正向传播时，两个内部样本的速度上界分别为 $2$ 和 $\sqrt8$。从终点反向传播后，距末端 $2\,\mathrm m$ 的样本降到 $2\,\mathrm{m/s}$，得到速度剖面 $(0,2,2,0)$。三段分别为 $2,1,2\,\mathrm s$，总计 $5\,\mathrm s$。这是恒加速度包络的结果，加入 jerk、响应延迟或推力裕量后，实际计划会再调整。

### 路径投影、进度和速度意图

飞机位置 $p$ 很少恰好落在曲线上。空间路径查询需要找一个附近的弧长 $s^\star$，使距离误差平方尽可能小。

$$
\begin{aligned}
f(s) &= \tfrac12\|q(s)-p\|^2,\\
f'(s) &= (q(s)-p)^\mathsf{T}\hat t(s),\\
s_{\mathrm{new}} &\approx s+(p-q(s))^\mathsf{T}\hat t(s).
\end{aligned}
$$

第三式可以理解为在当前位置把曲线暂时当直线，沿切线做一次投影。`FAircraftSpatialPath::Project` 先在指定搜索区间离散找最低距离点，再做有限次投影迭代，每次截回搜索区间。局部搜索依赖已有进度，可以减少航线交叉时直接跳到较近的另一条曲线分支。新任务或需要重新定位时，可使用全局搜索。闭合路径还要处理一圈末尾与下一圈开头的连续性。

`Velocity` 则不依赖空间投影。它对速度目标做在线整形，把所需加速度限制到可用加速度与 jerk 内，再积分得到新的速度参考。一维简式为 $|a_{k+1}-a_k|\le j_{\max}h$、$v_{k+1}=v_k+h a_{k+1}$。真实实现要同时限制水平模长、竖直分量、相对上一帧的变化和制动余量。例如水平两轴均为 $2\,\mathrm{m/s}$ 时，合速度为 $2.83\,\mathrm{m/s}$。限为 $2.5\,\mathrm{m/s}$ 时，应沿原方向把两轴按比例缩到约 $1.77\,\mathrm{m/s}$。

### 参考时钟和推进限幅

实际飞机落后时，一味以原计划速度推进参考，会让参考点越走越远。Timed 策略结合路径投影、跟踪状态和能力调整参考时钟的推进。令计划内部时间为 $\sigma(t)$，推进倍率为 $u=d\sigma/dt$。位置仍由原计划的 $p_{\mathrm{plan}}(\sigma)$ 给出，导数需按当前时钟重算。

$$
\begin{aligned}
v_r &= v_{\mathrm{plan}}(\sigma)\,u,\\
a_r &= a_{\mathrm{plan}}(\sigma)\,u^2
      + v_{\mathrm{plan}}(\sigma)\,\dot u.
\end{aligned}
$$

若 $u=0.5$ 并保持不变，参考速度减半，参考加速度缩到四分之一。若正在减慢时钟，$\dot u$ 还会产生沿计划速度方向的减速项。有一条标称速度为 $2\,\mathrm{m/s}$ 的匀速参考，此时若 $u=0.5$ 且 $\dot u=-0.2\,\mathrm{s^{-1}}$，该项给出 $-0.4\,\mathrm{m/s^2}$。因此仅给速度乘倍率会破坏位置、速度与加速度的一致性。

### Stop 与 PassThrough

理想的一维匀减速停车距离为 $v^2/(2b)$，$b>0$ 为减速度大小。如果姿态与旋翼需要 $t_d$ 才能建立减速度，可以先估算一段近似匀速延迟，得到

$$
\begin{aligned}
d_{\mathrm{stop}} &\approx v\,t_d+\frac{v^2}{2b},\\
v_{\mathrm{stop}}(d)
 &\approx \sqrt{(bt_d)^2+2bd}-bt_d.
\end{aligned}
$$

第二式是把剩余距离给定后解二次方程的非负根。若 $v=4\,\mathrm{m/s}$、$b=2\,\mathrm{m/s^2}$、$t_d=0.25\,\mathrm s$，需要约 $5\,\mathrm m$，其中 $1\,\mathrm m$ 用在响应延迟上。AircraftLab 根据切向在水平和竖直上的分量选择有效制动和 jerk，再结合响应时间收紧开路线的 Stop 速度包络。

`Stop` 要求末端参考减速，并进入终点收敛。任务完成还取决于实测位置、速度和完成策略。`PassThrough` 可以指定终端水平和竖直速度，经终端切线折算后保留可实现的沿程速度。到达最后一个计划样本和实测飞机满足到达条件是两个时刻，检查时需要分别记录。

## MPCC 风格预测跟踪

计划解决「在哪里、什么时候、以多快的速度通过」。预测跟踪从实际状态出发，处理有限的执行响应和即将到来的偏差。AircraftLab 的 `FAircraftMpccController` 以给定参考样本和切线为条件，优化未来各步的加速度修正。经典 MPCC 可以把路径进度一并纳入优化，并用进度收益和跟踪误差折中。这里的进度由上游参考策略管理，所以本文沿用「MPCC 风格预测跟踪」。 [Romero 等，Model Predictive Contouring Control for Time-Optimal Quadrotor Flight][mpcc]

### 预测模型

优化输入包括当前 $p_0,v_0,a_0$、能力快照、各步 $p_{r,k},v_{r,k},a_{r,k}$ 和切线。第 $k$ 步先把候选修正 $\delta a_k$ 加到参考加速度上，再考虑速度、jerk、倾角、总推力及阻力补偿，形成可用的命令 $a_k^c$。一个分量的一阶响应模型为

$$
\begin{aligned}
\beta_k &= 1-e^{-h/\tau_k},\\
a_{k+1} &= (1-\beta_k)a_k+\beta_k a_k^c,\\
v_{k+1} &= v_k+h a_{k+1},\\
p_{k+1} &= p_k+h v_k+\tfrac12 h^2a_{k+1}.
\end{aligned}
$$

$\tau_k$ 可随增推力和减推力选用不同值，水平方向还计入姿态响应时间。实现 `RolloutHorizon` 用这个简化模型快速展开多个未来步。预测模型以平移状态为主，执行仿真还会逐子步更新姿态、旋翼和接触。

### 代价函数

令 $e_{p,k}=p_k-p_{r,k}$，$\hat t_k$ 为参考切线，并记 $e_{v,k}=v_k-v_{r,k}$。沿程误差和横向误差分别是切线投影和余量。

$$
\begin{aligned}
e_{\parallel,k} &= \hat t_k(\hat t_k^\mathsf{T}e_{p,k}),\\
e_{\perp,k} &= e_{p,k}-e_{\parallel,k}.
\end{aligned}
$$

直线参考沿 $X$ 轴时，若位置差为 $(0.6,0.3,0.4)\,\mathrm m$，沿程向量为 $(0.6,0,0)\,\mathrm m$，横向误差的模为 $0.5\,\mathrm m$。两者的物理含义不同。沿程偏大表示飞机落后或超前，横向偏大表示飞离曲线。

$$
\begin{aligned}
J_p &= \sum_k \big(w_c\|e_{\perp,k}\|^2
                     +w_l\|e_{\parallel,k}\|^2\big),\\
J_v &= \sum_k w_v\|e_{v,k}\|^2,\\
J_a &= \sum_k \big(w_a\|\delta a_k\|^2
                     +w_r\|a_k^c\|^2\big),\\
J_j &= \sum_k w_j\|a_k^c-a_{k-1}^c\|^2,\\
J &= J_p+J_v+J_a+J_j+J_{\mathrm{terminal}}.
\end{aligned}
$$

终端项在预测末步加重位置和速度误差。$J_a$ 限制相对计划的修正，也惩罚大的命令幅度。$J_j$ 惩罚一个离散步内的命令差，约束投影另外处理可允许的变化率。相同参数只有在长度单位、时域采样和权重定义一致时才可比较。

### 求解策略和预算

求解器从上次移位过的修正序列或零序列开始。每轮先正向滚动预测，再从末步反向累计误差对每步加速度的影响。例如一个加速度变化会给下一步速度贡献 $h\,\delta a$，给下一步位置贡献 $\tfrac12 h^2\delta a$。因此若下一步状态的伴随量为 $\lambda_v,\lambda_p,\lambda_a$，这一段对命令加速度的近似梯度贡献为

$$
g_a \approx \beta_k\left(\lambda_a
       + h\lambda_v+\tfrac12 h^2\lambda_p\right).
$$

把它与加速度、正则化和相邻命令差的梯度相加，再沿负梯度更新修正序列。投影和响应系数只在滚动时重新计算，局部梯度用于有限预算内的迭代。代价上升时回退到前一次序列。时间预算、最大迭代次数、代价改善和修正量都可结束求解。最终只发布近期控制修正，下一轮重新读状态。具体实现见 `AircraftMpccController.cpp` 的 `OptimizeControlHorizon` 与 `Solve`。

`AccelerationCmPerSecSq` 表示参考运动的导数，`ControlAccelerationCmPerSecSq` 携带求解和约束后的控制加速度，`DynamicsFeedForwardAccelerationCmPerSecSq` 表示阻力等补偿。修改飞控时要沿调用路径确认各字段怎样消费。把同一份阻力补偿在规划和飞控各加一次，会在本就合理的前馈上再推一把。

## 串级飞控

内层负责更快的角速度与姿态响应，外层根据较慢的位置与速度变化纠偏。用一条航线中间的跟踪点作为例子，位置偏差先产生速度修正，速度偏差再产生期望加速度。期望的水平方向决定倾转，垂直速度误差决定额外总距。最后三轴角速度误差生成力矩请求。

### 单环离散形式

令误差 $e_k=r_k-y_k$，步长为 $h$，$f_k$ 为参考前馈。一个受限跟踪 PID 的常用形式为

$$
\begin{aligned}
I_k^\star &= \operatorname{clip}(I_{k-1}+h e_k),\\
d_k^\star &= \dot r_k-(y_k-y_{k-1})/h,\\
d_k &= d_{k-1}+\alpha(d_k^\star-d_{k-1}),\\
u_k^\star &= K_p e_k+K_i I_k^\star+K_d d_k+K_{ff}f_k,\\
u_k &= \operatorname{clip}(u_k^\star).
\end{aligned}
$$

$\alpha$ 由滤波时间尺度和步长确定。已有参考导数时，用它与测量导数的差，可以在轨迹运动时提供导数反馈，同时避免把设定值的突变直接当成无限大的微分。$I$ 的单位是误差单位乘时间。位置环输出速度，速度环输出加速度或归一化总距修正，角速度环输出力矩需求。改变某一层的单位会同时改变该层增益的量纲。

### 水平位置环和速度环

在启用位置跟踪时，把位置误差的速度修正加入参考速度。

$$
\begin{aligned}
v_c &= v_r + \mathcal C_p(p_r-p),\\
a_c &= a_{\mathrm{ff}} + \mathcal C_v(v_c-v).
\end{aligned}
$$

速度意图直接给速度环参考，可以略过位置环。限幅按水平合成向量判断，避免 X 和 Y 分别到上限时，不经意地让合加速度达上限的 $\sqrt 2$ 倍。前馈用于满足弯道和变速本来就需要的加速度，反馈用于纠正实际状态与计划的差。

定高近似下 $\theta=\arctan(a_h/g)$。若水平参考加速度为 $2\,\mathrm{m/s^2}$，理想倾角约为 $11.5^\circ$。当当前机体仍是水平时，先由姿态环建立倾角，速度才开始跟上。这是理解「蓝线在转弯、绿线还向前」的第一步。

### 垂直环

高度误差转成竖直速度修正，垂直速度环在悬停总距 $c_h$ 的基础上调节。以悬停推力约为 $mg$ 的近似，竖直加速度前馈可按净加速度与支撑重力的比例计算。

$$
\begin{aligned}
c_{\mathrm{ff}} &= c_h\max(0,1+a_{z,\mathrm{ff}}/g),\\
c_{\mathrm{cmd}} &=
  \operatorname{clip}(c_{\mathrm{ff}}+\Delta c_v).
\end{aligned}
$$

$\Delta c_v$ 是速度反馈，$a_{z,\mathrm{ff}}$ 包含本环计划使用的竖直前馈。要求额外 $0.2g$ 的向上加速度时，前馈总距约为悬停的 $1.2$ 倍。倾转后还可按 $1/\cos\theta$ 补偿竖直投影，实际实现会保护除数和输出上界。当推力到达上限时，掉高可能来自物理能力不足，单独增大积分会进一步积累误差。

### 姿态参考和角速度环

数学上，可由所需世界推力 $f^\star=m(a_c+g e_3)-F_{\mathrm{ext,est}}$ 得到期望推力轴 $f^\star/\|f^\star\|$。航向条件给出绕该轴的定向。其退化情形包括所需推力近零，以及用于定向的航向与推力轴近乎平行，构造姿态时需要有可用的保持或备用方向。

AircraftLab 的姿态反馈优先处理倾转。设 $R$ 为当前姿态，$R_r$ 为目标姿态，先用最短旋转 $Q_{\mathrm{tilt}}$ 对齐两个上轴，再求剩余偏航。

$$
\begin{aligned}
R_{\mathrm{reduced}} &= Q_{\mathrm{tilt}}R,\\
R_{\mathrm{residual}} &= R_{\mathrm{reduced}}^{-1}R_r.
\end{aligned}
$$

在两个上轴对齐时，剩余旋转在约化姿态的局部坐标中绕上轴。`FlightControlSolver.cpp` 从剩余四元数计算偏航误差，按偏航权重和倾转误差合成控制轴的姿态误差。姿态环输出角速度修正，与参考角速度前馈合并。角速度反馈比较机体系目标与实测角速度，把力矩需求交给分配器。启用姿态参考动力学时，角速度、角加速度和角 jerk 还会约束目标姿态建立的过程。

### 饱和和积分回退

单环先处理自己的输出饱和。若积分继续把请求推向同一个已经夹紧的方向，可撤回本步积分。水平合加速度限幅或旋翼分配会在下游改变能够实现的控制量，这时可用跟踪回算或按饱和方向冻结积分。

$$
\Delta I_{\mathrm{track}}
  =\frac{K_{\mathrm{track}}h}{K_i}
      (u_{\mathrm{ach}}-u_{\mathrm{req}}).
$$

这里要求 $K_i>0$。回算除以 $K_i$，因为差值用的是输出单位，而积分状态的单位是误差乘时间。比如要求向前加速但倾角限制截掉一部分，$u_{\mathrm{ach}}-u_{\mathrm{req}}<0$，回算可释放同方向的积分。旋翼分配器发布正负方向的力矩饱和信息，角速度环据此判断是否应继续让该方向的积分增长。

## 控制分配：从 wrench 到旋翼

### 从单个旋翼推导分配矩阵

飞控的请求用四个通道表达，第一项是沿机体上轴的合推力，其余为滚转、俯仰和偏航力矩。令旋翼的可分配最大推力为 $T_{\max,i}$，分配比例为 $x_i\in[0,1]$，则 $T_i=T_{\max,i}x_i$。简化的旋翼力和力矩为

$$
\begin{aligned}
F_i &= d_i T_i,\\
\tau_i &= r_i\times(d_i T_i)
          +\sigma_i k_{\tau,i}\, d_iT_i.
\end{aligned}
$$

叉乘是偏离质心的推力形成的力矩。$\sigma_i=\pm1$ 表示反扭矩方向，$k_{\tau,i}$ 的单位为米，使 N 乘系数成为 N·m。把 $F_i$ 投影到上轴，把 $\tau_i$ 转换到控制轴，就得到旋翼对四维 wrench 的一列线性贡献。四桨同时工作时，$w=A x$。支持某方向力矩，既要求矩阵有该方向的权限，也要求当前还有足够的旋翼余量。

对称 X 形布局中，悬停推力近似均分。若每个桨的横向力臂为 $0.18\,\mathrm m$，正侧两桨各多给 $0.4\,\mathrm N$、负侧两桨各少给 $0.4\,\mathrm N$，合推力变化为零，滚转力矩变化约为 $4\times0.18\times0.4=0.288\,\mathrm{N\,m}$。这个算例把力臂定义为侧向坐标绝对值，并假设对称安装和交替旋向。

### 阻尼伪逆与饱和处理

将推力、力矩各通道按权限归一化成 $\bar A,\bar w$，使相同的数字误差对应各自权限上的相对误差。先暂时不考虑 $[0,1]$ 的约束，解带阻尼的最小二乘。

$$
\begin{aligned}
\min_x\quad &\|\bar A x-\bar w\|^2+\lambda^2\|x\|^2,\\
(\bar A^\mathsf{T}\bar A+\lambda^2 I)x
 &=\bar A^\mathsf{T}\bar w.
\end{aligned}
$$

令 $x=\bar A^\mathsf{T}y$，可以改成解四维系统 $(\bar A\bar A^\mathsf{T}+\lambda^2 I)y=\bar w$。旋翼数量可以变化，系统的行数仍为四。正的 $\lambda$ 降低病态小特征值对指令的放大，同时可能留下更多跟踪残差。

`ControlAllocator.cpp` 对严重越界的旋翼锁定边界。设已锁定集合为 $S$，剩下的自由旋翼为 $F$，下一轮改用残差目标

$$
\bar w_{\mathrm{free}}=\bar w-\bar A_S x_S.
$$

然后只用 $\bar A_F$ 做同样的阻尼求解，直到剩余候选均合法或已没有自由旋翼。这是一种逐步锁定的限幅求解，适用于每个子步的小规模分配。全局最优的有界最小二乘还需要完整的活动约束判定。诊断区分请求 wrench、静态分配估计能实现的 wrench 和实际转速所产生的 wrench，分别对应控制意图、权限不足和执行滞后。

## 旋翼、电机和气动力

### 从推力比例到实际推力

设 $c$ 为归一化的电机指令，$n$ 为 RPM。把电机指令曲线与转速平方模型串起来，可得

$$
\begin{aligned}
n_{\mathrm{target}}
 &= n_{\mathrm{idle}}+(n_{\max}-n_{\mathrm{idle}})c^\gamma,\\
T &= T_{\max}(n/n_{\max})^2.
\end{aligned}
$$

上式第一行用于非零有效指令，模型对零指令给出零目标转速。分配器输出的是推力比例。静态反解先取 $n/n_{\max}=\sqrt{x}$，再对指令曲线做逆映射。例如零怠速且 $\gamma=1$ 时，半推力需要约 $70.7\%$ 转速。半转速只给四分之一最大推力。

电机先按配置限制指令变化速率，再解一阶响应 $\dot n=(n_{\mathrm{target}}-n)/\tau$。在一步内目标恒定，剩余转速差乘 $e^{-h/\tau}$，源码在 `FAircraftRotorRuntimeState::Update` 中用等价的插值实现。

~~~cpp
const float ResponseAlpha = 1.0f - FMath::Exp(-DeltaTime / ResponseTime);
CurrentRpm = FMath::Lerp(CurrentRpm, TargetRpm, ResponseAlpha);
~~~

从静止把目标转速设到最大且忽略指令斜率时，经过一个时间常数会达到约 $63.2\%$ 的目标转速，但实际推力此时只有 $0.632^2\approx40.0\%$ 的目标推力。减速时间常数可以不同，因此刹停时的推力变化也不必和加速对称。

### 相对气流与刚体施力

气流速度用机体相对空气的速度表示。先把 $v_\mathrm{body}-v_\mathrm{air}$ 的世界向量转换到气动控制轴，记单轴分量为 $u_j$。线性和二次阻力可写为

$$
F_{\mathrm{drag},j}
 =-b_j u_j-\tfrac12\rho(C_D A)_j |u_j|u_j .
$$

两项都与相对运动方向相反。速度翻倍时，二次项增为四倍。静止悬停遇到横风时，地面速度为零，飞机仍要倾斜抵消风引起的力。启用显式气动时，要核对同一物理路径中原生阻尼的配置，避免把同一类阻力重复计入。代码入口见 `AircraftAerodynamics.cpp`。

逐旋翼后端从实际质心计算力臂，把力、力矩转到物理接口所要求的坐标和单位后交给 Chaos。接触、重力和这些作用共同推进刚体，下一物理步重新读取状态。该过程解释了为什么运动计划的曲线和仿真采样会出现偏差，即使两者起点和终点一致。

## 线程、后端与 Simulation LOD

Dataflow 把机架、旋翼、控制参数、规划参数和 LOD 配置编译成运行时模型。运行时游戏线程转发意图与配置，执行端以状态快照作为反馈，发布参考和诊断。同时用于编辑器的短时预测从已发布的数据读取当前状态。比较不同数据时，应对齐请求、计划和状态各自的版本与时间。

### 三个执行后端

- **FlightController** 在物理步走串级飞控、分配、旋翼和施力链路。预测修正启用且可用时，按独立调度更新。它可以表现倾转和电机的滞后。
- **PhysicsConstraint** 使用刚体的线性和角驱动。线性部分可以近似为受限的弹簧阻尼 $F\approx k(p_r-p)+c(v_r-v)$，实际响应取决于驱动模式、上限和 Chaos 求解。它没有逐旋翼转速这一层的动态。
- **Kinematic** 在游戏线程更新组件位姿，在启用相应碰撞模式时对位移做 Sweep。此时记录的位置取决于实际可执行的位移，碰撞响应与刚体受力后端不同。

### LOD 切换

同一任务在 LOD 切换后仍可有相同的航点定义，但是可用速度、制动和姿态响应会改变。Runtime 可以重建物理状态，也可按配置保留运动或进入过渡 Hold。用不同 LOD 的预览作对照时，应记录初始状态、后端、当前配置和任务是否被重新提交。否则绿色轨迹的差异无法只归因于同一个参数。

### Dataflow 的路线预演和短时预测

PathConfig 的示例面板展示指定参数下的几何拟合。Dataflow Simulation 中的 **Route Preview** 可输入世界坐标航点，预览 Actor 把这些点作为 `Route` 意图交给当前 LOD。按下 **Fly Route** 后，视口按数据来源显示三层。

- **黄色输入路线**连接用户提交的航点，便于观察几何拟合是否切弯。
- **蓝色计划轨迹**连接与当前路线匹配、由运行时发布的运动计划位置样本。样本带时间、速度和加速度。静态线条主要呈现空间形状，观察制动时还需要读取速度或时间数据。
- **绿色仿真轨迹**连接预览 Actor 从有效状态快照读到的质心位置。连续位置过近时跳过采样，历史长度也有上限。重新提交会清除旧记录，并从当时的预览状态执行。

上述路径在 `AAircraftDataflowPreviewActor::ApplyPreviewRoute`、`UpdatePreviewRoute` 和 `FAircraftDataflowSimulationVisualization::Draw` 中实现。预演是当前仿真条件下的一次闭环执行。换成 PIE 的关卡时，初始位姿、风、接触、引导输入、子步设置和 LOD 都可能改变结果。

`BuildTrajectoryPrediction` 是单独的调试预测。它从当前质心状态出发，使用可用的计划或引导采样，按有限加速度的速度模型向前积分。其位置更新用步前、步后速度的平均值。它适合观察短期运动趋势。MPCC 内部的滚动则用于选择近端控制修正。两类预测都早于未来的实际仿真，绿色线上的状态由预览世界已经执行的步骤给出。

## 用飞行现象定位误差

**转弯前就减速。** 先查看蓝色计划样本的速度剖面。曲率、可用法向加速度和制动包络可能已经决定要提前降速。若只有绿色轨迹在落后，继续检查参考时钟、切向误差、机体倾角和实际推力建立速率。

**黄色与蓝色在转角内侧分开。** 这是几何拟合与原始折线的差异。判断依据应是允许的偏移量和场景净空。若只有蓝色和绿色分离，就再比较滤波、外环、旋翼分配及实际状态。

**倾转时掉高度。** 对照竖直参考、总距请求、分配估计和转速产生的实际推力，计算 $T\cos\theta$ 是否足以支撑重力。请求已经饱和、分配余量不足和电机还未提速，会出现相似的轨迹形状，需要不同的证据区分。

**终点有明显余速或反冲。** 对照剩余距离、计划末端速度、实际减速度建立时间以及输出限幅发生的时刻。若计划已经提前减速，而机体一直追不上，问题可能在执行响应或当前能力。若解限后突然反向输出，进一步检查饱和方向和积分历史。验证完成条件时还需要实测位置、速度和稳定时间。

## 延伸查阅

- [四旋翼飞行原理：动力学与交互演示](/knowledge/quadcopter-basics-interactive/)
- [经典力学：牛顿、拉格朗日与哈密顿](/knowledge/classical-mechanics/)
- [刚体动力学](/knowledge/rigid-body-dynamics/)
- [常微分方程：状态、初值与动力系统](/knowledge/differential-equations/)
- [线性系统的迭代求解](/knowledge/iterative-linear-solvers/)
- [Jacobian 矩阵与局部线性化](/knowledge/jacobian-matrix/)

[se3]: https://mleok.science/LeLeMc2010_quadrotor.html
[minimum-snap]: https://doi.org/10.1109/ICRA.2011.5980409
[mpcc]: https://arxiv.org/abs/2108.13205
