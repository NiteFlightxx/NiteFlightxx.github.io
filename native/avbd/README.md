# AVBD Web runtime

This directory vendors the solver, constraint, collision and scene code from
[`savant117/avbd-demo3d`](https://github.com/savant117/avbd-demo3d). The
site-specific `web/avbd_web.cpp` adapter replaces the original SDL/ImGui UI and
exports a small C interface for the React homepage viewport.

The upstream implementation is licensed under the MIT License. Keep
`native/avbd/LICENSE`, the copyright headers in the vendored source files and
the entry in `THIRD_PARTY_NOTICES.md` when redistributing the site.

Build with an activated Emscripten SDK:

```sh
npm run build:avbd
```

The generated `public/avbd/avbd.js` and `public/avbd/avbd.wasm` files are
loaded by the React viewport as static GitHub Pages assets. They do not require
a server-side runtime.
