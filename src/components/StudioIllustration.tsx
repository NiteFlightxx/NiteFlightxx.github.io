export default function StudioIllustration() {
  return <svg className="studio-illustration" viewBox="0 0 480 310" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth=".6" opacity=".12">{Array.from({length:13},(_,i)=><path key={i} d={`M${25+i*34} 30V280 M25 ${30+i*20}H435`}/>)}</g>
    <g stroke="currentColor" strokeWidth="1.1" opacity=".6"><path d="m106 93 142-49 127 76-140 56zM106 93v113l129 66 140-56V120M235 176v96"/><path d="m106 206 142-51 127 61M248 44v111" strokeDasharray="4 5" opacity=".35"/></g>
    <g stroke="var(--color-accent-primary)" strokeWidth="1.1"><circle cx="241" cy="152" r="66"/><ellipse cx="241" cy="152" rx="66" ry="23" transform="rotate(-20 241 152)"/><ellipse cx="241" cy="152" rx="25" ry="66" transform="rotate(-20 241 152)"/><ellipse cx="241" cy="152" rx="49" ry="66" transform="rotate(35 241 152)" opacity=".45"/></g>
    <path d="M35 250c56 0 70-44 111-44s90 31 132-22 52-91 130-108" stroke="var(--color-accent-primary)" strokeDasharray="3 5" opacity=".65"/>
    <g fill="var(--color-accent-primary)"><circle cx="106" cy="206" r="3"/><circle cx="235" cy="272" r="3"/><circle cx="375" cy="216" r="3"/><circle cx="408" cy="76" r="3"/></g>
    <g fill="currentColor" opacity=".6" fontFamily="monospace" fontSize="9" letterSpacing="1.5"><text x="24" y="17">FORM / FORCE / MOTION</text><text x="339" y="290">NITE — 001</text><text x="395" y="64">Δt</text></g>
  </svg>;
}
