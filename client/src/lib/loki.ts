export type LokiLine = {
  tsMs: number;
  labels: Record<string, string>;
  line: string;
};

// Constants
const NS_PER_MS = 1_000_000;
const MS_PER_MINUTE = 60_000;

function nsToMs(ns: string): number {
  return Number(BigInt(ns) / BigInt(NS_PER_MS));
}

export async function fetchAgentLogs(
  serviceName: string,
  lookbackMin = 5,
  limit = 200
): Promise<LokiLine[]> {
  const end = Date.now();
  const start = end - lookbackMin * MS_PER_MINUTE;
  const selector = `{service_name="${serviceName}"}`;
  const qs = new URLSearchParams({
    query: selector,
    start: String(start),
    end: String(end),
    limit: String(limit),
    direction: 'backward',
  });
  const r = await fetch(`/api/logs/query_range?${qs.toString()}`);
  if (!r.ok) throw new Error(`Loki HTTP ${r.status}`);
  const j = await r.json();

  const out: LokiLine[] = [];
  for (const stream of j?.data?.result ?? []) {
    const labels = stream.stream ?? {};
    for (const [tsNs, line] of stream.values ?? []) {
      out.push({ tsMs: nsToMs(tsNs), labels, line });
    }
  }
  return out;
}
