import React, { useEffect, useState } from 'react';
import Navbar from '../../components/navbar/navbar';
import TitleNav from '../../components/titlenav/titlenav';

const LOCAL_KEY = 'a2a.grafana.dashboardUrl';

export default function Statistics() {
  const [grafanaBase, setGrafanaBase] = useState<string>('');
  const [dashboardUrl, setDashboardUrl] = useState<string>('');

  useEffect(() => {
    // Load persisted dashboard URL if any
    const saved = localStorage.getItem(LOCAL_KEY) || '';
    setDashboardUrl(saved);

    // Fetch Grafana base URL from backend
    fetch('/api/grafana')
      .then((r) => r.json())
      .then((j) => setGrafanaBase(j.baseUrl))
      .catch(() => {});
  }, []);

  function saveUrl() {
    localStorage.setItem(LOCAL_KEY, dashboardUrl);
  }

  // Build embed URL using the current Grafana base (dynamic port)
  let embedUrl = '';
  try {
    if (dashboardUrl) {
      if (dashboardUrl.startsWith('http')) {
        const pasted = new URL(dashboardUrl);
        const base = grafanaBase ? new URL(grafanaBase) : null;
        if (base) {
          embedUrl = `${base.origin}${pasted.pathname}${pasted.search}${pasted.hash}`;
        } else {
          embedUrl = dashboardUrl;
        }
      } else if (grafanaBase) {
        embedUrl = new URL(dashboardUrl, grafanaBase).toString();
      }
    } else if (grafanaBase) {
      embedUrl = `${grafanaBase}/dashboards`;
    }
  } catch {
    embedUrl = dashboardUrl || (grafanaBase ? `${grafanaBase}/dashboards` : '');
  }

  return (
    <div className='dashboard-page'>
      <TitleNav />
      <Navbar />

      <section
        className='dashboard-body-wrapper'
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1rem',
        }}
      >
        <div>
          <h2>Agent Statistics</h2>
          <p style={{ color: '#aaa' }}>
            Paste the Grafana dashboard URL (Share → Link or Embed) and click
            Save. We’ll remember it for next time.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type='text'
              value={dashboardUrl}
              onChange={(e) => setDashboardUrl(e.target.value)}
              placeholder={
                grafanaBase
                  ? `${grafanaBase}/d/<uid>/<slug>`
                  : 'Grafana dashboard URL'
              }
              style={{ flex: 1, padding: '0.5rem' }}
            />
            <button onClick={saveUrl} style={{ padding: '0.5rem 1rem' }}>
              Save
            </button>
            {grafanaBase && (
              <a
                href={grafanaBase}
                target='_blank'
                rel='noreferrer'
                style={{ padding: '0.5rem 1rem' }}
              >
                Open Grafana
              </a>
            )}
          </div>
        </div>

        {embedUrl ? (
          <iframe
            src={embedUrl}
            title='Grafana Dashboard'
            style={{
              width: '100%',
              height: '75vh',
              border: '1px solid #333',
              borderRadius: 8,
            }}
          />
        ) : (
          <div style={{ color: '#ccc' }}>Waiting for Grafana base URL…</div>
        )}
      </section>
    </div>
  );
}
