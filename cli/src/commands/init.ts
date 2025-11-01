import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import findPort from 'find-open-port';
import { logger } from '../utils/logger.js';

export default async function init() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (!homeDir) {
    logger.error('Could not determine home directory');
    process.exit(1);
  }
  const configDir = path.join(homeDir, '.a2a');

  // Write the file your app actually reads:
  const configPath = path.join(configDir, 'a2a.config.json');

  const collectorPath = path.join(configDir, 'collector-config.yaml');
  const prometheusPath = path.join(configDir, 'prometheus.yml');
  const tempoPath = path.join(configDir, 'tempo.yaml');
  const dockerComposePath = path.join(configDir, 'docker-compose.yml');
  const grafanaProvisioningDir = path.join(
    configDir,
    'grafana',
    'provisioning'
  );
  const grafanaDatasourcesPath = path.join(
    grafanaProvisioningDir,
    'datasources',
    'datasources.yml'
  );
  const grafanaDashboardsPath = path.join(
    grafanaProvisioningDir,
    'dashboards',
    'dashboards.yml'
  );
  const grafanaDashboardsDir = path.join(grafanaProvisioningDir, 'dashboards');
  const grafanaOverviewDashboardPath = path.join(
    grafanaDashboardsDir,
    'a2a-overview.json'
  );
  const grafanaAccessControlPath = path.join(
    grafanaProvisioningDir,
    'access-control',
    'a2a-access.yaml'
  );

  await fs.ensureDir(configDir);

  // 🔹 Dynamic HOST ports for all services (to avoid conflicts)
  const collectorHttpPort = await findPort({ start: 37641 });
  const collectorGrpcPort = await findPort({ start: 39867 });
  const promExporterPort = await findPort({ start: 32923 }); // Collector's Prom metrics
  const promUiPort = await findPort({ start: 33259 });
  const lokiPort = await findPort({ start: 38391 });
  const tempoHttpPort = await findPort({ start: 37039 }); // Tempo UI/HTTP
  const dashboardPort = await findPort({ start: 43333 }); // reserved for your app if you surface it

  // 🔹 Global app config (overwrite every time)
  const token = randomUUID();
  const grafanaUser = process.env.GRAFANA_ADMIN_USER || 'admin';
  const grafanaPassword = process.env.GRAFANA_ADMIN_PASSWORD || 'a2a';

  const globalConfig = {
    collector: {
      endpointHttp: `http://localhost:${collectorHttpPort}/v1/traces`,
      endpointGrpc: `http://localhost:${collectorGrpcPort}`,
      token,
    },
    ports: {
      prometheus: promUiPort,
      loki: lokiPort,
      tempo: tempoHttpPort,
      prometheusExporter: promExporterPort,
      dashboard: dashboardPort,
    },
    grafana: {
      user: grafanaUser,
      password: grafanaPassword,
    },
  };

  // Write to config.json (not a2a.config.json - that's for agents)
  const globalConfigPath = path.join(configDir, 'config.json');
  await fs.writeJson(globalConfigPath, globalConfig, { spaces: 2 });
  logger.info('✅ Wrote config.json');

  // Also create a default agent config for A2ATrace itself
  const agentConfig = {
    agentId: randomUUID(),
    agentName: 'A2ATrace',
    role: 'helper',
    connectedAgents: [''],
    methods: [''],
    endpoint: globalConfig.collector.endpointHttp,
    grpcEndpoint: globalConfig.collector.endpointGrpc,
    token: globalConfig.collector.token,
    metricPort: promExporterPort,
  };
  const agentConfigPath = path.join(process.cwd(), '.a2a.config.json');
  await fs.writeJson(agentConfigPath, agentConfig, { spaces: 2 });
  logger.info('✅ Wrote a2a.config.json for A2ATrace agent');

  // 🔹 Collector config (listen on standard OTLP ports internally, export to Tempo)
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
  otlp:
    endpoint: "tempo:4317"  # talk to Tempo over Docker network
    tls:
      insecure: true
  debug: {}

processors:
  batch:

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp, debug]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
`;
  await fs.writeFile(collectorPath, collectorYaml, 'utf8');
  logger.info('✅ Wrote collector-config.yaml');

  // 🔹 Prometheus config (scrape collector’s Prom exporter)
  const prometheusYaml = `
global:
  scrape_interval: 5s

scrape_configs:
  - job_name: "a2a-agents"
    static_configs:
      - targets: ["otel-collector:8889"]
`;
  await fs.writeFile(prometheusPath, prometheusYaml, 'utf8');
  logger.info('✅ Wrote prometheus.yml');

  // 🔹 Tempo config (keep gRPC internal on 4317; expose only HTTP)
  const tempoYaml = `
server:
  http_listen_port: 3200
  grpc_listen_port: 9095     # was 4317 → move away to avoid conflict

distributor:
  receivers:
    otlp:
      protocols:
        grpc:
          endpoint: 0.0.0.0:4317   # keep standard OTLP gRPC for ingestion
        http:
          endpoint: 0.0.0.0:4318   # optional; fine to leave enabled

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
  logger.info('✅ Wrote tempo.yaml');

  // 🔹 Docker Compose (map host ports from config to standard internal ports)
  const dockerYaml = `
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ${collectorPath}:/etc/otel-collector-config.yaml:ro
    ports:
      - "127.0.0.1:${collectorHttpPort}:4318"   # OTLP/HTTP (host:container)
      - "127.0.0.1:${collectorGrpcPort}:4317"   # OTLP/gRPC (host:container)
      - "127.0.0.1:${promExporterPort}:8889"    # Prometheus metrics from collector
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:13133/"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ${prometheusPath}:/etc/prometheus/prometheus.yml:ro
    ports:
      - "127.0.0.1:${promUiPort}:9090"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:9090/-/healthy"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  loki:
    image: grafana/loki:2.9.4
    command: -config.file=/etc/loki/local-config.yaml
    ports:
      - "127.0.0.1:${lokiPort}:3100"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3100/ready"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 15s

  tempo:
    image: grafana/tempo:2.4.1
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ${tempoPath}:/etc/tempo.yaml:ro
      - tempo-data:/tmp/tempo
    ports:
      - "127.0.0.1:${tempoHttpPort}:3200"  # Tempo HTTP/UI
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3200/ready"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 15s

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ALLOW_EMBEDDING=true
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Editor
      - GF_AUTH_ANONYMOUS_ORG_NAME=Main Org.
      - GF_AUTH_BASIC_ENABLED=true
      - GF_AUTH_DISABLE_LOGIN_FORM=false
      - GF_EXPLORE_ENABLED=true
      - GF_SECURITY_ADMIN_USER=${grafanaUser}
      - GF_SECURITY_ADMIN_PASSWORD=${grafanaPassword}
      - GF_FEATURE_TOGGLES_ENABLE=accessControl,rbac,florenceAccessControl
      - GF_SERVER_SERVE_FROM_SUB_PATH=true
      - GF_SERVER_ROOT_URL=/grafana
    ports:
      - "127.0.0.1:4001:3000"
    depends_on:
      prometheus:
        condition: service_healthy
      loki:
        condition: service_healthy
      tempo:
        condition: service_healthy
    volumes:
      - grafana-data:/var/lib/grafana
      - ${grafanaProvisioningDir}:/etc/grafana/provisioning:ro
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s

volumes:
  tempo-data:
  grafana-data:
`;
  await fs.writeFile(dockerComposePath, dockerYaml, 'utf8');
  logger.info(
    chalk.green('✅ Wrote docker-compose.yml with dynamic port mappings')
  );

  // 🔹 Grafana data sources provisioning
  const grafanaDatasourcesYaml = `
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    uid: PROM
    access: proxy
    url: http://prometheus:9090
    isDefault: false
    editable: true

  - name: Tempo
    type: tempo
    uid: TEMPO
    access: proxy
    url: http://tempo:3200
    isDefault: true
    editable: true
    jsonData:
      httpMethod: GET
      nodeGraph:
        enabled: true

  - name: Loki
    type: loki
    uid: LOKI
    access: proxy
    url: http://loki:3100
    isDefault: false
    editable: true
    jsonData:
      maxLines: 1000
`;
  await fs.ensureDir(path.dirname(grafanaDatasourcesPath));
  await fs.writeFile(grafanaDatasourcesPath, grafanaDatasourcesYaml, 'utf8');
  logger.info('✅ Wrote Grafana datasources.yml');

  // 🔹 Grafana dashboards provisioning
  const grafanaDashboardsYaml = `
apiVersion: 1

providers:
  - name: 'A2A Dashboards'
    orgId: 1
    folder: 'A2A'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
`;
  await fs.ensureDir(path.dirname(grafanaDashboardsPath));
  await fs.writeFile(grafanaDashboardsPath, grafanaDashboardsYaml, 'utf8');
  logger.info('✅ Wrote Grafana dashboards.yml');

  // 🔹 A2A Overview Dashboard JSON
  const overviewDashboard = {
    uid: 'a2a-overview',
    title: 'A2A Overview',
    tags: ['a2a', 'telemetry'],
    timezone: 'browser',
    schemaVersion: 38,
    version: 1,
    refresh: '5s',
    panels: [
      {
        id: 1,
        type: 'timeseries',
        title: 'Spans Received (rate)',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [
          {
            expr: 'rate(otelcol_receiver_accepted_spans{receiver="otlp"}[1m])',
            legendFormat: '{{receiver}}',
            refId: 'A',
            datasource: { type: 'prometheus', uid: 'PROM' },
          },
        ],
        options: {
          legend: { displayMode: 'list', placement: 'bottom' },
        },
      },
      {
        id: 2,
        type: 'timeseries',
        title: 'Spans Exported (rate)',
        gridPos: { x: 12, y: 0, w: 12, h: 8 },
        targets: [
          {
            expr: 'rate(otelcol_exporter_sent_spans{exporter="otlp"}[1m])',
            legendFormat: '{{exporter}}',
            refId: 'A',
            datasource: { type: 'prometheus', uid: 'PROM' },
          },
        ],
        options: {
          legend: { displayMode: 'list', placement: 'bottom' },
        },
      },
      {
        id: 3,
        type: 'stat',
        title: 'Total Spans Accepted (15m)',
        gridPos: { x: 0, y: 8, w: 6, h: 4 },
        targets: [
          {
            expr: 'sum(increase(otelcol_receiver_accepted_spans{receiver="otlp"}[15m]))',
            refId: 'A',
            datasource: { type: 'prometheus', uid: 'PROM' },
          },
        ],
        options: {
          graphMode: 'none',
          colorMode: 'value',
          textMode: 'value_and_name',
        },
      },
      {
        id: 4,
        type: 'stat',
        title: 'Total Spans Exported (15m)',
        gridPos: { x: 6, y: 8, w: 6, h: 4 },
        targets: [
          {
            expr: 'sum(increase(otelcol_exporter_sent_spans{exporter="otlp"}[15m]))',
            refId: 'A',
            datasource: { type: 'prometheus', uid: 'PROM' },
          },
        ],
        options: {
          graphMode: 'none',
          colorMode: 'value',
          textMode: 'value_and_name',
        },
      },
      {
        id: 5,
        type: 'text',
        title: 'Quick Links',
        gridPos: { x: 12, y: 8, w: 12, h: 4 },
        options: {
          mode: 'markdown',
          content:
            '### A2A Telemetry\\n\\n- [Explore Traces (Tempo)](/grafana/explore?left=%7B%22datasource%22:%22TEMPO%22%7D)\\n- [Explore Metrics (Prometheus)](/grafana/explore?left=%7B%22datasource%22:%22PROM%22%7D)\\n- [Explore Logs (Loki)](/grafana/explore?left=%7B%22datasource%22:%22LOKI%22%7D)',
        },
      },
    ],
  };
  await fs.ensureDir(grafanaDashboardsDir);
  await fs.writeFile(
    grafanaOverviewDashboardPath,
    JSON.stringify(overviewDashboard, null, 2),
    'utf8'
  );
  logger.info('✅ Wrote A2A Overview dashboard');

  // 🔹 Grafana access-control provisioning (allow Explore for Viewer/anonymous)
  const grafanaAccessYaml = `
apiVersion: 1

roles:
  - name: A2A Explore Viewer
    uid: a2a-explore-viewer
    description: Allow Viewer (including anonymous) to use Explore
    permissions:
      - action: datasources:query
      - action: datasources:explore

role_assignments:
  - roleUid: a2a-explore-viewer
    builtInRole: Viewer
`;
  await fs.ensureDir(path.dirname(grafanaAccessControlPath));
  await fs.writeFile(grafanaAccessControlPath, grafanaAccessYaml, 'utf8');
  logger.info(
    chalk.green('✅ Wrote Grafana access-control (Explore for Viewer)')
  );

  // 🔹 Debug summary (reflect the actual, exposed ports)
  logger.info(`\nℹ️ A2A initialized at ${configDir}`);
  logger.info('\n🔍 Service endpoints:');
  logger.info(
    chalk.yellow(
      `   Collector HTTP: http://localhost:${collectorHttpPort}/v1/traces`
    )
  );
  logger.info(
    chalk.yellow(`   Collector gRPC: localhost:${collectorGrpcPort}`)
  );
  logger.info(
    chalk.yellow(`   Prometheus UI:  http://localhost:${promUiPort}`)
  );
  logger.info(`   Loki:           http://localhost:${lokiPort}`);
  logger.info(
    chalk.yellow(`   Tempo HTTP:     http://localhost:${tempoHttpPort}`)
  );
  logger.info(`   Grafana:        http://localhost:4001`);
  logger.info(
    chalk.yellow(`   Dashboard:      http://localhost:${dashboardPort}`)
  );
  logger.info(
    chalk.cyan('\n💡 Run `a2a start-dashboard` to start the telemetry stack')
  );
}
