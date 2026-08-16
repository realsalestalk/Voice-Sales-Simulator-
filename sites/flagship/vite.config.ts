import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  build: {
    target: 'es2022',
    cssMinify: true,
    // Fail loudly if the entry chunk grows. The whole performance story rests
    // on Three.js staying out of it, and that regresses silently otherwise.
    chunkSizeWarningLimit: 120,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/lenis')) return 'scroll';
          return undefined;
        },
      },
    },
  },
  plugins: [
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      template: 'treemap',
    }),
  ],
});
