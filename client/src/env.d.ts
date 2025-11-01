/// <reference types="vite/client" />

// optional: nice autocomplete
interface ImportMetaEnv {
  readonly VITE_GRAFANA_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
