/**
 * Progressive-enhancement mount point for interactive demos inside Markdown
 * articles. Authors drop an empty placeholder into the article body:
 *
 *   <div data-demo="drone-sandbox"></div>
 *
 * This component (hydrated once per article page) scans for those
 * placeholders, looks the key up in the registry below, and mounts the
 * matching React component with a fresh createRoot. No placeholders →
 * no-op, mirroring how ArticleEnhancements degrade on non-article routes.
 */
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

export const DEMO_REGISTRY: Record<string, () => Promise<React.ComponentType>> = {
  'calculus-secant': () => import('./CalculusDemos').then(m => m.SecantDemo),
  'calculus-gradient': () => import('./CalculusDemos').then(m => m.GradientDemo),
  'course-points': () => import('./CourseLabs').then(m => m.PointsLab),
  'course-timestep': () => import('./CourseLabs').then(m => m.TimestepLab),
  'course-pose': () => import('./CourseLabs').then(m => m.PoseLab),
  'drone-sandbox': () => import('./DroneSandbox').then(m => m.default),
};

export default function DemoMount() {
  useEffect(() => {
    const roots: Array<{ root: Root; el: HTMLElement }> = [];
    const pending = new Set<HTMLElement>();
    let disposed = false;
    const mount = () => {
      document.querySelectorAll<HTMLElement>("[data-demo]:not([data-demo-mounted])").forEach((el) => {
        const key = el.dataset.demo ?? "";
        const load = DEMO_REGISTRY[key];
        if (!load) {
          el.textContent = `[未知演示组件: ${key}]`;
          return;
        }
        el.dataset.demoMounted = "1";
        pending.add(el);
        // Leave the worksheet fallback visible if a chunk fails to load.
        void load().then(Component => {
          if (disposed || !el.isConnected) return;
          const root = createRoot(el);
          root.render(<Component />);
          roots.push({ root, el });
        }).catch(() => { /* The static exercise remains usable. */ });
      });
    };
    // Run once after hydration; a short delay lets the static article HTML
    // finish parsing so late placeholders are also covered.
    mount();
    const timer = window.setTimeout(mount, 300);
    return () => {
      window.clearTimeout(timer);
      disposed = true;
      roots.forEach(({ root }) => root.unmount());
      pending.forEach(el => { delete el.dataset.demoMounted; });
    };
  }, []);

  return null;
}
