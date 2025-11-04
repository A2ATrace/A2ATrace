import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import findPort from 'find-open-port';
import os from 'os';

export default async function init() {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.a2a');
  const configPath = path.join(configDir, 'config.json');
  const collectorPath = path.join(configDir, 'collector-config.yaml');
  const prometheusPath = path.join(configDir, 'prometheus.yml');
  const tempoPath = path.join(configDir, 'tempo.yaml');
  const dockerComposePath = path.join(configDir, 'docker-compose.yml');
  const registryPath = path.join(configDir, 'agents.json');

  await fs.ensureDir(configDir);

  // 🔹 Dynamic HOST ports
  const collectorHttpPort = await findPort({ start: 4318 });
  const collectorGrpcPort = await findPort({ start: 4317 });
  const promExporterPort = 8889; // fixed inside container
  const promUiPort = await findPort({ start: 9090 });
  const lokiPort = await findPort({ start: 3100 });
  const tempoHttpPort = await findPort({ start: 3200 });
  const tempoGrpcPort = await findPort({ start: 4320 }); // unify everything on 4320
  const grafanaPort = await findPort({ start: 3000 });
  const dashboardPort = await findPort({ start: 4000 });

  // 🔹 Global config.json
  const config = {
    registry: registryPath,
    collector: {
      endpointHttp: `http://localhost:${collectorHttpPort}/v1/traces`,
      endpointGrpc: `http://localhost:${collectorGrpcPort}`,
    },
    ports: {
      prometheus: promUiPort,
      loki: lokiPort,
      tempoHttp: tempoHttpPort,
      tempoGrpc: tempoGrpcPort,
      prometheusExporter: promExporterPort,
      grafana: grafanaPort,
      dashboard: dashboardPort,
    },
    files: {
      collector: collectorPath,
      prometheus: prometheusPath,
      tempo: tempoPath,
      dockerCompose: dockerComposePath,
    },
  };
  await fs.writeJson(configPath, config, { spaces: 2 });
  console.log(chalk.green('✅ Wrote global config.json with dynamic ports'));

  // 🔹 Collector config
  const collectorYaml = `
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"

  otlp/tempo:
    endpoint: "tempo:4320"
    tls:
      insecure: true

  loki:
    endpoint: "http://loki:3100/loki/api/v1/push"
    tls:
      insecure: true

  debug: {}

processors:
  batch: {}
  resource:
    attributes:
      - key: service.namespace
        value: a2a-agents
        action: insert
      - key: service.name
        from_attribute: service.name
        action: upsert
      - key: agent.card.name
        from_attribute: agent.card.name
        action: upsert

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo, debug]

    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus, debug]

    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [loki, debug]
`;
  await fs.writeFile(collectorPath, collectorYaml, 'utf8');

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

  // 🔹 Tempo config (unify ports to 4320 gRPC, 3200 HTTP)
  const tempoYaml = `
server:
  http_listen_port: 3200
  grpc_listen_port: 9095

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4320
        http:
          endpoint: 0.0.0.0:4318

ingester:
  trace_idle_period: 10s
  max_block_bytes: 1000000
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

  // 🔹 Docker Compose
  const dockerYaml = `
version: "3.8"

services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.94.0
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ${collectorPath}:/etc/otel-collector-config.yaml
    ports:
      - "${collectorGrpcPort}:4317"
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
    image: grafana/tempo:2.8.0
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ${tempoPath}:/etc/tempo.yaml
    ports:
      - "${tempoHttpPort}:3200"
      - "${tempoGrpcPort}:4320"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "${grafanaPort}:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
      - GF_AUTH_DISABLE_LOGIN_FORM=true
      - GF_SECURITY_ALLOW_EMBEDDING=true
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
`;
  await fs.writeFile(dockerComposePath, dockerYaml, 'utf8');

  console.log(chalk.green('✅ Wrote docker-compose.yml with dynamic ports'));

  // 🔹 Debug summary
  console.log(chalk.blue(`ℹ️ A2A initialized at ${configDir}`));
  console.log(chalk.yellow('🔍 Debug info:'));
  console.log(
    chalk.yellow(
      `   Collector HTTP: http://localhost:${collectorHttpPort}/v1/traces`
    )
  );
  console.log(
    chalk.yellow(`   Collector gRPC: localhost:${collectorGrpcPort}`)
  );
  console.log(chalk.yellow(`   Prometheus UI: http://localhost:${promUiPort}`));
  console.log(chalk.yellow(`   Loki: http://localhost:${lokiPort}`));
  console.log(chalk.yellow(`   Tempo HTTP: http://localhost:${tempoHttpPort}`));
  console.log(chalk.yellow(`   Tempo gRPC: localhost:${tempoGrpcPort}`));
  console.log(chalk.yellow(`   Grafana: http://localhost:${grafanaPort}`));
  console.log(
    chalk.yellow(`   Dashboard (reserved): http://localhost:${dashboardPort}`)
  );
}
