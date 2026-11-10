import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpRight, Eye, X } from 'lucide-react';
import { RESEARCH_WORKS } from '../data/researchWorks';
import type { ContentArticle } from '../types';
import ResearchDiagram from './ResearchDiagram';
import BorderGlow from './effects/BorderGlow';

const BASE = import.meta.env.BASE_URL;
type Work = (typeof RESEARCH_WORKS)[number];

/** Cover movement never moves a reading link or a preview button. */
function moveCover(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const card = event.currentTarget;
  const box = card.getBoundingClientRect();
  card.style.setProperty('--cover-x', `${((event.clientY - box.top) / box.height - .5) * -4}deg`);
  card.style.setProperty('--cover-y', `${((event.clientX - box.left) / box.width - .5) * 4}deg`);
}

export default function ResearchCards({ articles }: { articles: ContentArticle[] }) {
  const [selected, setSelected] = useState<Work | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewTitle = useId();
  const previewDescription = useId();
  const bySlug = new Map(articles.map(article => [article.slug, article]));
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);
  const close = () => dialog.current?.close();
  const open = (work: Work) => {
    setSelected(work);
  };
  const selectedArticle = selected ? bySlug.get(selected.href.split('/')[1]) : undefined;

  return <>
    <div className="studio-work-grid">
      {RESEARCH_WORKS.map((work, index) => <BorderGlow as="article" className="studio-work-card" key={work.id}
        onPointerMove={moveCover} onPointerLeave={event => {
          event.currentTarget.style.removeProperty('--cover-x');
          event.currentTarget.style.removeProperty('--cover-y');
        }}>
        <a className="research-card-link" href={`${BASE}${work.href}`}>
          <div className="work-card-top"><span>{String(index + 1).padStart(2, '0')} / {work.kind}</span><ArrowUpRight size={17}/></div>
          <div className={`studio-work-art art-${work.diagram}`}><ResearchDiagram kind={work.diagram}/></div>
          <div className="studio-work-copy"><h3>{work.name}</h3><p>{work.description}</p>
            <div className="work-tags">{work.tags.slice(0, 2).map(tag => <span key={tag}>{tag}</span>)}</div>
          </div>
        </a>
        <div className="research-card-actions">
          <a href={`${BASE}${work.href}`}>阅读文档 <ArrowUpRight size={15}/></a>
          <button type="button" onClick={() => open(work)} aria-haspopup="dialog" aria-label={`预览 ${work.name}`}><Eye size={15}/>预览</button>
        </div>
      </BorderGlow>)}
    </div>
    <dialog ref={dialog} className="research-preview" aria-labelledby={previewTitle} aria-describedby={previewDescription}
      onClick={event => { if (event.target === event.currentTarget) {
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
      } }} onClose={() => setSelected(null)}>
      {selected && <>
        <header className="research-preview-header"><span>{selected.kind} · 研究预览</span><button type="button" className="icon-button" onClick={close} aria-label="关闭预览" autoFocus><X size={20}/></button></header>
        <div className={`research-preview-cover studio-work-art art-${selected.diagram}`}><ResearchDiagram kind={selected.diagram}/></div>
        <div className="research-preview-body"><span className="eyebrow">{selected.field}</span><h2 id={previewTitle}>{selected.name}</h2>
          <p id={previewDescription}>{selectedArticle?.excerpt || selected.description}</p>
          <div className="work-tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          {selectedArticle && <p className="research-preview-meta">{selectedArticle.category} · {selectedArticle.readTime || '技术文档'}</p>}
          <a className="primary-link" href={`${BASE}${selected.href}`}>阅读完整文档 <ArrowUpRight size={17}/></a>
        </div>
      </>}
    </dialog>
  </>;
}
