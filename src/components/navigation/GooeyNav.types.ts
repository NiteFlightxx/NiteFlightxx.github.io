import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface GooeyNavItem {
  id?: string;
  label: string;
  href?: string;
  icon?: ReactNode;
}

export interface GooeyNavProps {
  items: GooeyNavItem[];
  initialActiveIndex?: number;
  activeIndex?: number;
  onChange?: (index: number, item: GooeyNavItem) => void;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>, index: number, item: GooeyNavItem) => void;
  theme?: 'dark' | 'light';
  color?: string;
  activeTextColor?: string;
  colors?: string[];
  size?: 'sm' | 'md' | 'lg';
  frame?: boolean;
  animationTime?: number;
  particleCount?: number;
  spread?: number;
  timeVariance?: number;
  gooeyness?: number;
  wobble?: number;
  hoverEffect?: boolean;
  rememberNavigation?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}
