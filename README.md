# A2A Telemetry CLI & Dashboard

A2A provides a local telemetry stack and dashboard for agent developers. The CLI wraps the tooling needed to:

- bootstrap per-machine OpenTelemetry infrastructure (`otel-collector`, Prometheus, Loki, Tempo, Grafana, dashboard UI)
- describe agents via `agent-card.json`
- link agents into a shared registry
- view active agents and launch the dashboard

---

## Prerequisites

- Node.js ≥ 18 and npm
- Docker Engine & Docker Compose
- macOS, Linux, or WSL with access to `~` (the CLI writes to `~/.a2a`)
- Optional: VS Code (comfortable editor for agent cards)

---

## Initial Setup

```bash
# from repo root
cd cli
npm install

# build TypeScript to dist/
npm run build

# optional: link the CLI locally
npm link    # makes `a2a` available in your PATH
During development you can skip the build step and run:

bash

npm run dev   # runs src/index.ts via ts-node
Typical Workflow
Initialize tooling (once per machine)

bash

a2a init
Creates ~/.a2a
Generates config.json, OpenTelemetry collector config, Prometheus/Tempo YAML, and docker-compose.yml
Picks open host ports dynamically and records them in config.json
Prepare an agent directory

bash

cd path/to/your-agent
a2a inject
Generates agent-card.json with placeholders
Edit the file (at minimum, set a unique name)
Link the agent

bash

a2a link
Validates agent-card.json
Optionally fetches remote card via the url field
Upserts the agent into ~/.a2a/agents.json
Writes A2A-README.md with OpenTelemetry bootstrap code and the configured OTLP endpoint
See what’s registered

bash

a2a agents
Renders all linked agents in a table (ID, name, version, methods, endpoints)
Launch the telemetry stack & dashboard

bash

a2a start-dashboard
Ensures a2a init has been run (checks for ~/.a2a/config.json)
Runs docker compose … up -d against ~/.a2a/docker-compose.yml
Boots the local dashboard server (Express + WebSocket)
Serves the UI from client/dist (or the baked cli/client-dist fallback)
Reports URLs:
Collector: config.collector.endpointHttp
Prometheus: http://localhost:<prometheus port>
Loki: http://localhost:<loki port>
Tempo: http://localhost:<tempo port>
Grafana: http://localhost:<grafana port>
Dashboard UI: http://localhost:<dashboard port>
Command Reference
a2a init
Purpose: Bootstrap local telemetry configs and registry paths.
Outputs (all under ~/.a2a):
config.json — record of registry path, collector endpoints, chosen host ports.
collector-config.yaml, prometheus.yml, tempo.yaml, docker-compose.yml.
Notes: Ports are reserved randomly at runtime; rerun to regenerate if needed.
a2a inject
Purpose: Create a local agent-card.json scaffold in the current directory.
Behavior: Refuses to overwrite an existing card.
Fields to update: name (required), plus methods, relationships, endpoints, labels, optional url.
a2a link
Purpose: Register an agent with the global registry.
Flow: Reads agent-card.json, fetches remote card via url if provided, upserts into ~/.a2a/agents.json, writes A2A-README.md.
Validation: Fails if agent-card.json is missing or name remains "YourAgent".
a2a agents
Purpose: Inspect the shared registry.
Output: CLI table listing all agents (ID, name, version, methods, endpoints).
Tip: Delete ~/.a2a/agents.json manually if you need to reset the registry.
a2a start-dashboard
Purpose: Start Docker-based telemetry services and the local dashboard server.
Requirements: Docker daemon running, successful a2a init.
Services: OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, dashboard UI.
Extras: REST endpoints (/api/agents, /api/metrics, /api/logs, /api/traces, /api/grafana) plus a WebSocket heartbeat.
Telemetry Helper (import "a2a-trace/telemetry")
startTelemetry(agentConfigPath) boots instrumentation for Node agents:

Reads agent config (name, ID, OTLP endpoint, token, Prometheus port).
Detects host resources, adds agent metadata, merges resource attributes.
Starts OTLP trace/log exporters and Prometheus metrics endpoint.
Enables auto-instrumentations.
Handles SIGINT/SIGTERM cleanup.
Usage:

ts

import { startTelemetry } from "a2a-trace/telemetry";

await startTelemetry("agent-telemetry.json");
Repository Layout

cli/              # CLI source & build artifacts
  src/
    commands/     # init, link, inject, agents, start-dashboard
    utils/        # telemetry helper
  dist/           # compiled JS (after build)
  client-dist/    # bundled dashboard copied in prepublish
client/           # React dashboard source (Vite)
Dashboard Frontend
Develop:
bash

cd client
npm install
npm run dev
Build for distribution:
bash

npm run build
Run npm run prepublishOnly from cli/ to bundle the client into cli/client-dist.
Troubleshooting
❌ Missing global config.json — run a2a init.
Docker failures — ensure Docker Engine/Compose are available (docker info).
Port conflicts — rerun a2a init.
Agent not listed — confirm a2a link success; inspect ~/.a2a/agents.json.
No metrics/logs/traces — ensure your agent uses the OTEL snippet (A2A-README.md) or startTelemetry.
Dashboard no UI — build the frontend (client/dist) or confirm cli/client-dist exists.