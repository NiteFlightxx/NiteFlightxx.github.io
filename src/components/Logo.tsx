/**
 * Brand logo — the blocky "N" from Nite_Logo.png.
 *
 * The glyph is built from three angular strokes (left bar, diagonal, right bar)
 * traced from the reference logo. Unlike the previous curvy version, this uses
 * straight polygon segments so the letter reads as sharp and geometric.
 * Uses `currentColor` so it inherits the surrounding text color.
 */
interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 317 357"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left vertical bar */}
      <path d="M15,102 L23,113 L36,128 L49,143 L49,293 L42,308 L27,323 L15,336 Z" />
      {/* Diagonal stroke */}
      <path d="M0,0 L8,35 L22,63 L38,84 L59,105 L80,126 L101,147 L122,168 L143,189 L164,210 L185,231 L205,252 L226,273 L247,294 L269,315 L290,336 L311,357 L317,357 L300,308 L280,280 L253,252 L232,231 L211,210 L190,189 L169,168 L148,147 L127,126 L106,105 L85,84 L64,63 L43,42 L22,21 L1,0 Z" />
      {/* Right vertical bar */}
      <path d="M303,43 L303,253 L304,267 L289,248 L276,233 L269,218 L269,83 L278,68 L293,53 L303,43 Z" />
    </svg>
  );
}
