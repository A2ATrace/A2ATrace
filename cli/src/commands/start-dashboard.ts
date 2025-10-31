// cli/commands/start-dashboard.ts
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

   // helper to load agents
async function loadAgents() {
  if (await fs.pathExists(agentsPath)) {
    return await fs.readJson(agentsPath);
  }
  return [];
}

// ---- Metrics: returns { agents: [{ agent, metrics }] } ----
app.get("/api/metrics", async (_req, res) => {
  try {
    const agents = await loadAgents();
    if (!agents.length) return res.json({ agents: [] });

    const results = await Promise.all(
      agents.map(async (agent: any) => {
        const serviceName = agent.name;
        const promQL = `questions_total{service_name="${serviceName}"}`;
        const r = await fetch(
          `http://localhost:${config.ports.prometheus}/api/v1/query?query=${encodeURIComponent(promQL)}`
        );
        const metrics = await r.json();
        return { agent: serviceName, metrics };
      })
    );

    res.json({ agents: results });
  } catch (err: any) {
    res.status(500).json({ error: "Metrics fetch failed", details: err.message });
  }
});

// ---- Logs: returns { agents: [{ agent, logs }] } ----
app.get("/api/logs", async (_req, res) => {
  try {
    const agents = await loadAgents();
    if (!agents.length) return res.json({ agents: [] });

    const results = await Promise.all(
      agents.map(async (agent: any) => {
        const serviceName = agent.name;
        const logQL = `{service_name="${serviceName}"}`;
        const r = await fetch(
          `http://localhost:${config.ports.loki}/loki/api/v1/query?query=${encodeURIComponent(logQL)}`
        );
        const logs = await r.json();
        return { agent: serviceName, logs };
      })
    );

    res.json({ agents: results });
  } catch (err: any) {
    res.status(500).json({ error: "Logs fetch failed", details: err.message });
  }
});

// ---- Traces: returns { agents: [{ agent, traces }] } ----
app.get("/api/traces", async (_req, res) => {
  try {
    const agents = await loadAgents();
    if (!agents.length) return res.json({ agents: [] });

    const results = await Promise.all(
      agents.map(async (agent: any) => {
        const serviceName = agent.name;
        const url = `http://localhost:${config.ports.tempoHttp}/api/search?serviceName=${encodeURIComponent(serviceName)}&limit=5`;
        const r = await fetch(url);
        const ct = r.headers.get("content-type") || "";
        const traces = ct.includes("application/json") ? await r.json() : { error: await r.text() };
        return { agent: serviceName, traces };
      })
    );

    res.json({ agents: results });
  } catch (err: any) {
    res.status(500).json({ error: "Traces fetch failed", details: err.message });
  }
});

    // ---- Serve frontend build ----
    let frontendPath = path.join(packageRoot, "client-dist");
    if (!(await fs.pathExists(frontendPath))) {
      frontendPath = path.join(packageRoot, "../client/dist");
    }
    if (await fs.pathExists(frontendPath)) {
      app.use(express.static(frontendPath));
      app.get(/.*/, (_req, res) => res.sendFile(path.join(frontendPath, "index.html")));
    }

    // ---- Start server + WebSocket ----
    const server = app.listen(dashboardPort, () => {
      console.log(chalk.cyan(`🌐 Dashboard running at http://localhost:${dashboardPort}`));
    });

    const wss = new WebSocketServer({ server });
    console.log(chalk.green("📡 WebSocket server ready"));

    // Optional: Poll & broadcast for debugging
    setInterval(async () => {
      try {
        const agents = await loadAgents();
        const payload = { type: "heartbeat", agents };
        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(payload));
          }
        });
      } catch (err) {
        console.warn("Polling failed:", err);
      }
    }, 10000);
  } catch (err) {
    console.error(chalk.red("❌ Failed to start dashboard stack:"), err);
  }
}
