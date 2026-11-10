import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { HyperspeedProps } from './Hyperspeed.types';

export default function HomeHyperspeed() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [Renderer, setRenderer] = useState<ComponentType<HyperspeedProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState({ light: false, accent: '#a855f7', bright: '#bf7bfa',
    soft: '#c4a2ed', road: '#120f17', line: '#524760', touch: false });

  useEffect(() => {
    const root = document.documentElement;
    const coarse = matchMedia('(pointer: coarse)');
    const narrow = matchMedia('(max-width: 700px)');
    const sync = () => {
      const style = getComputedStyle(root);
      const color = (name: string) => style.getPropertyValue(name).trim();
      setTheme({ light: root.classList.contains('light-theme'),
        accent: color('--color-accent-primary'), bright: color('--color-accent-primary-hover'),
        soft: color('--color-accent-link'), road: color('--color-surface-base'),
        line: color('--color-border-strong'), touch: coarse.matches || narrow.matches });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    coarse.addEventListener('change', sync);
    narrow.addEventListener('change', sync);
    let alive = true;
    import('./Hyperspeed').then(module => { if (alive) setRenderer(() => module.default); })
      .catch(error => { if (alive) { console.warn('[Hyperspeed] Could not load renderer:', error); setFailed(true); } });
    return () => {
      alive = false;
      observer.disconnect();
      coarse.removeEventListener('change', sync);
      narrow.removeEventListener('change', sync);
    };
  }, []);

  return <div ref={rootRef} className="home-hyperspeed" data-effect="hyperspeed"
    data-renderer={failed ? 'unavailable' : ready ? 'webgl' : 'loading'}>
    {Renderer && !failed && <Renderer
      curve="winding" curvature={0.8} speed={0.85} boost={2.5} fov={90} boostFov={112}
      lanes={3} roadWidth={10} medianWidth={2} density={theme.touch ? 22 : 40}
      trailLength={0.85} lightSize={1.1} poles={theme.touch ? 12 : 20}
      dust={theme.touch ? 30 : 70} glow={theme.touch ? 0.35 : 0.5} reflections={0.35}
      roadOpacity={0.18} steer={theme.touch ? 0 : 0.25} dpr={theme.touch ? 1 : 1.25}
      tailColors={[theme.accent, theme.bright, theme.soft]}
      headColors={[theme.soft, theme.bright, theme.accent]} poleColors={[theme.bright]}
      roadColor={theme.road} lineColor={theme.line} background="transparent"
      theme={theme.light ? 'light' : 'dark'} interactive
      onReady={() => setReady(true)}
      onError={error => { console.warn('[Hyperspeed] WebGL unavailable:', error); setFailed(true); }}
    />}
    {failed && <p className="home-hyperspeed-unavailable" role="status">当前浏览器无法启用 WebGL 动画</p>}
  </div>;
}
