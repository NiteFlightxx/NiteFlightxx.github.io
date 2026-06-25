import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';

// GitHub Pages serves project sites under a sub-path (e.g. /my-repo/) and user
// sites (/<username>.github.io) under root. Derive `base` from GITHUB_REPOSITORY
// at build time so the same config deploys to any repo; fall back to '/' for local dev.
const ghRepo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
const base = process.env.GITHUB_REPOSITORY
  ? (ghRepo.endsWith('.github.io') ? '/' : `/${ghRepo}/`)
  : '/';
const site = process.env.GITHUB_REPOSITORY?.includes('/')
  ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io`
  : 'https://localhost';

// https://astro.build/config
export default defineConfig({
  site,
  base,
  output: 'static',
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeSlug, rehypeKatex],
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': new URL('.', import.meta.url).pathname,
      },
    },
  },
});
