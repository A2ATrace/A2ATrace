export type LokiLine = {
  tsMs: number;
  labels: Record<string, string>;
  line: string;
};

function nsToMs(ns: string): number {
  return Number(BigInt(ns) / 1_000_000n);
}

export async function fetchAgentLogs(
  serviceName: string,
  lookbackMin = 5,
  limit = 200
): Promise<LokiLine[]> {
  const end = Date.now();
  const start = end - lookbackMin * 60_000;
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
