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

- Selected visual target: `docs/qa/drone-project/digital-twin-direction.png` (the second generated direction selected by the user).
- Rendered implementation: `docs/qa/drone-project/qa-drone-project-v6-desktop.png` and `docs/qa/drone-project/qa-drone-project-v6-mobile.png`.
- Runtime evidence: `docs/qa/drone-project/qa-drone-project-v6-runtime.json`.
- Target image dimensions: 1024 × 640 px. The target is a visual direction board rather than a pixel-perfect screen, so comparison focused on the 3D viewport region and normalized the implementation review to its visible canvas region.
- Implementation desktop viewport: 1440 × 1000 CSS px, deviceScaleFactor 1. Implementation mobile viewport: 390 × 844 CSS px, deviceScaleFactor 1.

The selected direction is represented in code with a faceted six-sided central shell, layered chassis/brace materials, motor status rings, a translucent contour-twin shell and axes, smooth calibration rings, a metric grid with depth fade, and restrained lime/ice-blue control semantics. The screenshot keeps the force arrows readable while the model and floor now provide the primary visual hierarchy.

### WebGL comparison history

- Pass 1: the first implementation used the selected visual language but Torus constructor segment arguments were reversed, producing polygonal calibration rings. Fixed by assigning the high segment count to the torus path (`tubularSegments`) and keeping a lower count for the tube profile.
- Pass 2: fresh desktop/mobile capture after the fix. No actionable P0/P1/P2 visual issue remained; the runtime capture reported no console errors.

### WebGL fidelity surfaces

- Fonts and typography: unchanged from the approved project shell; the WebGL viewport uses existing mono diagnostic overlays.
- Spacing and layout rhythm: unchanged outside the canvas; viewport overlays still align with the lesson controls and sidebar.
- Colors and visual tokens: the selected direction's graphite, lime, ice-blue and low-opacity calibration palette maps to existing NITE tokens and the sandbox legend.
- Image quality and asset fidelity: no generated raster is shipped into the app. The direction board was used as a visual reference; the final effect is procedural OGL geometry/shader work so it remains interactive.
- Copy and content: existing educational labels and five-mode lesson flow are preserved.

final result: passed
