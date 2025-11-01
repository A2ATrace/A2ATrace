import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import chalk from 'chalk';
import findPort from 'find-open-port';

export default async function init() {
  const homeDir = process.env.HOME || process.env.USERPROFILE!;
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
  };

  // Write to config.json (not a2a.config.json - that's for agents)
  const globalConfigPath = path.join(configDir, 'config.json');
  await fs.writeJson(globalConfigPath, globalConfig, { spaces: 2 });
  console.log(chalk.green('✅ Wrote config.json'));

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
  await fs.writeJson(configPath, agentConfig, { spaces: 2 });
  console.log(chalk.green('✅ Wrote a2a.config.json for A2ATrace agent'));

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
  console.log(chalk.green('✅ Wrote collector-config.yaml'));

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
  console.log(chalk.green('✅ Wrote prometheus.yml'));

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
  console.log(chalk.green('✅ Wrote tempo.yaml'));

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

  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ${prometheusPath}:/etc/prometheus/prometheus.yml:ro
    ports:
      - "127.0.0.1:${promUiPort}:9090"

  loki:
    image: grafana/loki:2.9.4
    command: -config.file=/etc/loki/local-config.yaml
    ports:
      - "127.0.0.1:${lokiPort}:3100"

  tempo:
    image: grafana/tempo:2.4.1
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ${tempoPath}:/etc/tempo.yaml:ro
      - tempo-data:/tmp/tempo
    ports:
      - "127.0.0.1:${tempoHttpPort}:3200"  # Tempo HTTP/UI

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
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=a2a
      - GF_FEATURE_TOGGLES_ENABLE=accessControl,rbac,florenceAccessControl
      - GF_SERVER_SERVE_FROM_SUB_PATH=true
      - GF_SERVER_ROOT_URL=/grafana
    ports:
      - "127.0.0.1:4001:3000"
    depends_on:
      - prometheus
      - loki
      - tempo
    volumes:
      - grafana-data:/var/lib/grafana
      - ${grafanaProvisioningDir}:/etc/grafana/provisioning:ro

volumes:
  tempo-data:
  grafana-data:
`;
  await fs.writeFile(dockerComposePath, dockerYaml, 'utf8');
  console.log(
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
  console.log(chalk.green('✅ Wrote Grafana datasources.yml'));

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
  console.log(chalk.green('✅ Wrote Grafana dashboards.yml'));

  // 🔹 A2A Overview dashboard (basic metrics + link to Explore)
  const a2aOverviewDashboard = {
    annotations: { list: [] },
    editable: true,
    fiscalYearStartMonth: 0,
    graphTooltip: 0,
    id: null,
    links: [],
    liveNow: false,
    panels: [
      {
        type: 'text',
        title: 'Welcome',
        gridPos: { x: 0, y: 0, w: 24, h: 4 },
        options: {
          mode: 'markdown',
          content:
            'Use Explore for traces: [Open Tempo Explore](/grafana/explore?orgId=1)\n\nQuery: `{ service.name = "A2ATrace" }`',
        },
      },
      {
        type: 'timeseries',
        title: 'Spans received (rate)',
        datasource: { type: 'prometheus', uid: 'PROM' },
        fieldConfig: { defaults: { unit: 'spm' }, overrides: [] },
        gridPos: { x: 0, y: 4, w: 24, h: 8 },
        options: { legend: { displayMode: 'table', placement: 'bottom' } },
        targets: [
          {
            refId: 'A',
            expr: 'rate(otelcol_receiver_accepted_spans[5m])',
            legendFormat: 'accepted',
          },
          {
            refId: 'B',
            expr: 'rate(otelcol_exporter_sent_spans[5m])',
            legendFormat: 'exported',
          },
        ],
      },
      {
        type: 'stat',
        title: 'Accepted spans (last 15m)',
        datasource: { type: 'prometheus', uid: 'PROM' },
        gridPos: { x: 0, y: 12, w: 12, h: 6 },
        options: { reduceOptions: { calcs: ['lastNotNull'], values: false } },
        targets: [
          {
            refId: 'A',
            expr: 'sum(increase(otelcol_receiver_accepted_spans[15m]))',
          },
        ],
      },
      {
        type: 'stat',
        title: 'Exported spans (last 15m)',
        datasource: { type: 'prometheus', uid: 'PROM' },
        gridPos: { x: 12, y: 12, w: 12, h: 6 },
        options: { reduceOptions: { calcs: ['lastNotNull'], values: false } },
        targets: [
          {
            refId: 'A',
            expr: 'sum(increase(otelcol_exporter_sent_spans[15m]))',
          },
        ],
      },
    ],
    refresh: '10s',
    schemaVersion: 39,
    style: 'dark',
    tags: ['a2a', 'overview'],
    templating: { list: [] },
    time: { from: 'now-6h', to: 'now' },
    timepicker: {},
    timezone: '',
    title: 'A2A Overview',
    uid: 'a2a-overview',
    version: 1,
  } as const;

  await fs.writeFile(
    grafanaOverviewDashboardPath,
    JSON.stringify(a2aOverviewDashboard, null, 2),
    'utf8'
  );
  console.log(chalk.green('✅ Wrote Grafana dashboard: A2A Overview'));

  await fs.ensureDir(path.dirname(grafanaDashboardsPath));
  await fs.writeFile(grafanaDashboardsPath, grafanaDashboardsYaml, 'utf8');
  console.log(chalk.green('✅ Wrote Grafana dashboards.yml'));

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
  console.log(chalk.green('✅ Wrote A2A Overview dashboard'));

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
  console.log(
    chalk.green('✅ Wrote Grafana access-control (Explore for Viewer)')
  );

  // 🔹 Debug summary (reflect the actual, exposed ports)
  console.log(chalk.blue(`\nℹ️ A2A initialized at ${configDir}`));
  console.log(chalk.yellow('\n🔍 Service endpoints:'));
  console.log(
    chalk.yellow(
      `   Collector HTTP: http://localhost:${collectorHttpPort}/v1/traces`
    )
  );
  console.log(
    chalk.yellow(`   Collector gRPC: localhost:${collectorGrpcPort}`)
  );
  console.log(
    chalk.yellow(`   Prometheus UI:  http://localhost:${promUiPort}`)
  );
  console.log(chalk.yellow(`   Loki:           http://localhost:${lokiPort}`));
  console.log(
    chalk.yellow(`   Tempo HTTP:     http://localhost:${tempoHttpPort}`)
  );
  console.log(chalk.yellow(`   Grafana:        http://localhost:4001`));
  console.log(
    chalk.yellow(`   Dashboard:      http://localhost:${dashboardPort}`)
  );
  console.log(
    chalk.cyan('\n💡 Run `a2a start-dashboard` to start the telemetry stack')
  );
}
