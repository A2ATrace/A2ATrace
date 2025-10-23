import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import chalk from "chalk";
import express from "express";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "../..");

let spans: any[] = []; // store last 100 spans

export default async function startDashboard() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE!;
    const configDir = path.join(homeDir, ".a2a");
    const configPath = path.join(configDir, "config.json");
    const agentsPath = path.join(configDir, "agents.json");
    const dockerComposePath = path.join(configDir, "docker-compose.yml");

    if (!(await fs.pathExists(configPath))) {
      console.error(chalk.red("❌ Missing global config.json — run `a2a init` first"));
      process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // Start Docker stack
    console.log(chalk.blue("🐳 Starting telemetry stack..."));
    await execa("docker", ["compose", "-f", dockerComposePath, "up", "-d"], { stdio: "inherit" });

    console.log(chalk.green("✅ Telemetry stack running!"));
    console.log(chalk.gray("   Prometheus:"), `http://localhost:${config.ports.prometheus}`);
    console.log(chalk.gray("   Loki:"), `http://localhost:${config.ports.loki}`);
    console.log(chalk.gray("   Tempo HTTP:"), `http://localhost:${config.ports.tempoHttp}`);
    console.log(chalk.gray("   Tempo gRPC:"), `localhost:${config.ports.tempoGrpc}`);
    console.log(chalk.gray("   Collector HTTP:"), config.collector.endpointHttp);
    console.log(chalk.gray("   Collector GRPC:"), config.collector.endpointGrpc);

    const app = express();
    app.use(express.json());
    const dashboardPort = config.ports.dashboard || 4000;

    // 🔹 Ingest spans from Collector
    app.post("/ingest", (req, res) => {
      const batch = req.body.resourceSpans || [];
      spans.push(...batch);
      spans = spans.slice(-100); // keep last 100

      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify(batch));
        }
      });

      res.status(200).end();
    });

    // 🔹 API: config info
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
          collectorGrpc: config.collector.endpointGrpc,
        },
        agents,
      });
    });

    // 🔹 API: get last 100 spans
    app.get("/api/spans", (_req, res) => {
      res.json(spans);
    });

    // 🔹 API: query Prometheus
    app.get("/api/metrics", async (req, res) => {
      const q = req.query.q || "otelcol_receiver_accepted_spans";
      try {
        const resp = await fetch(
          `http://localhost:${config.ports.prometheus}/api/v1/query?query=${encodeURIComponent(
            q as string
          )}`
        );
        const data = await resp.json();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch metrics" });
      }
    });

    // 🔹 API: query Loki
    app.get("/api/logs", async (req, res) => {
      const q = req.query.q || '{job="a2a-agents"}';
      try {
        const resp = await fetch(
          `http://localhost:${config.ports.loki}/loki/api/v1/query?query=${encodeURIComponent(
            q as string
          )}`
        );
        const data = await resp.json();
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch logs" });
      }
    });

    // Serve frontend build
    let frontendPath = path.join(packageRoot, "client-dist");
    if (!(await fs.pathExists(frontendPath))) {
      frontendPath = path.join(packageRoot, "../client/dist");
    }

    if (await fs.pathExists(frontendPath)) {
      console.log(chalk.green("✅ Serving frontend from:"), frontendPath);
      app.use(express.static(frontendPath));
      app.get(/.*/, (_req, res) => res.sendFile(path.join(frontendPath, "index.html")));
    } else {
      console.warn(chalk.yellow("⚠️ No frontend build found — running in API-only mode"));
    }

    // Start server + WebSocket
    const server = app.listen(dashboardPort, () => {
      console.log(chalk.cyan(`🌐 Dashboard running at http://localhost:${dashboardPort}`));
    });

    const wss = new WebSocketServer({ server });
    console.log(chalk.green("📡 WebSocket server ready on /"));
  } catch (err) {
    console.error(chalk.red("❌ Failed to start dashboard stack:"), err);
  }
}
