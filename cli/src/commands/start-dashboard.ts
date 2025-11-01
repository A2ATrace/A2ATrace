import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import chalk from 'chalk';
import express from 'express';
// NEW:
import cors from 'cors';

// ✅ ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Always resolve relative to package root (cli/)
const packageRoot = path.resolve(__dirname, '../..');

export default async function startDashboard() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE!;
    const configDir = path.join(homeDir, '.a2a');
    const configPath = path.join(configDir, 'config.json');
    const agentsPath = path.join(configDir, 'agents.json');
    const dockerComposePath = path.join(configDir, 'docker-compose.yml');

    // Ensure config exists
    if (!(await fs.pathExists(configPath))) {
      console.error(
        chalk.red('❌ Missing global config.json — run `a2a init` first')
      );
      process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // Start docker compose
    console.log(chalk.blue('🐳 Starting telemetry stack...'));
    await execa('docker', ['compose', '-f', dockerComposePath, 'up', '-d'], {
      stdio: 'inherit',
    });

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
      chalk.gray('   Tempo:'),
      `http://localhost:${
        config.ports.tempo || config.ports.tempoHttp || 37039
      }`
    );

    console.log(
      chalk.gray('   Collector HTTP:'),
      config.collector.endpointHttp
    );
    console.log(
      chalk.gray('   Collector GRPC:'),
      config.collector.endpointGrpc
    );

    // 🔹 Start Express server
    const app = express();
    const dashboardPort = config.ports.dashboard || 4000;

    // NEW: common middleware for API
    app.use(cors());
    app.use(express.json({ limit: '2mb' }));

    // =========================
    // API: Config for client
    // =========================
    app.get('/api/config', async (_req, res) => {
      let agents: any[] = [];
      if (await fs.pathExists(agentsPath)) {
        agents = await fs.readJson(agentsPath);
      }
      res.json({
        telemetry: {
          prometheusUrl: `http://localhost:${config.ports.prometheus}`,
          lokiUrl: `http://localhost:${config.ports.loki}`,
          tempoUrl: `http://localhost:${config.ports.tempo}`,
          collectorHttp: config.collector.endpointHttp,
          collectorGrpc: config.collector.endpointGrpc,
        },
        agents,
      });
    });

    // =========================
    // NEW: Loki proxy routes
    // =========================
    const lokiPort = config?.ports?.loki;
    if (!lokiPort) {
      console.warn(
        chalk.yellow(
          '⚠️ ports.loki missing in config; Loki routes will not work'
        )
      );
    } else {
      const lokiBase = `http://localhost:${lokiPort}`;

      // Label values (e.g., service_name)
      app.get('/api/logs/labels/:name/values', async (req, res) => {
        try {
          const url = new URL(
            `${lokiBase}/loki/api/v1/label/${encodeURIComponent(
              req.params.name
            )}/values`
          );
          const r = await fetch(url);
          const data = await r.json();
          res.json(data); // { status, data: string[] }
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // Series discovery (optional)
      app.get('/api/logs/series', async (req, res) => {
        try {
          const endMs = Number(req.query.end ?? Date.now());
          const startMs = Number(req.query.start ?? endMs - 5 * 60_000);
          const url = new URL(`${lokiBase}/loki/api/v1/series`);
          url.searchParams.set('start', String(startMs * 1_000_000)); // ms -> ns
          url.searchParams.set('end', String(endMs * 1_000_000));
          const match = req.query.match;
          if (Array.isArray(match))
            match.forEach((m) => url.searchParams.append('match[]', String(m)));
          else if (match) url.searchParams.append('match[]', String(match));
          const r = await fetch(url);
          const data = await r.json();
          res.json(data); // { status, data: Array<Record<string,string>> }
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // Instant query (point-in-time)
      app.get('/api/logs/query', async (req, res) => {
        try {
          const url = new URL(`${lokiBase}/loki/api/v1/query`);
          if (req.query.query)
            url.searchParams.set('query', String(req.query.query));
          if (req.query.time)
            url.searchParams.set('time', String(req.query.time)); // RFC3339 or ns
          const r = await fetch(url);
          const data = await r.json();
          res.json(data);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });

      // Range query (best for UI lists / polling)
      app.get('/api/logs/query_range', async (req, res) => {
        try {
          const endMs = Number(req.query.end ?? Date.now());
          const startMs = Number(req.query.start ?? endMs - 5 * 60_000); // default 5m
          const limit = String(req.query.limit ?? '500');
          const dir = String(req.query.direction ?? 'backward'); // or "forward"
          const query = String(req.query.query ?? '{}'); // LogQL selector + pipes

          const url = new URL(`${lokiBase}/loki/api/v1/query_range`);
          url.searchParams.set('query', query);
          url.searchParams.set('start', String(startMs * 1_000_000)); // ms -> ns
          url.searchParams.set('end', String(endMs * 1_000_000));
          url.searchParams.set('limit', limit);
          url.searchParams.set('direction', dir);

          const r = await fetch(url);
          const data = await r.json();
          res.json(data);
        } catch (e) {
          res.status(500).json({ error: String(e) });
        }
      });
    }

    // =========================
    // Proxy Grafana requests
    // =========================
    const grafanaPort = 4001; // Direct Grafana container port
    app.use('/grafana', async (req, res) => {
      try {
        const targetUrl = `http://127.0.0.1:${grafanaPort}${req.originalUrl}`;
        const headers: Record<string, string> = {
          Authorization: 'Basic ' + Buffer.from('admin:a2a').toString('base64'),
        };

        // Copy relevant headers from original request
        if (req.headers['content-type']) {
          headers['Content-Type'] = req.headers['content-type'] as string;
        }

        const options: RequestInit = {
          method: req.method,
          headers,
        };

        // Handle body for POST/PUT requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          options.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, options);

        // Copy response headers
        response.headers.forEach((value, name) => {
          res.setHeader(name, value);
        });

        res.status(response.status);

        // Handle different content types
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          res.json(data);
        } else if (contentType.includes('text/')) {
          const text = await response.text();
          res.send(text);
        } else {
          const buffer = await response.arrayBuffer();
          res.send(Buffer.from(buffer));
        }
      } catch (e) {
        console.error('Grafana proxy error:', e);
        res.status(500).json({ error: String(e) });
      }
    });

    // =========================
    // Serve React dashboard build
    // =========================
    let frontendPath = path.join(packageRoot, 'client-dist'); // Published package
    if (!(await fs.pathExists(frontendPath))) {
      // Fallback for monorepo dev mode
      frontendPath = path.join(packageRoot, '../client/dist');
    }

    console.log('DEBUG: __dirname =', __dirname);
    console.log('DEBUG: checking frontendPath =', frontendPath);

    if (await fs.pathExists(frontendPath)) {
      console.log(chalk.green('✅ Serving frontend from:'), frontendPath);
      app.use(express.static(frontendPath));
      app.get(/.*/, (_req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
      });
    } else {
      console.warn(
        chalk.yellow('⚠️ No frontend build found — running in API-only mode')
      );
    }

    // Start server
    app.listen(dashboardPort, () => {
      console.log(
        chalk.cyan(`🌐 Dashboard running at http://localhost:${dashboardPort}`)
      );
    });
  } catch (err) {
    console.error(chalk.red('❌ Failed to start dashboard stack:'), err);
  }
}
