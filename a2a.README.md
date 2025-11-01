# A2A Telemetry Setup for A2ATrace

**Role:** helper  
**Connected Agents:** None  
**Methods:** None

This agent is configured with `.a2a.config.json`.  
Telemetry data will be sent to:

- Collector (HTTP): `http://localhost:37641/v1/traces`
- Collector (gRPC): `http://localhost:39867`
- Metrics (Prometheus Exporter): `http://localhost:32923/metrics`

---

## JavaScript (Node.js)

Install the CLI:

```bash
npm install a2a-cli
```

Use in your app:

```js
import { startTelemetry } from 'a2a-cli/telemetry';
await startTelemetry('./.a2a.config.json');
```

---

## Python

Install OTel:

```bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation
```

Use in your app:

```python
import json
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry import trace

# Load agent config
with open(".a2a.config.json") as f:
    config = json.load(f)

# Build resource with metadata
resource = Resource.create({
    "service.name": config["agentName"],
    "a2a.agent.id": config["agentId"],
    "a2a.agent.role": config.get("role", ""),
    "a2a.agent.connected": ",".join(config.get("connectedAgents", [])),
    "a2a.agent.methods": ",".join(config.get("methods", [])),
})

# Configure exporter with dynamic endpoint
trace_exporter = OTLPSpanExporter(
    endpoint=config["endpoint"],
    headers={"Authorization": f"Bearer {config['token']}"}
)

# Configure provider
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(trace_exporter))
trace.set_tracer_provider(provider)

print(f"📡 Telemetry started for {config['agentName']} on {config['endpoint']}")

```
