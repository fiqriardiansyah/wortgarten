import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@wortgarten/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\//],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3026',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
