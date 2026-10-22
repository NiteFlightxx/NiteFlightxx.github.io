# NITE / Ticket Tear

NITE 中文票券交互实验。界面、票面正反面、帮助与验证状态统一使用中文；页眉、全息材质缩略图与票面防伪章共享个人网站的 NITE 标志。基于 Vite、TypeScript、React、Three.js、自定义 GLSL、程序化 Canvas 纹理和 Web Audio 构建。

From the repository root:

```sh
npm install
npm run dev:ticket
npm run build:ticket
npm run test:ticket
```

The standalone Vite app runs at `http://localhost:5173`. The same component is published at `/cases/ticket-tear/`, accessible through a large case card on the portfolio's TOY gallery. The gallery keeps the existing `/about/` URL and `/#archive` compatibility; the original biography and technical index have been removed. It loads only static case previews; Three.js, physics, and audio load when a case is opened. The demo links back to TOY. The portfolio homepage remains at `/`. The published case does not depend on a running Vite server.

Add future gallery entries to `src/data/toys.ts`. Cards and the case count are generated from that list; each entry specifies its title, description, tags, preview, and experience route.

Drag the upper pass to flex. Drag horizontally along the dotted perforation, or pull the bottom stub down to sever fibers. The button also performs a sequential tear. Double-click / **F** flips the ticket; **X** shows the live spring lattice; **R** issues a fresh pass. Sound starts after the first interaction and can be muted.

The 900-particle solver uses ten constraint iterations, structural and shear springs, two bending distances, and two coincident but independently indexed seam rows. Exactly 25 breakable springs connect the mesh islands. The foil shader uses front/back 1024 × 1740 canvas textures, RGB reflectivity/emboss/phase masks, thin-film interference, and Voronoi glitter. A matching cutout depth shader casts the deformed ticket's shadow. Audio is generated locally without samples.

This is an interactive concept; it does not process payments or issue real admission credentials. The procedural QR-style artwork is decorative.
