import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { CONFIG_DIR, REGISTRY_PATH, GLOBAL_CONFIG_PATH } from '../config.js';
import type { AgentCard } from '../types.js';

const agentDir = process.cwd();

// ---- Registry helpers ----
async function loadRegistry(): Promise<AgentCard[]> {
  if (await fs.pathExists(REGISTRY_PATH)) {
    return fs.readJson(REGISTRY_PATH);
  }
  return [];
}

async function saveRegistry(registry: AgentCard[]) {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(REGISTRY_PATH, registry, { spaces: 2 });
}

function upsertAgent(registry: AgentCard[], agent: AgentCard) {
  const idx = registry.findIndex((a) => a.name === agent.name);
  if (idx >= 0) {
    const oldAgent = registry[idx];
    registry[idx] = { ...oldAgent, ...agent };
    console.log(chalk.yellow(`🔄 Updated agent in registry: ${agent.name}`));
  } else {
    registry.push(agent);
    console.log(chalk.green(`✅ Linked new agent: ${agent.name}`));
  }
  return registry;
}

// ---- README injector ----
async function injectReadme(agent: AgentCard) {
  const readmePath = path.join(agentDir, 'A2A-README.md');

  let otelEndpoint = 'http://localhost:4318';
  try {
    const globalConfig = await fs.readJson(GLOBAL_CONFIG_PATH);
    if (globalConfig?.collector?.endpointHttp) {
      otelEndpoint = String(globalConfig.collector.endpointHttp).replace(
        /\/v1\/traces$/,
        ''
      );
    }
  } catch {
    console.warn(
      chalk.yellow(
        '⚠️ Could not load global config.json, using default OTEL endpoint'
      )
    );
  }

  const content = `
# A2A Agent Telemetry Setup

This agent has been linked to your A2A dashboard.

To enable OpenTelemetry instrumentation, copy one of the snippets below into your agent's entry point.  
The OTLP endpoint is prefilled from your A2A config: \`${otelEndpoint}\`.

---

## Node.js Example

\`\`\`js
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";

import { LoggerProvider, BatchLogRecordProcessor, logs } from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes as S } from "@opentelemetry/semantic-conventions";

const OTEL_ENDPOINT = "${otelEndpoint}";

const resource = new Resource({
  [S.SERVICE_NAME]: "${agent.name}",
  [S.SERVICE_VERSION]: "${agent.version}",
  "agent.id": "${agent.id}"
});

// ---- Traces ----
const tracerProvider = new NodeTracerProvider({ resource });
tracerProvider.addSpanProcessor(
  new BatchSpanProcessor(new OTLPTraceExporter({ url: \`\${OTEL_ENDPOINT}/v1/traces\` }))
);
tracerProvider.register();
export const tracer = tracerProvider.getTracer("${agent.name}");

// ---- Metrics ----
const metricExporter = new OTLPMetricExporter({ url: \`\${OTEL_ENDPOINT}/v1/metrics\` });
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000
});
const meterProvider = new MeterProvider({ resource });
meterProvider.addMetricReader(metricReader);
export const meter = meterProvider.getMeter("${agent.name}");

// ---- Logs ----
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(
  new BatchLogRecordProcessor(new OTLPLogExporter({ url: \`\${OTEL_ENDPOINT}/v1/logs\` }))
);
logs.setGlobalLoggerProvider(loggerProvider);
export const logger = loggerProvider.getLogger("${agent.name}");
\`\`\`
---

Now run your agent. Telemetry will flow into your A2A dashboard.
`;

  await fs.writeFile(readmePath, content, 'utf8');
  console.log(chalk.green(`📘 Created A2A-README.md in ${agentDir}`));
}

// ---- Main link command ----
export default async function linkAgent() {
  const cardPath = path.join(agentDir, 'agent-card.json');
  if (!(await fs.pathExists(cardPath))) {
    console.error(
      chalk.red(
        `❌ No agent-card.json found in ${agentDir}. Run "a2a inject" first.`
      )
    );
    return;
  }

  const card = (await fs.readJson(cardPath)) as AgentCard;
  let finalCard: AgentCard | null = null;

  // Validate agent name before doing anything
  if (!card.name || card.name === 'YourAgent') {
    console.error(
      chalk.red(
        "❌ Invalid agent-card.json: please edit 'name' in VS Code before running `a2a link`."
      )
    );
    return;
  }

  // Try URL first if present
  if (card.url) {
    try {
      const res = await fetch(card.url);
      if (res.ok) {
        finalCard = await res.json();
        console.log(chalk.green(`✅ Pulled agent card from URL: ${card.url}`));
      } else {
        console.warn(
          chalk.yellow(
            `⚠️ URL returned ${res.status}, falling back to local file`
          )
        );
      }
    } catch {
      console.warn(
        chalk.yellow(
          `⚠️ Failed to fetch ${card.url}, falling back to local file`
        )
      );
    }
  }

  // Fall back to static JSON
  if (!finalCard) {
    finalCard = { ...card };
    console.log(chalk.green(`✅ Loaded agent card from ${cardPath}`));
  }

  // Update registry (upsert by name)
  let registry = await loadRegistry();
  registry = upsertAgent(registry, finalCard);
  await saveRegistry(registry);
  console.log(chalk.blue(`📒 Registry saved at ${REGISTRY_PATH}`));

  // Inject OTEL README
  await injectReadme(finalCard);
}
