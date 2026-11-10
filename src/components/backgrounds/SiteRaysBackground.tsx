import { useEffect, useState } from 'react';
import SideRays from './SideRays';

export default function SiteRaysBackground() {
  const [theme, setTheme] = useState({ light: false, colorA: '#a855f7', colorB: '#bf7bfa', touch: false });

  useEffect(() => {
    const root = document.documentElement;
    const pointerQuery = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      const colors = getComputedStyle(root);
      setTheme({
        light: root.classList.contains('light-theme'),
        colorA: colors.getPropertyValue('--color-accent-primary').trim(),
        colorB: colors.getPropertyValue('--color-accent-primary-hover').trim(),
        touch: pointerQuery.matches,
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    pointerQuery.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      pointerQuery.removeEventListener('change', sync);
    };
  }, []);

  return <div className="site-rays-renderer" data-theme={theme.light ? 'light' : 'dark'}>
    <SideRays
      rayColor1={theme.colorA}
      rayColor2={theme.colorB}
      origin="top-right"
      speed={0.7}
      intensity={theme.light ? 1.6 : 1.8}
      spread={2.2}
      density={5}
      sharpness={0.35}
      falloff={1.7}
      glow={0.5}
      saturation={0.85}
      opacity={theme.light ? 0.28 : 0.75}
      followMouse={!theme.touch}
      mouseInfluence={0.2}
      maxDevicePixelRatio={theme.touch ? 1 : 1.25}
      lightMode={theme.light}
    />
  </div>;
}
