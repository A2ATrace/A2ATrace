import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import chalk from "chalk";
import express from "express";
import { WebSocketServer } from "ws";

// ✅ ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Always resolve relative to package root (cli/)
const packageRoot = path.resolve(__dirname, "../..");

export default async function startDashboard() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE!;
    const configDir = path.join(homeDir, ".a2a");
    const configPath = path.join(configDir, "config.json");
    const agentsPath = path.join(configDir, "agents.json");
    const dockerComposePath = path.join(configDir, "docker-compose.yml");

    // Ensure config exists
    if (!(await fs.pathExists(configPath))) {
      console.error(
        chalk.red("❌ Missing global config.json — run `a2a init` first")
      );
      process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // Start docker compose
    console.log(chalk.blue("🐳 Starting telemetry stack..."));
    await execa("docker", ["compose", "-f", dockerComposePath, "up", "-d"], {
      stdio: "inherit",
    });

    console.log(chalk.green("✅ Telemetry stack running!"));
    console.log(
      chalk.gray("   Prometheus:"),
      `http://localhost:${config.ports.prometheus}`
    );
    console.log(chalk.gray("   Loki:"), `http://localhost:${config.ports.loki}`);
    console.log(
      chalk.gray("   Tempo HTTP:"),
      `http://localhost:${config.ports.tempoHttp || config.ports.tempo}`
    );
    console.log(
      chalk.gray("   Tempo gRPC:"),
      `localhost:${config.ports.tempoGrpc || "4317"}`
    );
    console.log(
      chalk.gray("   Collector HTTP:"),
      config.collector.endpointHttp
    );
    console.log(
      chalk.gray("   Collector GRPC:"),
      config.collector.endpointGrpc
    );

    // 🔹 Start Express server
    const app = express();
    const dashboardPort = config.ports.dashboard || 4000;

    // ✅ API route (dashboard metadata)
    app.get("/api/config", async (_req, res) => {
      let agents: any[] = [];
      if (await fs.pathExists(agentsPath)) {
        agents = await fs.readJson(agentsPath);
      }
      res.json({
        telemetry: {
          prometheusUrl: `http://localhost:${config.ports.prometheus}`,
          lokiUrl: `http://localhost:${config.ports.loki}`,
          tempoUrl: `http://localhost:${config.ports.tempoHttp || config.ports.tempo}`,
          collectorHttp: config.collector.endpointHttp,
          collectorGrpc: config.collector.endpointGrpc,
          ingestUrl: `http://localhost:${dashboardPort}/ingest`, // 👈 new
        },
        agents,
      });
    });

    // ✅ Ingest route (collector → dashboard)
    app.post("/ingest", express.json({ limit: "10mb" }), (req, res) => {
      console.log("📥 Received spans:", JSON.stringify(req.body, null, 2));
      res.status(200).send("ok");
    });

    // 🔹 Serve React dashboard build
    let frontendPath = path.join(packageRoot, "client-dist"); // Published package

    if (!(await fs.pathExists(frontendPath))) {
      // Fallback for monorepo dev mode
      frontendPath = path.join(packageRoot, "../client/dist");
    }

    console.log("DEBUG: __dirname =", __dirname);
    console.log("DEBUG: checking frontendPath =", frontendPath);

    if (await fs.pathExists(frontendPath)) {
      console.log(chalk.green("✅ Serving frontend from:"), frontendPath);

      app.use(express.static(frontendPath));
      app.get(/.*/, (_req, res) => {
        res.sendFile(path.join(frontendPath, "index.html"));
      });
    } else {
      console.warn(
        chalk.yellow("⚠️ No frontend build found — running in API-only mode")
      );
    }

    // Start server
    app.listen(dashboardPort, () => {
      console.log(
        chalk.cyan(`🌐 Dashboard running at http://localhost:${dashboardPort}`)
      );
    });
  } catch (err) {
    console.error(chalk.red("❌ Failed to start dashboard stack:"), err);
  }
}
