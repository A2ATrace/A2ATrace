// src/components/metricsview/MetricsView.tsx
import { useEffect, useState } from "react";

const MetricsView = () => {
  const [metrics, setMetrics] = useState("");

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/metrics");
        const text = await res.text();
        setMetrics(text);
      } catch (err) {
        setMetrics("❌ Failed to fetch metrics: " + err);
      }
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="metrics-view">
      <h2>📊 Metrics (Prometheus)</h2>
      <pre>{metrics}</pre>
    </div>
  );
};

export default MetricsView;
