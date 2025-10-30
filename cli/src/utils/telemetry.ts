import fs from "fs-extra";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  detectResources,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

export async function startTelemetry(agentConfigPath: string) {
  const config = await fs.readJson(agentConfigPath);

  // 🔹 Detect system resources and add agent metadata
  const detected = await detectResources();
  const custom = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: config.agentName,
    "a2a.agent.id": config.agentId,
    "a2a.agent.role": config.role || "",
    "a2a.agent.connected": (config.connectedAgents || []).join(","),
    "a2a.agent.methods": (config.methods || []).join(","),
  });
  const mergedResource = detected.merge(custom);

  // 🔹 Metrics
  const prometheusPort = config.metricPort || 9464;
  const prometheusExporter = new PrometheusExporter({ port: prometheusPort });
  console.log(
    `📊 Prometheus metrics available at http://localhost:${prometheusPort}/metrics`
  );

  // 🔹 Logs
  const logExporter = new OTLPLogExporter({
    url: config.endpoint.replace("/traces", "/logs"),
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const loggerProvider = new LoggerProvider({
    processors: [new BatchLogRecordProcessor(logExporter)],
  });

  // 🔹 Traces
  const traceExporter = new OTLPTraceExporter({
    url: config.endpoint,
    headers: { Authorization: `Bearer ${config.token}` },
  });

  // 🔹 Start Node OTel SDK
  const sdk = new NodeSDK({
    traceExporter,
    metricReader: prometheusExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    resource: mergedResource,
  });

  await sdk.start();
  console.log(`📡 Telemetry started for agent: ${config.agentName}`);

  process.on("SIGTERM", async () => {
    await sdk.shutdown();
    await loggerProvider.shutdown();
  });
  process.on("SIGINT", async () => {
    await sdk.shutdown();
    await loggerProvider.shutdown();
  });

  return sdk;
}
