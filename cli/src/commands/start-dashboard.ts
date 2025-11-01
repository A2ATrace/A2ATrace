import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import chalk from 'chalk';
import express from 'express';
// NEW:
import cors from 'cors';
import { logger } from '../utils/logger.js';
import {
  MS_PER_MINUTE,
  NS_PER_MS,
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_GRAFANA_TIMEOUT_MS,
  DEFAULT_LOKI_QUERY_TIMEOUT_MS,
  DEFAULT_LOG_LIMIT,
  MAX_LOG_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_LABEL_NAME_LENGTH,
  MAX_TIME_RANGE_MS,
} from '../utils/constants.js';

interface AgentInfo {
  agentId: string;
  agentName: string;
  role: string;
  connectedAgents: string[];
  methods: string[];
}

// ✅ ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Always resolve relative to package root (cli/)
const packageRoot = path.resolve(__dirname, '../..');

export default async function startDashboard() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      logger.error('Could not determine home directory');
      process.exit(1);
    }
    const configDir = path.join(homeDir, '.a2a');
    const configPath = path.join(configDir, 'config.json');
    const agentsPath = path.join(configDir, 'agents.json');
    const dockerComposePath = path.join(configDir, 'docker-compose.yml');

    // Ensure config exists
    if (!(await fs.pathExists(configPath))) {
      logger.error('Missing global config.json — run `a2a init` first');
      process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // Start docker compose
    logger.info('Starting telemetry stack...');
    await execa('docker', ['compose', '-f', dockerComposePath, 'up', '-d'], {
      stdio: 'inherit',
    });

    logger.info('Telemetry stack running!', {
      prometheus: `http://localhost:${config.ports.prometheus}`,
      loki: `http://localhost:${config.ports.loki}`,
      tempo: `http://localhost:${
        config.ports.tempo || config.ports.tempoHttp || 37039
      }`,
      collectorHttp: config.collector.endpointHttp,
      collectorGrpc: config.collector.endpointGrpc,
    });

    // 🔹 Start Express server
    const app = express();
    const dashboardPort = config.ports.dashboard || 4000;

    // Configure CORS - allow localhost and configurable origins
    const allowedOrigins = [
      `http://localhost:${dashboardPort}`,
      'http://localhost:4000', // Vite dev server
      'http://127.0.0.1:4000',
      ...(process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) || []),
    ];

    app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps, curl, Postman)
          if (!origin) return callback(null, true);

          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            logger.warn('CORS blocked request from unauthorized origin', {
              origin,
            });
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
      })
    );
    app.use(express.json({ limit: '2mb' }));

    // =========================
    // API: Config for client
    // =========================
    app.get('/api/config', async (_req, res) => {
      try {
        let agents: AgentInfo[] = [];
        if (await fs.pathExists(agentsPath)) {
          try {
            agents = await fs.readJson(agentsPath);
            if (!Array.isArray(agents)) {
              logger.warn('agents.json is not an array, using empty array');
              agents = [];
            }
          } catch (e) {
            logger.error('Error reading agents.json', e);
            agents = [];
          }
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
      } catch (e) {
        logger.error('Error handling /api/config request', e);
        res.status(500).json({ error: 'Failed to load configuration' });
      }
    });

    // =========================
    // NEW: Loki proxy routes
    // =========================
    const lokiPort = config?.ports?.loki;
    if (!lokiPort) {
      logger.warn('ports.loki missing in config; Loki routes will not work');
    } else {
      const lokiBase = `http://localhost:${lokiPort}`;

      // Label values (e.g., service_name)
      app.get('/api/logs/labels/:name/values', async (req, res) => {
        try {
          // Input validation
          const labelName = req.params.name;
          if (
            !labelName ||
            typeof labelName !== 'string' ||
            labelName.length > MAX_LABEL_NAME_LENGTH
          ) {
            return res.status(400).json({ error: 'Invalid label name' });
          }

          const url = new URL(
            `${lokiBase}/loki/api/v1/label/${encodeURIComponent(
              labelName
            )}/values`
          );
          const r = await fetch(url, {
            signal: AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS),
          });

          if (!r.ok) {
            logger.error('Loki label values request failed', undefined, {
              status: r.status,
              statusText: r.statusText,
            });
            return res.status(r.status).json({
              error: `Loki service error: ${r.statusText}`,
            });
          }

          const data = await r.json();
          res.json(data); // { status, data: string[] }
        } catch (e) {
          logger.error('Error fetching Loki label values', e);
          const isTimeout = e instanceof Error && e.name === 'TimeoutError';
          res.status(isTimeout ? 504 : 500).json({
            error: isTimeout
              ? 'Loki request timeout'
              : 'Failed to fetch label values',
          });
        }
      });

      // Series discovery (optional)
      app.get('/api/logs/series', async (req, res) => {
        try {
          // Input validation
          const endMs = Number(req.query.end ?? Date.now());
          const startMs = Number(req.query.start ?? endMs - 5 * MS_PER_MINUTE);

          if (
            !isFinite(startMs) ||
            !isFinite(endMs) ||
            startMs < 0 ||
            endMs < 0
          ) {
            return res
              .status(400)
              .json({ error: 'Invalid timestamp parameters' });
          }
          if (endMs - startMs > MAX_TIME_RANGE_MS) {
            return res
              .status(400)
              .json({ error: 'Time range too large (max 24h)' });
          }

          const url = new URL(`${lokiBase}/loki/api/v1/series`);
          url.searchParams.set('start', String(startMs * NS_PER_MS)); // ms -> ns
          url.searchParams.set('end', String(endMs * NS_PER_MS));
          const match = req.query.match;
          if (Array.isArray(match))
            match.forEach((m) => url.searchParams.append('match[]', String(m)));
          else if (match) url.searchParams.append('match[]', String(match));

          const r = await fetch(url, {
            signal: AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS),
          });

          if (!r.ok) {
            logger.error(
              `Loki series request failed: ${r.status} ${r.statusText}`
            );
            return res.status(r.status).json({
              error: `Loki service error: ${r.statusText}`,
            });
          }

          const data = await r.json();
          res.json(data); // { status, data: Array<Record<string,string>> }
        } catch (e) {
          logger.error('Error fetching Loki series', e);
          const isTimeout = e instanceof Error && e.name === 'TimeoutError';
          res.status(isTimeout ? 504 : 500).json({
            error: isTimeout
              ? 'Loki request timeout'
              : 'Failed to fetch series',
          });
        }
      });

      // Instant query (point-in-time)
      app.get('/api/logs/query', async (req, res) => {
        try {
          // Input validation
          const query = req.query.query;
          if (!query || typeof query !== 'string') {
            return res
              .status(400)
              .json({ error: 'Query parameter is required' });
          }
          if (query.length > MAX_QUERY_LENGTH) {
            return res
              .status(400)
              .json({ error: 'Query too long (max 5000 chars)' });
          }

          const url = new URL(`${lokiBase}/loki/api/v1/query`);
          url.searchParams.set('query', query);
          if (req.query.time)
            url.searchParams.set('time', String(req.query.time)); // RFC3339 or ns

          const r = await fetch(url, {
            signal: AbortSignal.timeout(DEFAULT_LOKI_QUERY_TIMEOUT_MS),
          });

          if (!r.ok) {
            logger.error(
              `Loki query request failed: ${r.status} ${r.statusText}`
            );
            return res.status(r.status).json({
              error: `Loki service error: ${r.statusText}`,
            });
          }

          const data = await r.json();
          res.json(data);
        } catch (e) {
          logger.error('Error executing Loki query', e);
          const isTimeout = e instanceof Error && e.name === 'TimeoutError';
          res.status(isTimeout ? 504 : 500).json({
            error: isTimeout
              ? 'Loki request timeout'
              : 'Failed to execute query',
          });
        }
      });

      // Range query (best for UI lists / polling)
      app.get('/api/logs/query_range', async (req, res) => {
        try {
          // Input validation
          const endMs = Number(req.query.end ?? Date.now());
          const startMs = Number(req.query.start ?? endMs - 5 * MS_PER_MINUTE); // default 5m

          if (
            !isFinite(startMs) ||
            !isFinite(endMs) ||
            startMs < 0 ||
            endMs < 0
          ) {
            return res
              .status(400)
              .json({ error: 'Invalid timestamp parameters' });
          }
          if (endMs - startMs > MAX_TIME_RANGE_MS) {
            return res
              .status(400)
              .json({ error: 'Time range too large (max 24h)' });
          }

          const limitNum = Number(req.query.limit ?? String(DEFAULT_LOG_LIMIT));
          if (!isFinite(limitNum) || limitNum < 1 || limitNum > MAX_LOG_LIMIT) {
            return res
              .status(400)
              .json({ error: 'Invalid limit (must be 1-5000)' });
          }

          const dir = String(req.query.direction ?? 'backward');
          if (dir !== 'backward' && dir !== 'forward') {
            return res.status(400).json({
              error: 'Invalid direction (must be "backward" or "forward")',
            });
          }

          const query = String(req.query.query ?? '{}');
          if (query.length > MAX_QUERY_LENGTH) {
            return res
              .status(400)
              .json({ error: 'Query too long (max 5000 chars)' });
          }

          const url = new URL(`${lokiBase}/loki/api/v1/query_range`);
          url.searchParams.set('query', query);
          url.searchParams.set('start', String(startMs * NS_PER_MS)); // ms -> ns
          url.searchParams.set('end', String(endMs * NS_PER_MS));
          url.searchParams.set('limit', String(limitNum));
          url.searchParams.set('direction', dir);

          const r = await fetch(url, {
            signal: AbortSignal.timeout(DEFAULT_LOKI_QUERY_TIMEOUT_MS),
          });

          if (!r.ok) {
            logger.error(
              `Loki query_range request failed: ${r.status} ${r.statusText}`
            );
            return res.status(r.status).json({
              error: `Loki service error: ${r.statusText}`,
            });
          }

          const data = await r.json();
          res.json(data);
        } catch (e) {
          logger.error('Error executing Loki range query', e);
          const isTimeout = e instanceof Error && e.name === 'TimeoutError';
          res.status(isTimeout ? 504 : 500).json({
            error: isTimeout
              ? 'Loki request timeout'
              : 'Failed to execute range query',
          });
        }
      });
    }

    // =========================
    // Proxy Grafana requests
    // =========================
    const grafanaPort = 4001; // Direct Grafana container port
    const grafanaUser = config.grafana?.user || 'admin';
    const grafanaPassword = config.grafana?.password || 'a2a';
    const grafanaAuth = Buffer.from(
      `${grafanaUser}:${grafanaPassword}`
    ).toString('base64');

    app.use('/grafana', async (req, res) => {
      try {
        const targetUrl = `http://127.0.0.1:${grafanaPort}${req.originalUrl}`;
        const headers: Record<string, string> = {
          Authorization: `Basic ${grafanaAuth}`,
        };

        // Copy relevant headers from original request
        if (req.headers['content-type']) {
          headers['Content-Type'] = req.headers['content-type'] as string;
        }

        const options: RequestInit = {
          method: req.method,
          headers,
          signal: AbortSignal.timeout(DEFAULT_GRAFANA_TIMEOUT_MS), // 30s timeout for Grafana requests
        };

        // Handle body for POST/PUT requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          options.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, options);

        // Copy response headers (filter out problematic ones)
        response.headers.forEach((value, name) => {
          // Skip headers that could cause issues
          if (
            !['transfer-encoding', 'connection'].includes(name.toLowerCase())
          ) {
            res.setHeader(name, value);
          }
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
        logger.error('Grafana proxy error', e);
        const isTimeout = e instanceof Error && e.name === 'TimeoutError';
        const isFetchError = e instanceof Error && e.message.includes('fetch');

        if (isTimeout) {
          res.status(504).json({ error: 'Grafana request timeout' });
        } else if (isFetchError) {
          res.status(503).json({ error: 'Grafana service unavailable' });
        } else {
          res.status(500).json({ error: 'Grafana proxy error' });
        }
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

    if (await fs.pathExists(frontendPath)) {
      logger.info('Serving frontend', { path: frontendPath });
      // SPA fallback: serve index.html for app routes before static middleware
      const spaRoutes = [
        '/',
        '/statistics',
        '/visualizer',
        '/config',
        '/dashboard',
      ];
      app.get(spaRoutes, (_req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
      });
      // Static assets
      app.use(express.static(frontendPath));
    } else {
      logger.warn('No frontend build found — running in API-only mode');
    }

    // Start server
    app.listen(dashboardPort, () => {
      logger.info('Dashboard running', {
        url: `http://localhost:${dashboardPort}`,
      });
    });
  } catch (err) {
    logger.error('Failed to start dashboard stack', err);
  }
}
