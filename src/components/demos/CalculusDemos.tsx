import { useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { renderToString } from 'katex';
import './CalculusDemos.css';

// All displayed equations use the same KaTeX convention as the article body.
function MathText({ tex }: { tex: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderToString(tex, { throwOnError: true, strict: false }) }} />;
}

function PlotSlider({ label, value, min, max, step = .01, onChange }: {
  label: string; value: number; min: number; max: number; step?: number | 'any'; onChange: (value: number) => void;
}) {
  const id = useId();
  return <label className="calculus-control" htmlFor={id}>
    <span>{label}<output htmlFor={id}>{value.toFixed(step === 'any' || step < 1 ? 2 : 0)}</output></span>
    <input id={id} type="range" min={min} max={max} step={step} value={value}
      onChange={event => onChange(Number(event.target.value))} />
  </label>;
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return <section className="calculus-demo" aria-label={title}>
    <div className="calculus-demo-title"><strong>{title}</strong><span>可拖动 · 支持键盘滑块</span></div>
    {children}
  </section>;
}

function localPoint(event: PointerEvent<SVGSVGElement>) {
  const matrix = event.currentTarget.getScreenCTM();
  if (!matrix) return null;
  const point = event.currentTarget.createSVGPoint();
  point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fixed = (value: number) => (Math.abs(value) < .00005 ? 0 : value).toFixed(4);

export function SecantDemo() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);
  const active = useRef<{ point: 'a' | 'b'; pointer: number } | null>(null);
  const clip = `secant-${useId().replaceAll(':', '')}`;
  const px = (x: number) => 260 + x * 84;
  const py = (y: number) => 320 - y * 42;
  const coincident = Math.abs(b - a) < 1e-8;
  // This simplified difference quotient avoids cancellation near coincident samples.
  const slope = a + b;
  const curve = Array.from({ length: 101 }, (_, i) => {
    const x = -2.5 + i * .05;
    return `${i ? 'L' : 'M'}${px(x)},${py(x*x)}`;
  }).join(' ');
  const update = (event: PointerEvent<SVGSVGElement>, key: 'a' | 'b') => {
    const point = localPoint(event);
    if (!point) return;
    const x = Math.round(clamp((point.x - 260) / 84, -2.3, 2.3) * 100) / 100;
    (key === 'a' ? setA : setB)(x);
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (active.current?.pointer === event.pointerId) active.current = null;
  };
  return <Frame title="割线如何趋近切线">
    <div className="calculus-controls">
      <PlotSlider label="切点横坐标" value={a} min={-2.3} max={2.3} onChange={setA} />
      <PlotSlider label="第二点横坐标" value={b} min={-2.3} max={2.3} onChange={setB} />
    </div>
    <svg className="calculus-plot" viewBox="0 0 520 360" role="img" aria-label="平方函数、割线与切线；拖动圆点改变横坐标"
      onPointerDown={event => {
        const key = (event.target as Element).getAttribute('data-point');
        if (event.button !== 0 || (key !== 'a' && key !== 'b')) return;
        active.current = { point: key, pointer: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event, key);
      }}
      onPointerMove={event => { if (active.current?.pointer === event.pointerId) update(event, active.current.point); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { active.current = null; }}>
      <defs><clipPath id={clip}><rect x="44" y="22" width="432" height="298" /></clipPath></defs>
      {[1, 2, 3, 4, 5, 6].map(y => <g key={y}>
        <line className="calculus-grid" x1="44" x2="476" y1={py(y)} y2={py(y)} />
        <text x="30" y={py(y)+4}>{y}</text>
      </g>)}
      <path className="calculus-axis" d="M44 320H488M260 332V18" />
      {[-2, -1, 0, 1, 2].map(x => <text key={x} x={px(x)} y="341" textAnchor="middle">{x}</text>)}
      <text x="491" y="322">x</text><text x="270" y="22">f</text>
      <g clipPath={`url(#${clip})`}>
        <path className="calculus-curve" d={curve} />
        <line className="calculus-tangent" x1={px(-2.5)} y1={py(a*a+2*a*(-2.5-a))}
          x2={px(2.5)} y2={py(a*a+2*a*(2.5-a))} />
        {!coincident && <line className="calculus-secant" x1={px(-2.5)} y1={py(a*a+slope*(-2.5-a))}
          x2={px(2.5)} y2={py(a*a+slope*(2.5-a))} />}
      </g>
      <circle data-point="b" className="calculus-point calculus-secondary" cx={px(b)} cy={py(b*b)} r="10" />
      <circle data-point="a" className="calculus-point calculus-primary" cx={px(a)} cy={py(a*a)} r="7" />
      <text x={px(a)-17} y={py(a*a)+25}>A</text>
      {!coincident && <text x={px(b)+12} y={py(b*b)-12}>B</text>}
    </svg>
    <div className="calculus-legend"><span>曲线</span><span className="calculus-primary">虚线：切线</span><span className="calculus-secondary">实线：割线</span></div>
    <div className="calculus-readout" aria-live="polite">
      <MathText tex={String.raw`f(x)=x^2,\quad f'(a)=${fixed(2*a)}`} />
      <MathText tex={String.raw`\Delta x=${fixed(b-a)},\quad\Delta f=${fixed(b*b-a*a)}`} />
      {coincident ? <span>两点重合，差商未定义；切线来自解析导数。</span> :
        <MathText tex={String.raw`\frac{\Delta f}{\Delta x}=${fixed(slope)}`} />}
    </div>
    <div className="calculus-actions">
      <button type="button" onClick={() => { setA(1); setB(1.01); }}>接近切点</button>
      <button type="button" onClick={() => { setA(1); setB(2); }}>重置</button>
    </div>
  </Frame>;
}

export function GradientDemo() {
  const [point, setPoint] = useState<[number, number]>([1, 1]);
  const [angle, setAngle] = useState(0);
  const activePointer = useRef<number | null>(null);
  const id = `gradient-${useId().replaceAll(':', '')}`;
  const [x, y] = point;
  const gx = 2*x, gy = 4*y;
  const norm = Math.hypot(gx, gy);
  const theta = angle * Math.PI / 180;
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const rate = gx*ux + gy*uy;
  const px = (value: number) => 260 + value*72;
  const py = (value: number) => 210 - value*72;
  // One common factor scales both gradient components; direction is preserved.
  const scale = 64 / Math.max(norm, 1);
  const update = (event: PointerEvent<SVGSVGElement>) => {
    const p = localPoint(event);
    if (!p) return;
    setPoint([
      Math.round(clamp((p.x-260)/72, -1.8, 1.8)*100)/100,
      Math.round(clamp((210-p.y)/72, -1.5, 1.5)*100)/100,
    ]);
  };
  const end = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointer.current === event.pointerId) activePointer.current = null;
  };
  return <Frame title="梯度与任意方向的变化率">
    <div className="calculus-controls">
      <PlotSlider label="观察点横坐标" value={x} min={-1.8} max={1.8} onChange={value => setPoint([value, y])} />
      <PlotSlider label="观察点纵坐标" value={y} min={-1.5} max={1.5} onChange={value => setPoint([x, value])} />
      <PlotSlider label="移动方向（度）" value={angle} min={-180} max={180} step="any" onChange={setAngle} />
    </div>
    <svg className="calculus-plot calculus-drag-plane" viewBox="0 0 520 420" role="img"
      aria-label="椭圆碗的等高线、观察点、梯度和所选方向；可拖动观察点"
      onPointerDown={event => {
        if (event.button !== 0) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={event => { if (activePointer.current === event.pointerId) update(event); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { activePointer.current = null; }}>
      <defs>
        <clipPath id={`${id}-clip`}><rect x="40" y="24" width="440" height="370" /></clipPath>
        <marker id={`${id}-g`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L10 5L0 10Z" className="calculus-primary-fill" />
        </marker>
        <marker id={`${id}-u`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L10 5L0 10Z" className="calculus-secondary-fill" />
        </marker>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        {[.5, 1, 2, 4, 6, 8].map(c => <ellipse key={c} className="calculus-contour" cx="260" cy="210"
          rx={Math.sqrt(c)*72} ry={Math.sqrt(c/2)*72} />)}
      </g>
      <path className="calculus-axis" d="M40 210H480M260 394V24" />
      {[-2, -1, 1, 2].map(v => <g key={v}>
        <text x={px(v)} y="229" textAnchor="middle">{v}</text>
        <text x="243" y={py(v)+4} textAnchor="end">{v}</text>
      </g>)}
      <text x="484" y="214">x</text><text x="269" y="29">y</text>
      <line className="calculus-gradient-arrow" x1={px(x)} y1={py(y)} x2={px(x)+gx*scale} y2={py(y)-gy*scale}
        markerEnd={norm > 0 ? `url(#${id}-g)` : undefined} />
      <line className="calculus-direction-arrow" x1={px(x)} y1={py(y)} x2={px(x)+ux*54} y2={py(y)-uy*54}
        markerEnd={`url(#${id}-u)`} />
      <circle className="calculus-point calculus-primary" cx={px(x)} cy={py(y)} r="7" />
    </svg>
    <div className="calculus-legend"><span className="calculus-primary">实线：梯度方向</span><span className="calculus-secondary">虚线：所选方向</span></div>
    <div className="calculus-readout" aria-live="polite">
      <MathText tex={String.raw`f(x,y)=x^2+2y^2=${fixed(x*x+2*y*y)}`} />
      <MathText tex={String.raw`\nabla f=(${fixed(gx)},\,${fixed(gy)})^{\mathsf T}`} />
      <MathText tex={String.raw`\mathbf{u}=(${fixed(ux)},\,${fixed(uy)})^{\mathsf T}`} />
      <MathText tex={String.raw`D_{\mathbf{u}}f=\nabla f^{\mathsf T}\mathbf{u}=${fixed(rate)}`} />
      <span>{norm === 0 ? '当前为驻点，一阶变化率为零，梯度方向未定义。' :
        Math.abs(rate) < 1e-8 ? '当前方向一阶变化为零。' : rate > 0 ? '当前方向局部上升。' : '当前方向局部下降。'}</span>
    </div>
    <div className="calculus-actions">
      <button type="button" disabled={norm === 0} onClick={() => setAngle(Math.atan2(gy, gx)*180/Math.PI)}>沿梯度</button>
      <button type="button" disabled={norm === 0} onClick={() => setAngle(Math.atan2(-gy, -gx)*180/Math.PI)}>沿负梯度</button>
      <button type="button" onClick={() => { setPoint([0, 0]); setAngle(0); }}>观察驻点</button>
      <button type="button" onClick={() => { setPoint([1, 1]); setAngle(0); }}>重置</button>
    </div>
  </Frame>;
}
