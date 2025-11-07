// cli/commands/start-dashboard.ts
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import chalk from 'chalk';
import express from 'express';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';
import {
  GLOBAL_CONFIG_PATH,
  REGISTRY_PATH,
  DOCKER_COMPOSE_PATH,
} from '../config.js';
import type { AgentCard } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../..');

const HEARTBEAT_INTERVAL_MS = 10000; // Broadcast heartbeat every 10 seconds

export default async function startDashboard() {
  try {
    const configPath = GLOBAL_CONFIG_PATH;
    const agentsPath = REGISTRY_PATH;
    const dockerComposePath = DOCKER_COMPOSE_PATH;

    if (!(await fs.pathExists(configPath))) {
      console.error(
        chalk.red('❌ Missing global config.json — run `a2a init` first')
      );
      process.exit(1);
    }

    // 🔹 Verify Docker is available
    try {
      await execa('docker', ['--version']);
    } catch (err) {
      console.error(chalk.red('❌ Docker is not installed or not in PATH'));
      console.error(
        chalk.yellow('   Please install Docker Desktop or Docker Engine')
      );
      process.exit(1);
    }

    // 🔹 Verify Docker Compose is available
    try {
      await execa('docker', ['compose', 'version']);
    } catch (err) {
      console.error(chalk.red('❌ Docker Compose is not available'));
      console.error(
        chalk.yellow('   Please ensure Docker Compose plugin is installed')
      );
      process.exit(1);
    }

    // 🔹 Check if Docker daemon is running
    try {
      await execa('docker', ['info']);
    } catch (err) {
      console.error(chalk.red('❌ Docker daemon is not running'));
      console.error(
        chalk.yellow('   Please start Docker Desktop or the Docker service')
      );
      process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // 🔹 Start Docker stack
    console.log(chalk.blue('🐳 Starting telemetry stack...'));
    try {
      await execa('docker', ['compose', '-f', dockerComposePath, 'up', '-d'], {
        stdio: 'inherit',
      });
    } catch (err) {
      console.error(chalk.red('❌ Failed to start Docker containers'));
      console.error(
        chalk.yellow('   Error:'),
        err instanceof Error ? err.message : String(err)
      );
      process.exit(1);
    }

    console.log(chalk.green('✅ Telemetry stack running!'));
    console.log(
      chalk.gray('   Prometheus:'),
      `http://localhost:${config.ports.prometheus}`
    );
    console.log(
      chalk.gray('   Loki:'),
      `http://localhost:${config.ports.loki}`
    );
    console.log(
      chalk.gray('   Tempo HTTP:'),
      `http://localhost:${config.ports.tempoHttp}`
    );
    console.log(
      chalk.gray('   Collector HTTP:'),
      config.collector.endpointHttp
    );

    // 🔹 Express app
    const app = express();
    app.use(express.json());
    const dashboardPort = config.ports.dashboard || 4000;

    // helper to load agents
    async function loadAgents(): Promise<AgentCard[]> {
      if (await fs.pathExists(agentsPath)) {
        return (await fs.readJson(agentsPath)) as AgentCard[];
      }
      return [];
    }
    //  Get agent list from registry
    app.get('/api/agents', async (_req, res) => {
      res.json({ agents: await loadAgents() });
    });

    // ---- Metrics: returns { agents: [{ agent, metrics }] } ----
    app.get('/api/metrics', async (_req, res) => {
      try {
        const agents = await loadAgents();
        if (!agents.length) return res.json({ agents: [] });

        const results = await Promise.all(
          agents.map(async (agent: AgentCard) => {
            const serviceName = agent.name;
            const promQL = `questions_total{service_name="${serviceName}"}`;
            const r = await fetch(
              `http://localhost:${
                config.ports.prometheus
              }/api/v1/query?query=${encodeURIComponent('questions_total')}`
            );
            const metrics = await r.json();
            return { agent: serviceName, metrics };
          })
        );

        res.json({ agents: results });
      } catch (err) {
        res.status(500).json({
          error: 'Metrics fetch failed',
          details: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ---- Logs: returns { agents: [{ agent, logs }] } ----
    app.get('/api/logs', async (_req, res) => {
      try {
        const agents = await loadAgents();
        if (!agents.length) return res.json({ agents: [] });

        const endNs = BigInt(Date.now()) * 1000000n; // Loki expects ns
        const startNs = endNs - 5n * 60n * 1000000000n; // last 5 minutes

        const results = await Promise.all(
          agents.map(async (agent: AgentCard) => {
            const serviceName = agent.name;
            // Broad query; refine labels as needed per agent instrumentation
            const query = `{job=~".+"}`;
            const url = `http://localhost:${
              config.ports.loki
            }/loki/api/v1/query_range?query=${encodeURIComponent(
              query
            )}&direction=BACKWARD&limit=100&start=${startNs.toString()}&end=${endNs.toString()}&step=5s`;
            const r = await fetch(url);
            const logs = await r.json();
            return { agent: serviceName, logs };
          })
        );

        res.json({ agents: results });
      } catch (err) {
        res.status(500).json({
          error: 'Logs fetch failed',
          details: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ---- Traces: returns { agents: [{ agent, traces }] } ----
    app.get('/api/traces', async (_req, res) => {
      try {
        const agents = await loadAgents();
        if (!agents.length) return res.json({ agents: [] });

        const results = await Promise.all(
          agents.map(async (agent: AgentCard) => {
            const serviceName = agent.name;
            const url = `http://localhost:${config.ports.tempoHttp}/api/search`;
            const r = await fetch(url);
            const ct = r.headers.get('content-type') || '';
            const traces = ct.includes('application/json')
              ? await r.json()
              : { error: await r.text() };
            return { agent: serviceName, traces };
          })
        );

        res.json({ agents: results });
      } catch (err) {
        res.status(500).json({
          error: 'Traces fetch failed',
          details: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ---- Trace details: returns full trace with attributes ----
    app.get('/api/traces/:traceId', async (req, res) => {
      try {
        const { traceId } = req.params;
        const url = `http://localhost:${config.ports.tempoHttp}/api/traces/${traceId}`;
        const r = await fetch(url);
        const ct = r.headers.get('content-type') || '';
        const trace = ct.includes('application/json')
          ? await r.json()
          : { error: await r.text() };
        res.json(trace);
      } catch (err) {
        res.status(500).json({
          error: 'Trace fetch failed',
          details: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // ---- Grafana base URL ----
    app.get('/api/grafana', (_req, res) => {
      res.json({ baseUrl: `http://localhost:${config.ports.grafana}` });
    });

    // ---- Serve frontend build ----
    // Prefer the fresh dev build in ../client/dist, fallback to prebuilt cli/client-dist
    let frontendPath = path.join(packageRoot, '../client/dist');
    if (!(await fs.pathExists(frontendPath))) {
      frontendPath = path.join(packageRoot, 'client-dist');
    }
    if (await fs.pathExists(frontendPath)) {
      console.log(chalk.gray('   Frontend:'), frontendPath);
      app.use(express.static(frontendPath));
      app.get(/.*/, (_req, res) =>
        res.sendFile(path.join(frontendPath, 'index.html'))
      );
    }

    // ---- Start server + WebSocket ----
    const server = app.listen(dashboardPort, () => {
      console.log(
        chalk.cyan(`🌐 Dashboard running at http://localhost:${dashboardPort}`)
      );
    });

    const wss = new WebSocketServer({ server });
    console.log(chalk.green('📡 WebSocket server ready'));

    // Optional: Poll & broadcast for debugging
    setInterval(async () => {
      try {
        const agents = await loadAgents();
        const payload = { type: 'heartbeat', agents };
        wss.clients.forEach((client) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(payload));
          }
        });
      } catch (err) {
        console.warn('Polling failed:', err);
      }
    }, HEARTBEAT_INTERVAL_MS);
  } catch (err) {
    console.error(chalk.red('❌ Failed to start dashboard stack:'), err);
  }
}
