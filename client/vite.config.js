import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function getDashboardTarget() {
  try {
    const cfgPath = path.join(os.homedir(), '.a2a', 'config.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    const port = cfg?.ports?.dashboard ?? 43333;
    return `http://127.0.0.1:${port}`;
  } catch {
    // Fallback for first-run before init or if config is missing
    return 'http://127.0.0.1:43333';
  }
}

const dashboardTarget = getDashboardTarget();
const grafanaTarget = 'http://127.0.0.1:4001'; // Grafana container port

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    host: true, // expose to host OS (WSL/containers)
    open: true,
    proxy: {
      // API routes (served by a2a dashboard server)
      '/api': {
        target: dashboardTarget,
        changeOrigin: true,
      },
      // Keep the /grafana prefix (Grafana root_url = /grafana)
      '/grafana': {
        target: grafanaTarget,
        changeOrigin: true,
        headers: {
          // Basic auth for admin:a2a (as provisioned in docker-compose)
          Authorization: 'Basic ' + Buffer.from('admin:a2a').toString('base64'),
        },
        // no rewrite!
      },
      // Belt-and-suspenders: handle any absolute /public/* asset requests
      '/public': {
        target: dashboardTarget,
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist' },
});
