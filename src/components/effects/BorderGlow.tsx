/**
 * Adapted from the user-supplied React Bits BorderGlow source.
 * Copyright (c) 2026 David Haz. MIT + Commons Clause.
 * Source: https://reactbits.dev/components/border-glow
 * License: /licenses/react-bits-LICENSE.md
 * Native element/children layout and existing pointer handlers are preserved.
 */
import { createElement, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import './BorderGlow.css';

type GlowStyle = CSSProperties & Record<`--${string}`, string | number>;
interface BorderGlowProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'a' | 'button';
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
  edgeSensitivity?: number; glowColor?: string; backgroundColor?: string;
  borderRadius?: number; glowRadius?: number; glowIntensity?: number;
  coneSpread?: number; animated?: boolean; colors?: string[]; fillOpacity?: number;
}

const SITE_COLORS = ['var(--color-accent-primary)', 'var(--color-accent-primary-hover)', 'var(--color-accent-primary)'];

function parseHSL(hslStr: string) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string | undefined, intensity: number) {
  const { h, s, l } = parseHSL(glowColor ?? '239 70 70');
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  const vars: Record<string, string> = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = glowColor
      ? `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`
      : `color-mix(in srgb, var(--color-accent-primary) ${Math.min(opacities[i] * intensity, 100)}%, transparent)`;
  }
  return vars;
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors: string[]) {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars['--gradient-base'] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

function isLightColor(color: string) {
  const value = color.trim().replace('#', '');
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(value)) return false;
  const hex = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 180;
}

function easeOutCubic(x: number) { return 1 - Math.pow(1 - x, 3); }
function easeInCubic(x: number) { return x * x * x; }

interface AnimationOptions {
  start?: number; end?: number; duration?: number; delay?: number;
  ease?: (value: number) => number; onUpdate: (value: number) => void; onEnd?: () => void;
}
function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }: AnimationOptions) {
  const t0 = performance.now() + delay;
  let frame = 0;
  function tick() {
    const elapsed = performance.now() - t0;
    const t = Math.max(0, Math.min(elapsed / duration, 1));
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) frame = requestAnimationFrame(tick);
    else if (onEnd) onEnd();
  }
  const timer = setTimeout(() => {
    frame = requestAnimationFrame(tick);
  }, delay);
  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
  };
}

export default function BorderGlow({
  as = 'div', children, className = '', style, onPointerMove, onPointerLeave,
  edgeSensitivity = 30, glowColor, backgroundColor = 'var(--color-surface-card)',
  borderRadius = 14, glowRadius = 24, glowIntensity = 0.7, coneSpread = 25,
  animated = false, colors = SITE_COLORS, fillOpacity = 0.06, ...elementProps
}: BorderGlowProps) {
  const cardRef = useRef<HTMLElement>(null);
  const allowMotion = useRef(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => {
      allowMotion.current = !motion.matches && pointer.matches;
      if (!allowMotion.current) cardRef.current?.style.setProperty('--edge-proximity', '0');
    };
    sync();
    motion.addEventListener('change', sync);
    pointer.addEventListener('change', sync);
    return () => { motion.removeEventListener('change', sync); pointer.removeEventListener('change', sync); };
  }, []);

  useEffect(() => {
    if (!animated || !cardRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = cardRef.current;
    const angleStart = 110;
    const angleEnd = 465;
    card.classList.add('sweep-active');
    card.style.setProperty('--cursor-angle', `${angleStart}deg`);
    const animations = [
      animateValue({ duration: 500, onUpdate: value => card.style.setProperty('--edge-proximity', `${value}`) }),
      animateValue({ ease: easeInCubic, duration: 1500, end: 50, onUpdate: value => card.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * value / 100 + angleStart}deg`) }),
      animateValue({ ease: easeOutCubic, delay: 1500, duration: 2250, start: 50, end: 100, onUpdate: value => card.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * value / 100 + angleStart}deg`) }),
      animateValue({ ease: easeInCubic, delay: 2500, duration: 1500, start: 100, end: 0, onUpdate: value => card.style.setProperty('--edge-proximity', `${value}`), onEnd: () => card.classList.remove('sweep-active') }),
    ];
    const cancel = () => { animations.forEach(stop => stop()); card.classList.remove('sweep-active'); };
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => { if (motion.matches) cancel(); };
    motion.addEventListener('change', onMotionChange);
    return () => { cancel(); motion.removeEventListener('change', onMotionChange); };
  }, [animated]);

  const cardStyle: GlowStyle = {
    '--card-bg': backgroundColor,
    '--edge-sensitivity': Math.max(0, Math.min(79, edgeSensitivity)),
    '--border-radius': `${borderRadius}px`,
    '--glow-padding': `${glowRadius}px`,
    '--cone-spread': coneSpread,
    '--fill-opacity': fillOpacity,
    ...buildGlowVars(glowColor, glowIntensity),
    ...buildGradientVars(colors.length ? colors : SITE_COLORS),
    ...style,
  };

  return createElement(as, {
    ...elementProps,
    ref: cardRef,
    className: `border-glow-card${isLightColor(backgroundColor) ? ' border-glow-card--light' : ''} ${className}`,
    style: cardStyle,
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const card = cardRef.current;
      if (card && allowMotion.current && event.pointerType === 'mouse') {
        const rect = card.getBoundingClientRect();
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        const edge = Math.min(1, Math.max(Math.abs(dx) / Math.max(rect.width / 2, 1), Math.abs(dy) / Math.max(rect.height / 2, 1)));
        const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;
        card.style.setProperty('--edge-proximity', `${(edge * 100).toFixed(3)}`);
        card.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`);
      }
      onPointerMove?.(event);
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      cardRef.current?.style.setProperty('--edge-proximity', '0');
      onPointerLeave?.(event);
    },
  }, <span className="edge-light" aria-hidden="true" />, children);
}
