import { Project, BlogArticle, ResearchNote, SkillCategory, TimelineEvent } from "./types";

export const PROJECTS_DATA: Project[] = [
  {
    id: "aetherflow",
    title: "AetherFlow: GPU Eulerian Fluid Solver",
    category: "Physics Simulation",
    description: "A custom-built Eulerian fluid solver integrated into Unreal Engine 5 via Niagara and HLSL compute shaders, enabling highly interactive physical smoke and mist.",
    extendedDetails: "AetherFlow is a grid-based (Eulerian) fluid dynamics solver that runs entirely on the GPU. By bypassing the standard CPU-bound particle solvers, it computes velocity advection, pressure projection, and density propagation directly in custom Niagara HLSL scratchpads. It uses a 3D grid layout packed into a volume texture. Collision with characters and obstacles is handled via distance fields, injecting velocity vectors dynamically into the simulation grid. The simulation is optimized with Jacobi iteration sub-stepping, completing in less than 1.2 milliseconds of render budget per frame.",
    tech: ["UE5", "C++", "HLSL", "Niagara", "Compute Shaders"],
    metrics: [
      { label: "Execution Time", value: "1.18 ms" },
      { label: "Grid Resolution", value: "128 × 128 × 128" },
      { label: "Voxel Count", value: "2.1 Million" },
      { label: "FPS", value: "120+ Stable" }
    ],
    visualPrompt: "A high-fidelity cinematic simulation of slate gray gaseous smoke curling smoothly around a metallic hand, computed via a grid of vector fields with dynamic micro-vortices under soft dramatic spot lighting.",
    codeSnippet: `// Niagara HLSL Scratchpad - Pressure Projection Jacobi Step
void SolveJacobi(
    in float3 ThreadId,
    in Texture3D<float> PressureTex,
    in Texture3D<float> DivergenceTex,
    out float OutPressure
) {
    float3 uv = (ThreadId + 0.5) / GridDimensions;
    float dx = 1.0 / GridDimensions.x;
    
    // Sample 6 spatial neighbors
    float pL = PressureTex.SampleLevel(LinearClamp, uv - float3(dx,0,0), 0).r;
    float pR = PressureTex.SampleLevel(LinearClamp, uv + float3(dx,0,0), 0).r;
    float pB = PressureTex.SampleLevel(LinearClamp, uv - float3(0,dx,0), 0).r;
    float pT = PressureTex.SampleLevel(LinearClamp, uv + float3(0,dx,0), 0).r;
    float pD = PressureTex.SampleLevel(LinearClamp, uv - float3(0,0,dx), 0).r;
    float pU = PressureTex.SampleLevel(LinearClamp, uv + float3(0,0,dx), 0).r;
    
    float div = DivergenceTex.SampleLevel(LinearClamp, uv, 0).r;
    
    // Solve Poisson Equation for Pressure
    OutPressure = (pL + pR + pB + pT + pD + pU - (dx * dx) * div) / 6.0;
}`
  },
  {
    id: "helios",
    title: "Helios: Volumetric Atmospheric Scattering",
    category: "Real-time Rendering",
    description: "A physically based multi-scattering atmospheric model rendering realistic dynamic skyboxes, volumetric clouds, and planetary-scale light shafts.",
    extendedDetails: "Helios is a complete real-time implementation of Rayleigh and Mie atmospheric scattering. Written in C++ as an Engine Extension, it bypasses UE's default sky component, executing a custom raymarcher through the atmosphere. The system computes sky luminance dynamically by integrating the light transport equation over multiple atmospheric layers, calculating transmittance and optical depth. Volumetric clouds use a 3D curl-noise volume texture for hyper-realistic wind shearing, while single-pass deep shadow maps handle dynamic cloud self-shadowing and light shafts (god rays) with spherical-harmonics based skylight projection.",
    tech: ["UE5", "C++", "HLSL", "Volumetric Raymarching", "Shader Model 6"],
    metrics: [
      { label: "Scattering Samples", value: "32 Primary, 8 Secondary" },
      { label: "Resolution", value: "Native 4K (Quarter-Res Raymarch)" },
      { label: "Memory Footprint", value: "32MB GPU VRAM" },
      { label: "API", value: "DirectX 12 / Vulkan" }
    ],
    visualPrompt: "A cinematic orbital shot of a planetary horizon showing a rich layered atmosphere scattering vibrant deep indigo, amber orange, and dusty blue light under an ultra-crisp starfield, in the style of interstellar.",
    codeSnippet: `// Volumetric Atmosphere Raymarched Transmittance Calculation
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
    title: "ApexMotion: Procedural Kinematics & Layering",
    category: "Animation Technical Art",
    description: "A state-of-the-art procedural movement runtime blending bone-accurate IK physics with multi-directional motion matching databases.",
    extendedDetails: "ApexMotion is a custom animation pipeline that bridges the gap between physics and traditional keyframe motion. Built with custom C++ AnimNodes, it reads the physics state of character capsules and dynamically builds skeletal orientations. It uses full body Inverse Kinematics (IK) to align feet, knees, hips, and hands perfectly with complex terrain, and integrates an analytical spring-damper joint solver that adds secondary physical mass reaction (such as weapon weight dragging or flesh micro-vibrations). When the character receives impacts, a specialized physical-animation node blends active ragdoll simulation with skeletal keyframes on a per-bone hierarchy.",
    tech: ["UE5", "C++", "Control Rig", "AnimGraphs", "IK-Rig", "Motion Matching"],
    metrics: [
      { label: "Skeletal Joints Evaluated", value: "86 Bones @ Real-time" },
      { label: "Blending Latency", value: "< 0.05 ms" },
      { label: "Ragdoll Blend Smoothness", value: "Hermite Spline Interp" },
      { label: "Memory Overhead", value: "1.4MB Animation Cache" }
    ],
    visualPrompt: "An elegant, minimalist render of a high-tech robotic humanoid skeleton standing in a balanced wide pose, glowing joint nodes with orange line wires mapping mechanical vector calculations on concrete.",
    codeSnippet: `// Custom AnimNode C++ Excerpt: Angular Velocity Spring Damper Joint Tracking
void FAnimNode_ApexSpringJoint::Evaluate_AnyThread(FPoseContext& Output) {
    float DeltaTime = Output.CurveValueCache.GetDeltaTime();
    FCompactPose& OutPose = Output.Pose;
    
    FTransform CurrentTransform = OutPose[TargetBone];
    FQuat CurrentRot = CurrentTransform.GetRotation();
    
    // Critical Damped Quaternion Spring-Damper
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
    title: "Chronos: Competitive Combat Network Engine",
    category: "Gameplay Systems",
    description: "A highly optimized server-authoritative netcode framework with sub-millisecond client prediction and rollback reconciliation.",
    extendedDetails: "Chronos is an advanced gameplay and combat subsystem designed to handle high-fidelity physics replication and fast-paced melee/ranged actions. Built entirely in C++ using Unreal's Gameplay Ability System (GAS), it implements a fully deterministic timeline that buffers player input, transform histories, and physics solver states for up to 300 milliseconds. When the server detects an action, it rewinds the game state to the exact timestamp of the client's execution, solves the interaction, and replicates the corrected result. The client reconciles instantly by fast-forwarding local state buffers, eliminating visual rubber-banding and providing crisp, lag-free registration.",
    tech: ["UE5", "C++", "Netcode", "GAS", "Deterministic Prediction", "Replication"],
    metrics: [
      { label: "State Buffering", value: "300 ms sliding window" },
      { label: "Reconciliation Latency", value: "Sub-millisecond" },
      { label: "Bandwidth Savings", value: "40% compared to default RPCs" },
      { label: "Simulation Re-ticks", value: "Up to 32 frames in 0.2ms" }
    ],
    visualPrompt: "A sleek technical diagram of server client synchronized timelines, represented as glowing translucent wireframe corridors of blue and orange overlapping grids on a dark graphite background.",
    codeSnippet: `// Server-Authoritative Input Rewind & Lag Compensation
void UChronosCombatComponent::ReconcileClientInput(
    float ClientTimestamp, 
    FVector TargetLocation, 
    FHitResult& OutHitResult
) {
    // 1. Fetch historical state buffer
    TDoubleLinkedList<FChronosHistoryState>::TDoubleLinkedListNode* Node = HistoryBuffer.GetTail();
    while (Node) {
        if (Node->GetValue().Timestamp <= ClientTimestamp) {
            break;
        }
        Node = Node->GetPrev();
    }
    
    if (Node) {
        const FChronosHistoryState& HistoryState = Node->GetValue();
        // Temporarily position collision volumes to client-time state
        FRollbackSceneContext Rollback(GetWorld(), HistoryState);
        
        // Execute collision sweep in historical scene
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

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    id: "volumetric-raymarching",
    title: "Volumetric Raymarching in Custom HLSL Shaders",
    excerpt: "An in-depth study of bypassing Unreal's material system to write direct raymarched media inside custom expression blocks, implementing Rayleigh/Mie light scattering.",
    category: "Real-time Rendering",
    date: "May 14, 2026",
    readTime: "12 min read",
    tags: ["HLSL", "UE5", "Shaders", "Raymarching"],
    content: `### Bypassing standard pipelines for true volumetric media

In modern rendering, volumetric effects such as smoke, dynamic fog, and celestial atmosphere add unparalleled realism and physical presence. While Unreal Engine 5's default Volumetric Cloud system is incredibly powerful, it operates at a planetary scale. For high-fidelity localized media—such as physical portals, energy shields, or dense medical nebulas—we must bypass the standard deferred pipeline and construct custom raymarchers.

This article details how to write a real-time raymarcher inside a custom Material node in Unreal Engine 5, including optimizations to achieve stable 60 FPS performance at 4K.

#### The Physics of Scattering
Before writing shader code, we must understand how light interacts with microscopic particles. The light transport equation inside a participating medium is governed by:

1. **Absorption**: Light converted into other forms of energy (reducing luminance).
2. **Out-scattering**: Light redirected *away* from the camera view ray.
3. **In-scattering**: Ambient and direct light redirected *into* the camera view ray.

The probability of light scattering at a specific angle $\\theta$ is defined by a **Phase Function**. For tiny gas molecules, we use the Rayleigh Phase Function:

$$P_{\\text{Rayleigh}}(\\theta) = \\frac{3}{16\\pi} (1 + \\cos^2\\theta)$$

For larger droplets or dust particles, we use the Henyey-Greenstein (HG) approximation:

$$P_{\\text{HG}}(g, \\theta) = \\frac{1}{4\\pi} \\frac{1 - g^2}{(1 + g^2 - 2g\\cos\\theta)^{3/2}}$$

Where $g \\in (-1, 1)$ defines the scattering anisotropy. A positive $g$ value causes strong forward-scattering (creating intense halos when looking toward a light source).

#### Optimizing the Inner Loop
Raymarching requires walking along the view camera ray and performing numerical integration. This can easily result in thousands of texture fetches and mathematical operations per pixel. To keep the execution within a reasonable GPU budget (under 1.5ms):

1. **Jittering and Temporal Reconstruction**: Instead of taking 128 expensive steps, take 16 or 32 steps. Jitter the ray starting offset along the view vector using a Blue Noise texture, and then reconstruct the volume across multiple frames using a Temporal Super-Resolution filter.
2. **Early Ray Termination**: Monitor the accumulated transmittance. If transmittance falls below a threshold (e.g., $0.01$), stop raymarching immediately. The medium is fully opaque at that point, and additional computation is wasted.
3. **Low-Resolution rendering**: Execute the raymarcher on a quarter-resolution buffer, and then upscale the output using a Bilateral Depth-Aware Upsampler to prevent halo artifacts on solid geometry boundaries.`
  },
  {
    id: "network-rigid-bodies",
    title: "Deterministic Physics Sub-stepping in UE5 & GAS",
    excerpt: "Integrating Chaos Physics with a client-side prediction and server-reconciliation netcode layer to synchronize fast-moving competitive rigidbodies.",
    category: "Physics Simulation",
    date: "April 02, 2026",
    readTime: "18 min read",
    tags: ["C++", "Physics", "Netcode", "Chaos", "GAS"],
    content: `### Taming Chaos: Network authoritative rigidbodies in competitive titles

Synchronization of high-velocity physics-based objects in multiplayer games is historically one of the most difficult engineering tasks. Unreal Engine 5 introduced **Chaos Physics**, a powerful physics simulation engine, but by default, it does not support full server-authoritative prediction and rollback. For titles where physical projectiles, vehicles, or sports objects dictate core mechanics, we must design a custom deterministic synchronization system.

#### The Sub-stepping Constraint
Unreal's main thread tick rate varies. If a client runs at 60 FPS and the server at 30 FPS, their physics simulation steps ($\\Delta t$) differ, leading to catastrophic divergence. To prevent this, we must enable **Physics Sub-stepping**.

Sub-stepping splits a single frame tick into multiple fixed physics sub-ticks (e.g., exactly $0.01$ seconds or $100\\text{Hz}$). This ensures that the numerical integrations (Euler or Verlet) perform identically regardless of the hardware's render frame rate:

$$x_{t + \\Delta t} = x_t + v_t \\Delta t + \\frac{1}{2} a_t \\Delta t^2$$

#### Hooks Into the Chaos Physics Tick
To inject forces deterministically, we cannot use standard \`TickComponent()\` on the game thread. We must hook directly into the Physics Thread using the **Chaos Physics Callback system**.

We register a custom solver callback that runs concurrently with the physics work:

\`\`\`cpp
class FMyPhysicsCallback : public Chaos::FSimCallbackObject {
public:
    virtual void OnPreSimulate_Internal(Chaos::FRigidSolver* Solver) override {
        // Retrieve state buffer, calculate predicted forces
        // Directly manipulate internal physics states
    }
};
\`\`\`

#### Rollback and Reconciliation
When a packet arrives from the server, we compare the historic state with our local buffer. If a drift exceeding a specific threshold is found:

1. **Save current state**: Store current rendering transforms.
2. **Rollback**: Set the physics simulation state (position, velocity, angular momentum) back to the last validated server frame.
3. **Re-simulate**: Force-tick the Chaos solver for $N$ steps to catch up to the current client time, applying buffered inputs.
4. **Visual Smoothing**: Since an instant correction causes jarring visual jumps, we interpolate the visual representation of the mesh back to the physical location over several frames using cubic Hermite splines.`
  },
  {
    id: "niagara-spatial-hash",
    title: "GPU Spatial Hash Grids inside Niagara Scratchpads",
    excerpt: "Implementing a dynamic O(N) neighbor look-up solver on the GPU using custom HLSL buffers to simulate massive swarm agents in real-time.",
    category: "Gameplay Systems",
    date: "February 20, 2026",
    readTime: "9 min read",
    tags: ["Niagara", "HLSL", "UE5", "GPU", "Algorithms"],
    content: `### Scaling swarm physics from O(N^2) to O(N) on the GPU

In animation art and design, generating swarms of micro-robots, schooling fish, or starship battle debris adds immense scale to environments. If we implement particle-to-particle interactions (like boids flocking, cohesion, alignment, and separation) naively, every particle must inspect every other particle. For 100,000 particles, this results in:

$$100,000 \\times 100,000 = 10,000,000,000 \\text{ interactions}$$

This $O(N^2)$ complexity instantly crashes the GPU. We can overcome this bottleneck by implementing a **GPU-based Spatial Hash Grid** directly inside Unreal's Niagara using HLSL.

#### Designing the GPU Grid
A spatial hash grid divides 3D space into uniform cubes (voxels) with a predefined cell size equal to the maximum interaction radius of a particle. 

The structure is represented by two primary flat buffers:
1. **Particle Hash Buffer**: Stores the cell index and particle index for every particle.
2. **Cell Start/End Buffer**: Stores where a cell's particle listing starts and ends in the sorted particle list.

#### The Three-Pass GPU Algorithm

1. **Pass 1: Hash Calculation (Parallel Write)**
   Each particle calculates its 3D cell coordinates and converts them to a flat 1D hash value using a prime multiplier hashing function:
   $$H(x, y, z) = ((x \\cdot 73856093) \\oplus (y \\cdot 19349663) \\oplus (z \\cdot 83492791)) \\pmod M$$
   The hash and particle ID are written to the Particle Hash Buffer.

2. **Pass 2: Parallel Sort**
   We sort the Particle Hash Buffer by Cell Index. This places all particles residing in the same cell next to each other in memory. In Niagara, we can use an optimized Radix or Bitonic Sort shader.

3. **Pass 3: Boundary Construction**
   We run a simple kernel that compares the cell index of particle $i$ with particle $i-1$. If they differ, we mark the boundaries, populating the Cell Start/End Buffer.

Now, when a boid agent calculates flocking, it computes its cell hash, retrieves the neighbor cells (inspecting only 27 adjacent cells in 3D), and reads the exact slice of particles. The complexity collapses from $O(N^2)$ to a pristine $O(N)$ linear rate, allowing **120,000 agents at 90+ FPS** inside Unreal Engine 5.`
  }
];

export const RESEARCH_NOTES: ResearchNote[] = [
  {
    id: "quaternion-damper",
    title: "Critically Damped Angular Springs in Quaternion Space",
    mathFormula: "J \\ddot{\\theta} + C \\dot{\\theta} + K \\theta = 0 \\implies q_{next} = \\text{Slerp}(q_{current}, q_{target}, \\alpha)",
    mathLabel: "Second-order rotational spring-damper equation in compact quaternion form",
    date: "June 2026",
    problem: "Traditional linear spring-dampers mapped to Euler angles suffer from gimbal lock, unstable rotational integration, and unnatural acceleration profiles under large angle differentials.",
    solution: "Derive an analytical angular spring-damper that operates directly inside the hypersphere of SO(3) quaternions, ensuring path-independent, torque-driven, critically damped convergence without gimbal lock.",
    implementationDetails: "This C++ solver calculates the shortest-path rotational offset (using quaternion dot-products to ensure hemispherical tracking), extracts the torque-vector equivalent of a rotational displacement, and updates angular acceleration dynamically. It is deployed inside custom Control Rig nodes for weapon inertia, dynamic neck tracking, and procedural hip tilting.",
    cppCode: `// Analytical Critically-Damped Quaternion Spring-Damper
FQuat SolveQuaternionSpring(
    const FQuat& CurrentRot,
    const FQuat& TargetRot,
    FVector& AngularVel, // Tracked state across frames
    float SpringConstant, // K
    float DampingConstant, // C (typically 2 * sqrt(K) for critical damping)
    float DeltaTime
) {
    // Hemispherical check: ensure we take shortest path
    FQuat ClampedTarget = TargetRot;
    float DotVal = CurrentRot | ClampedTarget;
    if (DotVal < 0.0f) {
        ClampedTarget = -ClampedTarget;
        DotVal = -DotVal;
    }
    
    // Calculate rotational error vector (Torque generator)
    FQuat RotationDiff = ClampedTarget * CurrentRot.Inverse();
    FVector ErrorVector;
    float Angle;
    RotationDiff.ToAxisAndAngle(ErrorVector, Angle);
    ErrorVector = ErrorVector * FMath::UnwindRadians(Angle);
    
    // Rotational Spring force equation: T = K * Error - C * Velocity
    FVector SpringTorque = ErrorVector * SpringConstant;
    FVector DampingTorque = AngularVel * DampingConstant;
    FVector Acceleration = SpringTorque - DampingTorque;
    
    // Integrate angular velocity & rotation
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
    title: "GPU Poisson Solvers for Pressure Projection in Fluid Solvers",
    mathFormula: "\\nabla^2 p = \\frac{\\rho}{\\Delta t} \\nabla \\cdot \\mathbf{u}^* \\implies p_{i,j,k}^{k+1} = \\frac{1}{6} \\left( p_{i+1,j,k} + p_{i-1,j,k} + p_{i,j+1,k} + p_{i,j-1,k} + p_{i,j,k+1} + p_{i,j,k-1} - d^2 D_{i,j,k} \\right)",
    mathLabel: "Discretized Poisson-Pressure equation for grid-based incompressibility constraints",
    date: "April 2026",
    problem: "In Eulerian fluid solvers, enforcing the incompressibility constraint (conservation of mass, divergence-free velocity field) requires solving a massive sparse system of linear equations every frame, which bottlenecks CPUs completely.",
    solution: "Implement a Red-Black Gauss-Seidel or Jacobi solver on the GPU in HLSL, leveraging texture cash spatial coherency and optimized thread-group shared memory (LDS) to solve pressure fields under a 1ms window.",
    implementationDetails: "Dividing the grid into a three-dimensional layout of 8×8×8 thread groups. By packing neighboring boundaries inside Local Data Share (LDS), we eliminate high-latency global memory lookups. The Divergence of the velocity field is stored in a single channel float texture, and pressure is iteratively updated in double-buffered textures.",
    hlslCode: `// HLSL Compute Shader: Multi-threaded pressure projection inner step
#define THREAD_GROUP_SIZE 8

Texture3D<float> InPressure : register(t0);
Texture3D<float> InDivergence : register(t1);
RWTexture3D<float> OutPressure : register(u0);

cbuffer GridParams : register(b0) {
    float3 GridDim;
    float CellSize;
    int CurrentPass; // For Red-Black partitioning
};

[numthreads(THREAD_GROUP_SIZE, THREAD_GROUP_SIZE, THREAD_GROUP_SIZE)]
void CS_PressureProjection(uint3 DTid : SV_DispatchThreadID) {
    if (any(DTid >= (uint3)GridDim - 1) || any(DTid <= 0)) return;
    
    // Evaluate only red or black cells depending on pass to preserve determinism
    if (((DTid.x + DTid.y + DTid.z) % 2) != (uint3)CurrentPass) return;
    
    // Fetch neighbors from global texture (highly cached in modern GPUs)
    float pL = InPressure[DTid + uint3(-1, 0, 0)];
    float pR = InPressure[DTid + uint3(1, 0, 0)];
    float pB = InPressure[DTid + uint3(0, -1, 0)];
    float pT = InPressure[DTid + uint3(0, 1, 0)];
    float pD = InPressure[DTid + uint3(0, 0, -1)];
    float pU = InPressure[DTid + uint3(0, 0, 1)];
    
    float divergence = InDivergence[DTid];
    
    // Jacobi Poisson projection
    float d2 = CellSize * CellSize;
    float solvedPressure = (pL + pR + pB + pT + pD + pU - d2 * divergence) / 6.0;
    
    OutPressure[DTid] = solvedPressure;
}`
  }
];

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    name: "Core Systems & Programming",
    skills: [
      { name: "C++ (Modern / Unreal Standards)", proficiency: 98, details: "Memory management, asynchronous threading, engine-level extensions, and assembly optimization." },
      { name: "HLSL / GLSL Shading", proficiency: 95, details: "Compute shaders, raymarching, volumetric rendering, and writing optimized raster/compute pipelines." },
      { name: "Math & Physics Solvers", proficiency: 92, details: "Linear algebra, numerical integration, differential equations, rigid body dynamics, and fluid solvers." },
      { name: "Data-Oriented Design (DOD)", proficiency: 88, details: "Massive scale entity architectures, CPU cache layout optimization, and Unreal Mass Framework." }
    ]
  },
  {
    name: "Unreal Engine Tech Stack",
    skills: [
      { name: "Niagara VFX Pipeline", proficiency: 96, details: "Writing custom HLSL scratchpads, dynamic data channels, and fluid-grid solver coupling." },
      { name: "Gameplay Ability System (GAS)", proficiency: 94, details: "Server-authoritative netcode, predictive abilities, modifier attributes, and combat systems." },
      { name: "Animation Engineering", proficiency: 95, details: "Control Rig, dynamic AnimGraphs, Motion Matching databases, and full-body physical animation blending." },
      { name: "Chaos Physics & Solvers", proficiency: 90, details: "Sub-stepped custom force resolvers, soft bodies, skeletal ragdoll blending, and collision hooks." }
    ]
  },
  {
    name: "Performance & Architecture",
    skills: [
      { name: "Render Pipeline Debugging", proficiency: 94, details: "RenderDoc, Pix, Unreal Insights, and profiling draw calls, quad-overdraw, and shader instruction count." },
      { name: "Network Prediction & Rollback", proficiency: 92, details: "Input-buffering, replication optimizations, server rewind collision solvers, and client reconciliation." },
      { name: "Vulkan / DirectX 12 Low Level", proficiency: 85, details: "GPU state binds, descriptor tables, barrier optimizations, and command queue management." }
    ]
  }
];

export const CAREER_TIMELINE: TimelineEvent[] = [
  {
    year: "2024 — Present",
    role: "Lead Physics & Technical Art Engineer",
    company: "Hexaverse Studios",
    description: "Architecting the physical sandbox and real-time environment systems for an unannounced AAA cinematic multiplayer title.",
    highlights: [
      "Designed and optimized a GPU-based fluid and debris solver running in Niagara, rendering interactive weather that reacts to player skills with 0% CPU impact.",
      "Engineered an authoritative multiplayer combat netcode using Unreal C++ and GAS, reducing average weapon registration discrepancies by 85%.",
      "Created a fully procedural movement system blending motion matching and sub-stepped joint spring dampers across 12 unique humanoid skeletons."
    ]
  },
  {
    year: "2021 — 2024",
    role: "Senior Real-time Rendering Engineer",
    company: "Singularity Interactive",
    description: "Developed engine-level extensions, volumetric shaders, and custom post-processing pipelines for cinema and dynamic gaming environments.",
    highlights: [
      "Wrote a custom Raymarched Atmospheric Atmospheric Scattering system in HLSL, deployed in high-end virtual production environments.",
      "Optimized shader rendering pipelines, decreasing peak GPU instruction cycles by 30% and lowering overall frame budgets for target consoles by 3ms.",
      "Built procedural destruction utilities in C++ hooking into Chaos, enabling deterministic debris replication on high-packet server loads."
    ]
  },
  {
    year: "2018 — 2021",
    role: "Gameplay Systems & Tech Art Developer",
    company: "Ironbound games",
    description: "Created gameplay systems, character physics nodes, and technical art templates for physical interaction.",
    highlights: [
      "Built custom anim-nodes for physical muscle and appendage inertia, enhancing visual impact feedback in melee interactions.",
      "Developed an automated performance reporting profiling suite using Unreal Insights, detecting CPU bottlenecks automatically in continuous integration.",
      "Authored custom rendering materials with dynamic vertex displacement and distance field fields for interactive ocean water waves."
    ]
  }
];
