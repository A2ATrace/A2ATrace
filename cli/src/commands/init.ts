import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import findPort from 'find-open-port';

export default async function init() {
  const homeDir = process.env.HOME || process.env.USERPROFILE!;
  const configDir = path.join(homeDir, '.a2a');
  const configPath = path.join(configDir, 'config.json');
  const collectorPath = path.join(configDir, 'collector-config.yaml');
  const prometheusPath = path.join(configDir, 'prometheus.yml');
  const tempoPath = path.join(configDir, 'tempo.yaml');
  const dockerComposePath = path.join(configDir, 'docker-compose.yml');

  await fs.ensureDir(configDir);

  // 🔹 Dynamic HOST ports
  const collectorHttpPort = await findPort({ start: 4318 }); // host → container 4318
  const collectorGrpcPort = await findPort({ start: 55680 }); // host → container 55680
  const promExporterPort = await findPort({ start: 9464 });
  const promUiPort = await findPort({ start: 9090 });
  const lokiPort = await findPort({ start: 3100 });
  const tempoHttpPort = await findPort({ start: 3200 });   // host → container 3200
  const tempoGrpcPort = await findPort({ start: 4320 });   // host → container 4320 (instead of 4317)
  const dashboardPort = await findPort({ start: 4000 });

  // 🔹 Global config.json (overwrite every time)
  const token = randomUUID();
  const config = {
    collector: {
      endpointHttp: `http://localhost:${collectorHttpPort}/v1/traces`,
      endpointGrpc: `http://localhost:${collectorGrpcPort}`,
      token,
    },
    ports: {
      prometheus: promUiPort,
      loki: lokiPort,
      tempoHttp: tempoHttpPort,
      tempoGrpc: tempoGrpcPort,
      prometheusExporter: promExporterPort,
      dashboard: dashboardPort,
    },
  };
  await fs.writeJson(configPath, config, { spaces: 2 });
  console.log(chalk.green('✅ Wrote global config.json with dynamic collector & tempo ports'));

  // 🔹 Collector config
  const collectorYaml = `
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:55680   # collector only uses 55680 inside container

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
  otlp:
    endpoint: "http://dashboard:4000/ingest"   # send traces to tempo’s gRPC port
    tls:
      insecure: true
  debug: {}   # safe fallback for logs

processors:
  batch:

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp, debug]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus, debug]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
`;
  await fs.writeFile(collectorPath, collectorYaml, 'utf8');
  console.log(chalk.green('✅ Wrote collector-config.yaml'));

  // 🔹 Prometheus config
  const prometheusYaml = `
global:
  scrape_interval: 5s

scrape_configs:
  - job_name: "a2a-agents"
    static_configs:
      - targets: ["otel-collector:8889"]
`;
  await fs.writeFile(prometheusPath, prometheusYaml, 'utf8');
  console.log(chalk.green('✅ Wrote prometheus.yml'));

  // 🔹 Tempo config
  const tempoYaml = `
server:
  http_listen_port: 3200
  grpc_listen_port: ${tempoGrpcPort}

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
        http:

ingester:
  trace_idle_period: 10s
  max_block_bytes: 1_000_000
  max_block_duration: 5m

compactor:
  compaction:
    compaction_window: 1h

storage:
  trace:
    backend: local
    wal:
      path: /tmp/tempo/wal
    local:
      path: /tmp/tempo/blocks
`;
  await fs.writeFile(tempoPath, tempoYaml, 'utf8');
  console.log(chalk.green('✅ Wrote tempo.yaml'));

  // 🔹 Docker Compose
  const dockerYaml = `
version: "3.8"

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ${collectorPath}:/etc/otel-collector-config.yaml
    ports:
      - "${collectorGrpcPort}:55680"
      - "${collectorHttpPort}:4318"
      - "${promExporterPort}:8889"

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ${prometheusPath}:/etc/prometheus/prometheus.yml
    ports:
      - "${promUiPort}:9090"

  loki:
    image: grafana/loki:2.9.4
    command: -config.file=/etc/loki/local-config.yaml
    ports:
      - "${lokiPort}:3100"

  tempo:
    image: grafana/tempo:2.4.1
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ${tempoPath}:/etc/tempo.yaml
      - tempo-data:/tmp/tempo
    ports:
      - "${tempoHttpPort}:3200"
      - "${tempoGrpcPort}:${tempoGrpcPort}"

volumes:
  tempo-data:
`;
  await fs.writeFile(dockerComposePath, dockerYaml, 'utf8');
  console.log(chalk.green('✅ Wrote docker-compose.yml with dynamic Tempo gRPC'));

  // 🔹 Debug summary
  console.log(chalk.blue(`ℹ️ A2A initialized at ${configDir}`));
  console.log(chalk.yellow('🔍 Debug info:'));
  console.log(chalk.yellow(`   Collector HTTP: http://localhost:${collectorHttpPort}/v1/traces`));
  console.log(chalk.yellow(`   Collector gRPC: localhost:${collectorGrpcPort} → container:55680`));
  console.log(chalk.yellow(`   Tempo HTTP: http://localhost:${tempoHttpPort}`));
  console.log(chalk.yellow(`   Tempo gRPC: localhost:${tempoGrpcPort} → container:${tempoGrpcPort}`));
}
