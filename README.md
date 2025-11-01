# A2ATrace

> **Distributed Telemetry Stack for Agent-to-Agent (A2A) Communication**

A2ATrace is a comprehensive observability solution for multi-agent systems, providing distributed tracing, metrics collection, and log aggregation for Agent-to-Agent (A2A) communication patterns. Built on industry-standard tools like OpenTelemetry, Prometheus, Loki, Tempo, and Grafana.

## 🚀 Features

- **🔍 Distributed Tracing**: Track requests across multiple agents with OpenTelemetry
- **📊 Metrics Collection**: Monitor agent performance with Prometheus
- **📝 Log Aggregation**: Centralized logging with Loki
- **📈 Real-time Dashboard**: Live agent status and telemetry visualization
- **🐳 Docker-based Stack**: One-command deployment of the entire telemetry infrastructure
- **🔗 Easy Integration**: Simple SDK for instrumenting your agents
- **🎯 Agent-Centric**: Purpose-built for multi-agent architectures

## 📋 Prerequisites

- **Node.js** >= 18.x
- **Docker** & **Docker Compose**
- **npm** or **yarn**

## 🛠️ Installation

### Global Installation

```bash
npm install -g a2a-trace
```

### Local Installation

```bash
git clone https://github.com/A2ATrace/A2ATrace.git
cd A2ATrace/cli
npm install
npm run build
npm link
```

## 🎯 Quick Start

### 1. Initialize A2A Telemetry

```bash
a2a init
```

This creates:

- Configuration files in `~/.a2a/`
- Docker Compose setup for telemetry services
- Grafana dashboards and datasources
- Dynamic port assignments to avoid conflicts

### 2. Link Your Agent Project

Navigate to your agent project directory:

```bash
cd /path/to/your/agent
a2a link --name "my-agent"
```

Follow the prompts to configure:

- Agent name
- Agent role
- Connected agents
- Agent capabilities/methods

This creates `.a2a.config.json` in your project.

### 3. Instrument Your Agent

#### JavaScript/Node.js

```javascript
import { startTelemetry } from 'a2a-trace/telemetry';

// Start telemetry at application startup
await startTelemetry('./.a2a.config.json');

// Your agent code here...
```

#### Python

```bash
a2a inject-otel
```

This generates `a2a.README.md` with Python setup instructions.

### 4. Start the Telemetry Stack

```bash
a2a start-dashboard
```

This starts:

- **OpenTelemetry Collector**: Receives and processes telemetry
- **Prometheus**: Stores and queries metrics
- **Loki**: Log aggregation
- **Tempo**: Distributed tracing backend
- **Grafana**: Visualization and dashboards
- **Dashboard Web UI**: Live agent monitoring

Access the dashboard at: `http://localhost:4000` (or configured port)

## 📊 Architecture

```
┌─────────────────┐
│  Your Agents    │
│                 │
│  ┌───────────┐  │
│  │ OTel SDK  │  │
│  └─────┬─────┘  │
└────────┼────────┘
         │
         ▼
┌────────────────────┐
│ OTel Collector     │
│ (Port: Dynamic)    │
└────┬───────────────┘
     │
     ├─────────────┬──────────────┬─────────────┐
     ▼             ▼              ▼             ▼
┌─────────┐  ┌─────────┐   ┌─────────┐   ┌──────────┐
│Prometheus│  │  Loki   │   │  Tempo  │   │ Grafana  │
│(Metrics) │  │ (Logs)  │   │(Traces) │   │   (UI)   │
└─────────┘  └─────────┘   └─────────┘   └──────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  Dashboard   │
                                         │ (localhost)  │
                                         └──────────────┘
```

## 🔧 Configuration

### Global Configuration (`~/.a2a/config.json`)

Contains:

- Collector endpoints (HTTP & gRPC)
- Service ports (Prometheus, Loki, Tempo, Grafana)
- Authentication tokens

### Agent Configuration (`.a2a.config.json`)

Per-project configuration:

- Agent ID & name
- Role & capabilities
- Connected agents
- Telemetry endpoints

## 📡 API Endpoints

The dashboard server provides:

- `GET /api/config` - Telemetry configuration
- `GET /api/logs/labels/:name/values` - Loki label values
- `GET /api/logs/series` - Log series discovery
- `GET /api/logs/query` - Instant log query
- `GET /api/logs/query_range` - Range log query
- `/grafana/*` - Grafana proxy

## 🎨 Dashboard Features

- **Live Agent Cards**: Real-time status of each agent
- **Log Streaming**: Recent logs from each agent
- **Error Tracking**: Automatic error detection and counting
- **Agent Relationships**: Visualize agent-to-agent connections
- **Statistics**: Embedded Grafana dashboards
- **Configuration Management**: (Coming soon)

## 🛡️ Environment Variables

- `LOG_LEVEL`: Set logging level (`debug`, `info`, `warn`, `error`)
- `ALLOWED_ORIGINS`: Comma-separated list of additional CORS origins

## 📝 Examples

### Sending Custom Traces

```javascript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-agent');

async function processRequest() {
  const span = tracer.startSpan('process-request');

  try {
    // Your processing logic
    span.setAttribute('request.type', 'data-fetch');
    span.addEvent('processing-started');

    // ... work ...

    span.end();
  } catch (error) {
    span.recordException(error);
    span.end();
  }
}
```

### Adding Custom Metrics

```javascript
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('my-agent');
const requestCounter = meter.createCounter('requests', {
  description: 'Count of requests processed',
});

requestCounter.add(1, {
  status: 'success',
  agent: 'my-agent',
});
```

## 🐛 Troubleshooting

### Ports Already in Use

A2ATrace uses dynamic port allocation, but if issues persist:

1. Check `~/.a2a/config.json` for assigned ports
2. Stop conflicting services
3. Run `a2a init` again to reassign ports

### Docker Services Not Starting

```bash
# Check Docker Compose logs
docker compose -f ~/.a2a/docker-compose.yml logs

# Restart services
docker compose -f ~/.a2a/docker-compose.yml restart
```

### No Data Appearing

1. Verify agent is sending telemetry:

   ```bash
   # Check collector is receiving data
   curl http://localhost:<collector-port>/
   ```

2. Check Prometheus targets:

   ```
   http://localhost:<prometheus-port>/targets
   ```

3. Verify agent configuration file exists and is valid

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🔗 Links

- **Documentation**: [Coming Soon]
- **Issues**: [GitHub Issues](https://github.com/A2ATrace/A2ATrace/issues)
- **Discord**: [Join our community](https://discord.gg/a2atrace)

## 🙏 Acknowledgments

Built with:

- [OpenTelemetry](https://opentelemetry.io/)
- [Prometheus](https://prometheus.io/)
- [Grafana Loki](https://grafana.com/oss/loki/)
- [Grafana Tempo](https://grafana.com/oss/tempo/)
- [Grafana](https://grafana.com/)
- [React](https://react.dev/)
- [Express](https://expressjs.com/)

---

**Made with ❤️ for the multi-agent community**
