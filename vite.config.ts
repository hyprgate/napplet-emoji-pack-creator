import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { nip5aManifest } from '@napplet/vite-plugin';

export default defineConfig({
  base: './',
  plugins: [
    svelte(),
    nip5aManifest({
      nappletType: 'emoji-pack-creator',
      requires: ['identity', 'relay', 'outbox', 'resource', 'storage', 'theme', 'upload', 'common', 'inc'],
      artifactMode: 'single-file',
    }),
  ],
  resolve: { dedupe: ['svelte'] },
  server: { port: 9535, cors: true },
  build: { outDir: 'dist' },
});
