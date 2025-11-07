import { useEffect, useMemo, useState } from 'react';
import './spansview.scss';
import type {
  AgentMetrics,
  AgentLogs,
  AgentTraces,
  LogEntry,
  TraceData,
} from '../../types';

const POLLING_INTERVAL_MS = 20000; // Poll every 20 seconds

export default function SignalsView({ agentName }: { agentName?: string }) {
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [logs, setLogs] = useState<AgentLogs[]>([]);
  const [traces, setTraces] = useState<AgentTraces[]>([]);

  // Accumulated history for display
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [allTraces, setAllTraces] = useState<TraceData[]>([]);

  // ---- Metrics ----
  const fetchMetrics = async () => {
    const res = await fetch('/api/metrics');
    const json = await res.json();
    setMetrics(json.agents || []);
  };
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---- Logs ----
  const fetchLogs = async () => {
    const res = await fetch('/api/logs');
    const json = await res.json();
    setLogs(json.agents || []);
  };
  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, POLLING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---- Traces ----
  const fetchTraces = async () => {
    const res = await fetch('/api/traces');
    const json = await res.json();
    setTraces(json.agents || []);
  };
  useEffect(() => {
    fetchTraces();
    const interval = setInterval(fetchTraces, POLLING_INTERVAL_MS);
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
      const total = res.reduce((acc: number, it) => {
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
      streams.forEach((s) => {
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
    const newTraces: TraceData[] = [];
    items.forEach((t) => {
      const arr = t.traces?.traces || [];
      if (Array.isArray(arr)) {
        arr.forEach((x) => newTraces.push(x));
      }
    });

    if (newTraces.length > 0) {
      // Fetch trace details to get question and answer attributes
      const fetchTraceDetails = async () => {
        const enrichedTraces = await Promise.all(
          newTraces.map(async (trace) => {
            try {
              const res = await fetch(`/api/traces/${trace.traceID}`);
              const details = await res.json();

              // Extract attributes from the trace
              let question = '';
              let answer = '';

              if (
                details.batches?.[0]?.scopeSpans?.[0]?.spans?.[0]?.attributes
              ) {
                const attrs =
                  details.batches[0].scopeSpans[0].spans[0].attributes;
                const questionAttr = attrs.find(
                  (a: { key: string; value: { stringValue?: string } }) =>
                    a.key === 'user.question'
                );
                const answerAttr = attrs.find(
                  (a: { key: string; value: { stringValue?: string } }) =>
                    a.key === 'response.answer_preview'
                );

                if (questionAttr?.value?.stringValue) {
                  question = questionAttr.value.stringValue;
                }
                if (answerAttr?.value?.stringValue) {
                  answer = answerAttr.value.stringValue;
                }
              }

              return { ...trace, question, answer };
            } catch (err) {
              return trace;
            }
          })
        );

        setAllTraces((prev) => {
          // Merge new traces with existing, remove duplicates by traceId
          const merged = [...prev, ...enrichedTraces];
          const unique = Array.from(
            new Map(merged.map((trace) => [trace.traceID, trace])).values()
          );
          unique.sort((a, b) =>
            a.startTimeUnixNano > b.startTimeUnixNano ? -1 : 1
          );
          return unique.slice(0, 10);
        });
      };

      fetchTraceDetails();
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
    <div className='signals-view'>
      <h2>📊 Metrics</h2>
      {metricSummary.map((m, i) => (
        <div key={i} className='metric-item'>
          <strong>{m.agent}</strong>: total questions ={' '}
          <strong>{m.total}</strong>
        </div>
      ))}

      <h2>📝 Logs (latest 10)</h2>
      {logItems.length ? (
        <ul>
          {logItems.map((l, i) => (
            <li key={i}>
              <span className='timestamp'>{nsToLocalTime(l.ts)}</span>
              {' — '}
              <strong>Q:</strong> {l.question}
              {l.latency && <span className='latency'>({l.latency} ms)</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p>No recent logs…</p>
      )}

      <h2>📡 Traces</h2>
      <div className='trace-summary'>
        Total: <strong>{traceSummary.count}</strong> · Avg duration:{' '}
        <strong>{traceSummary.avgMs} ms</strong>
      </div>
      {traceSummary.latest.length ? (
        <ul>
          {traceSummary.latest.map((t, i: number) => (
            <li key={i}>
              <span className='timestamp'>
                {nsToLocalTime(t.startTimeUnixNano)}
              </span>
              {` — ${t.rootTraceName || 'trace'} (${t.durationMs ?? '?'} ms)`}
              {t.question && (
                <div className='trace-details'>
                  <strong>Q:</strong> {t.question}
                </div>
              )}
              {t.answer && (
                <div className='trace-details'>
                  <strong>A:</strong> {t.answer}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No recent traces…</p>
      )}
    </div>
  );
}
