export const UI_TRANSLATIONS = {
  zh: {
    role: "引擎级系统开发工程师",
    title: "物理模拟 & 实时渲染系统架构师",
    statement: "“构建技术与运动交汇的系统。”",
    exploreWork: "探索项目",
    viewProfile: "查看简历",
    disciplineMatrix: "专业领域矩阵",
    coreCompetencies: "核心专业能力",
    selectedLogs: "精选日志",
    featuredSystems: "特色系统",
    viewAllProjects: "查看全部项目",
    knowledgeSharing: "技术分享",
    technicalLogs: "技术日志",
    viewAllLogs: "查看全部日志",
    academics: "学术推导",
    activeResearch: "活跃研究",
    explore: "探索",
    examineFullDerivation: "阅读完整推导",
    systemDiagnostics: "系统诊断数据",
    diagnosticsDriver: "驱动:",
    diagnosticsSolver: "求解器:",
    diagnosticsTimer: "计时器:",
    allRightsReserved: "马库斯 · 范斯。保留所有计算权利。",
    backToFeed: "返回列表",
    share: "分享",
    copied: "已复制",
    copyCode: "复制代码",
    viewportMetadata: "电影级光追视口元数据",
    postProcess: "后处理: 电影胶片颗粒 [0.15]",
    sampling: "采样: DLSS_3.7_预设_G",
    renderer: "渲染器: SUB_LUMEN_ACTIVE",
    engineeringLog: "工程日志",
    metricsTitle: "关键求解器指标",
    closeStream: "关闭流",
    filterSpecialization: "过滤专业方向:",
    all: "全部",
    examine: "分析",
    searchPlaceholder: "搜索着色器、物理模拟、C++ 网卡代码...",
    resetFilters: "重置过滤器",
    filterTag: "标签过滤:",
    allLogs: "全部日志",
    readLog: "阅读日志",
    noLogsFound: "未找到对应的技术日志",
    refineSearch: "请优化搜索关键词或选择其他标签。",
    memorandum: "备忘录",
    problem: "计算难题:",
    solution: "工程解决方案:",
    methodology: "实现方法论",
    copySource: "复制源码",
    profileOverview: "档案概览",
    narrativeHeadline: "在大规模场景中构建交互式物理与渲染系统。",
    experience: "工作经验:",
    language: "核心语言:",
    platforms: "目标平台:",
    location: "工作地点:",
    systemProficiencies: "系统精通度",
    techStackProfile: "技术栈画像",
    professionalTimeline: "职业发展时间线",
    careerChronology: "职业生涯年表",
    compileStatus: "UE5.5 编译",
    compileActive: "UE5.5 编译就绪"
  },
  en: {
    role: "ENGINE LEVEL SYSTEM DEVELOPER",
    title: "PHYSICS SIMULATION & RENDER SYSTEMS ARCHITECT",
    statement: "\"Building systems where technology and motion meet.\"",
    exploreWork: "EXPLORE WORK",
    viewProfile: "VIEW PROFILE",
    disciplineMatrix: "DISCIPLINE MATRIX",
    coreCompetencies: "Core Competencies",
    selectedLogs: "SELECTED LOGS",
    featuredSystems: "Featured Systems",
    viewAllProjects: "VIEW ALL PROJECTS",
    knowledgeSharing: "KNOWLEDGE SHARING",
    technicalLogs: "Technical Logs",
    viewAllLogs: "VIEW ALL LOGS",
    academics: "ACADEMICS",
    activeResearch: "Active Research",
    explore: "EXPLORE",
    examineFullDerivation: "EXAMINE FULL DERIVATION",
    systemDiagnostics: "SYSTEM DIAGNOSTICS",
    diagnosticsDriver: "DRIVER:",
    diagnosticsSolver: "SOLVER:",
    diagnosticsTimer: "TIMER:",
    allRightsReserved: "Marcus Vance. All computational rights reserved.",
    backToFeed: "BACK TO FEED",
    share: "SHARE",
    copied: "COPIED",
    copyCode: "COPY CODE",
    viewportMetadata: "CINEMATIC RAYTRACED VIEWPORT METADATA",
    postProcess: "POST_PROCESS: FILM_GRAIN [0.15]",
    sampling: "SAMPLING: DLSS_3.7_PRESET_G",
    renderer: "RENDERER: SUB_LUMEN_ACTIVE",
    engineeringLog: "ENGINEERING LOG",
    metricsTitle: "CRITICAL SOLVER METRICS",
    closeStream: "CLOSE STREAM",
    filterSpecialization: "FILTER SPECIALIZATION:",
    all: "All",
    examine: "EXAMINE",
    searchPlaceholder: "Search shaders, physics, C++ netcode...",
    resetFilters: "RESET FILTERS",
    filterTag: "Filter Tag:",
    allLogs: "All Logs",
    readLog: "READ LOG",
    noLogsFound: "NO CORRESPONDING TECHNICAL LOGS FOUND",
    refineSearch: "Please refine your search parameters or select a different tag.",
    memorandum: "MEMORANDUM",
    problem: "The Computational Problem:",
    solution: "The Engineering Solution:",
    methodology: "IMPLEMENTATION METHODOLOGY",
    copySource: "COPY SOURCE",
    profileOverview: "PROFILE OVERVIEW",
    narrativeHeadline: "Architecting interactive physics and rendering at scale.",
    experience: "EXPERIENCE:",
    language: "LANGUAGE:",
    platforms: "PLATFORMS:",
    location: "LOCATION:",
    systemProficiencies: "SYSTEM PROFICIENCIES",
    techStackProfile: "Technical Stack Profile",
    professionalTimeline: "PROFESSIONAL TIMELINE",
    careerChronology: "Career Chronology",
    compileStatus: "UE5.5 COMPILE",
    compileActive: "UE5.5 COMPILE ACTIVE"
  }
};

export const PROJECTS_ZH = [
  {
    id: "aetherflow",
    title: "AetherFlow: GPU 欧拉流体求解器",
    category: "Physics Simulation",
    description: "通过 Niagara 和 HLSL 计算着色器，将自定义构建的欧拉流体求解器深度集成于虚幻引擎 5 中，实现高度交互式的物理烟雾与迷雾效果。",
    extendedDetails: "AetherFlow 是一个完全在 GPU 上运行的基于网格（欧拉）的流体力学求解器。它通过绕过标准 CPU 限制的粒子求解器，在 Niagara HLSL 脚本中直接计算速度平流、压力投影和密度传播。系统采用打包成 3D 体积贴图的 3D 网格布局。通过距离场（Distance Fields）动态检测角色和障碍物碰撞，实时向模拟网格中注入速度向量。该求解器采用雅可比迭代（Jacobi iteration）多步子步（Sub-stepping）进行极限优化，在每一帧渲染中仅消耗不到 1.18 毫秒的 GPU 渲染预算。",
    tech: ["UE5", "C++", "HLSL", "Niagara", "Compute Shaders"],
    metrics: [
      { label: "执行耗时", value: "1.18 毫秒" },
      { label: "网格分辨率", value: "128 × 128 × 128" },
      { label: "体素总数", value: "210 万" },
      { label: "帧率表现", value: "120+ 稳定运行" }
    ],
    visualPrompt: "灰色气态烟雾围绕着金属手臂流畅缠绕的高保真电影级模拟，采用带有动态微涡流的向量场网格在柔和的聚光灯下计算。",
    codeSnippet: `// Niagara HLSL Scratchpad - 压力投影雅可比迭代步
void SolveJacobi(
    in float3 ThreadId,
    in Texture3D<float> PressureTex,
    in Texture3D<float> DivergenceTex,
    out float OutPressure
) {
    float3 uv = (ThreadId + 0.5) / GridDimensions;
    float dx = 1.0 / GridDimensions.x;
    
    // 采样6个空间邻近体素
    float pL = PressureTex.SampleLevel(LinearClamp, uv - float3(dx,0,0), 0).r;
    float pR = PressureTex.SampleLevel(LinearClamp, uv + float3(dx,0,0), 0).r;
    float pB = PressureTex.SampleLevel(LinearClamp, uv - float3(0,dx,0), 0).r;
    float pT = PressureTex.SampleLevel(LinearClamp, uv + float3(0,dx,0), 0).r;
    float pD = PressureTex.SampleLevel(LinearClamp, uv - float3(0,0,dx), 0).r;
    float pU = PressureTex.SampleLevel(LinearClamp, uv + float3(0,0,dx), 0).r;
    
    float div = DivergenceTex.SampleLevel(LinearClamp, uv, 0).r;
    
    // 求解压力的泊松方程 (Poisson Equation for Pressure)
    OutPressure = (pL + pR + pB + pT + pD + pU - (dx * dx) * div) / 6.0;
}`
  },
  {
    id: "helios",
    title: "Helios: 大气多重散射体积渲染系统",
    category: "Real-time Rendering",
    description: "基于物理的多重散射大气模型，用于渲染高度真实的动态天空盒、体积云以及星球级别的动态光轴（耶稣光）。",
    extendedDetails: "Helios 是瑞利（Rayleigh）和米氏（Mie）大气散射的完整实时实现。该系统采用 C++ 写成引擎拓展，完全绕过虚幻引擎默认的天空组件，并在底层的渲染管线中执行自定义的穿过大气层的射线步进（Raymarcher）。系统通过在多个大气层上对光线传输方程进行积分来动态计算天空亮度，精准计算透射率和光深度。体积云使用 3D 旋度噪声（Curl-Noise）体积贴图以获得超写实的风切变和形变。单通道深度阴影图则通过基于球面谐波（Spherical Harmonics）的天光投影处理动态云的自阴影及光轴。",
    tech: ["UE5", "C++", "HLSL", "Volumetric Raymarching", "Shader Model 6"],
    metrics: [
      { label: "散射采样数", value: "32次主采样, 8次辅助采样" },
      { label: "分辨率规格", value: "原生 4K (采用四分之一分辨率步进)" },
      { label: "显存占用", value: "32MB GPU 显存" },
      { label: "图形接口", value: "DirectX 12 / Vulkan" }
    ],
    visualPrompt: "一个宏大的星球地平线电影级轨道特写镜头，展示了在极高清晰度的星空下，多层大气散射出深邃的靛蓝、温暖的琥珀橙和朦胧的烟灰蓝，极具《星际穿越》的科幻写实风格。",
    codeSnippet: `// 体积大气瑞利/米氏散射透射率计算
float3 ComputeOpticalDepth(float3 RayStart, float3 RayDir, float RayLength) {
    float3 OpticalDepthSum = 0.0;
    float StepSize = RayLength / float(SAMPLES_COUNT);
    
    for (int i = 0; i < SAMPLES_COUNT; i++) {
        float3 SamplePos = RayStart + RayDir * (float(i) + 0.5) * StepSize;
        float Height = length(SamplePos) - EarthRadius;
        
        if (Height < 0.0 || Height > AtmosphereHeight) continue;
        
        float DensityRayleigh = exp(-Height / ScaleHeightRayleigh);
        float DensityMie = exp(-Height / ScaleHeightMie);
        
        OpticalDepthSum += float3(DensityRayleigh, DensityMie, 0.0) * StepSize;
    }
    return OpticalDepthSum;
}`
  },
  {
    id: "apexmotion",
    title: "ApexMotion: 运动匹配与程序化动力学动画骨骼系统",
    category: "Animation Technical Art",
    description: "前沿的程序化运动运行管线，将高精度的多骨骼 IK 物理与多方向运动匹配（Motion Matching）数据库深度融合。",
    extendedDetails: "ApexMotion 是一套打破物理模拟与传统关键帧动画界限的定制化动画管线。它基于自定义的 C++ AnimNode 编写，能读取角色碰撞体的实时物理状态并动态修正和重建骨骼朝向。系统采用全身反向动力学（Full Body IK）使角色的双脚、膝盖、臀部和手臂与复杂的地形完美贴合，并整合了解析弹簧阻尼器（Spring-Damper）关节求解器，为角色武器动作、重力下坠感及肌肉震颤增加二次物理惯性。当角色受到强力冲击时，专用的物理动画节点能在每根骨骼层级上无缝混合活跃的布娃娃（Ragdoll）物理与骨骼关键帧动作。",
    tech: ["UE5", "C++", "Control Rig", "AnimGraphs", "IK-Rig", "Motion Matching"],
    metrics: [
      { label: "实时求值骨骼数", value: "86 根骨骼实时计算" },
      { label: "混合延迟", value: "小于 0.05 毫秒" },
      { label: "物理布娃娃过渡", value: "埃尔米特样条曲线插值" },
      { label: "内存消耗", value: "1.4MB 动画预存" }
    ],
    visualPrompt: "一个精致而极简的机器人人形骨骼渲染，其站在水泥地面上，全身发光的关节节点和橙色线条展示了实时的受力向量计算过程。",
    codeSnippet: `// 自定义 C++ 动画节点片段：角速度弹簧阻尼关节追踪
void FAnimNode_ApexSpringJoint::Evaluate_AnyThread(FPoseContext& Output) {
    float DeltaTime = Output.CurveValueCache.GetDeltaTime();
    FCompactPose& OutPose = Output.Pose;
    
    FTransform CurrentTransform = OutPose[TargetBone];
    FQuat CurrentRot = CurrentTransform.GetRotation();
    
    // 临界阻尼四元数弹簧阻尼器
    FQuat Difference = TargetRotation * CurrentRot.Inverse();
    FVector Torque = Difference.ToRotationVector() * SpringConstant;
    
    AngularVelocity += (Torque - DampingConstant * AngularVelocity) * DeltaTime;
    FQuat DeltaRot = FQuat::MakeFromRotationVector(AngularVelocity * DeltaTime);
    
    FTransform OutTransform = CurrentTransform;
    OutTransform.SetRotation(DeltaRot * CurrentRot);
    OutPose[TargetBone] = OutTransform;
}`
  },
  {
    id: "chronos",
    title: "Chronos: 竞技级战斗物理网络同步引擎",
    category: "Gameplay Systems",
    description: "高度优化的服务器授权（Server-Authoritative）网络同步框架，支持亚毫秒级的客户端预测、回滚与状态和解。",
    extendedDetails: "Chronos 是一个尖端的玩法和战斗网络子系统，旨在处理高精度的物理复制以及快节奏的近战与射击动作判定。该系统完全在 C++ 中基于虚幻引擎的 Gameplay 技能系统（GAS）构建，它实现了一个完全确定性的时间线缓冲区，能存储长达 300 毫秒的玩家输入、变换历史及物理求解器状态。当服务器检测到技能动作时，它将游戏状态倒回至客户端执行的精确时间戳进行物理扫掠判定，解决冲突并同步修正后的数据。客户端能立即进行预测和解（Reconciliation），消除视觉拉回（Rubber-banding）并提供极佳的零延迟判定体验。",
    tech: ["UE5", "C++", "Netcode", "GAS", "Deterministic Prediction", "Replication"],
    metrics: [
      { label: "状态回滚窗口", value: "300 毫秒滑动窗口" },
      { label: "网络状态和解延迟", value: "亚毫秒级" },
      { label: "带宽开销缩减", value: "比默认虚幻RPC减少40%" },
      { label: "模拟重算性能", value: "在0.2ms内重算多达32帧" }
    ],
    visualPrompt: "一个高科技的服务器与客户端同步时间线示意图，表现为发光的、半透明的蓝色和橙色重叠网格走廊，背景是墨黑色的石墨板。",
    codeSnippet: `// 服务器授权的客户端输入回滚与延迟补偿判定
void UChronosCombatComponent::ReconcileClientInput(
    float ClientTimestamp, 
    FVector TargetLocation, 
    FHitResult& OutHitResult
) {
    // 1. 获取历史状态链表节点
    TDoubleLinkedList<FChronosHistoryState>::TDoubleLinkedListNode* Node = HistoryBuffer.GetTail();
    while (Node) {
        if (Node->GetValue().Timestamp <= ClientTimestamp) {
            break;
        }
        Node = Node->GetPrev();
    }
    
    if (Node) {
        const FChronosHistoryState& HistoryState = Node->GetValue();
        // 临时将场景物理碰撞体定位到客户端当时的历史位置
        FRollbackSceneContext Rollback(GetWorld(), HistoryState);
        
        // 执行历史物理空间中的单次扫掠碰撞检测
        GetWorld()->SweepSingleByChannel(
            OutHitResult, 
            HistoryState.SourceOrigin, 
            TargetLocation, 
            FQuat::Identity, 
            ECC_GameTraceChannel1, 
            FCollisionQueryParams::DefaultQueryParam
        );
    }
}`
  }
];

export const BLOG_ZH = [
  {
    id: "volumetric-raymarching",
    title: "在虚幻5自定义 HLSL 中实现体积光线步进材质",
    excerpt: "深入研究如何绕过虚幻引擎材质编辑器的节点限制，直接在自定义表达式块中编写 GPU 光线步进代码，实现写实的瑞利/米氏多重光散射渲染。",
    category: "Real-time Rendering",
    date: "2026年5月14日",
    readTime: "阅读约12分钟",
    tags: ["HLSL", "UE5", "Shaders", "Raymarching"],
    content: `### 绕过标准管线，构建极致保真的自定义体积介质

在实时渲染中，体积雾、动态烟尘及星球级大气等体积效果，能赋予环境无与伦比的纵深感和物理真实感。虽然虚幻5内置的体积云（Volumetric Cloud）十分强大，但其主要针对行星级超大尺度。当我们需要在局部实现高精度体积特效时——比如空间传送门、能量能量防护罩或精密的魔法烟雾——我们必须绕过标准的延迟渲染管线，在底层构建自定义的光线步进器（Raymarcher）。

本篇文章将详细剖析如何利用自定义材质节点（Custom Node）编写一个高效的实时体积光线步进器，并提供一系列深度优化手段，使其在 4K 分辨率下依然能够稳定 60 FPS 渲染。

#### 光散射物理学
在动手写着色器代码之前，我们先理清光线与微观粒子的物理作用机理。光线在一个参与介质（Participating Medium）中的传播受以下三种行为制约：

1. **吸收 (Absorption)**: 光能被粒子转化为热能等其他能量形式，导致相机方向的光强衰减。
2. **外散射 (Out-scattering)**: 光线在传播途中，被粒子撞击偏离了射向相机的视线。
3. **内散射 (In-scattering)**: 外部光源或环境光被粒子反射，方向恰好转而射向相机，增加了该像素的亮度。

光线在特定偏转角 $\\theta$ 发生散射的概率由 **相位函数 (Phase Function)** 定义。对于极微小的气体分子，我们采用瑞利相位函数（Rayleigh Phase Function）：

$$P_{\\text{Rayleigh}}(\\theta) = \\frac{3}{16\\pi} (1 + \\cos^2\\theta)$$

对于较大的灰尘或微小液滴，我们则采用 Henyey-Greenstein (HG) 近似相位函数：

$$P_{\\text{HG}}(g, \\theta) = \\frac{1}{4\\pi} \\frac{1 - g^2}{(1 + g^2 - 2g\\cos\\theta)^{3/2}}$$

其中 $g \\in (-1, 1)$ 是不对称因子（Anisotropy）。正值的 $g$ 会引发强烈的向前散射（Forward-scattering），这便是当我们正对光源看去时，周围会出现极为亮丽耀眼的体积光晕的原因。

#### 核心循环优化
光线步进本质上是沿着像素发射出的视线向量一步步前进，并进行数值积分求和。这意味着每一个像素都会产生几十甚至上百次昂贵的纹理和噪声采样。如果不加优化，GPU 压力将会呈几何倍数增加。

1. **抖动与时间重建 (Jittering & TSR)**: 采用蓝噪声（Blue Noise）对步进的起点坐标进行沿视线方向的抖动，使得每一帧的采样位置各不相同。这样可以将高昂的步进次数（如 128 次）骤降至 16 次或 32 次，再利用虚幻引擎内置的 Temporal Super Resolution (TSR) 进行多帧混合重建，消除噪点，保证流畅性。
2. **光线提前截断 (Early Ray Termination)**: 在循环内时刻监控当前的累计透射率（Transmittance）。一旦透射率降低到阈值以下（例如 $0.01$），意味着该介质在此处已经彻底不透明，后面的光线再也传不过来，立即使用 break 退出循环。
3. **四分之一分辨率渲染与双边深度上采样 (Bilateral Upsampling)**: 在低分辨率的渲染缓冲区执行体积步进，最后使用双边深度感知滤波器将体积颜色合成回主通道，完美防止固态物体边缘出现锯齿与漏光现象。`
  },
  {
    id: "network-rigid-bodies",
    title: "虚幻5与 GAS 框架下的确定性物理子步回滚同步",
    excerpt: "将 Chaos 物理引擎底层的 Sub-stepping 与客户端预测和服务器和解机制融合，完美解决高频竞技游戏中多人物理刚体的网络同步偏差难题。",
    category: "Physics Simulation",
    date: "2026年4月2日",
    readTime: "阅读约18分钟",
    tags: ["C++", "Physics", "Netcode", "Chaos", "GAS"],
    content: `### 驯服 Chaos：竞技游戏中网络权威物理刚体的高效同步架构

在多人联机竞技游戏中，高运动强度的物理对象（如物理弹跳弹丸、载具撞击或体育竞技中的物理球体）的网络同步一直被奉为行业终极难题之一。虚幻引擎 5 引入了功能强大的 **Chaos 物理引擎**，但默认配置下，Chaos 并不直接提供面向客户端预测与回滚的机制。对于那些物理判定决定核心玩法的硬核游戏，我们必须从底层重构出一套网络物理预测求解器。

#### 核心基石：物理子步 (Sub-stepping) 的约束
物理模拟中，客户端与服务器的每帧耗时（$\\Delta t$）由于硬件和帧率波动往往是不一致的。若直接在变动的 Tick 步长下积分，两端的积分路径极易在瞬间产生不可挽回的巨大漂移。

为了确保数值模拟的确定性，必须开启 **物理子步（Sub-stepping）**。子步技术将一帧的 Tick 强行拆解为若干个固定时间跨度的物理微步（例如恒定 $0.01$ 秒，即 $100\\text{Hz}$）。这使得不论当前的渲染帧率如何变动，其底层的数值积分求解路径皆能完全吻合：

$$x_{t + \\Delta t} = x_t + v_t \\Delta t + \\frac{1}{2} a_t \\Delta t^2$$

#### 深入 Chaos 物理线程回调
为了让物理施力具备严格的确定性，我们绝对不能在虚幻常规的游戏主线程（Game Thread）中调用 AddForce()。这会导致指令到达物理逻辑的时间产生难以预测的错位。我们需要在 C++ 中使用 **Chaos 物理模拟回调系统 (Chaos Physics Callback System)** 挂载自定义的处理逻辑。

我们注册一个并行的回调函数，让其直接在底层的 Physics Thread 执行：

\`\`\`cpp
class FMyPhysicsCallback : public Chaos::FSimCallbackObject {
public:
    virtual void OnPreSimulate_Internal(Chaos::FRigidSolver* Solver) override {
        // 读取游戏主线程序列化过来的物理指令缓冲，精准施加确定性的驱动外力
        // 直接操作底层的刚体流状态
    }
};
\`\`\`

#### 预测、回滚与本地平滑和解
当服务器下发权威的刚体状态报文时，客户端会将其与本地保存的历史状态缓冲区进行比对。如果发现预测偏差超过了容许的精度门限：

1. **缓存当前渲染状态**：记录发生偏差修正前，网格体当前的渲染世界坐标。
2. **刚体回滚**：强制将 Chaos 物理引擎中该刚体的位置、线速度、角速度等属性拉回到服务器确认的历史帧状态。
3. **前向模拟重算**：使用缓存的历史玩家指令，将物理求解器强制连续单步迭代 $N$ 个固定子步，追赶上客户端当前的时间。
4. **渲染双端融合插值**：物理状态纠偏在瞬间发生，会带来严重的视觉闪烁和拉扯感。我们通过在客户端维持一个虚拟的渲染代理网格，利用三次埃尔米特（Hermite）样条曲线，将渲染网格体平滑地平移融合至最新的确定物理刚体位置，达成完全无缝的多人联机物理战斗。`
  },
  {
    id: "niagara-spatial-hash",
    title: "在 Niagara HLSL 脚本中构建 GPU 空间哈希网格",
    excerpt: "运用自定义 HLSL 缓冲区在 Niagara 粒子着色器中实现 O(N) 的邻近邻域查找算法，支撑在120帧稳定渲染超大规模的群鸟与战斗碎屑模拟。",
    category: "Gameplay Systems",
    date: "2026年2月20日",
    readTime: "阅读约9分钟",
    tags: ["Niagara", "HLSL", "UE5", "GPU", "Algorithms"],
    content: `### 突破算力瓶颈：将 GPU 群体交互算法复杂度从 O(N^2) 降低到 O(N)

在特效与场景设计中，动辄数万、数十万的微型机器人集群、深海鱼群或太空战舰爆炸溅落的宏大碎屑群落，能赋予场景极其震撼的视觉张力。然而，如果我们使用传统的双循环机制来计算粒子间的相互作用力（如群体避障、凝聚、对齐以及分离等 Boids 群落算法），每一颗粒子都必须去轮询所有其他的粒子。对于 10 万个粒子，这会产生：

$$100,000 \\times 100,000 = 100 \\text{ 亿次计算}$$

这种 $O(N^2)$ 的复杂度会在一瞬间挤爆 GPU 的计算单元，造成毁灭性的降帧。为了克服该瓶颈，我们需要在虚幻 Niagara 粒子系统的 HLSL 脚本中，实现一套全 GPU 计算的 **空间哈希网格（Spatial Hash Grid）**。

#### 空间哈希网格的设计架构
空间哈希网格的核心思路是将无限的 3D 三维物理空间，划分为一个个均匀的虚拟立方体单元（Voxel）。每个立方体网格的边长等于粒子最大交互半径。

我们在 GPU 上开辟并维护两张一维平铺的连续数据缓冲区：
1. **粒子哈希缓冲区 (Particle Hash Buffer)**：存储每一颗粒子当前所处单元格的哈希值以及该粒子的 ID。
2. **网格起始边界缓冲区 (Cell Start/End Buffer)**：用来记录特定哈希网格在已排序的粒子列表中，起始与结束对应的索引范围。

#### 优雅的 GPU 三阶执行流

1. **第一阶：哈希计算与平铺写入**
   每颗粒子根据其所处的 3D 物理空间坐标，折算成整数型的 3D 单元网格索引，随后利用大质数哈希散列算法，计算出一个平行的哈希值：
   $$H(x, y, z) = ((x \\cdot 73856093) \\oplus (y \\cdot 19349663) \\oplus (z \\cdot 83492791)) \\pmod M$$
   并将计算出的哈希和粒子 ID 写入到 Particle Hash Buffer 中。

2. **第二阶：并行排序 (Parallel Sort)**
   在 GPU 上利用极为高效的双调排序（Bitonic Sort）算法，对 Particle Hash Buffer 按照 Cell 哈希值进行从小到大排序。排序完成后，所有处在同一个三维体积格子里的粒子，在内存结构上被强制紧密排在了相邻位置。

3. **第三阶：边界标识与检索**
   启动一个轻量级着色器线程，对比粒子 $i$ 和 $i-1$ 的哈希值。若不一致，说明该处是两个格子的分界点，并将其起止序号填入 Cell Start/End Buffer。

现在，当粒子需要计算避障或凝聚力时，它只需计算自己的空间哈希，检索周围相邻的 27 个 3D 格子，并从边界缓冲区瞬间查出这些邻近格子所含的粒子切片，彻底避免了盲目轮询整个粒子库。运算复杂度成功由 $O(N^2)$ 坍塌到极其轻快的 $O(N)$ 线性级别，从而能够在 5.5ms 内**在虚幻 5 中轻松跑起 12 万只极速振翅的群体昆虫特效**。`
  }
];

export const RESEARCH_ZH = [
  {
    id: "quaternion-damper",
    title: "四元数非线性超空间中的临界阻尼角弹簧推导",
    mathFormula: "J \\ddot{\\theta} + C \\dot{\\theta} + K \\theta = 0 \\implies q_{next} = \\text{Slerp}(q_{current}, q_{target}, \\alpha)",
    mathLabel: "紧凑四元数空间下的二阶旋转弹簧阻尼物理系统方程",
    date: "2026年6月",
    problem: "将传统线性弹簧阻尼器映射到欧拉角进行旋转插值时，由于欧拉角本身的奇点限制，极易引发万向锁（Gimbal Lock），且在大角度差过渡时，旋转角速度会产生极其不自然的突变和系统振荡。",
    solution: "直接在 SO(3) 四元数流形超球面上推导出解析形式的非线性角弹簧求解器。由于始终沿着最短大圆路径进给，可在确保系统不发生万向锁的前提下，实现扭矩驱动的、完全临界阻尼的平滑逼近。",
    implementationDetails: "该 C++ 物理求解器实时计算当前旋转与目标旋转的最短路径偏置（通过四元数点积对半球朝向进行投影锁定），提取出等效的旋转位移扭矩向量，进而动态反算角加速度。目前，这一高阶节点被广泛部署于我们的 Control Rig 骨骼重定向算法中，驱动高频战斗中的武器挥舞惯性、动态角色视线注视追踪（Look-At）以及臀部受力倾斜的逼近。",
    cppCode: `// 物理解析临界阻尼四元数角弹簧求解器
FQuat SolveQuaternionSpring(
    const FQuat& CurrentRot,
    const FQuat& TargetRot,
    FVector& AngularVel, // 跨帧维持的物理角速度状态
    float SpringConstant, // 弹簧系数 K
    float DampingConstant, // 阻尼系数 C (通常设为 2 * sqrt(K) 以达到临界阻尼)
    float DeltaTime
) {
    // 投影检测：确保选择半球面上最短路径进行过渡
    FQuat ClampedTarget = TargetRot;
    float DotVal = CurrentRot | ClampedTarget;
    if (DotVal < 0.0f) {
        ClampedTarget = -ClampedTarget;
        DotVal = -DotVal;
    }
    
    // 计算旋转误差向量 (作为扭矩发生源)
    FQuat RotationDiff = ClampedTarget * CurrentRot.Inverse();
    FVector ErrorVector;
    float Angle;
    RotationDiff.ToAxisAndAngle(ErrorVector, Angle);
    ErrorVector = ErrorVector * FMath::UnwindRadians(Angle);
    
    // 旋转角弹簧经典力学方程: T = K * Error - C * Velocity
    FVector SpringTorque = ErrorVector * SpringConstant;
    FVector DampingTorque = AngularVel * DampingConstant;
    FVector Acceleration = SpringTorque - DampingTorque;
    
    // 数值积分：更新角速度与朝向四元数
    AngularVel += Acceleration * DeltaTime;
    FVector DeltaAngle = AngularVel * DeltaTime;
    float DeltaAngleLen = DeltaAngle.Size();
    
    if (DeltaAngleLen > 1e-5f) {
        FQuat DeltaQuat(DeltaAngle.GetUnsafeNormal(), DeltaAngleLen);
        return DeltaQuat * CurrentRot;
    }
    
    return CurrentRot;
}`
  },
  {
    id: "gpu-poisson",
    title: "流体计算中压力泊松方程的 GPU 迭代求解器研究",
    mathFormula: "\\nabla^2 p = \\frac{\\rho}{\\Delta t} \\nabla \\cdot \\mathbf{u}^* \\implies p_{i,j,k}^{k+1} = \\frac{1}{6} \\left( p_{i+1,j,k} + p_{i-1,j,k} + p_{i,j+1,k} + p_{i,j-1,k} + p_{i,j,k+1} + p_{i,j,k-1} - d^2 D_{i,j,k} \\right)",
    mathLabel: "用于三维流体网格不可压缩约束条件下的离散泊松-压力求解方程",
    date: "2026年4月",
    problem: "在基于网格的欧拉流体求解器中，为了满足质量守恒以及流速场散度为零（Divergence-free）的不可压缩约束，每一帧都必须在全局求解一个庞大而极其稀疏的对称线性方程组。若在 CPU 上求解，极易引发严重卡顿。",
    solution: "利用 HLSL 编写了基于红黑高斯-赛德尔（Red-Black Gauss-Seidel）或双缓冲雅可比（Jacobi）迭代的 GPU 并行求解内核，利用现代显卡的一级缓存空间关联度以及 LDS (本地共享内存) 优化线程组间的数据交换，将计算延迟压缩至亚毫秒。",
    implementationDetails: "将 3D 流体网格剖分为 8×8×8 的独立计算线程组。通过将当前计算栅格的物理邻近体素一并载入到 LDS (Local Data Share) 中，消除了高延迟的全局显存寻址交互。散度值作为单通道浮点纹理传入，压力场则在两个乒乓贴图（Ping-Pong Texture）之间轮流迭代刷新。",
    hlslCode: `// HLSL Compute Shader: GPU 多线程压力投影雅可比迭代单步内核
#define THREAD_GROUP_SIZE 8

Texture3D<float> InPressure : register(t0);
Texture3D<float> InDivergence : register(t1);
RWTexture3D<float> OutPressure : register(u0);

cbuffer GridParams : register(b0) {
    float3 GridDim;
    float CellSize;
    int CurrentPass; // 0代表红，1代表黑 (用于红黑块分区多线程同步)
};

[numthreads(THREAD_GROUP_SIZE, THREAD_GROUP_SIZE, THREAD_GROUP_SIZE)]
void CS_PressureProjection(uint3 DTid : SV_DispatchThreadID) {
    if (any(DTid >= (uint3)GridDim - 1) || any(DTid <= 0)) return;
    
    // 红黑交替分区校验，保证迭代计算的并行确定性与收敛速度
    if (((DTid.x + DTid.y + DTid.z) % 2) != (uint3)CurrentPass) return;
    
    // 从底层显卡的纹理高速缓存采样相邻的6个体素
    float pL = InPressure[DTid + uint3(-1, 0, 0)];
    float pR = InPressure[DTid + uint3(1, 0, 0)];
    float pB = InPressure[DTid + uint3(0, -1, 0)];
    float pT = InPressure[DTid + uint3(0, 1, 0)];
    float pD = InPressure[DTid + uint3(0, 0, -1)];
    float pU = InPressure[DTid + uint3(0, 0, 1)];
    
    float divergence = InDivergence[DTid];
    
    // 雅可比泊松迭代公式
    float d2 = CellSize * CellSize;
    float solvedPressure = (pL + pR + pB + pT + pD + pU - d2 * divergence) / 6.0;
    
    OutPressure[DTid] = solvedPressure;
}`
  }
];

export const SKILLS_ZH = [
  {
    name: "核心编程与系统设计",
    skills: [
      { name: "C++ (现代标准与虚幻规范)", proficiency: 98, details: "高频指针内存管理、多线程多路并发设计、自定义底层引擎架构、高性能内联汇编级代码调优。" },
      { name: "HLSL / GLSL 着色器编程", proficiency: 95, details: "计算着色器(Compute Shaders)、体积射线步进、高保真光线追踪与自定义渲染器、渲染管线指令最优化。" },
      { name: "物理求解器与高等数学", proficiency: 92, details: "高级线性代数、微分方程数值解法、经典动力学、流体力学 Navier-Stokes 方程数值离散化。" },
      { name: "面向数据设计 (DOD / ECS)", proficiency: 88, details: "CPU 缓存命中最优化、海量实体(Massive scale)高并发数据对齐、虚幻 Mass Framework 深度二次开发。" }
    ]
  },
  {
    name: "虚幻引擎深层开发",
    skills: [
      { name: "Niagara 粒子特效核心", proficiency: 96, details: "基于原生 HLSL 深度定制 Niagara Scratchpad、多维动态数据通道耦合、复杂流体场与粒子集群力学绑定。" },
      { name: "Gameplay 技能系统 (GAS)", proficiency: 94, details: "服务器绝对授权、复杂的客户端输入预测、状态回滚冲突判定以及多路网络 RPC 序列化裁剪。" },
      { name: "骨骼动画工程与重定向", proficiency: 95, details: "Control Rig 程序化控制、底层 C++ AnimGraph 自定义节点开发、超大规模运动匹配 (Motion Matching) 库优化。" },
      { name: "Chaos 物理与刚体解算", proficiency: 90, details: "物理多子步(Sub-stepping)力学钩子注入、动态物理动画融合(Physical Animation)、复杂柔性组织力学模拟。" }
    ]
  },
  {
    name: "性能分析与硬件开发",
    skills: [
      { name: "图形管线诊断与性能调优", proficiency: 94, details: "熟练运用 RenderDoc、Pix 抓帧、Unreal Insights 分析瓶颈，精准消除 Quad-Overdraw、缩减过高 Shader 指令。" },
      { name: "网络同步回滚与平滑纠偏", proficiency: 92, details: "高吞吐状态滑动窗口、输入确定性回放、历史碰撞体矩阵倒带及埃尔米特样条曲线高精度渲染纠偏。" },
      { name: "Vulkan / DirectX 12 核心API", proficiency: 85, details: "显卡底层流水线状态、显卡描述符表装配(Descriptor Tables)、GPU 屏障同步(Barrier)及多命令队列组装。" }
    ]
  }
];

export const TIMELINE_ZH = [
  {
    year: "2024 — 至今",
    role: "首席物理与技术美术工程师",
    company: "Hexaverse 互动娱乐",
    description: "主导并构建未公开 AAA 级电影级多人竞技沙盒游戏的实时物理沙盒以及高阶环境反应系统架构。",
    highlights: [
      "设计并上线了完全运行于 GPU 的 Niagara 复杂流体与爆破碎片交互算法，使得气象效果可对玩家动作做出即时响应，且完美达成 0% CPU 占用。",
      "基于 C++ 与 GAS 重构了核心战斗的网络同步底层，将多端近战及投掷物碰撞的同步偏差率缩减了 85%。",
      "研发了兼顾全身 IK 阻尼关节与运动匹配的混合骨骼解决方案，使其自适应渲染于 12 套截然不同的物理人形及异形骨骼。"
    ]
  },
  {
    year: "2021 — 2024",
    role: "资深实时渲染工程师",
    company: "Singularity 虚拟科技",
    description: "开发虚幻引擎底层 C++ 管线拓展、自研体积材质，并为大型虚拟制片和高品质主机端产品交付高效渲染模板。",
    highlights: [
      "在 HLSL 中自主研发了基于物理的大气散射光线步进算法(Raymarched Atmosphere)，并稳定应用于多套影视虚拟制片场景中。",
      "针对主流次世代主机进行显卡底层优化，优化后着色器关键循环指令周期减少 30%，整体帧耗时削减了 3 毫秒。",
      "深度开发 Chaos 物理破碎子系统，利用服务器端物理状态轻量打包技术，实现在复杂网络延迟下大量刚体建筑残骸的确定性网络复现。"
    ]
  },
  {
    year: "2018 — 2021",
    role: "玩法系统与技术美术开发工程师",
    company: "Ironbound 重工业娱乐",
    description: "设计与开发核心玩法，打造高拟真肌肉运动等物理骨骼节点，并负责制定整体性能调优模板。",
    highlights: [
      "自主编写了用于模拟肢体及肌肉微小惯性的动画求值节点(AnimNode)，显著改善了硬核近战游戏中物理打击反馈的视觉爆发力。",
      "编写了自动化性能分析脚本并在持续集成(CI)流水线中利用 Unreal Insights 监测核心热点，让 CPU 线程阻塞瓶颈无处遁形。",
      "利用虚幻引擎全局距离场(Distance Fields)编写了高阶动态顶点偏置的交互式大洋海水模拟着色器，达成写实的波浪浪花反应。"
    ]
  }
];
