import React, { useEffect, useState } from "react";

export default function SignalsView() {
  const agentName = "Open-AI Q/A Agent"; // 👈 must match service.name from your Python agent
  const [traces, setTraces] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);

  // ---- Traces ----
  useEffect(() => {
    async function fetchTraces() {
      try {
        const res = await fetch(`/api/traces?agent=${encodeURIComponent(agentName)}&limit=5`);
        const json = await res.json();
        console.log("Traces response:", json);
        setTraces(json.traces || []); // Tempo search returns {traces: []}
      } catch (err) {
        console.error("❌ Failed to fetch traces:", err);
      }
    }
    fetchTraces();
    const interval = setInterval(fetchTraces, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---- Metrics ----
  useEffect(() => {
    async function fetchMetrics() {
      try {
        // Example: count of requests received by this agent
        const query = `questions_total{service_name="${agentName}"}`;
        const res = await fetch(`/api/metrics?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setMetrics(JSON.stringify(json, null, 2));
      } catch (err) {
        setMetrics("❌ Failed to fetch metrics: " + err);
      }
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---- Logs ----
  useEffect(() => {
    async function fetchLogs() {
      try {
        const query = `{service_name="${agentName}"}`;
        const res = await fetch(`/api/logs?q=${encodeURIComponent(query)}`);
        const json = await res.json();

        const streams = json.data?.result || [];
        const lines: string[] = [];
        streams.forEach((s: any) => {
          (s.values || []).forEach((v: [string, string]) => {
            lines.push(v[1]);
          });
        });
        setLogs(lines);
      } catch (err) {
        console.error("❌ Failed to fetch logs:", err);
      }
    }
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: "1rem", fontFamily: "sans-serif" }}>
      <h2>📡 Traces (recent)</h2>
      <pre>{traces.length ? JSON.stringify(traces, null, 2) : "No traces yet"}</pre>

      <h2>📊 Metrics</h2>
      <pre>{metrics || "Loading metrics..."}</pre>

      <h2>📝 Logs</h2>
      {logs.length === 0 && <p>No logs yet...</p>}
      <ul>{logs.map((line, i) => <li key={i}>{line}</li>)}</ul>
    </div>
  );
}
