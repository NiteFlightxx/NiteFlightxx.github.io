import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// GitHub Pages serves project sites under a sub-path (e.g. /my-repo/) and user
// sites (/<username>.github.io) under root. Derive `base` from GITHUB_REPOSITORY
// at build time so the same config deploys to any repo; fall back to '/' for local dev.
const ghRepo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const base = process.env.GITHUB_REPOSITORY
  ? (ghRepo.endsWith('.github.io') ? '/' : `/${ghRepo}/`)
  : '/';

export default defineConfig(() => {
  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
