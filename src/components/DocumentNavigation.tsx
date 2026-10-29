import type { ReadingGroup } from '../lib/readingOrder';
import { articleHref } from '../lib/readingOrder';
import { compactTitle } from '../lib/research';

export default function DocumentNavigation({ groups, current }: { groups: ReadingGroup[]; current: string }) {
  return <nav className="document-navigation" aria-label="知识库文档目录">
    <div className="document-nav-header"><a href={`${import.meta.env.BASE_URL}knowledge/`}>知识库</a><a href={`${import.meta.env.BASE_URL}knowledge/library/`}>全部文档 ↗</a></div>
    {groups.map(group => <details key={group.id} open={group.sections.some(section => section.articles.some(article => article.slug === current))}>
      <summary>{group.title}<small>{group.sections.reduce((count, section) => count + section.articles.length, 0)}</small></summary>
      {group.description && <p className="document-nav-description">{group.description}</p>}
      {group.sections.map(section => <div className="document-nav-section" key={section.title} data-reading-mode={section.mode}><span>{section.title}<small>{section.mode === 'sequence' ? '顺序阅读' : '按需查阅'}</small></span><ol>{section.articles.map((article, index) => <li key={article.slug}><a href={articleHref(article.slug)} aria-current={article.slug === current ? 'page' : undefined}>{section.mode === 'sequence' && <i>{index + 1}. </i>}{compactTitle(article.title)}</a></li>)}</ol></div>)}
    </details>)}
    <a className="document-nav-footer" href={`${import.meta.env.BASE_URL}knowledge/graph/`}>知识图谱 ↗</a>
  </nav>;
}
