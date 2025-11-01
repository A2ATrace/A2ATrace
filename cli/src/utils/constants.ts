// Time constants
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

// Nanosecond conversions
export const NS_PER_MS = 1_000_000;
export const NS_PER_SECOND = NS_PER_MS * MS_PER_SECOND;

// Default timeouts
export const DEFAULT_API_TIMEOUT_MS = 5000;
export const DEFAULT_GRAFANA_TIMEOUT_MS = 30000;
export const DEFAULT_LOKI_QUERY_TIMEOUT_MS = 10000;

// Default limits
export const DEFAULT_LOG_LIMIT = 500;
export const MAX_LOG_LIMIT = 5000;
export const MAX_QUERY_LENGTH = 5000;
export const MAX_LABEL_NAME_LENGTH = 100;
export const MAX_TIME_RANGE_MS = MS_PER_DAY; // 24 hours
