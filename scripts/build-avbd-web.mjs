import { existsSync, mkdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'native', 'avbd', 'source');
const webRoot = path.join(root, 'native', 'avbd', 'web');
const outputRoot = path.join(root, 'public', 'avbd');

mkdirSync(outputRoot, { recursive: true });

// Remove artifacts from the earlier ES-module output layout. These exact
// generated files are reproducible and are not source inputs.
const obsoleteOutputRoot = path.join(root, 'src', 'wasm');
for (const obsoleteFile of [
  path.join(outputRoot, 'avbd.mjs'),
  path.join(obsoleteOutputRoot, 'avbd.mjs'),
  path.join(obsoleteOutputRoot, 'avbd.wasm'),
]) {
  if (!obsoleteFile.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe generated path: ${obsoleteFile}`);
  if (existsSync(obsoleteFile)) unlinkSync(obsoleteFile);
}
if (existsSync(obsoleteOutputRoot)) rmdirSync(obsoleteOutputRoot);

const sources = [
  'collide.cpp', 'force.cpp', 'joint.cpp', 'manifold.cpp', 'rigid.cpp', 'solver.cpp', 'spring.cpp',
].map((file) => path.join(sourceRoot, file));

const exportedFunctions = [
  '_main', '_avbd_load_scene', '_avbd_reset_scene', '_avbd_set_paused', '_avbd_step_once',
  '_avbd_set_contacts', '_avbd_pointer_down', '_avbd_pointer_move', '_avbd_pointer_up',
  '_avbd_pointer_cancel', '_avbd_zoom', '_avbd_shoot', '_avbd_resize', '_avbd_shutdown',
];

const args = [
  ...sources,
  path.join(webRoot, 'avbd_web.cpp'),
  '-I', sourceRoot,
  '-std=c++17', '-O3',
  '-sUSE_SDL=2', '-sUSE_WEBGL2=1', '-sMIN_WEBGL_VERSION=2', '-sMAX_WEBGL_VERSION=2',
  '-sLEGACY_GL_EMULATION=1', '-sALLOW_MEMORY_GROWTH=1', '-sMODULARIZE=1',
  '-sEXPORT_NAME=createAvbdModule', '-sENVIRONMENT=web', '-sNO_EXIT_RUNTIME=1',
  `-sEXPORTED_FUNCTIONS=${JSON.stringify(exportedFunctions)}`,
  '-o', path.join(outputRoot, 'avbd.js'),
];

let compiler = process.env.EMXX || 'em++';
let compilerArgs = args;
if (process.platform === 'win32' && process.env.EMSDK && process.env.EMSDK_PYTHON) {
  compiler = process.env.EMSDK_PYTHON;
  compilerArgs = [path.join(process.env.EMSDK, 'upstream', 'emscripten', 'em++.py'), ...args];
}

const result = spawnSync(compiler, compilerArgs, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to launch ${compiler}: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`AVBD WebAssembly written to ${path.relative(root, outputRoot)}`);
