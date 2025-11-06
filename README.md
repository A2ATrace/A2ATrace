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

## Initial Source Repo Setup (Once Per Machine)

```bash
# from repo root
cd cli
npm install

# build cli tooling to dist/
npm run build

# build frontend into client-dist/
npm run frontend

# link the CLI locally
npm link    # makes `a2a` available in your PATH

```
## Run In Agent Repo (Once Per Machine)

```bash
a2a init 
```
Creates ~/.a2a
Generates config.json, OpenTelemetry collector config, Prometheus/Tempo YAML, and docker-compose.yml
Picks open host ports dynamically and records them in config.json
Prepare an agent directory (agents.json)

```bash
cd path/to/your-agent # from agent repo
```

```bash
a2a inject
```
Generates agent-card.json inside agent repo with placeholders
Edit the file (at minimum, set a unique name)

```bash
a2a link
```
Validates agent-card.json
Optionally fetches remote card via the url field
Upserts the agent into ~/.a2a/agents.json
Writes A2A-README.md with OpenTelemetry bootstrap code and the configured OTLP endpoint

```bash
a2a agents
```
Renders all linked agents in a table (ID, name, version, methods, endpoints)

```bash
a2a start-dashboard
```
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
Dashboard UI: http://localhost:<dashboard port> **Open To View Dashboard**


## Common Issues

❌ Missing global config.json — run a2a init.

Docker failures — ensure Docker Engine/Compose are available (docker info).

Port conflicts — rerun a2a init.

Agent not listed — confirm a2a link success; inspect ~/.a2a/agents.json.

No metrics/logs/traces — ensure your agent uses the OTEL snippet (A2A-README.md) or startTelemetry.

Dashboard no UI — build the frontend (client/dist) or confirm cli/client-dist exists.

---

## Grafana Configuration

The Statistics page on the dashboard is integrated with Grafana for built in customizable graphing depending on user preference.
However, in order to utilize and see your telemtry you will need to create a Grafana account and create some starting 
dashboards. 

These will save once created, so you only have to do this once unless you want to make more changes. 

To do this, link Prometheus, Loki, and Tempo as data sources inside of Grafana's UI and paste in their listening PORTs
Example: Prometheus --> http://localhost:9090

---

## Telemtry Information

Do setup OpenTelemetry outside of the auto-instrumentation provided for you, please visit the official documentation: https://opentelemetry.io/

Prometheus Documentation (Metrics): https://prometheus.io/

Loki Documentation (Logs): https://grafana.com/oss/loki/

Tempo Documentation (Traces): https://grafana.com/docs/tempo/latest/

