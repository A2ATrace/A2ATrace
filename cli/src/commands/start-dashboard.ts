import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import chalk from "chalk";
import express from "express";
import fetch from "node-fetch";
import os from "os";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "../..");

export default async function startDashboard() {
  try {
    const homeDir = os.homedir();
    const configDir = path.join(homeDir, ".a2a");
    const configPath = path.join(configDir, "config.json");
    const agentsPath = path.join(configDir, "agents.json");
    const dockerComposePath = path.join(configDir, "docker-compose.yml");

    if (!(await fs.pathExists(configPath))) {
      console.error(chalk.red("❌ Missing global config.json — run `a2a init` first"));
      process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // 🔹 Start Docker stack
    console.log(chalk.blue("🐳 Starting telemetry stack..."));
    await execa("docker", ["compose", "-f", dockerComposePath, "up", "-d"], {
      stdio: "inherit"
    });

    console.log(chalk.green("✅ Telemetry stack running!"));
    console.log(chalk.gray("   Prometheus:"), `http://localhost:${config.ports.prometheus}`);
    console.log(chalk.gray("   Loki:"), `http://localhost:${config.ports.loki}`);
    console.log(chalk.gray("   Tempo HTTP:"), `http://localhost:${config.ports.tempoHttp}`);
    console.log(chalk.gray("   Collector HTTP:"), config.collector.endpointHttp);

    // 🔹 Express app
    const app = express();
    app.use(express.json());
    const dashboardPort = config.ports.dashboard || 4000;

    // API: return config + agents
    app.get("/api/config", async (_req, res) => {
      let agents: any[] = [];
      if (await fs.pathExists(agentsPath)) {
        agents = await fs.readJson(agentsPath);
      }
      res.json({
        telemetry: {
          prometheusUrl: `http://localhost:${config.ports.prometheus}`,
          lokiUrl: `http://localhost:${config.ports.loki}`,
          tempoHttpUrl: `http://localhost:${config.ports.tempoHttp}`,
          collectorHttp: config.collector.endpointHttp,
          collectorGrpc: config.collector.endpointGrpc
        },
        agents
      });
    });

    // Manual API proxies (still useful for ad-hoc queries)
    app.get("/api/metrics", async (req, res) => {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: "Missing ?q=<promql>" });
      const resp = await fetch(
        `http://localhost:${config.ports.prometheus}/api/v1/query?query=${encodeURIComponent(q)}`
      );
      res.json(await resp.json());
    });

    app.get("/api/logs", async (req, res) => {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: "Missing ?q=<logql>" });
      const resp = await fetch(
        `http://localhost:${config.ports.loki}/loki/api/v1/query?query=${encodeURIComponent(q)}`
      );
      res.json(await resp.json());
    });

    app.get("/api/traces/:id", async (req, res) => {
      const resp = await fetch(
        `http://localhost:${config.ports.tempoHttp}/api/traces/${req.params.id}`
      );
      res.json(await resp.json());
    });

    // 🔹 New endpoint: fetch recent traces for an agent by name
    app.get("/api/traces", async (req, res) => {
      try {
        const agent = req.query.agent as string;
        const limit = req.query.limit || 10;

        if (!agent) {
          return res.status(400).json({ error: "Missing ?agent=AgentName" });
        }

        const resp = await fetch(
          `http://localhost:${config.ports.tempoHttp}/api/search?serviceName=${encodeURIComponent(agent)}&limit=${limit}`
        );

        if (!resp.ok) {
          const text = await resp.text();
          return res.status(resp.status).json({ error: "Tempo query failed", details: text });
        }

        const data = await resp.json();
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ error: "Failed to fetch traces", details: err.message });
    }
});

    // 🔹 Serve frontend build
    let frontendPath = path.join(packageRoot, "client-dist");
    if (!(await fs.pathExists(frontendPath))) {
      frontendPath = path.join(packageRoot, "../client/dist");
    }
    if (await fs.pathExists(frontendPath)) {
      app.use(express.static(frontendPath));
      app.get(/.*/, (_req, res) => res.sendFile(path.join(frontendPath, "index.html")));
    }

    // 🔹 Start server + WebSocket
    const server = app.listen(dashboardPort, () => {
      console.log(chalk.cyan(`🌐 Dashboard running at http://localhost:${dashboardPort}`));
    });
    const wss = new WebSocketServer({ server });
    console.log(chalk.green("📡 WebSocket server ready"));

    // 🔹 Poll backends for ALL agents (metrics + logs + traces)
    setInterval(async () => {
      try {
        let agents: any[] = [];
        if (await fs.pathExists(agentsPath)) {
          agents = await fs.readJson(agentsPath);
        }

        const results: any[] = [];
        for (const agent of agents) {
          const serviceName = agent.name;

          // Metrics
          const promResp = await fetch(
            `http://localhost:${config.ports.prometheus}/api/v1/query?query=otelcol_receiver_accepted_spans{service_name="${serviceName}"}`
          );
          const metrics = await promResp.json();

          // Logs
          const lokiResp = await fetch(
            `http://localhost:${config.ports.loki}/loki/api/v1/query?query={service_name="${serviceName}"}`
          );
          const logs = await lokiResp.json();

          // Traces (search latest for this agent)
          const tempoResp = await fetch(
            `http://localhost:${config.ports.tempoHttp}/api/search?serviceName=${encodeURIComponent(serviceName)}&limit=5`
          );
          let traces;
          const contentType = tempoResp.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            traces = await tempoResp.json();
          } else {
            traces = { error: await tempoResp.text() }; // fallback to plain text
}

          results.push({
            agent,
            metrics,
            logs,
            traces
          });
        }

        const payload = { type: "update", agents: results };
        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(payload));
          }
        });
      } catch (err) {
        console.warn("Polling failed:", err);
      }
    }, 5000); // poll every 5s
  } catch (err) {
    console.error(chalk.red("❌ Failed to start dashboard stack:"), err);
  }
}
