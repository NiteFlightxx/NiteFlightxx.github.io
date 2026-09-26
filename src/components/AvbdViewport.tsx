import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Contact, Pause, Play, RotateCcw, StepForward } from 'lucide-react';

const BASE_URL = import.meta.env.BASE_URL;
const AVBD_RUNTIME_VERSION = '2026-09-26-input-v3';

interface AvbdModule {
  _avbd_load_scene(scene: number): void;
  _avbd_reset_scene(): void;
  _avbd_set_paused(paused: number): void;
  _avbd_step_once(): void;
  _avbd_set_contacts(visible: number): void;
  _avbd_pointer_down(button: number, x: number, y: number): void;
  _avbd_pointer_move(x: number, y: number, deltaX: number, deltaY: number): void;
  _avbd_pointer_up(button: number): void;
  _avbd_pointer_cancel(): void;
  _avbd_zoom(wheelDelta: number): void;
  _avbd_shoot(): void;
  _avbd_resize(width: number, height: number): void;
  _avbd_shutdown(): void;
}

interface AvbdModuleFactoryOptions {
  canvas: HTMLCanvasElement;
  locateFile(path: string): string;
  print?(message: string): void;
  printErr?(message: string): void;
}

type AvbdModuleFactory = (options: AvbdModuleFactoryOptions) => Promise<AvbdModule>;
type RuntimeState = 'loading' | 'ready' | 'error';

declare global {
  interface Window {
    createAvbdModule?: AvbdModuleFactory;
    __avbdRuntimeVersion?: string;
  }
}

const SCENES = [
  ['Empty', '空场景'],
  ['Ground', '基础碰撞'],
  ['Dynamic Friction', '动摩擦'],
  ['Static Friction', '静摩擦'],
  ['Pyramid', '金字塔'],
  ['Rope', '约束链'],
  ['Heavy Rope', '重载约束链'],
  ['Spring', '弹簧'],
  ['Spring Ratio', '刚度比'],
  ['Stack', '堆叠'],
  ['Stack Ratio', '质量比堆叠'],
  ['Soft Body', '软体结构'],
  ['Bridge', '约束桥'],
  ['Breakable', '断裂约束'],
] as const;

const DEFAULT_SCENE = 12;

export default function AvbdViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const moduleRef = useRef<AvbdModule | null>(null);
  const lastSizeRef = useRef({ width: 1280, height: 760 });
  const pausedRef = useRef(false);
  const pointerRef = useRef<{ id: number; button: number; clientX: number; clientY: number } | null>(null);
  const [runtime, setRuntime] = useState<RuntimeState>('loading');
  const [runtimeError, setRuntimeError] = useState('');
  const [scene, setScene] = useState(DEFAULT_SCENE);
  const [paused, setPaused] = useState(false);
  const [contacts, setContacts] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    let cancelled = false;
    let instance: AvbdModule | null = null;
    let runtimeScript: HTMLScriptElement | null = null;

    const resize = () => {
      const bounds = viewport.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      lastSizeRef.current = { width, height };
      canvas.width = width;
      canvas.height = height;
      instance?._avbd_resize(width, height);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();

    const handleCanvasWheel = (event: WheelEvent) => {
      event.preventDefault();
      const normalizedDelta = Math.max(-4, Math.min(4, -event.deltaY / 100));
      instance?._avbd_zoom(normalizedDelta);
    };
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });

    const handleVisibility = () => {
      instance?._avbd_set_paused(document.hidden || pausedRef.current ? 1 : 0);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    void (async () => {
      try {
        if (!window.createAvbdModule || window.__avbdRuntimeVersion !== AVBD_RUNTIME_VERSION) {
          await new Promise<void>((resolve, reject) => {
            runtimeScript = document.createElement('script');
            runtimeScript.src = `${BASE_URL}avbd/avbd.js?v=${AVBD_RUNTIME_VERSION}`;
            runtimeScript.async = true;
            runtimeScript.onload = () => {
              window.__avbdRuntimeVersion = AVBD_RUNTIME_VERSION;
              resolve();
            };
            runtimeScript.onerror = () => reject(new Error('无法加载 AVBD WebAssembly 运行时。'));
            document.head.appendChild(runtimeScript);
          });
        }
        if (!window.createAvbdModule) throw new Error('AVBD 模块工厂未注册。');
        instance = await window.createAvbdModule({
          canvas,
          locateFile: (path) => `${BASE_URL}avbd/${path.split('/').pop() ?? path}?v=${AVBD_RUNTIME_VERSION}`,
          print: () => undefined,
          printErr: (message) => console.warn(`[AVBD] ${message}`),
        });
        if (cancelled) {
          instance._avbd_shutdown();
          return;
        }
        moduleRef.current = instance;
        const { width, height } = lastSizeRef.current;
        instance._avbd_resize(width, height);
        instance._avbd_load_scene(DEFAULT_SCENE);
        instance._avbd_set_contacts(1);
        setRuntime('ready');
      } catch (error) {
        console.error('Unable to initialize the AVBD WebAssembly viewport.', error);
        if (!cancelled) {
          setRuntimeError(error instanceof Error ? error.message : String(error));
          setRuntime('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
      canvas.removeEventListener('wheel', handleCanvasWheel);
      document.removeEventListener('visibilitychange', handleVisibility);
      moduleRef.current = null;
      instance?._avbd_shutdown();
      runtimeScript?.remove();
    };
  }, []);

  const selectScene = useCallback((index: number) => {
    setScene(index);
    moduleRef.current?._avbd_load_scene(index);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      pausedRef.current = next;
      moduleRef.current?._avbd_set_paused(next ? 1 : 0);
      return next;
    });
  }, []);

  const stepOnce = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
    moduleRef.current?._avbd_step_once();
  }, []);

  const toggleContacts = useCallback(() => {
    setContacts((current) => {
      const next = !current;
      moduleRef.current?._avbd_set_contacts(next ? 1 : 0);
      return next;
    });
  }, []);

  const canvasPoint = useCallback((canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (clientX - bounds.left) * canvas.width / Math.max(bounds.width, 1),
      y: (clientY - bounds.top) * canvas.height / Math.max(bounds.height, 1),
    };
  }, []);

  return (
    <section className="mx-auto w-full max-w-[1680px] px-3 pt-4 md:px-6 md:pt-7" aria-label="AVBD 交互式物理实验场">
      <div
        ref={viewportRef}
        className="relative h-[clamp(520px,calc(100svh-190px),820px)] min-h-0 overflow-hidden rounded-2xl border border-border-subtle bg-[#050706] shadow-[0_30px_100px_rgba(0,0,0,.45)]"
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none cursor-grab outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-primary/60"
          tabIndex={0}
          aria-label={`AVBD 3D 场景：${SCENES[scene][1]}`}
          onPointerDown={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            if (event.pointerType !== 'mouse' || !moduleRef.current) return;
            event.preventDefault();
            const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
            pointerRef.current = {
              id: event.pointerId,
              button: event.button,
              clientX: event.clientX,
              clientY: event.clientY,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
            moduleRef.current._avbd_pointer_down(event.button, point.x, point.y);
          }}
          onPointerMove={(event) => {
            const pointer = pointerRef.current;
            if (event.pointerType !== 'mouse' || pointer?.id !== event.pointerId || !moduleRef.current) return;
            event.preventDefault();
            const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
            const deltaX = event.clientX - pointer.clientX;
            const deltaY = event.clientY - pointer.clientY;
            pointer.clientX = event.clientX;
            pointer.clientY = event.clientY;
            moduleRef.current._avbd_pointer_move(point.x, point.y, deltaX, deltaY);
          }}
          onPointerUp={(event) => {
            const pointer = pointerRef.current;
            if (pointer?.id === event.pointerId) {
              moduleRef.current?._avbd_pointer_up(pointer.button);
              pointerRef.current = null;
            }
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            if (pointerRef.current?.id === event.pointerId) {
              moduleRef.current?._avbd_pointer_cancel();
              pointerRef.current = null;
            }
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onLostPointerCapture={(event) => {
            if (pointerRef.current?.id === event.pointerId) {
              moduleRef.current?._avbd_pointer_cancel();
              pointerRef.current = null;
            }
          }}
          onKeyDown={(event) => {
            if (event.code === 'Space') {
              event.preventDefault();
              moduleRef.current?._avbd_shoot();
            }
          }}
          onContextMenu={(event) => event.preventDefault()}
          onAuxClick={(event) => event.preventDefault()}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/65 to-transparent px-4 pb-12 pt-4 md:px-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.24em] text-accent-primary">AVBD Physics Lab</div>
            <div className="mt-1 text-xs text-text-muted">Augmented Vertex Block Descent · {SCENES[scene][0]}</div>
          </div>
          <div className="rounded-full border border-border-subtle bg-black/35 px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-text-faint backdrop-blur">
            {runtime === 'ready' ? (paused ? 'Paused' : 'Live solver') : runtime}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-wrap items-end justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-14 md:px-6">
          <p className="font-mono text-[9px] leading-5 text-text-faint">左键拖拽刚体 · 右键旋转视角 · 滚轮缩放 · 中键或空格发射刚体</p>
          <p className="font-mono text-[9px] uppercase tracking-wider text-accent-primary/70">C++ solver · WebAssembly · WebGL2</p>
        </div>

        {runtime !== 'ready' && (
          <div className="absolute inset-0 grid place-items-center bg-[#050706]/88">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border border-accent-primary/20 border-t-accent-primary" />
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[.2em] text-text-muted">
                {runtime === 'loading' ? 'Loading AVBD runtime' : 'AVBD runtime unavailable'}
              </p>
              {runtimeError && <p className="mx-auto mt-3 max-w-xl px-6 font-mono text-[9px] leading-5 text-red-300/80">{runtimeError}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-2xl border border-border-subtle bg-surface-card/80 p-3 backdrop-blur md:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 xl:flex-wrap xl:overflow-visible">
            {SCENES.map(([english, chinese], index) => (
              <button
                type="button"
                key={english}
                onClick={() => selectScene(index)}
                disabled={runtime !== 'ready'}
                aria-pressed={scene === index}
                className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-wait disabled:opacity-45 ${
                  scene === index
                    ? 'border-accent-primary/50 bg-accent-primary/12 text-accent-primary'
                    : 'border-border-subtle bg-surface-base/45 text-text-muted hover:border-border-strong hover:text-text-primary'
                }`}
              >
                <span className="block font-mono text-[9px] uppercase tracking-wider">{english}</span>
                <span className="mt-0.5 block text-[10px]">{chinese}</span>
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
            <button type="button" onClick={togglePaused} disabled={runtime !== 'ready'} aria-label={paused ? '继续模拟' : '暂停模拟'} className="rounded-lg border border-border-subtle p-2.5 text-text-muted hover:text-accent-primary disabled:opacity-40">
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
            <button type="button" onClick={stepOnce} disabled={runtime !== 'ready'} aria-label="单步模拟" className="rounded-lg border border-border-subtle p-2.5 text-text-muted hover:text-accent-primary disabled:opacity-40"><StepForward className="h-4 w-4" /></button>
            <button type="button" onClick={() => moduleRef.current?._avbd_reset_scene()} disabled={runtime !== 'ready'} aria-label="重置场景" className="rounded-lg border border-border-subtle p-2.5 text-text-muted hover:text-accent-primary disabled:opacity-40"><RotateCcw className="h-4 w-4" /></button>
            <button type="button" onClick={toggleContacts} disabled={runtime !== 'ready'} aria-label={contacts ? '隐藏接触点' : '显示接触点'} aria-pressed={contacts} className={`rounded-lg border p-2.5 disabled:opacity-40 ${contacts ? 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary' : 'border-border-subtle text-text-muted hover:text-text-primary'}`}><Contact className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
