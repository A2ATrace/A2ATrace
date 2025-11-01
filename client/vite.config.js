import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    host: true, // expose to host OS (WSL/containers)
    open: true,
    proxy: {
      // API routes for Loki queries
      '/api': {
        target: 'http://127.0.0.1:43333',
        changeOrigin: true,
      },
      // Keep the /grafana prefix (Grafana root_url = /grafana)
      '/grafana': {
        target: 'http://127.0.0.1:43333',
        changeOrigin: true,
        // no rewrite!
      },
      // Belt-and-suspenders: handle any absolute /public/* asset requests
      '/public': {
        target: 'http://127.0.0.1:43333',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist' },
});
