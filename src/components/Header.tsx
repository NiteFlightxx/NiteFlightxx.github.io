import { useEffect, useState, type MouseEvent } from 'react';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import Logo from './Logo';
import GithubIcon from './GithubIcon';
import { MAIN_NAV_ITEMS, mainNavHref } from '../lib/siteNavigation';

interface HeaderProps {
  activeTab: string;
  setActiveTab?: (tab: string) => void;
}

export default function Header({ activeTab, setActiveTab }: HeaderProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  useEffect(() => {
    const sync = () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem('theme'); } catch { /* reading still works */ }
      const light = stored !== 'dark';
      document.documentElement.classList.toggle('light-theme', light);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#F4F2ED' : '#171C18');
      setTheme(light ? 'light' : 'dark');
    };
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('light-theme', next === 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#F4F2ED' : '#171C18');
    setTheme(next);
    try { localStorage.setItem('theme', next); } catch { /* optional persistence */ }
  };
  const navigation = MAIN_NAV_ITEMS.map((item) => ({ ...item, href: mainNavHref(item.id, import.meta.env.BASE_URL) }));
  const navigate = (event: MouseEvent<HTMLAnchorElement>, tab: string) => {
    if (!setActiveTab || tab === 'knowledge' || tab === 'archive' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setActiveTab(tab);
    event.currentTarget.closest('details')?.removeAttribute('open');
  };

  return (
    <>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href={import.meta.env.BASE_URL} onClick={(event) => navigate(event, 'home')} id="nav-logo" aria-label="NITE 首页"><Logo className="h-6 w-6" /><span>NITE<span className="brand-caption">独立研究与实验</span></span></a>
          <nav className="desktop-navigation" aria-label="主导航">
            {navigation.map((item) => <a id={'nav-' + item.id} key={item.id} href={item.href} onClick={(event) => navigate(event, item.id)} aria-current={activeTab === item.id ? 'page' : undefined}>{item.labelZh}</a>)}
          </nav>
          <div className="header-actions">
            <button type="button" className="header-search" onClick={() => window.dispatchEvent(new Event('nite:open-command-palette'))} aria-label="打开全局搜索"><Search size={16} /><span>搜索</span><kbd>⌘ K</kbd></button>
            <a className="icon-button header-github" href="https://github.com/NiteFlightxx" target="_blank" rel="noopener noreferrer" aria-label="GitHub 主页"><GithubIcon className="h-4 w-4" /></a>
            <button className="icon-button" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} id="theme-toggle">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <details className="mobile-navigation">
              <summary aria-label="打开导航菜单"><Menu size={20} /></summary>
              <nav aria-label="移动端主导航">{navigation.map((item) => <a key={item.id} href={item.href} onClick={(event) => navigate(event, item.id)} aria-current={activeTab === item.id ? 'page' : undefined}>{item.labelZh}</a>)}<a href={import.meta.env.BASE_URL + 'knowledge/graph/'}>知识图谱</a><a href={import.meta.env.BASE_URL + 'knowledge/?scope=favorites'}>我的收藏</a></nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
