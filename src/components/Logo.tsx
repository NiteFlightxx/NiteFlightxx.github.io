/**
 * Brand logo — the blocky "N" from Nite_Logo.png.
 *
 * The glyph is built from three angular strokes (left bar, diagonal, right bar)
 * traced from the reference logo. Unlike the previous curvy version, this uses
 * straight polygon segments so the letter reads as sharp and geometric.
 * Uses `currentColor` so it inherits the surrounding text color.
 */
import { NITE_LOGO_HEIGHT, NITE_LOGO_PATHS, NITE_LOGO_WIDTH } from '../lib/brandGeometry';

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${NITE_LOGO_WIDTH} ${NITE_LOGO_HEIGHT}`}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {NITE_LOGO_PATHS.map(path => <path key={path} d={path} />)}
    </svg>
  );
}
