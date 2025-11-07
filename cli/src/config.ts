import path from 'path';
import os from 'os';

// Centralized configuration for A2A CLI
export const CONFIG_DIR = path.join(os.homedir(), '.a2a');
export const REGISTRY_PATH = path.join(CONFIG_DIR, 'agents.json');
export const GLOBAL_CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
export const COLLECTOR_CONFIG_PATH = path.join(
  CONFIG_DIR,
  'collector-config.yaml'
);
export const PROMETHEUS_CONFIG_PATH = path.join(CONFIG_DIR, 'prometheus.yml');
export const TEMPO_CONFIG_PATH = path.join(CONFIG_DIR, 'tempo.yaml');
export const DOCKER_COMPOSE_PATH = path.join(CONFIG_DIR, 'docker-compose.yml');
