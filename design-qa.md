# Drone Project Detail — Design QA

## Evidence

- Source visual truth: `C:\Users\wanglinfeng\Downloads\preview.html`
- Source capture: `docs/qa/drone-project/qa-reference.png`
- Rendered implementation: `docs/qa/drone-project/qa-drone-project-desktop.png`
- Responsive implementation: `docs/qa/drone-project/qa-drone-project-mobile.png`
- Combined comparison: `docs/qa/drone-project/qa-comparison.png`
- Runtime evidence: `docs/qa/drone-project/qa-drone-project-runtime.json`
- Desktop viewport: 1440 × 1000 CSS px, deviceScaleFactor 1; source and implementation captures are both 1440 × 1000 px, so no density normalization was required.
- Mobile viewport: 390 × 844 CSS px, deviceScaleFactor 1; implementation capture is 390 × 844 px. The source has no mobile state, so this capture validates the agreed responsive adaptation rather than pixel fidelity.
- State: dark theme; project detail open; desktop on lesson 01 (悬停), mobile on lesson 02 (姿态) after exercising the lesson selector.

## Full-view comparison

The combined image confirms the requested structural match without copying the quadruped content: a compact engineering header, dominant live viewport, dense independent sidebar, system/status labels, control-pipeline hierarchy, and restrained dark instrumentation styling. The implementation intentionally moves the four-stage flight-control pipeline above the viewport instead of copying the reference's bottom MPC/WBC/QP strip; this makes the AircraftLab-specific causal chain visible before interaction.

## Focused evidence

Separate original-resolution captures were inspected because the 2880 × 1000 combined image makes small diagnostic text difficult to judge in a normal viewer. The desktop capture verifies the header controls, four pipeline cards, five lesson tabs, live viewport overlays, project-index controls, metric cards, architecture stack, and independent scroll regions. The mobile capture verifies the stacked two-column pipeline, sticky section navigation, legible project title, accessible close control, five lesson tabs, and a viewport-first reading order.

## Required fidelity surfaces

- Fonts and typography: JetBrains Mono is retained for diagnostic/system labels and Noto Sans SC for Chinese body copy. Header, section, metric, and helper text have distinct weight and size tiers. No actionable wrapping or truncation issue was observed at either viewport.
- Spacing and layout rhythm: the desktop split is approximately 70/30, matching the reference's dominant simulation surface and narrow diagnostic rail. Borders, compact cards, and section spacing form a consistent instrument-panel rhythm. The mobile layout stacks cleanly without horizontal overflow.
- Colors and visual tokens: the implementation preserves NITE's graphite surfaces and lime primary accent while using ice blue and amber only for secondary semantics. Contrast remains readable and the result is recognizably part of the existing portfolio rather than a copy of the reference.
- Image quality and asset fidelity: the page uses the existing real-time OGL drone renderer as the primary visual rather than a placeholder. Icons come from the installed Lucide library. No reference logos, robot imagery, handcrafted SVGs, or CSS-drawn replacement assets were introduced.
- Copy and content: labels and architecture content describe the actual AircraftLab chain: MovementIntent, trajectory planning, MPCC-style predictive correction, cascaded control, allocation, rotors, and Chaos. The page explicitly states the educational-model and MPCC terminology boundaries.

## Findings

- No actionable P0, P1, or P2 differences remain. The major structural relationship and interface density match the approved direction.
- P3: the project overview paragraph is intentionally more editorial than the reference's terse telemetry. A later content pass could shorten it, but it does not impair hierarchy or use.
- P3: the procedural quadcopter remains deliberately schematic so force and rotor feedback stay readable. A future portfolio iteration could add higher-detail geometry without changing this page structure.

## Interaction and runtime checks

- Opened the drone project from the projects grid.
- Switched from lesson 01 to lesson 02 and confirmed `aria-current="step"` moved to the attitude lesson.
- Confirmed the modal locks body scrolling and exposes the project title and close control.
- Browser runtime log: no console warnings, errors, or uncaught exceptions were captured.

## Comparison history

- Pass 1: no P0/P1/P2 issues found. No visual fixes were required after the first same-viewport comparison.

## Implementation checklist

- [x] Dedicated flight-lab experience is limited to `drone-basics-interactive`.
- [x] Other projects retain the standard project detail modal.
- [x] Existing interactive drone sandbox is the primary exhibit.
- [x] AircraftLab-specific control-chain and boundary content replaces reference-page subject matter.
- [x] Desktop and mobile layouts are usable and visually coherent.
- [x] Primary interaction and console state were checked in a browser render.

## WebGL digital-twin visual pass

- Problem capture supplied by the user: `C:\Users\WANGLI~1\AppData\Local\Temp\codex-clipboard-fc7c00f2-ed3f-4595-9ad3-17c3574fb838.png`.
- Visual target supplied by the user: `C:\Users\WANGLI~1\AppData\Local\Temp\codex-clipboard-bf9057da-f425-43cb-a8ce-2ff560e364f8.png`.
- Final desktop render: `docs/qa/drone-project/qa-drone-project-palette-desktop.png`.
- Final responsive render: `docs/qa/drone-project/qa-drone-project-palette-mobile.png`.
- Runtime evidence: `docs/qa/drone-project/qa-drone-project-palette-runtime.json`.
- Desktop viewport: 2529 × 1216 CSS px, deviceScaleFactor 1. The measured WebGL canvas is 2103 × 760 px, replacing the previous compressed fixed-height presentation.
- Responsive viewport: 390 × 844 CSS px, deviceScaleFactor 1. The WebGL canvas uses a 410 px presentation height and an aspect-aware camera radius so all four rotors remain visible.

The final direction treats the reference as a visual-system target rather than a subject-matter clone. The scene now uses the portfolio's semantic palette: surface-base graphite, primary cyber lime, secondary ice blue, warm amber and the existing text scale. The filled target disc was replaced with a fine torus, the ground shader now works in world space, and the engineering field combines subtle Cartesian grid lines, radial spokes, concentric calibration rings and partial orbital arcs.

### WebGL comparison history

- Pass 1: the enlarged viewport solved the squashed canvas, but the ground was broadly brown, legacy green lines remained, the target marker was an oversized filled disc and the rotor overlays dominated the model.
- Pass 2: moved the ground pattern to world coordinates, rebuilt the palette and engineering field, replaced the filled target disc with a torus, reduced rotor-disc opacity and added portrait camera compensation.
- Pass 3: thinned the remaining calibration geometry, neutralized green-tinted UI surfaces and reserved lime for live status. A fresh Chrome QA session confirmed the final desktop and mobile renders with no console errors or warnings.

### WebGL fidelity surfaces

- Fonts and typography: the approved project-shell hierarchy remains intact; mono diagnostic overlays stay readable against the darker stage.
- Spacing and layout rhythm: the project canvas scales between 620 and 780 px on desktop and uses 410 px on mobile. The 2529 × 1216 evidence shows a 2103 × 760 canvas without vertical compression.
- Colors and visual tokens: broad surfaces use the site's surface-base/card scale; lime, ice blue and amber map directly to the existing semantic accent tokens, with the text scale providing neutral structure.
- Image quality and asset fidelity: the final result is entirely procedural OGL geometry and shader work. No raster reference content or copied reference assets ship with the page.
- Interaction and performance: all five learning modes, drag orbit, wheel zoom, ground-force picking, PID graph and mixer feedback remain connected. Rendering keeps the existing DPR caps and reduced-motion path.
- Copy and content: the five-mode causal learning sequence and AircraftLab terminology are unchanged.

### Final findings

- No P0, P1 or P2 visual differences remain relative to the approved direction.
- The quadcopter remains intentionally schematic rather than photorealistic so vectors, rotor state and control feedback are legible; the new material split and engineering field make that abstraction feel deliberate.
- The final runtime capture contains zero console warnings, errors or uncaught exceptions.

final result: passed
