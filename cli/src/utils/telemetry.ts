import fs from 'fs-extra';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  detectResources,
  resourceFromAttributes,
} from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { logger } from './logger.js';

export async function startTelemetry(agentConfigPath: string) {
  const config = await fs.readJson(agentConfigPath);

  // 🔹 Detect system resources and add agent metadata
  const detected = await detectResources();
  const custom = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: config.agentName,
    'a2a.agent.id': config.agentId,
    'a2a.agent.role': config.role || '',
    'a2a.agent.connected': (config.connectedAgents || []).join(','),
    'a2a.agent.methods': (config.methods || []).join(','),
  });
  const mergedResource = detected.merge(custom);

  // 🔹 Metrics (using OTLP exporter instead of Prometheus for compatibility)
  const metricExporter = new OTLPMetricExporter({
    url: config.endpoint.replace('/v1/traces', '/v1/metrics'),
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  });

  // 🔹 Logs
  const logExporter = new OTLPLogExporter({
    url: config.endpoint.replace('/traces', '/logs'),
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
    metricReader,
    instrumentations: [getNodeAutoInstrumentations()],
    resource: mergedResource,
  });

  await sdk.start();
  logger.info(`📡 Telemetry started for agent: ${config.agentName}`);

  process.on('SIGTERM', async () => {
    await sdk.shutdown();
    await loggerProvider.shutdown();
  });
  process.on('SIGINT', async () => {
    await sdk.shutdown();
    await loggerProvider.shutdown();
  });

  return sdk;
}
