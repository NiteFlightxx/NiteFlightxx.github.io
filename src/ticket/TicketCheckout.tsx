import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, Check, ChevronDown, Moon, Sun, RotateCcw, ScanLine, Scissors, ShieldCheck, Volume2, VolumeX, MousePointer2, MoveUpRight, Fingerprint } from 'lucide-react';
import Logo from '../components/Logo';
import TicketStage, { type StageControls } from './TicketStage';
import { TICKET_EDITIONS as editions, TICKET_ZONES as zones } from './ticketContent';
import './ticket.css';

export default function TicketCheckout({ portfolioHref, returnLabel = '返回 NITE 个人网站' }: { portfolioHref?: string; returnLabel?: string }) {
  const [edition, setEdition] = useState(0);
  const [zone, setZone] = useState<string>('general');
  const [dark, setDark] = useState(false);
  const [xray, setXray] = useState(false);
  const [muted, setMuted] = useState(false);
  const [torn, setTorn] = useState(0);
  const [issue, setIssue] = useState(0);
  const [help, setHelp] = useState(false);
  const controls = useRef<StageControls | null>(null);
  const selectedZone = zones.find(item => item.id === zone) ?? zones[0];
  const verified = torn === 25;
  const price = editions[edition].price + selectedZone.extra;
  const fresh = () => { setTorn(0); setIssue(n => n + 1); };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.repeat) return;
      switch (event.key.toLowerCase()) {
        case 'f': controls.current?.flip(); break;
        case 'x': setXray(x => !x); break;
        case 'r': setTorn(0); setIssue(n => n + 1); break;
        case 'escape': setHelp(false); break;
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return <div className={`ticket-app ${dark ? 'concert' : ''}`}>
    <header className="site-header">
      <a className="brand" href={portfolioHref ?? import.meta.env.BASE_URL} aria-label={portfolioHref ? returnLabel : 'NITE · 票券交互实验'}>
        <Logo className="ticket-brand-mark" /><span>NITE<span className="brand-sub">独立研究与交互实验</span></span>
      </a>
      {portfolioHref ? <a className="portfolio-return" href={portfolioHref}>← {returnLabel}</a> : <div className="header-center"><span className="live-dot" />把想法，变成可触碰的体验。</div>}
      <div className="header-actions">
        <button className="theme-toggle" onClick={() => setDark(d => !d)} aria-label={dark ? '切换至明亮工作室' : '切换至暗色音乐厅'} aria-pressed={dark}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}<span>{dark ? '暗色音乐厅' : '明亮工作室'}</span><span className={`switch ${dark ? 'on' : ''}`}><i /></span>
        </button>
        <span className="header-divider" />
        <button className="about-button" onClick={() => setHelp(h => !h)}>体验说明 <ArrowUpRight size={14} /></button>
      </div>
    </header>
    <main>
      <section className="intro">
        <div><div className="eyebrow"><span className="tiny-cross">✳</span> NITE 交互实验 / TICKET TEAR</div><h1>有些体验，<br />值得<em>亲手感受。</em><span className="heading-spark">✳</span></h1></div>
        <p>一场关于光、声音与相遇的夜晚。<br />从亲手撕开通行证的那一刻开始。</p>
      </section>
      <div className="checkout-layout">
        <section className="checkout-panel" aria-label="定制你的活动通行证">
          <div className="event-meta"><span>NITE · 下一场相遇</span><span className="event-number">№ 004 <ArrowUpRight size={14} /></span></div>
          <h2>NITE 光影<br />共振之夜<span className="title-period">。</span></h2>
          <div className="event-details"><span>2026.10.17</span><i /><span>伦敦 · 圆屋剧场</span></div>
          <div className="section-rule" />
          <div className="field-heading"><span>01 <b>选择全息材质</b></span><span>三款限定版本</span></div>
          <div className="editions" role="radiogroup" aria-label="全息材质版本">
            {editions.map((item, i) => <button key={item.name} className={`edition ${edition === i ? 'selected' : ''}`} role="radio" aria-checked={edition === i} onClick={() => { if (edition !== i) { setEdition(i); setTorn(0); } }}>
              <span className={`foil-swatch ${item.className}`}><Logo /></span><span className="edition-copy"><strong>{item.name}</strong><small>{item.note}</small></span><span className="edition-radio">{edition === i && <Check size={11} strokeWidth={2.5} />}</span>
            </button>)}
          </div>
          <label className="field-heading zone-label" htmlFor="zone"><span>02 <b>选择入场区域</b></span></label>
          <div className="select-wrap"><select id="zone" value={zone} onChange={e => { setZone(e.target.value); setTorn(0); }}>{zones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div>
          <div className="total-line">
            <span className="total-caption">一夜限定，独一无二。<small className="mini-integrity"><span className="mini-track" role="progressbar" aria-label="剩余穿孔纤维" aria-valuemin={0} aria-valuemax={25} aria-valuenow={25 - torn}><i style={{ width: `${(25 - torn) / 25 * 100}%` }} /></span>剩余 {25 - torn}/25 根纤维</small></span>
            <strong>£{price}<small>.00</small></strong>
          </div>
          <button className={`primary-button ${verified ? 'verified' : ''}`} onClick={() => verified ? fresh() : controls.current?.tear()} title={verified ? '点击签发一张新通行证' : undefined}>
            {verified ? <><Check size={17} /><span>验证通过 · 一人入场</span><RotateCcw size={16} /></> : <><Scissors size={17} /><span>{torn > 0 ? '继续撕开，完成入场' : '撕开通行证，进入体验'}</span><ArrowRight size={17} /></>}
          </button>
          <div className="checkout-note" role="status"><ShieldCheck size={13} /><span>{verified ? '通行证已验证，期待与你相遇。' : '交互概念演示，无需付款。'}</span></div>
        </section>
        <section className={`stage ${xray ? 'is-xray' : ''}`} aria-label="通行证交互舞台">
          <div className="stage-topline"><span><span className="live-dot" />{verified ? '入场验证完成' : xray ? '物理与材质透视' : '一张有触感的通行证'}</span><span>350 GSM <span className="slash">/</span> {editions[edition].name}</span></div>
          <div className="stage-glow" /><div className="stage-orbit orbit-one" /><div className="stage-orbit orbit-two" />
          <TicketStage edition={edition} zone={selectedZone.name} dark={dark} xray={xray} muted={muted} issue={issue} onProgress={setTorn} controls={controls} />
          <div className="pass-annotation"><span className="annotation-line" /><span>{verified ? '美好的夜晚，从这里开始。' : '动手，打破一点距离。'}</span><Scissors size={13} /></div>
          {xray && <div className="xray-legend"><span><i />结构弹簧</span><span><i />剪切与弯曲</span><span><i />穿孔纤维</span><small>900 个顶点 · 每帧 10 次约束迭代</small></div>}
          <div className="tear-meter">
            <div className="meter-header"><span>{verified ? <Check size={12} /> : <Fingerprint size={13} />}<b>{verified ? '这一刻，属于你' : '穿孔纤维完整度'}</b></span><span>{25 - torn}<span className="muted-text"> / 25 根纤维</span></span></div>
            <div className="fiber-bars">{Array.from({ length: 25 }, (_, i) => <i key={i} className={i < torn ? 'broken' : ''} />)}</div>
            <div className="meter-bottom"><span>{verified ? '轻轻撕开，留下回响。' : '轻轻一撕，开启这一夜。'}</span><span>已撕开 {Math.round(torn / 25 * 100)}%</span></div>
          </div>
          <div className="stage-tools">
            <button onClick={() => controls.current?.flip()} title="翻转通行证（F）"><RotateCcw size={14} /><span>翻转</span><kbd>F</kbd></button>
            <button className={xray ? 'tool-active' : ''} onClick={() => setXray(x => !x)} title="切换物理透视（X）" aria-pressed={xray}><ScanLine size={15} /><span>物理透视</span><kbd>X</kbd></button>
            <span className="tool-divider" /><button onClick={fresh} title="签发新通行证（R）"><span>签发新票</span><kbd>R</kbd></button>
            <button className="sound-button" onClick={() => setMuted(m => !m)} aria-label={muted ? '开启声音' : '关闭声音'} title={muted ? '开启声音' : '关闭声音'}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
          </div>
        </section>
      </div>
      <section className="interaction-guide" aria-label="交互操作指南">
        <div className="guide-intro"><span className="tiny-cross">✳</span><span>数字之间，<br />也有真实触感。</span></div>
        <div className="guide-item"><MousePointer2 size={19} /><p><b>触碰，感受材质。</b><span>拖动票面，让全息光泽随手而动。</span></p><span className="guide-number">01</span></div>
        <div className="guide-item"><Scissors size={19} /><p><b>撕开，让体验发生。</b><span>沿虚线划过，或向下拉动票根。</span></p><span className="guide-number">02</span></div>
        <div className="guide-item"><MoveUpRight size={20} /><p><b>此刻，正式入场。</b><span>撕断全部纤维，完成通行验证。</span></p><span className="guide-number">03</span></div>
      </section>
    </main>
    <footer className="site-footer"><span>© 2026 NITE</span><span>让想法被触碰。<span className="footer-star">✳</span>让体验留下回响。</span><span>独立研究与交互实验</span></footer>
    {help && <div className="help-backdrop" onClick={() => setHelp(false)}><section className="help-dialog" role="dialog" aria-modal="true" aria-label="体验说明" onClick={e => e.stopPropagation()}>
      <button className="dialog-close" onClick={() => setHelp(false)} aria-label="关闭体验说明">×</button><div className="eyebrow">NITE · 数字触感实验</div><h2>用双手，<br /><em>感受一点不同。</em></h2>
      <p>Ticket Tear 是一项票券交互概念实验。选择全息材质，转动票面捕捉光线，再亲手撕开属于你的入场通行证。</p>
      <p>拖动票面上半部可以弯折纸张；沿穿孔虚线横向划过，或向下拉动票根，即可依次撕断 25 根纤维。双击票面可以翻转，查看背面。</p>
      <div className="help-shortcuts"><span><kbd>F</kbd> 翻转</span><span><kbd>X</kbd> 物理透视</span><span><kbd>R</kbd> 签发新票</span></div><small>图形与声音实时生成。本页面不收取费用，通行证与二维码仅作交互展示。</small>
    </section></div>}
  </div>;
}
