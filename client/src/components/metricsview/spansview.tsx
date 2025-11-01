import React, { useEffect, useState } from "react";

export default function SignalsView() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [traces, setTraces] = useState<any[]>([]);

  // ---- Metrics ----
  useEffect(() => {
    async function fetchMetrics() {
      const res = await fetch("/api/metrics");
      const json = await res.json();
      console.log("METRICS", json)
      setMetrics(json.agents || []);
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 20000);
    return () => clearInterval(interval);
  }, []);

  // ---- Logs ----
  useEffect(() => {
    async function fetchLogs() {
      const res = await fetch("/api/logs");
      const json = await res.json();
      console.log("LOGS", json)
      setLogs(json.agents || []);
    }
    fetchLogs();
    const interval = setInterval(fetchLogs, 20000);
    return () => clearInterval(interval);
  }, []);

  // ---- Traces ----
  useEffect(() => {
    async function fetchTraces() {
      const res = await fetch("/api/traces");
      const json = await res.json();
      console.log("TRACES", json)
      setTraces(json.agents || []);
    }
    fetchTraces();
    const interval = setInterval(fetchTraces, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h2>📊 Metrics</h2>
      {metrics.map((m, i) => (
        <div key={i}>
          <h3>{m.agent}</h3>
          <pre>{JSON.stringify(m.metrics, null, 2)}</pre>
        </div>
      ))}

      <h2>📝 Logs</h2>
      {logs.map((l, i) => (
        <div key={i}>
          <h3>{l.agent}</h3>
          {l.logs?.data?.result?.length ? (
            <ul>
              {l.logs.data.result.map((stream: any, j: number) =>
                stream.values.map((v: [string, string], k: number) => (
                  <li key={`${i}-${j}-${k}`}>{v[1]}</li>
                ))
              )}
            </ul>
          ) : (
            <p>No logs yet...</p>
          )}
        </div>
      ))}

      <h2>📡 Traces</h2>
      {traces.map((t, i) => (
        <div key={i}>
          <h3>{t.agent}</h3>
          <pre>{JSON.stringify(t.traces, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}
