import { useEffect, useState } from "react";

/**
 * Centralized opt-out flags for heavy background animations.
 *
 * Two independent signals pause the render loop:
 *  1. `prefers-reduced-motion` — the user explicitly asked the OS / browser
 *     to minimize motion (vestibular sensitivity, accessibility). Honored at
 *     both mount and when the media query changes at runtime.
 *  2. Page visibility — when the tab is hidden, an rAF loop is pure waste
 *     (CPU/GPU/battery). `document.visibilityState` flips on tab switch,
 *     minimization, and screen-sleep on some platforms.
 *
 * Components should STOP (not just slow down) their `requestAnimationFrame`
 * loop while `paused === true`, and ideally render nothing visible either,
 * since a frozen WebGL frame wastes a texture slot.
 */
export function useAnimationOptOut(): { paused: boolean; reducedMotion: boolean } {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // prefers-reduced-motion: query the live media query so we react to the
    // user toggling the OS setting without reloading the page.
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mql.matches);
    sync();
    mql.addEventListener("change", sync);

    // Visibility: pause rAF while the tab is in the background.
    const onVis = () => setHidden(document.visibilityState === "hidden");

    return () => {
      mql.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { paused: reducedMotion || hidden, reducedMotion };
}
