import { ArrowUpRight } from 'lucide-react';

export default function Footer({ lang: _lang }: { lang: 'zh' | 'en' }) {
  return (
    <footer className="site-footer">
      <div><span className="footer-wordmark">NITE</span><span>实时物理与动画系统 · 个人研究笔记</span></div>
      <nav aria-label="页脚链接">
        <a href="https://github.com/NiteFlightxx" target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={12} /></a>
        <a href="https://space.bilibili.com/101356800" target="_blank" rel="noopener noreferrer">Bilibili<ArrowUpRight size={12} /></a>
        <span>© {new Date().getFullYear()} Nite</span>
      </nav>
    </footer>
  );
}
