import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function getConfig() {
  try {
    const cfgPath = path.join(os.homedir(), '.a2a', 'config.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    return {
      dashboardPort: cfg?.ports?.dashboard ?? 43333,
      grafanaUser: cfg?.grafana?.user ?? 'admin',
      grafanaPassword: cfg?.grafana?.password ?? 'a2a',
    };
  } catch {
    // Fallback for first-run before init or if config is missing
    return {
      dashboardPort: 43333,
      grafanaUser: 'admin',
      grafanaPassword: 'a2a',
    };
  }
}

const config = getConfig();
const dashboardTarget = `http://127.0.0.1:${config.dashboardPort}`;
const grafanaTarget = 'http://127.0.0.1:4001'; // Grafana container port
const grafanaAuth = Buffer.from(
  `${config.grafanaUser}:${config.grafanaPassword}`
).toString('base64');

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
          // Basic auth from config (configurable via env vars)
          Authorization: `Basic ${grafanaAuth}`,
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
