import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';

export default async function injectOtel() {
  try {
    const cwd = process.cwd();
    const agentConfigPath = path.join(cwd, '.a2a.config.json');

    if (!(await fs.pathExists(agentConfigPath))) {
      logger.error(
        chalk.red('❌ No .a2a.config.json found. Run `a2a link` first.')
      );
      process.exit(1);
    }

    const agentConfig = await fs.readJson(agentConfigPath);
    const readmePath = path.join(cwd, 'a2a.README.md');

    const readmeContent = `# A2A Telemetry Setup for ${agentConfig.agentName}

**Role:** ${agentConfig.role || 'N/A'}  
**Connected Agents:** ${agentConfig.connectedAgents?.join(', ') || 'None'}  
**Methods:** ${agentConfig.methods?.join(', ') || 'None'}  

This agent is configured with \`.a2a.config.json\`.  
Telemetry data will be sent to:

- Collector (HTTP): \`${agentConfig.endpoint}\`  
- Collector (gRPC): \`${agentConfig.grpcEndpoint}\`  
- Metrics (Prometheus Exporter): \`http://localhost:${
      agentConfig.metricPort
    }/metrics\`  

---

## JavaScript (Node.js)

Install the CLI:
\`\`\`bash
npm install a2a-cli
\`\`\`

Use in your app:
\`\`\`js
import { startTelemetry } from "a2a-cli/telemetry";
await startTelemetry("./.a2a.config.json");
\`\`\`

---

## Python

Install OTel:
\`\`\`bash
pip install opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation
\`\`\`

Use in your app:
\`\`\`python
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

\`\`\`
`;

    await fs.writeFile(readmePath, readmeContent, 'utf8');

    logger.info('✅ OTel setup injected successfully!');
    logger.info(`File created: ${readmePath}`);
  } catch (err) {
    logger.error(chalk.red('❌ Failed to inject OTel setup:'), err);
  }
}
