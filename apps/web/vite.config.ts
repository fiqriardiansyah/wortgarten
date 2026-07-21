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
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 3026}`,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
