import { ArrowUpRight } from 'lucide-react';
import { TOY_CASES } from '../data/toys';
import './featured-case.css';

export default function ToyGallery() {
  const base = import.meta.env.BASE_URL;
  return (
    <div className="toy-page">
      <header className="page-heading"><div><span className="eyebrow">A playground for ideas</span><h1>TOY</h1><p>一些可以动手体验的想法。关于物理、视觉与交互的小实验。</p></div></header>
      <section className="toy-cases" aria-labelledby="toy-cases-heading">
        <div className="section-heading"><h2 id="toy-cases-heading">交互案例</h2><span className="eyebrow">Selected experiments / {String(TOY_CASES.length).padStart(2, '0')}</span></div>
        <div className="toy-case-list">
          {TOY_CASES.map((toy, index) => {
            const accent = toy.accent && toy.title.endsWith(toy.accent) ? toy.accent : '';
            return (
              <a key={toy.id} className="featured-case" href={`${base}${toy.href}`} aria-label={`体验 ${toy.name}：${toy.title.replaceAll('\n', ' ')}`}>
                <div className="featured-case-copy">
                  <span className="featured-case-kicker"><span>✳</span> CASE {String(index + 1).padStart(3, '0')} / {toy.category}</span>
                  <h3>{accent ? <>{toy.title.slice(0, -accent.length)}<em>{accent}</em></> : toy.title}</h3>
                  <p>{toy.description}</p>
                  <div className="featured-case-tags">{toy.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
                  <span className="featured-case-cta">进入体验 <ArrowUpRight size={19} /><span>{toy.name}</span></span>
                </div>
                <div className="featured-case-art" aria-hidden="true">
                  <svg viewBox={toy.preview.viewBox} preserveAspectRatio="xMidYMid meet" focusable="false"><image href={`${base}${toy.preview.src}`} x="0" y="0" width={toy.preview.width} height={toy.preview.height} /></svg>
                  <span className="featured-case-art-label">{toy.caption}</span>
                </div>
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}
