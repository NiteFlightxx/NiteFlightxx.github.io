export const RESEARCH_WORKS = [
  { id:'gpu-physics', name:'GPUPhysicsLab', kind:'自主项目', field:'GPU PHYSICS', diagram:'physics', title:'在 GPU 上，探索实时物理。', description:'从碰撞检测到约束求解，记录 Unreal Engine 中的 GPU 仿真、RDG 资源与状态提交。', href:'knowledge/gpu-physics-plugin/', tags:['Unreal Engine','RDG','AVBD'] },
  { id:'aircraft', name:'AircraftLab', kind:'自主项目', field:'DYNAMICS & CONTROL', diagram:'flight', title:'从控制意图，到真实的运动。', description:'围绕四旋翼动力学、飞行控制与仿真架构，连接任务意图、控制器和物理响应。', href:'knowledge/quadcopter-flight-control-math/', tags:['Dynamics','PID / MPCC','Unreal Engine'] },
  { id:'foot-ik', name:'Predictive Foot IK', kind:'算法研究', field:'ANIMATION SYSTEMS', diagram:'animation', title:'在下一步落地之前，理解接触。', description:'梳理脚步预测、落脚候选与接触锁定的通用模型，明确规划和最终 IK 求解的边界。', href:'knowledge/predictive-foot-ik/', tags:['Contact planning','Animation','IK'] },
] as const;
