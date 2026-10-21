import { ArrowUpRight } from 'lucide-react';
import type { SkillCategory } from '../types';

interface ArchiveViewProps { skills: SkillCategory[]; lang: 'zh' | 'en'; }

export default function ArchiveView({ skills }: ArchiveViewProps) {
  return (
    <div className="about-page" id="archive-view-container">
      <header className="page-heading"><div><span className="eyebrow">About this notebook</span><h1>关于这些研究笔记</h1><p>Nite / 实时物理与动画系统</p></div></header>
      <div className="about-intro">
        <div><h2>从原理到实现，再回到问题。</h2><p>这里记录实时物理、角色动画与控制系统的学习和工程研究，包括数学推导、Unreal Engine 源码分析，以及实现中的取舍与验证。</p><p>知识文章保留完整推导，研究专题串联相关问题，交互实验用于建立直觉。不同层次的内容通过链接关联，不必重复展开。</p></div>
        <aside><span className="eyebrow">Elsewhere</span><a className="path-link" href="https://github.com/NiteFlightxx" target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={15} /></a><a className="path-link" href="https://space.bilibili.com/101356800" target="_blank" rel="noopener noreferrer">Bilibili<ArrowUpRight size={15} /></a></aside>
      </div>
      <section className="about-method"><div><span className="eyebrow">01 / Principles</span><h3>原理与数学</h3><p>明确假设、量纲与适用范围，建立可以复用的基础。</p></div><div><span className="eyebrow">02 / Implementation</span><h3>源码与实现</h3><p>沿实际执行链路理解系统，保留文件、版本与证据。</p></div><div><span className="eyebrow">03 / Validation</span><h3>实验与边界</h3><p>区分源码事实、工程判断与仍需运行时验证的内容。</p></div></section>
      <section><div className="section-heading"><h2>技术索引</h2><span className="eyebrow">Areas of practice</span></div><div className="about-skills">{skills.map((category) => <section key={category.name}><h3>{category.name}</h3><dl>{category.skills.map((skill) => <div key={skill.name}><dt>{skill.name}</dt><dd>{skill.details}</dd></div>)}</dl></section>)}</div></section>
    </div>
  );
}
