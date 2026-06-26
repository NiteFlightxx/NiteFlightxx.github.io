/**
 * Brand logo. Uses `currentColor` so it inherits the surrounding text color
 * (e.g. gray-200 → hover lime in the header). Drop into any React surface
 * with a sizing/colour className.
 */
interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="132 92 284 296"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M150 150L170 170L170 350L150 370Z" />
      <path transform="translate(10, 0)" d="M340 120L360 100L360 300L340 280Z" />
      <path d="M140 110 C200 120,250 180,300 260 C330 305,365 340,400 355 C360 350,315 320,265 250 C220 185,195 135,140 110 Z" />
    </svg>
  );
}
