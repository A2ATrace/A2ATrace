// Type definitions for A2A CLI

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

export interface A2AConfig {
  registry: string;
  collector: {
    endpointHttp: string;
    endpointGrpc: string;
  };
  ports: {
    prometheus: number;
    loki: number;
    tempoHttp: number;
    tempoGrpc: number;
    prometheusExporter: number;
    grafana: number;
    dashboard: number;
  };
  files: {
    collector: string;
    prometheus: string;
    tempo: string;
    dockerCompose: string;
  };
}
