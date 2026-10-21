// Static decorative diagrams: no canvas, simulation, animation or GPU context.
export default function ResearchDiagram({ kind }: { kind: string }) {
  return (
    <svg className="research-diagram" viewBox="0 0 260 150" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="0.7" opacity="0.15">
        {[20, 50, 80, 110, 140].map((y) => <path key={`h${y}`} d={`M0 ${y}H260`} />)}
        {[10, 40, 70, 100, 130, 160, 190, 220, 250].map((x) => <path key={`v${x}`} d={`M${x} 0V150`} />)}
      </g>
      {kind === 'physics' ? <>
        <g stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
          <path d="M66 52 125 23 183 52 124 83Z M66 52V107L124 136 183 106V52 M124 83V136" />
          <path d="M125 23V78L66 107 M125 78 183 106" strokeDasharray="4 5" opacity="0.35" />
          <path d="M26 116 90 146 M173 137 227 108 M195 121V64 M190 70 195 64 200 70" opacity="0.45" />
        </g>
        <g fill="var(--color-accent-primary)"><circle cx="66" cy="107" r="3" /><circle cx="124" cy="136" r="3" /><circle cx="183" cy="106" r="3" /></g>
        <path d="M38 121 96 150M96 150 210 94" stroke="var(--color-accent-primary)" opacity="0.35" />
      </> : kind === 'animation' ? <>
        <path d="M22 124C80 131 101 103 132 104S204 100 242 64" stroke="var(--color-accent-primary)" strokeDasharray="4 5" />
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="128" cy="28" r="9" /><path d="M128 38 123 69 130 88 M123 49 101 62 89 49 M123 49 147 60 163 48 M130 88 104 103 95 126 M130 88 151 108 173 116" />
          <path d="M79 43 75 75 89 92 77 112 61 121 M75 57 57 69 M75 57 95 65 M89 92 105 111" opacity="0.22" />
        </g>
        <g fill="var(--color-accent-primary)">{[[123, 69], [130, 88], [104, 103], [151, 108], [95, 126], [173, 116]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.5" />)}</g>
      </> : <>
        <path d="M13 126C58 126 55 96 92 96S159 112 180 77 198 32 245 25" stroke="var(--color-accent-primary)" strokeDasharray="4 5" />
        <g stroke="currentColor" strokeWidth="1.4">
          <path d="m90 47 74 33M164 47 90 80" /><ellipse cx="90" cy="47" rx="23" ry="8" /><ellipse cx="164" cy="47" rx="23" ry="8" /><ellipse cx="90" cy="80" rx="23" ry="8" /><ellipse cx="164" cy="80" rx="23" ry="8" /><path d="m116 57 22 0 5 15h-32Z" />
          <path d="M127 45V17 M122 24 127 17 132 24" stroke="var(--color-accent-primary)" />
        </g><circle cx="180" cy="77" r="3" fill="var(--color-accent-primary)" />
      </>}
    </svg>
  );
}
