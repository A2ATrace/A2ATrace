// Type definitions for A2A Dashboard

export interface AgentCard {
  id: string;
  name: string;
  version?: string;
  description?: string;
  url?: string;
  methods?: string[];
  relationships?: string[];
  endpoints?: Record<string, string>;
  labels?: Record<string, string>;
}

export interface MetricResult {
  metric: Record<string, string>;
  value: [number, string];
}

export interface MetricsData {
  status: string;
  data: {
    resultType: string;
    result: MetricResult[];
  };
}

export interface AgentMetrics {
  agent: string;
  metrics: MetricsData;
}

export interface LogStream {
  stream: Record<string, string>;
  values: [string, string][];
}

export interface LogsData {
  status: string;
  data: {
    resultType: string;
    result: LogStream[];
  };
}

export interface AgentLogs {
  agent: string;
  logs: LogsData;
}

export interface TraceData {
  traceID: string;
  rootServiceName: string;
  rootTraceName: string;
  startTimeUnixNano: string;
  durationMs: number;
  question?: string;
  answer?: string;
  spanSets?: Array<{
    spans: Array<{
      spanID: string;
      startTimeUnixNano: string;
      durationNanos: string;
      attributes?: Array<{ key: string; value: { stringValue?: string } }>;
    }>;
  }>;
}

export interface TracesData {
  traces?: TraceData[];
  error?: string;
}

export interface AgentTraces {
  agent: string;
  traces: TracesData;
}

export interface LogEntry {
  ts: string;
  msg: string;
  level?: string;
  traceId?: string;
}
