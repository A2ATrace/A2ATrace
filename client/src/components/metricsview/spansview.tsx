import React, { useEffect, useMemo, useState } from 'react';

type AgentMetrics = { agent: string; metrics: any };
type AgentLogs = { agent: string; logs: any };
type AgentTraces = { agent: string; traces: any };

export default function SignalsView({ agentName }: { agentName?: string }) {
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [logs, setLogs] = useState<AgentLogs[]>([]);
  const [traces, setTraces] = useState<AgentTraces[]>([]);

  // Accumulated history for display
  const [allLogs, setAllLogs] = useState<
    { ts: string; msg: string; level?: string; traceId?: string }[]
  >([]);
  const [allTraces, setAllTraces] = useState<any[]>([]);

  // ---- Metrics ----
  const fetchMetrics = async () => {
    const res = await fetch('/api/metrics');
    const json = await res.json();
    console.log('METRICS', json);
    setMetrics(json.agents || []);
  };
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 20000);
    return () => clearInterval(interval);
  }, []);

  // ---- Logs ----
  const fetchLogs = async () => {
    const res = await fetch('/api/logs');
    const json = await res.json();
    console.log('LOGS', json);
    setLogs(json.agents || []);
  };
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 20000);
    return () => clearInterval(interval);
  }, []);

  // ---- Traces ----
  const fetchTraces = async () => {
    const res = await fetch('/api/traces');
    const json = await res.json();
    console.log('TRACES', json);
    setTraces(json.agents || []);
  };
  useEffect(() => {
    fetchTraces();
    const interval = setInterval(fetchTraces, 20000);
    return () => clearInterval(interval);
  }, []);

  // Helpers moved outside of JSX
  const nsToLocalTime = (ns: string): string => {
    if (!ns) return '';
    if (ns.length > 6) {
      const ms = Number(ns.slice(0, -6));
      return new Date(ms).toLocaleTimeString();
    }
    const ms = Math.floor(Number(ns) / 1e6);
    return new Date(ms).toLocaleTimeString();
  };

  function pickAgent<T extends { agent: string }>(arr: T[]) {
    return agentName ? arr.filter((x) => x.agent === agentName) : arr;
  }

  const metricSummary = useMemo(() => {
    const items = pickAgent(metrics);
    return items.map((m) => {
      const res = m.metrics?.data?.result ?? [];
      const total = res.reduce((acc: number, it: any) => {
        const val = parseFloat(it.value?.[1] ?? '0');
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      return { agent: m.agent, total };
    });
  }, [metrics, agentName]);

  // Process and accumulate new logs
  useEffect(() => {
    const items = pickAgent(logs);
    const flattened: {
      ts: string;
      msg: string;
      level?: string;
      traceId?: string;
    }[] = [];
    items.forEach((l) => {
      const streams = l.logs?.data?.result ?? [];
      streams.forEach((s: any) => {
        const level = s.stream?.level || s.stream?.severity;
        (s.values || []).forEach((v: [string, string]) => {
          let text = v[1];
          let traceId: string | undefined;
          try {
            const obj = JSON.parse(text);
            text = obj.body || obj.message || text;
            traceId = obj.traceid;
          } catch {}
          flattened.push({ ts: v[0], msg: text, level, traceId });
        });
      });
    });

    if (flattened.length > 0) {
      setAllLogs((prev) => {
        // Merge new logs with existing, remove duplicates by timestamp
        const merged = [...prev, ...flattened];
        const unique = Array.from(
          new Map(merged.map((log) => [log.ts, log])).values()
        );
        unique.sort((a, b) => (a.ts > b.ts ? -1 : 1));
        return unique.slice(0, 30); // Keep more logs to group by trace
      });
    }
  }, [logs, agentName]);

  // Group logs by trace ID to show question + answer together
  const logItems = useMemo(() => {
    const grouped = new Map<
      string,
      { question?: string; latency?: string; ts: string }
    >();

    allLogs.forEach((log) => {
      if (!log.traceId) return;

      const existing = grouped.get(log.traceId) || { ts: log.ts };

      if (log.msg.includes('Received question:')) {
        existing.question = log.msg.replace(
          'INFO:agent:Received question: ',
          ''
        );
      } else if (log.msg.includes('Answer produced in')) {
        const match = log.msg.match(/Answer produced in ([\d.]+) ms/);
        if (match) {
          existing.latency = match[1];
        }
      }

      grouped.set(log.traceId, existing);
    });

    // Convert to array and sort by timestamp
    const result = Array.from(grouped.entries())
      .filter(([_, data]) => data.question) // Only show entries with questions
      .map(([traceId, data]) => ({ traceId, ...data }))
      .sort((a, b) => (a.ts > b.ts ? -1 : 1))
      .slice(0, 10);

    return result;
  }, [allLogs]);

  // Process and accumulate new traces
  useEffect(() => {
    const items = pickAgent(traces);
    const newTraces: any[] = [];
    items.forEach((t) => {
      const arr = t.traces?.traces || t.traces || [];
      arr.forEach((x: any) => newTraces.push(x));
    });

    if (newTraces.length > 0) {
      setAllTraces((prev) => {
        // Merge new traces with existing, remove duplicates by traceId
        const merged = [...prev, ...newTraces];
        const unique = Array.from(
          new Map(merged.map((trace) => [trace.traceId, trace])).values()
        );
        unique.sort((a, b) =>
          a.startTimeUnixNano > b.startTimeUnixNano ? -1 : 1
        );
        return unique.slice(0, 10);
      });
    }
  }, [traces, agentName]);

  const traceSummary = useMemo(() => {
    const count = allTraces.length;
    const avgMs = count
      ? Math.round(
          (allTraces.reduce((s, x) => s + (x.durationMs || 0), 0) / count) * 10
        ) / 10
      : 0;
    const latest = allTraces.slice(0, 5);
    return { count, avgMs, latest };
  }, [allTraces]);

  return (
    <div style={{ padding: '0.5rem 0', fontFamily: 'sans-serif' }}>
      <h2>📊 Metrics</h2>
      {metricSummary.map((m, i) => (
        <div key={i} style={{ marginBottom: '0.5rem' }}>
          <strong>{m.agent}</strong>: total questions ={' '}
          <strong>{m.total}</strong>
        </div>
      ))}

      <h2>📝 Logs (latest 10)</h2>
      {logItems.length ? (
        <ul>
          {logItems.map((l, i) => (
            <li key={i}>
              <span style={{ opacity: 0.8 }}>{nsToLocalTime(l.ts)}</span>
              {' — '}
              <strong>Q:</strong> {l.question}
              {l.latency && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                  ({l.latency} ms)
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No recent logs…</p>
      )}

      <h2>📡 Traces</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        Total: <strong>{traceSummary.count}</strong> · Avg duration:{' '}
        <strong>{traceSummary.avgMs} ms</strong>
      </div>
      {traceSummary.latest.length ? (
        <ul>
          {traceSummary.latest.map((t: any, i: number) => (
            <li key={i}>
              <span style={{ opacity: 0.8 }}>
                {nsToLocalTime(t.startTimeUnixNano)}
              </span>
              {` — ${t.rootTraceName || 'trace'} (${t.durationMs ?? '?'} ms)`}
            </li>
          ))}
        </ul>
      ) : (
        <p>No recent traces…</p>
      )}
    </div>
  );
}
