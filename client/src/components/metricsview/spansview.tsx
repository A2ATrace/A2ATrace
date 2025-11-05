import React, { useEffect, useMemo, useState } from 'react';

type AgentMetrics = { agent: string; metrics: any };
type AgentLogs = { agent: string; logs: any };
type AgentTraces = { agent: string; traces: any };

export default function SignalsView({ agentName }: { agentName?: string }) {
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [logs, setLogs] = useState<AgentLogs[]>([]);
  const [traces, setTraces] = useState<AgentTraces[]>([]);

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

  const logItems = useMemo(() => {
    const items = pickAgent(logs);
    const flattened: { ts: string; msg: string; level?: string }[] = [];
    items.forEach((l) => {
      const streams = l.logs?.data?.result ?? [];
      streams.forEach((s: any) => {
        const level = s.stream?.level || s.stream?.severity;
        (s.values || []).forEach((v: [string, string]) => {
          let text = v[1];
          try {
            const obj = JSON.parse(text);
            text = obj.body || obj.message || text;
          } catch {}
          flattened.push({ ts: v[0], msg: text, level });
        });
      });
    });
    flattened.sort((a, b) => (a.ts > b.ts ? -1 : 1));
    return flattened.slice(0, 10);
  }, [logs, agentName]);

  const traceSummary = useMemo(() => {
    const items = pickAgent(traces);
    const all: any[] = [];
    items.forEach((t) => {
      const arr = t.traces?.traces || t.traces || [];
      arr.forEach((x: any) => all.push(x));
    });
    all.sort((a, b) => (a.startTimeUnixNano > b.startTimeUnixNano ? -1 : 1));
    const latest = all.slice(0, 5);
    const count = all.length;
    const avgMs = count
      ? Math.round(
          (all.reduce((s, x) => s + (x.durationMs || 0), 0) / count) * 10
        ) / 10
      : 0;
    return { count, avgMs, latest };
  }, [traces, agentName]);

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
              {l.level ? ` [${l.level}]` : ''} — {l.msg}
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
