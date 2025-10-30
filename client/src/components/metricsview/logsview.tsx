import { useEffect, useState } from "react";

const LogsView = () => {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch("/api/logs");
        const data = await res.json();

        console.log("📥 Loki raw response:", data);

        // Loki structure: data.data.result[*].values
        const results = data?.data?.result || [];
        const parsed = results
          .map((r: any) =>
            r.values.map((v: any) => ({
              ts: v[0],
              msg: v[1],
            }))
          )
          .flat();

        setLogs(parsed);
      } catch (err) {
        console.error("❌ Failed to fetch logs:", err);
      }
    }
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="logs-view">
      <h2>📝 Logs (Loki)</h2>
      {logs.length === 0 && <p>No logs yet...</p>}
      <ul>
        {logs.map((log, i) => (
          <li key={i}>
            <strong>{new Date(Number(log.ts) / 1e6).toLocaleTimeString()}</strong>{" "}
            - {log.msg}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LogsView;
