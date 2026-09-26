import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Filter, Focus, LocateFixed, Minus, Plus, Search, X } from 'lucide-react';
import type { KnowledgeGraph as GraphData, KnowledgeGraphNode } from '../types';

const BASE_URL = import.meta.env.BASE_URL;
const WIDTH = 1200;
const HEIGHT = 760;

interface Point { x: number; y: number; }
interface Transform { x: number; y: number; scale: number; }

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function layoutNodes(nodes: KnowledgeGraphNode[]): Map<string, Point> {
  const categories = [...new Set(nodes.map((node) => node.category))];
  const groups = new Map(categories.map((category) => [category, nodes.filter((node) => node.category === category)]));
  const positions = new Map<string, Point>();
  categories.forEach((category, groupIndex) => {
    const angle = (groupIndex / Math.max(categories.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const centerX = WIDTH / 2 + Math.cos(angle) * 285;
    const centerY = HEIGHT / 2 + Math.sin(angle) * 210;
    const group = groups.get(category) ?? [];
    group.forEach((node, index) => {
      const seed = hash(node.id);
      const itemAngle = (index / Math.max(group.length, 1)) * Math.PI * 2 + (seed % 100) / 100;
      const ring = 38 + (index % 4) * 25;
      positions.set(node.id, { x: centerX + Math.cos(itemAngle) * ring, y: centerY + Math.sin(itemAngle) * ring });
    });
  });
  return positions;
}

export default function KnowledgeGraph() {
  const [data, setData] = useState<GraphData | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [pageType, setPageType] = useState('all');
  const [selected, setSelected] = useState<KnowledgeGraphNode | null>(null);
  const [center, setCenter] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [manualPositions, setManualPositions] = useState<Record<string, Point>>({});
  const dragRef = useRef<{ mode: 'pan' | 'node'; id?: string; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setCenter(new URLSearchParams(window.location.search).get('center'));
    fetch(`${BASE_URL}knowledge-graph.json`).then((response) => response.json() as Promise<GraphData>).then(setData).catch(() => setData(null));
  }, []);

  const categories = useMemo(() => data ? [...new Set(data.nodes.map((node) => node.categoryLabel))].sort() : [], [data]);
  const pageTypes = useMemo(() => data ? [...new Set(data.nodes.map((node) => node.pageType))].sort() : [], [data]);

  const neighborhood = useMemo(() => {
    if (!data || !center) return null;
    const ids = new Set([center]);
    data.edges.forEach((edge) => { if (edge.source === center) ids.add(edge.target); if (edge.target === center) ids.add(edge.source); });
    return ids;
  }, [center, data]);

  const visibleNodes = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLocaleLowerCase();
    let nodes = data.nodes.filter((node) => {
      if (neighborhood && !neighborhood.has(node.id)) return false;
      if (category !== 'all' && node.categoryLabel !== category) return false;
      if (pageType !== 'all' && node.pageType !== pageType) return false;
      return !normalized || `${node.title} ${node.summary} ${node.categoryLabel}`.toLocaleLowerCase().includes(normalized);
    });
    const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    const limit = neighborhood ? 500 : mobile ? 120 : 300;
    nodes = nodes.sort((a, b) => b.degree - a.degree).slice(0, limit);
    return nodes;
  }, [category, data, neighborhood, pageType, query]);

  const nodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => data?.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)) ?? [], [data, nodeIds]);
  const basePositions = useMemo(() => layoutNodes(visibleNodes), [visibleNodes]);
  const positionOf = (id: string) => manualPositions[id] ?? basePositions.get(id) ?? { x: WIDTH / 2, y: HEIGHT / 2 };

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (WIDTH / rect.width), y: (event.clientY - rect.top) * (HEIGHT / rect.height) };
  };

  const startPan = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    const point = pointFromEvent(event);
    dragRef.current = { mode: 'pan', startX: point.x, startY: point.y, originX: transform.x, originY: transform.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startNodeDrag = (event: React.PointerEvent<SVGGElement>, node: KnowledgeGraphNode) => {
    event.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = { x: (event.clientX - rect.left) * (WIDTH / rect.width), y: (event.clientY - rect.top) * (HEIGHT / rect.height) };
    const position = positionOf(node.id);
    dragRef.current = { mode: 'node', id: node.id, startX: point.x, startY: point.y, originX: position.x, originY: position.y };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = pointFromEvent(event);
    if (drag.mode === 'pan') setTransform((current) => ({ ...current, x: drag.originX + point.x - drag.startX, y: drag.originY + point.y - drag.startY }));
    else if (drag.id) setManualPositions((current) => ({ ...current, [drag.id!]: { x: drag.originX + (point.x - drag.startX) / transform.scale, y: drag.originY + (point.y - drag.startY) / transform.scale } }));
  };

  const zoom = (amount: number) => setTransform((current) => ({ ...current, scale: Math.max(0.45, Math.min(2.4, current.scale + amount)) }));
  const resetView = () => { setTransform({ x: 0, y: 0, scale: 1 }); setManualPositions({}); };

  if (!data) return <div className="flex min-h-[60vh] items-center justify-center font-mono text-xs text-text-muted">正在加载静态知识图谱…</div>;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-7 md:px-7">
      <header className="mb-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><span className="font-mono text-[10px] uppercase tracking-[.25em] text-accent-primary">Static knowledge graph</span><h1 className="mt-2 font-display text-3xl font-black text-text-primary md:text-5xl">知识图谱</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">边来自站内链接、前置知识、后续阅读、相关页面与专题关系。数据在构建时生成。</p></div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] text-text-faint"><span className="rounded border border-border-subtle px-2 py-1">{visibleNodes.length} 节点</span><span className="rounded border border-border-subtle px-2 py-1">{visibleEdges.length} 关系</span>{center && <button onClick={() => setCenter(null)} className="rounded border border-accent-primary/30 px-2 py-1 text-accent-primary">退出邻域模式</button>}</div>
      </header>

      <section className="mb-4 grid gap-3 rounded-xl border border-border-subtle bg-surface-card/60 p-3 md:grid-cols-[1fr_auto_auto]">
        <label className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-base/60 px-3"><Search className="h-4 w-4 text-text-faint" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-text-primary outline-none" /></label>
        <label className="flex items-center gap-2"><Filter className="h-3.5 w-3.5 text-text-faint" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2.5 text-xs text-text-muted"><option value="all">全部领域</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <select value={pageType} onChange={(event) => setPageType(event.target.value)} className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2.5 text-xs text-text-muted"><option value="all">全部类型</option>{pageTypes.map((item) => <option key={item}>{item}</option>)}</select>
      </section>

      <div className="relative overflow-hidden rounded-2xl border border-border-strong bg-surface-card/45 shadow-[0_24px_80px_rgba(0,0,0,.25)]">
        <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[68vh] min-h-[520px] w-full touch-none select-none" onPointerDown={startPan} onPointerMove={movePointer} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} onWheel={(event) => { event.preventDefault(); zoom(event.deltaY > 0 ? -0.08 : 0.08); }} aria-label="可交互知识图谱">
          <defs><pattern id="graph-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="currentColor" strokeOpacity=".055" /></pattern><filter id="node-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#graph-grid)" className="text-text-primary" pointerEvents="none" />
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {visibleEdges.map((edge, index) => { const a = positionOf(edge.source); const b = positionOf(edge.target); return <line key={`${edge.source}-${edge.target}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeWidth={edge.type === 'topic' ? 1.4 : .8} strokeOpacity={edge.type === 'related' ? .34 : .18} className={edge.type === 'topic' ? 'text-accent-secondary' : 'text-text-muted'} pointerEvents="none" />; })}
            {visibleNodes.map((node) => { const point = positionOf(node.id); const active = selected?.id === node.id || center === node.id; const radius = Math.min(13, 5 + node.degree * .75 + (node.pageType === 'topic' ? 3 : 0)); return <g key={node.id} transform={`translate(${point.x} ${point.y})`} onPointerDown={(event) => startNodeDrag(event, node)} onClick={(event) => { event.stopPropagation(); setSelected(node); }} onDoubleClick={() => window.location.assign(node.url)} className="cursor-grab active:cursor-grabbing" role="button" tabIndex={0}>
              <circle r={active ? radius + 5 : radius + 2} fill="currentColor" fillOpacity={active ? .18 : .06} className={active ? 'text-accent-primary' : 'text-text-muted'} />
              <circle r={radius} fill="currentColor" className={node.pageType === 'topic' ? 'text-accent-secondary' : active ? 'text-accent-primary' : 'text-text-secondary'} filter={active ? 'url(#node-glow)' : undefined} />
              {(active || node.degree >= 3 || visibleNodes.length < 60) && <text x={radius + 7} y="4" fill="currentColor" className={active ? 'text-accent-primary' : 'text-text-muted'} fontSize={active ? 12 : 10} fontWeight={active ? 700 : 500} pointerEvents="none">{node.title.length > 20 ? `${node.title.slice(0, 20)}…` : node.title}</text>}
            </g>; })}
          </g>
        </svg>

        <div className="absolute bottom-4 left-4 flex overflow-hidden rounded-lg border border-border-subtle bg-surface-base/85 shadow-lg backdrop-blur"><button onClick={() => zoom(.15)} className="p-2.5 text-text-muted hover:text-accent-primary" aria-label="放大"><Plus className="h-4 w-4" /></button><button onClick={() => zoom(-.15)} className="border-x border-border-subtle p-2.5 text-text-muted hover:text-accent-primary" aria-label="缩小"><Minus className="h-4 w-4" /></button><button onClick={resetView} className="p-2.5 text-text-muted hover:text-accent-primary" aria-label="重置视图"><LocateFixed className="h-4 w-4" /></button></div>
        <div className="absolute bottom-4 right-4 hidden rounded-lg border border-border-subtle bg-surface-base/80 px-3 py-2 font-mono text-[9px] text-text-faint md:block">拖拽画布 · 滚轮缩放 · 双击打开文章</div>

        {selected && <aside className="absolute inset-y-0 right-0 w-full max-w-sm border-l border-border-strong bg-surface-base/95 p-6 shadow-2xl backdrop-blur-xl"><div className="flex items-start justify-between gap-3"><span className="font-mono text-[9px] uppercase tracking-widest text-accent-primary">{selected.categoryLabel} · {selected.pageType}</span><button onClick={() => setSelected(null)} className="text-text-muted hover:text-text-primary" aria-label="关闭摘要"><X className="h-5 w-5" /></button></div><h2 className="mt-5 font-display text-2xl font-bold leading-snug text-text-primary">{selected.title}</h2><p className="mt-4 text-sm leading-7 text-text-muted">{selected.summary}</p><div className="mt-6 flex items-center gap-2"><a href={selected.url} className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-4 py-2.5 text-xs font-bold text-black">阅读全文<ExternalLink className="h-3.5 w-3.5" /></a><button onClick={() => { setCenter(selected.id); setSelected(null); resetView(); }} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-4 py-2.5 text-xs text-text-secondary hover:text-text-primary"><Focus className="h-3.5 w-3.5" />查看邻域</button></div><dl className="mt-8 grid grid-cols-2 gap-3 border-t border-border-subtle pt-5 text-xs"><div><dt className="text-text-faint">连接度</dt><dd className="mt-1 font-mono text-text-primary">{selected.degree}</dd></div><div><dt className="text-text-faint">节点类型</dt><dd className="mt-1 font-mono text-text-primary">{selected.pageType}</dd></div></dl></aside>}
      </div>
    </div>
  );
}
