/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { signscanTrainer } from './scripts/trainer-plugin';

export default defineConfig({
  // Relative base: the built site works from any static host path (GitHub Pages, Netlify, a USB stick).
  base: './',
  // signscanTrainer: dev-only "Train model" endpoint (runs ml/scripts/pipeline.py locally)
  plugins: [react(), tailwindcss(), signscanTrainer()],
  server: {
    // shared/labels.json lives one level above app/
    fs: { allow: ['..'] },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
