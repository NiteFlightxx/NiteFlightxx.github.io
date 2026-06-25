---
title: "四轴无人机飞控的数学与物理原理"
excerpt: "基于 AircraftLab 插件源码，系统梳理四旋翼无人机从刚体动力学、旋翼空气动力学、级联 PID 控制到控制分配（混控）的完整数学链路与核心代码实现。"
date: "2026-06-25"
category: "Physics"
tags: ["无人机", "飞控", "PID", "数学", "C++"]
readTime: "阅读约35分钟"
---

> 本文基于 Unreal Engine 5 项目的 `AircraftLab` 插件源码（`FlightControllerComponent.cpp`、`AirscrewComponent.cpp`、`DroneTypes.h`）整理。该插件是实验性实现——所有飞控逻辑都集中在一个 `FlightControllerComponent` 里，刻意没有做框架拆分。因此本文不过多讨论工程结构，而是聚焦于**数学与物理原理本身**：每个公式从何而来、核心代码如何落地、各环节为何这样设计。
>
> 对象机型：四旋翼无人机（Quad X 布局）。四旋翼没有固定翼产生的升力，全部升力与控制力矩都来自四个旋翼的差速，因此对飞控的实时性与分配精度要求极高，是理解"控制理论如何变成可飞代码"的极佳样本。
>
> 📦 源码仓库（GitHub）：<https://github.com/NiteFlightxx/AircraftLab>

---

## 一、问题总览：四旋翼为何"天生不稳定"

固定翼飞机即使没有任何主动控制，由于机翼的气动恢复力矩，仍有静稳定性；而四旋翼是一个**欠驱动、强耦合、本质上不稳定**的系统：

- **欠驱动**：6 个自由度（三维位置 + 三轴姿态），但只有 4 个独立控制输入（总距油门 + 滚转/俯仰/偏航力矩）。
- **强耦合**：水平方向的移动**只能**靠倾斜机身来实现——要往前飞，必须先低头（俯仰），让旋翼推力产生水平分量。位置与姿态无法解耦。
- **本质不稳定**：任何姿态扰动若不主动修正，都会指数发散，旋翼的陀螺反扭矩和气动阻力都不足以稳定姿态。

这三条性质决定了四旋翼飞控的核心设计准则：**必须用快慢分层、逐级反馈的级联结构**，把"想去哪"这个慢目标，层层翻译成"电机转多快"这个快指令。本文将沿着这条翻译链自上而下展开。

---

## 二、坐标系、单位与符号约定

### 2.1 两套坐标系

飞控在两套坐标系间反复换算：

- **世界系（World / Navigation Frame）** $W$：固定参考系，位置、速度、期望航点都在此系下表达。UE 中默认 $Z$ 轴向上。
- **机体系（Body Frame）** $B$：固连于无人机本体，原点在质心。旋翼推力、力矩、IMU 测量都在此系下表达。

两者通过姿态旋转矩阵 $\mathbf{R}_{WB}$（或其逆 $\mathbf{R}_{BW}$）联系。一个世界系向量 $\mathbf{v}^W$ 转到机体系为：

$$
\mathbf{v}^B = \mathbf{R}_{BW}\,\mathbf{v}^W
$$

姿态用欧拉角（滚转 $\phi$、俯仰 $\theta$、偏航 $\psi$）表达，代码中 `FRotator AttitudeDegrees` 即三轴角度（度）。注意欧拉角存在万向锁问题，工程上姿态积分多用四元数，但**控制律本身基于小角度欧拉角线性化**，这在悬停附近是足够精确的。

### 2.2 单位约定

UE 内部长度单位是厘米（cm），所以本插件全部采用 **CGS 风格混合单位**：位置 cm、速度 cm/s、加速度 cm/s²，但质量用 kg、推力用牛顿（N）、力矩用 N·m。重力加速度配置为：

$$
g = 980\ \text{cm/s}^2 \quad(\text{即 } 9.8\ \text{m/s}^2)
$$

这种"厘米 + 牛顿"的混用要求每个公式里格外注意量纲一致——这也是后续力矩臂长要用米、而位置用厘米时容易出错的地方。

### 2.3 符号表

| 符号 | 含义 |
|------|------|
| $m$ | 无人机总质量（kg） |
| $\mathbf{I}$ | 转动惯量张量（对角近似 $\text{diag}(I_{xx},I_{yy},I_{zz})$） |
| $\mathbf{v}, \dot{\mathbf{v}}$ | 质心速度、加速度 |
| $\boldsymbol{\omega}, \dot{\boldsymbol{\omega}}$ | 机体角速度、角加速度 |
| $\mathbf{F}, \boldsymbol{\tau}$ | 合外力、合外力矩 |
| $T_i$ | 第 $i$ 个旋翼的推力（N） |
| $\omega_i$ | 第 $i$ 个旋翼转速（RPM 或 rad/s，视上下文） |
| $\theta, \phi$ | 俯仰角、滚转角 |

---

## 三、刚体动力学：牛顿-欧拉方程

无人机的运动遵循**六自由度刚体动力学**，由牛顿-欧拉方程描述。这是整个飞控最底层的"物理真值"——所有控制最终都是为了在这组方程上施加想要的力与力矩。

### 3.1 平动方程（牛顿第二定律）

质心的平动由合外力决定：

$$
m\,\dot{\mathbf{v}} = \sum \mathbf{F}
$$

对悬停中的四旋翼，合外力主要是两项：

$$
\sum \mathbf{F} = \underbrace{\sum_{i=1}^{4} T_i \,\hat{\mathbf{z}}_B}_{\text{旋翼总推力}} \;-\; \underbrace{m\,g\,\hat{\mathbf{z}}_W}_{\text{重力}}
$$

其中 $\hat{\mathbf{z}}_B$ 是机体 $Z$ 轴（旋翼推力方向），$\hat{\mathbf{z}}_W$ 是世界向上方向。当机身水平时二者重合；当机身倾斜 $\theta$ 角时，推力的垂直分量是 $T\cos\theta$、水平分量是 $T\sin\theta$——**正是这个水平分量让无人机能平移**，也是位置控制必须先改变姿态的物理根源。

### 3.2 转动方程（欧拉方程）

机体绕质心的转动由欧拉方程描述，它比牛顿第二定律多出一项陀螺耦合项：

$$
\mathbf{I}\,\dot{\boldsymbol{\omega}} + \boldsymbol{\omega} \times (\mathbf{I}\,\boldsymbol{\omega}) = \sum \boldsymbol{\tau}
$$

- 左边第一项 $\mathbf{I}\dot{\boldsymbol{\omega}}$ 是"角加速度 × 惯量"，与平动的 $m\dot{\mathbf{v}}$ 类比。
- 第二项 $\boldsymbol{\omega}\times(\mathbf{I}\boldsymbol{\omega})$ 是**陀螺力矩**，只有当转动惯量非各向同性且机体已在旋转时才出现。对四旋翼 $I_{xx}\approx I_{yy}$，滚转-俯仰间耦合较弱，但偏航转动会与俯仰/滚转耦合。

工程上若假设惯量对角且角速度不大，常忽略 $\boldsymbol{\omega}\times(\mathbf{I}\boldsymbol{\omega})$ 项，得到线性化模型 $\mathbf{I}\dot{\boldsymbol{\omega}} \approx \sum\boldsymbol{\tau}$，这正是姿态内环 PID 控制律的设计依据。

### 3.3 代码如何落地

本插件并不自己积分这组方程，而是**把算好的力与力矩交给 Chaos 物理引擎**的刚体去积分。`AirscrewComponent` 在物理线程里把每个旋翼的推力与反扭矩施加到刚体上：

```cpp
// AirscrewComponent.cpp — ApplyThrustForce_PhysicsThread
// 把旋翼推力与反扭矩施加到 Chaos 刚体
if (UPrimitiveComponent* Body = GetBodyPrimitive())
{
    // 推力沿机体 Z 轴，作用于旋翼安装位置（产生力臂→力矩）
    Body->AddForceAtLocation(
        ThrustAxisWorld * GeneratedThrust,   // 世界系推力向量
        ApplyLocation,                       // 旋翼位置（力作用点）
        BoneName);
    // 反扭矩绕推力轴，符号由旋转方向决定
    Body->AddTorqueInRadians(
        ThrustAxisWorld * GeneratedReactionTorque * SpinSign,
        BoneName, /*bAccelChange=*/false);
}
```

关键点：推力用 `AddForceAtLocation` 而非 `AddForce`，因为**力作用在旋翼位置（非质心）会同时产生力与力矩**——力臂 $\mathbf{r}_i \times (T_i\hat{\mathbf{z}}_B)$ 自然构成滚转/俯仰力矩。这正对应欧拉方程右边的 $\sum\boldsymbol{\tau}$。

---

## 四、旋翼空气动力学：从转速到推力

飞控输出的最终指令是"每个电机转多快"，但产生飞行效果的是推力与力矩。这一节解决 $\omega \to T \to (\mathbf{F},\boldsymbol{\tau})$ 的映射。

### 4.1 动量理论与推力-转速平方律

螺旋桨推力的经典结论来自**动量理论（Momentum Theory）**：把螺旋桨视为一个作用于气流圆盘的致动盘，气流穿过圆盘被加速、动量增加，反作用力即为推力。推导得到推力正比于转速的平方：

$$
T = k_T\,\rho\,A\,R^2\,\omega^2 \;\propto\; \omega^2
$$

其中 $\rho$ 为空气密度、$A$ 为桨盘面积、$R$ 为桨半径、$k_T$ 为推力系数。对固定桨叶，所有几何与气动参数合并进一个系数后，核心关系就是 $T \propto \omega^2$。

本插件将其归一化为工程上可标定的形式：

$$
T = T_{\max}\cdot\left(\frac{\text{RPM}}{\text{RPM}_{\max}}\right)^2 \cdot C_T \cdot \eta
$$

- $T_{\max}$：单个旋翼最大推力（N），由电机/桨的极限决定。
- $C_T$：推力系数（标定用，默认 1.0）。
- $\eta$：效率（0~1），模拟桨叶磨损、电压跌落等导致的推力衰减。

对应的代码定义见 `FDroneRotorDefinition`：

```cpp
// 推力系数（用于推力 ∝ 系数 × 转速²）
float ThrustCoefficient = 1.0f;
// 反扭矩系数（扭矩 = 系数 × 推力）
float ReactionTorqueCoefficient = 0.03f;
// 效率（0~1，影响实际推力和扭矩）
float Efficiency = 1.0f;
// 有效最大推力 = T_max × max(η, 0)
float GetEffectiveMaxThrust() const {
    return MaxThrustForce * FMath::Max(Efficiency, 0.0f);
}
```

### 4.2 反扭矩与正反桨配对

旋翼转动时空气给桨叶一个反作用力矩（阻力矩），其方向与旋转方向相反。本插件用一个简洁的比例关系建模：

$$
\tau_{\text{react},i} = k_\tau \cdot T_i \cdot \sigma_i
$$

其中 $k_\tau$ 是反扭矩系数（`ReactionTorqueCoefficient`，默认 0.03），$\sigma_i$ 是旋转方向符号（CCW 逆时针为 $+1$，CW 顺时针为 $-1$）。

四旋翼的**正反桨配对**正是为了抵消这个反扭矩：Quad X 布局下对角线上的两个旋翼同向、相邻旋翼反向，于是稳态下四个反扭矩两两抵消，合力矩为零——无人机不会自旋。而**偏航控制**恰恰是利用这个反扭矩：让同向的一对转快、反向的一对转慢，净反扭矩不再为零，机体绕 $Z$ 轴偏航。这是"用副作用做控制"的典型设计。

### 4.3 电机一阶响应模型

飞控发出的"目标转速"不会瞬间达到——电机/电调/桨的惯性与电磁滞后使转速跟踪近似为**一阶惯性系统**：

$$
\tau_m\,\frac{d\omega}{dt} + \omega = \omega_{\text{target}}
$$

$\tau_m$ 为电机时间常数（`SpinUpTimeSeconds`/`SpinDownTimeSeconds` 分别控制加速、减速）。离散化（零阶保持）后得到指数跟踪：

$$
\omega[n] = \omega[n-1] + \alpha\,(\omega_{\text{target}} - \omega[n-1]), \qquad \alpha = 1 - e^{-\Delta t / \tau_m}
$$

$\alpha \in (0,1]$ 越大跟随越快。这个一阶模型把"指令"与"实际转速"之间插入了一段动力学延迟，是飞控带宽设计的物理依据：**内环 PID 的截止频率不能高于电机响应能跟上的频率**，否则就是在控制一个跟不上的执行器。

`AirscrewComponent::UpdateRotorState` 用一个清晰的五步流水线把上述物理串起来：

```cpp
// AirscrewComponent.cpp — UpdateRotorState 五步流水线
// Step 1: 指令变化率限幅（Slew Rate Limiter），防电流冲击
//   |dc/dt| ≤ MaxCommandSlewPerSecond
Command = SlewLimit(Command, Dt, MaxCommandSlewPerSecond);

// Step 2: 目标转速 = 怠速 + (最大-怠速) × Command^CommandExponent
//   CommandExponent=2.0 即体现 T∝ω²：把线性指令映射到平方后的转速
float TargetRpm = Motor.IdleRpm
    + (Motor.MaxRpm - Motor.IdleRpm) * FMath::Pow(Command, Motor.CommandExponent);

// Step 3: 一阶惯性响应（上述 α = 1 - e^(-Δt/τ)）
float Alpha = 1.0f - FMath::Exp(-Dt / SpinUpOrDownTime);
CurrentRpm += (TargetRpm - CurrentRpm) * Alpha;

// Step 4: 推力 = T_max × (RPM/RPM_max)² × C_T × η
float RpmRatio = CurrentRpm / Motor.MaxRpm;
GeneratedThrust = Rotor.GetEffectiveMaxThrust()
                 * ThrustCoefficient * RpmRatio * RpmRatio;

// Step 5: 反扭矩 = k_τ × T × 方向符号
GeneratedReactionTorque = Rotor.GetEffectiveReactionTorqueCoefficient()
                         * GeneratedThrust * Rotor.GetSpinDirectionSign();
```

注意 Step 2 的 `CommandExponent = 2.0`：它把线性的归一化指令 $c$ 经指数映射为目标转速 $\omega_{\text{target}} \propto c^{\,p}$（指数 $p$ 即 `CommandExponent`）。这是一个**静态曲线整形**旋钮——它不改变 $T\propto\omega^2$ 这条气动规律本身，只改变"杆量→转速"映射的形状，用于把油门杆手感调到操作者习惯的非线性度。Step 1 的 slew limiter 则限制 $|dc/dt|$，防止油门突变烧毁电机。

---

## 五、级联 PID 控制架构

### 5.1 为什么是级联

四旋翼的各物理量变化速度差异巨大：位置以秒级变化、姿态角以百毫秒级变化、角速率以十毫秒级变化。把它们塞进一个单环 PID 会让增益极难整定。级联结构把不同时间尺度分离：

$$
\underbrace{\text{位置}}_{\text{慢}} \to \underbrace{\text{速度}}_{\downarrow} \to \underbrace{\text{姿态角}}_{\downarrow} \to \underbrace{\text{角速率}}_{\text{快}} \to \underbrace{\text{混控}} \to \underbrace{\text{电机}}
$$

每一环把上一环的输出作为自己的设定值（setpoint），形成"外环算目标、内环去跟踪"的逐级收窄。外环带宽低、内环带宽高，满足**时间尺度分离原则**：内环足够快，外环才"看见"内环近似为瞬时执行器。

主循环入口 `RunControlLoop` 严格按此顺序执行六步：

```cpp
// FlightControllerComponent.cpp — RunControlLoop
// 1. 采集状态估计（位置/速度/姿态/角速率）
// 2. 位置外环：期望位置 → 期望速度
// 3. 速度内环：期望速度 → 期望倾斜角(姿态)
// 4. 姿态角外环：期望角 → 期望角速率
// 5. 角速率内环：期望角速率 → 期望力矩
// 6. 混控：期望力/力矩 → 各电机指令
```

### 5.2 PID 控制律

每一环本质上都是一个 PID 控制器，其连续域控制律为（位置式 / Parallel Form）：

$$
u(t) = K_p\,e(t) + K_i\int_0^t e(\tau)\,d\tau + K_d\,\frac{de(t)}{dt} + K_{ff}\,ff(t)
$$

- $K_p$（比例）：与当前误差成正比，决定响应速度，但单独使用会有稳态误差。
- $K_i$（积分）：累加历史误差，**消除稳态误差**（如重力补偿、恒定风偏）。
- $K_d$（微分）：预测误差变化趋势，提供阻尼、抑制超调。
- $K_{ff}$（前馈）：把期望值直接注入，提高跟踪性能而不增加反馈延迟。

离散化采用后向差分（矩形积分）：

$$
I[n] = I[n-1] + e[n]\,\Delta t, \qquad D[n] = \frac{e[n]-e[n-1]}{\Delta t}
$$

$$
u[n] = K_p\,e[n] + K_i\,I[n] + K_d\,D[n] + K_{ff}\,ff
$$

对应代码（`FDronePidState::UpdateFromError`）：

```cpp
// 积分项：I += e·Δt，限幅防饱和
const float PreviousIntegral = Integral;
Integral += Error * DeltaSeconds;
if (Gains.IntegralLimit > 0.0f)
    Integral = FMath::Clamp(Integral, -Gains.IntegralLimit, Gains.IntegralLimit);

// 微分项：de/dt → 低通滤波
const float RawDerivative = bHasPreviousError
    ? (Error - PreviousError) / DeltaSeconds : 0.0f;
const float Derivative = ApplyDerivativeFilter(RawDerivative, DeltaSeconds, Gains);

// u = Kp·e + Ki·I + Kd·D + Kff·ff
const float OutputUnclamped = Error * Gains.Kp
    + Integral * Gains.Ki
    + Derivative * Gains.Kd
    + FeedForwardInput * Gains.Kff;
```

### 5.3 误差微分 vs 测量微分：避开"微分冲击"

标准 PID 的微分项是 $D = de/dt$。当**设定值突变**（例如飞行员瞬间打满杆）时，误差 $e = SP - PV$ 在一个采样周期内从 0 跳到最大值，$de/dt \to \infty$，输出会产生一个巨大的尖峰——这叫**微分冲击（Derivative Kick）**，会引发电机抖动甚至失控。

解决方法是把微分项改为对**测量值**求导，而不是对误差：

$$
D[n] = -\frac{PV[n] - PV[n-1]}{\Delta t}
$$

为什么是负号？因为 $e = SP - PV$，若 $SP$ 不变则 $de/dt = -d(PV)/dt$；而 $PV$（实际姿态/速度）受物理惯性约束，变化平滑连续，永远不会产生冲击。代码中 `UpdateFromMeasurement` 即此实现：

```cpp
// UpdateFromMeasurement：微分项使用 -d(PV)/dt，避免设定值突变冲击
const float RawDerivative = bHasPreviousMeasurement
    ? -(Measurement - PreviousMeasurement) / DeltaSeconds : 0.0f;
```

工程经验：**外环（位置/速度）可用 `UpdateFromError`，内环（角速率）必须用 `UpdateFromMeasurement`**——因为内环设定值（来自外环输出）变化剧烈，而测量值（陀螺）平滑。本插件的高度环与姿态环均采用测量微分形式。

### 5.4 抗饱和（Anti-windup）

积分项是双刃剑：消除稳态误差的同时，若输出已饱和（如电机已满油门），积分还会继续累加误差，导致**积分饱和（Windup）**——一旦扰动消失，积分类积如山，输出长时间维持饱和，引发大幅超调甚至振荡。

本插件采用**条件积分法（Conditional Integration / Clamping）**：输出被 `OutputLimit` 限幅后，若发现实际输出与未限幅值不一致（说明发生了饱和），就**回退本次积分累加**：

```cpp
float Output = OutputUnclamped;
if (Gains.OutputLimit > 0.0f)
    Output = FMath::Clamp(Output, -Gains.OutputLimit, Gains.OutputLimit);

// 输出饱和时回退积分累加，防止积分饱和
if (Gains.bFreezeIntegralWhenSaturated
    && !FMath::IsNearlyEqual(Output, OutputUnclamped))
{
    Integral = PreviousIntegral;   // 回退到上一周期值
}
```

直观理解：电机都到极限了，再喊 louder 也没用，干脆让积分"原地踏步"，等输出退出饱和区再让它继续工作。这比硬截断积分项更平滑。

### 5.5 微分项低通滤波

纯微分 $de/dt$ 是高通操作，会**放大高频噪声**（传感器噪声、量化噪声）。陀螺仪噪声经过 $K_d$ 放大后直接变成电机抖动。解决办法是给微分项串联一个一阶低通滤波器，传递函数：

$$
H(s) = \frac{1}{\tau_f s + 1}, \qquad \tau_f = \frac{1}{2\pi f_c}
$$

$f_c$ 为截止频率（`DerivativeCutoffHz`）。离散化（前向欧拉）得指数加权移动平均（EWMA）：

$$
\alpha = \frac{\Delta t}{\tau_f + \Delta t} = \frac{\Delta t}{\dfrac{1}{2\pi f_c} + \Delta t}
$$

$$
D_{\text{filt}}[n] = D_{\text{filt}}[n-1] + \alpha\,\bigl(D_{\text{raw}}[n] - D_{\text{filt}}[n-1]\bigr)
$$

$\alpha$ 越大（$f_c$ 越高或 $\Delta t$ 越大）滤波越弱、跟随越快。代码：

```cpp
// α = Δt / (1/(2πf_c) + Δt)
const float Rc = 1.0f / (2.0f * PI * Gains.DerivativeCutoffHz);
const float Alpha = DeltaSeconds / (Rc + DeltaSeconds);
// y[n] = y[n-1] + α·(x[n] - y[n-1])
FilteredDerivative += (RawDerivative - FilteredDerivative) * Alpha;
```

这个滤波器与电机的物理带宽要匹配：$f_c$ 设太高滤不掉噪声，设太低会引入相位滞后削弱微分阻尼。

### 5.6 高度与总距控制

高度通道是四旋翼最直观的控制：垂直加速度直接由总推力调节。它仍是双环级联——**高度外环产生期望垂直速度，垂直速度内环产生总距指令**：

```cpp
// ComputeVerticalControl
// 外环：高度误差 → 期望垂直速度（带爬升/下降率限幅）
float AltError = TargetAltitude - CurrentAltitude;
float DesiredClimbRate = PID_Altitude.UpdateFromError(AltError, Dt, ...);
DesiredClimbRate = Clamp(DesiredClimbRate, -MaxDescent, +MaxClimb);

// 内环：垂直速度误差 → 总距指令（归一化 0~1）
float ClimbError = DesiredClimbRate - CurrentClimbRate;
float CollectiveCommand = PID_VertVel.UpdateFromMeasurement(
    DesiredClimbRate, CurrentClimbRate, Dt, ...);
```

注意内环用 `UpdateFromMeasurement`，因为期望爬升率来自外环、变化较剧烈。默认参数为 $K_p=3, K_i=0.5, K_d=0.1$，积分项用于消除重力造成的稳态油门偏差——悬停时总距必须恰好抵消重力，这个"配平值"由积分项自动学出来。

### 5.7 悬停倾斜方程：连接水平加速度与姿态

这是四旋翼控制中最优美的一个公式。设无人机以水平加速度 $\mathbf{a}_{\text{horiz}}$ 飞行，推力 $T$ 沿机体 $Z$ 轴。把推力分解到世界系：

- 垂直分量平衡重力：$T\cos\theta = mg$
- 水平分量提供加速度：$T\sin\theta = m\,a$

两式相除即得**悬停倾斜方程**：

$$
\tan\theta = \frac{a}{g}
$$

它的意义是：**要获得水平加速度 $a$，机身必须倾斜 $\theta = \arctan(a/g)$**。这就把"速度环输出的期望加速度"直接翻译成了"姿态环的设定值"——位置控制到姿态控制的桥梁就此搭通。代码 `ComputeDesiredAttitude` 正是用它：

```cpp
// ComputeDesiredAttitude：由期望水平加速度反解目标倾斜角
// tan(θ) = a / g  →  θ = atan(a / g)
const float AccelMag = DesiredAccelerationWorld.Size2D();
// 安全限幅：最大倾斜角不超过 MaxTiltAngleDegrees（默认35°）
const float MaxAccel = G * FMath::Tan(FMath::DegreesToRadians(MaxTiltAngle));
const float ClampedAccel = FMath::Clamp(AccelMag, 0.0f, MaxAccel);
const float DesiredTiltAngle = FMath::Atan2(ClampedAccel, G);

// 倾斜方向 = 加速度方向在水平面投影
FVector TiltAxis = FVector::CrossProduct(FVector::UpVector, DesiredAccelDir);
// 期望姿态 = 绕该轴旋转 DesiredTiltAngle
DesiredAttitude = FRotator(TiltAxis, FMath::RadiansToDegrees(DesiredTiltAngle));
```

`MaxTiltAngle`（默认 35°）是硬性安全限幅——超过它会失速过多或触发翻滚保护。这个公式成立的前提是推力始终沿机体 $Z$ 轴（旋翼固定安装），所以它不适用于可倾转旋翼。

### 5.8 姿态角环与角速率内环

得到期望姿态后，姿态控制仍是双环：

- **角度外环**：期望角 − 实际角 → 期望角速率（`ComputeDesiredBodyRates`）。
- **角速率内环**：期望角速率 − 实际角速率 → 期望力矩（`ComputeBodyTorqueCommand`）。

```cpp
// 角度外环：角度误差 → 期望角速率
FVector AngleError = (DesiredAttitude - CurrentAttitude).Euler() * Deg2Rad;
FVector DesiredBodyRate = PID_Angle.UpdateFromMeasurement(
    DesiredAttitude.Euler(), CurrentAttitude.Euler(), Dt, ...);

// 角速率内环：角速率误差 → 期望力矩（最内环，带宽最高）
FVector RateError = DesiredBodyRate - CurrentBodyRate;
FVector DesiredTorque = PID_Rate.UpdateFromMeasurement(
    DesiredBodyRate, CurrentBodyRate, Dt, ...);
```

内环输出的是**期望力矩**（N·m），它已不再是"设定值"而是物理量——下一步要把它连同总推力一起分配给四个电机。这就进入混控。

---

## 六、控制分配与混控

### 6.1 控制分配问题

前五节算出了**期望合力与合力矩** $\mathbf{W} = [F_z,\ \tau_x,\ \tau_y,\ \tau_z]^T$（沿机体轴：总推力 + 三轴力矩）。但四旋翼只能直接控制四个旋翼的推力 $\mathbf{u} = [T_1,T_2,T_3,T_4]^T$。**控制分配**就是求解映射 $\mathbf{u} = f(\mathbf{W})$。

这个映射由旋翼几何与气动决定，写成矩阵形式：

$$
\mathbf{W} = \mathbf{B}\,\mathbf{u}
$$

$\mathbf{B}\in\mathbb{R}^{4\times 4}$ 是**控制效率矩阵（Jacobian）**，每一列对应一个旋翼，描述"该旋翼单位推力对四个控制通道的贡献"。`BuildJacobianColumn` 构造每一列：

$$
\mathbf{B}_i = \begin{bmatrix} F_z \\ -\tau_x \\ -\tau_y \\ \tau_z \end{bmatrix}_i = \begin{bmatrix} 1 \\ -(\mathbf{r}_i \times \hat{\mathbf{z}}_B)_y \\ +(\mathbf{r}_i \times \hat{\mathbf{z}}_B)_x \\ k_\tau\,\sigma_i \end{bmatrix}
$$

```cpp
// BuildJacobianColumn — 构造第 i 个旋翼对 [Fz, -τx, -τy, τz] 的贡献
FVector4 BuildJacobianColumn(const FDroneRotorDefinition& Rotor)
{
    const FVector Arm = Rotor.PositionLocalCm;          // 力臂（机体系）
    const float SpinSign = Rotor.GetSpinDirectionSign(); // CW=-1, CCW=+1
    const float Kt = Rotor.GetEffectiveReactionTorqueCoefficient();
    // 推力对总距贡献 1；力臂×推力产生滚转/俯仰力矩；反扭矩产生偏航
    return FVector4(
        1.0f,                         // Fz：直接加到总推力
        -(Arm.Y * SpinSign),         // τx：力臂Y分量→滚转力矩
        +(Arm.X * SpinSign),         // τy：力臂X分量→俯仰力矩
        Kt * SpinSign);              // τz：反扭矩→偏航力矩
}
```

理解每行物理含义：第一行所有旋翼推力都加总成 $F_z$；第二、三行是力臂叉乘得到滚转/俯仰力矩（这就是"对角差速"产生姿态力矩的来源）；第四行是反扭矩产生偏航。

### 6.2 阻尼伪逆求解

理想情况下 $\mathbf{B}$ 可逆，直接 $\mathbf{u} = \mathbf{B}^{-1}\mathbf{W}$。但实际中 $\mathbf{B}$ 可能接近奇异（如旋翼失效、布局退化），直接求逆会放大噪声、产生极大指令。工程上用**阻尼最小二乘伪逆（Damped Least Squares, DLS）**做正则化：

$$
\mathbf{u} = \mathbf{B}^T\bigl(\mathbf{B}\,\mathbf{B}^T + \lambda^2 \mathbf{I}\bigr)^{-1}\mathbf{W}
$$

- $\lambda$ 是阻尼系数（`DampedPseudoInverseLambda`，默认 0.05），越大越稳健但控制跟踪越"软"。
- 它是岭回归（Ridge Regression）在控制分配上的应用：以**轻微牺牲精度**换取**对奇异与噪声的鲁棒性**。
- 当 $\lambda \to 0$ 时退化为标准伪逆 $\mathbf{B}^+$；当 $\mathbf{B}$ 病态时，$\lambda^2\mathbf{I}$ 项压制了 $\mathbf{B}\mathbf{B}^T$ 的小奇异值被倒数放大。

代码用 4×4 高斯-约旦消元（带部分主元）求逆矩阵：

```cpp
// SolveLinearSystem4 — 4×4 线性方程组求解（Gauss-Jordan + 部分主元）
// 解 (B·B^T + λ²I)·x = W，得到 x = (B·B^T + λ²I)^{-1}·W
// 再左乘 B^T 得到 u = B^T·x
```

为改善数值条件，求解前还会做**行归一化**（`RowScale`），把各通道量纲差异（推力 N 与力矩 N·m 数量级不同）拉平，避免某通道因数值大而主导求解。

### 6.3 推力到指令的反演

伪逆求出的是每个旋翼的**期望推力** $T_i$（N），但电机接受的是归一化指令 $c_i \in [0,1]$。由 $T = T_{\max}\cdot c^2\cdot C_T\cdot\eta$ 反解：

$$
c_i = \sqrt{\frac{T_i}{T_{\max,i}\cdot C_{T,i}\cdot \eta_i}}
$$

```cpp
// ConvertThrustToCommand — 推力反演为归一化指令
float ConvertThrustToCommand(float ThrustN, const FDroneRotorDefinition& Rotor)
{
    const float Denom = Rotor.GetEffectiveMaxThrust() * Rotor.ThrustCoefficient;
    if (Denom <= UE_SMALL_NUMBER) return 0.0f;
    float Cmd = FMath::Sqrt(FMath::Max(ThrustN / Denom, 0.0f));
    return FMath::Clamp(Cmd, 0.0f, 1.0f);
}
```

平方根反演是推力-转速平方律的逆运算。注意取了 `Max(..., 0)` 防止负推力（物理上旋翼不能产生反向推力）开根号出错。

### 6.4 约束投影：边界内的可行解

伪逆求解**不保证** $c_i \in [0,1]$——某些旋翼可能算出负推力或超满油门。直接截断（clamp）会破坏力/力矩平衡。本插件用**迭代活动集法（Iterative Active-Set）**把解投影到可行域 $[0,1]^4$：

```cpp
// AllocateToRotors — 混控主算法
// 1. 用阻尼伪逆求初值 u
// 2. 检查是否越界 [0, T_max]
// 3. 把越界旋翼钉在边界（活动集），对剩余旋翼重新分配余量
// 4. 迭代直到全部可行或无法满足
```

其思想是：把触顶/触底的旋翼"钉死"在边界值，从期望 $\mathbf{W}$ 中减去它们已贡献的部分，对**剩余自由旋翼**重新解一个降维分配问题。反复迭代直到所有旋翼都落在 $[0,1]$ 内。这比朴素 clamp 优秀之处在于：它**尽量保住合力/合力矩**，把不可避免损失分散到各旋翼，而不是让一个旋翼独自饱和。

### 6.5 故障容忍

这一套分配框架的额外收益是**故障容忍**：当某个旋翼失效（`bEnabled=false` 或效率骤降），只需把它从 $\mathbf{B}$ 中剔除、重算伪逆（`RebuildAllocationCache`），系统自动重新分配控制权限给剩余旋翼。对四旋翼失去单桨虽仍难以稳定飞行，但对六旋翼/八旋翼就能撑住返航——这正是多旋翼冗余设计的价值所在。

---

## 七、整体数据流回顾

把全链路串起来，一帧控制循环的数据流是：

1. **状态估计**：IMU/气压计/GPS 融合 → 当前位置、速度、姿态、角速率。
2. **位置外环**：期望位置 − 当前位置 → 期望速度（PID）。
3. **速度内环**：期望速度 − 当前速度 → 期望水平加速度 → 经 $\tan\theta=a/g$ → 期望姿态角。
4. **高度环**：期望高度 → 期望垂直速度 → 总距指令 $F_z$。
5. **姿态角外环**：期望角 − 当前角 → 期望角速率（PID）。
6. **角速率内环**：期望角速率 − 当前角速率 → 期望力矩 $\boldsymbol{\tau}$。
7. **混控**：$\mathbf{W}=[F_z,\boldsymbol{\tau}]^T$ → 阻尼伪逆 + 活动集 → 各旋翼推力 $T_i$ → 反演为指令 $c_i$。
8. **电机**：$c_i$ → slew 限幅 → 目标转速 → 一阶响应 → 实际转速 → 推力/反扭矩 → Chaos 刚体。

每一步都是上一步输出的"消费者"和下一步输入的"生产者"，任何一环的数学理解偏差都会以飞行事故的形式暴露。这也是为什么飞控开发中**公式推导与代码实现必须严格对应**——本文的梳理正是服务于这个目的。

---

## 八、关键参数与默认值速查

以下是 `InitializeDefaultControllerConfig` 中针对百公斤级无人机的默认 PID 参数，供调试参考：

| 控制环 | $K_p$ | $K_i$ | $K_d$ | 说明 |
|--------|-------|-------|-------|------|
| 高度外环 | 2.0 | 0 | 0 | 纯比例，产生期望爬升率 |
| 垂直速度内环 | 3.0 | 0.5 | 0.1 | 带积分消除重力配平偏差 |
| 角度外环 | (Roll/Pitch) 较大 | — | — | 决定姿态跟踪刚度 |
| 角速率内环 | 最大带宽 | — | — | 最内环，需最快响应 |

物理限幅默认值：最大倾斜 35°、最大偏航速率 180°/s、最大爬升 4 m/s、最大下降 2.5 m/s、最大水平速度 12 m/s。电机最大转速 12000 RPM、怠速 1500 RPM、加速时间常数 0.06 s。

这些数值并非普适最优，而是针对特定机型的整定起点。真正的调参需要在"响应速度—超调量—抗扰性"三角中按机型质量、惯量、桨特性反复折中，而理解了上述每一节背后的数学，调参就不再是盲目试数，而是有据可循的工程判断。

---

## 结语

四旋翼飞控的魅力在于：它用一组**中学物理级别的牛顿-欧拉方程**作为底座，叠加上**经典控制理论的 PID**，再用**线性代数的伪逆与活动集**做执行器分配，最终在一颗每秒跑几百次的 MCU/GPU 上闭环。没有玄学，每一步都可推导、可验证、可调参。

本文从 AircraftLab 这一具体实现出发，把"想让无人机飞到某点"这个高层意图，逐层翻译到"第 3 号电机 PWM 占空比"这个底层指令，力求让每个公式都说清来历、每段代码都对得上物理。希望这套梳理能帮助你在阅读或编写飞控代码时，看见 `tan(θ)=a/g` 背后的倾斜飞行、看见伪逆 $\lambda$ 背后的鲁棒性折中、看见积分回退背后的抗饱和智慧——代码是数学的投影，飞行的优雅正在于此。
