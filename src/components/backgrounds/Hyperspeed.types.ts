import type { CSSProperties } from 'react';

export interface HyperspeedProps {
  curve?: 'straight' | 'gentle' | 'winding' | 'hills' | 'racing' | 'deep';
  curvature?: number;
  speed?: number;
  boost?: number;
  fov?: number;
  boostFov?: number;
  lanes?: number;
  roadWidth?: number;
  medianWidth?: number;
  density?: number;
  trailLength?: number;
  lightSize?: number;
  poles?: number;
  poleHeight?: number;
  dust?: number;
  glow?: number;
  reflections?: number;
  steer?: number;
  tailColors?: string[];
  headColors?: string[];
  poleColors?: string[];
  roadColor?: string;
  roadOpacity?: number;
  lineColor?: string;
  background?: string;
  theme?: 'dark' | 'light';
  interactive?: boolean;
  boosting?: boolean;
  dpr?: number;
  onBoostStart?: () => void;
  onBoostEnd?: () => void;
  onReady?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  style?: CSSProperties;
}
