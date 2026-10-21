import type { ReadingGroup } from '../lib/readingOrder';
import { articleHref } from '../lib/readingOrder';
import { compactTitle } from '../lib/research';

export default function DocumentNavigation({ groups, current }: { groups: ReadingGroup[]; current: string }) {
  return <nav className="document-navigation" aria-label="知识库文档目录">
    <div className="document-nav-header"><a href={`${import.meta.env.BASE_URL}knowledge/`}>知识库</a><a href={`${import.meta.env.BASE_URL}knowledge/library/`}>全部文档 ↗</a></div>
    {groups.map(group => <details key={group.id} open={group.sections.some(section => section.articles.some(article => article.slug === current))}>
      <summary>{group.title}<small>{group.sections.reduce((count, section) => count + section.articles.length, 0)}</small></summary>
      {group.sections.map(section => <div className="document-nav-section" key={section.title}><span>{section.title}</span><ol>{section.articles.map(article => <li key={article.slug}><a href={articleHref(article.slug)} aria-current={article.slug === current ? 'page' : undefined}>{compactTitle(article.title)}</a></li>)}</ol></div>)}
    </details>)}
    <a className="document-nav-footer" href={`${import.meta.env.BASE_URL}knowledge/graph/`}>知识图谱 ↗</a>
  </nav>;
}
