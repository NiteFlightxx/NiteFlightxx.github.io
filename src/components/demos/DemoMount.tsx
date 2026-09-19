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

import DroneSandbox from "./DroneSandbox";

export const DEMO_REGISTRY: Record<string, React.ComponentType> = {
  "drone-sandbox": DroneSandbox,
};

export default function DemoMount() {
  useEffect(() => {
    const roots: Array<{ root: Root; el: HTMLElement }> = [];
    const mount = () => {
      document.querySelectorAll<HTMLElement>("[data-demo]:not([data-demo-mounted])").forEach((el) => {
        const key = el.dataset.demo ?? "";
        const Component = DEMO_REGISTRY[key];
        if (!Component) {
          el.textContent = `[未知演示组件: ${key}]`;
          return;
        }
        el.dataset.demoMounted = "1";
        const root = createRoot(el);
        root.render(<Component />);
        roots.push({ root, el });
      });
    };
    // Run once after hydration; a short delay lets the static article HTML
    // finish parsing so late placeholders are also covered.
    mount();
    const timer = window.setTimeout(mount, 300);
    return () => {
      window.clearTimeout(timer);
      roots.forEach(({ root }) => root.unmount());
    };
  }, []);

  return null;
}
