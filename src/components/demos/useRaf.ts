import { useEffect, useRef } from "react";

/**
 * rAF hook with fixed-max dt and automatic cleanup. The callback receives
 * the clamped wall-clock step (seconds) so physics stays stable on lag
 * spikes. Stops when the component unmounts.
 */
export function useRaf(cb: (dt: number) => void, maxDt = 1 / 20) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, maxDt);
      last = now;
      cbRef.current(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [maxDt]);
}

/** Keep a canvas backing store in sync with its CSS size (HiDPI crispness). */
export function useCanvas(
  ref: React.RefObject<HTMLCanvasElement | null>,
) {
  const sizeRef = useRef({ w: 0, h: 0 });
  const sync = () => {
    const cv = ref.current;
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w, h };
  };
  return { sync, sizeRef };
}
