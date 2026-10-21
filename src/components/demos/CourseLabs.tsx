import { useId, useState } from 'react';
import { pointsModel, motionModel, poseModel } from '../../lib/courseModels';

export function PointsLab() {
  const [offset, setOffset] = useState(0);
  const model = pointsModel(offset);
  const id = useId();
  return <div className="course-lab">
    <label htmlFor={id}>共同平移 X（厘米）<input id={id} type="range" min={-80} max={100} step={10} value={offset} onChange={e => setOffset(Number(e.target.value))} /><output>{offset}</output></label>
    <svg viewBox="0 0 360 160" role="img" aria-label="两个点共同平移，连线方向与长度保持不变">
      <path d="M20 135H340M30 145V15" fill="none" stroke="currentColor" opacity=".25" />
      <line x1={model.p[0] + 30} y1={135 - model.p[1]} x2={model.q[0] + 30} y2={135 - model.q[1]} stroke="currentColor" strokeWidth="2" />
      <circle cx={model.p[0] + 30} cy={115} r="5" fill="currentColor" /><text x={model.p[0] + 18} y={137} fill="currentColor" fontSize="12">P</text>
      <circle cx={model.q[0] + 30} cy={75} r="5" fill="currentColor" /><text x={model.q[0] + 38} y={70} fill="currentColor" fontSize="12">Q</text>
    </svg>
    <div className="lab-readout" aria-live="polite">P = ({model.p.join(', ')}) cm；Q = ({model.q.join(', ')}) cm<br />位移 = ({model.displacement.join(', ')}) cm · 长度 = {model.length} cm</div>
    <button className="lab-button" onClick={() => setOffset(0)}>重置</button>
  </div>;
}
export function TimestepLab() {
  const [h, setH] = useState(.25);
  const [steps, setSteps] = useState(0);
  const model = motionModel(2, h, steps);
  return <div className="course-lab">
    <label>模拟步长（切换时重置）<select value={h} onChange={e => { setH(Number(e.target.value)); setSteps(0); }}><option value={.25}>0.25 秒</option><option value={.1}>0.1 秒</option><option value={.02}>0.02 秒</option></select></label>
    <svg viewBox="0 0 360 110" role="img" aria-label={`匀速物体在 ${model.time.toFixed(2)} 秒的位置为 ${model.position.toFixed(2)} 米`}>
      <path d="M20 60H340" stroke="currentColor" opacity=".25" />
      <circle cx={20 + Math.min(model.position, 10) * 32} cy="60" r="7" fill="currentColor" />
      <text x="20" y="90" fill="currentColor" fontSize="11">0 m</text><text x="300" y="90" fill="currentColor" fontSize="11">10 m</text>
    </svg>
    <div className="lab-readout" aria-live="polite">速度 2 m/s · {steps} 步 · 模拟时间 {model.time.toFixed(2)} s · 位置 {model.position.toFixed(2)} m</div>
    <div className="lab-actions"><button className="lab-button" disabled={model.time >= 5 - 1e-9} onClick={() => setSteps(n => n + 1)}>推进一步</button><button className="lab-button" onClick={() => setSteps(Math.round(1 / h))}>推进至 1 秒</button><button className="lab-button" onClick={() => setSteps(0)}>重置</button></div>
  </div>;
}
export function PoseLab() {
  const [rootX, setRootX] = useState(100);
  const model = poseModel(rootX);
  const id = useId();
  return <div className="course-lab">
    <label htmlFor={id}>root 的组件 X（厘米）<input id={id} type="range" min={50} max={200} step={10} value={rootX} onChange={e => setRootX(Number(e.target.value))} /><output>{rootX}</output></label>
    <svg viewBox="0 0 360 180" role="img" aria-label="纯平移的三节点骨架：移动根节点，子节点局部位置不变">
      <path d={`M${rootX} 150 L${model.pelvis[0]} 60 L${model.foot[0]} 150`} fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx={rootX} cy="150" r="5" fill="currentColor" /><circle cx={model.pelvis[0]} cy="60" r="5" fill="currentColor" /><circle cx={model.foot[0]} cy="150" r="5" fill="currentColor" />
      <text x={rootX - 32} y="173" fill="currentColor" fontSize="11">root</text><text x={rootX + 10} y="50" fill="currentColor" fontSize="11">pelvis</text><text x={model.foot[0] + 8} y="155" fill="currentColor" fontSize="11">foot</text>
    </svg>
    <div className="lab-readout" aria-live="polite">foot 局部 = ({model.footLocal.join(', ')}) cm（不变）<br />foot 组件 = ({model.foot.join(', ')}) cm</div>
    <button className="lab-button" onClick={() => setRootX(100)}>重置</button>
  </div>;
}
