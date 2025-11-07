import { useEffect, useState } from 'react';
import Navbar from '../../components/navbar/navbar';
import TitleNav from '../../components/titlenav/titlenav';
import './statistics.scss';

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
      .catch((err) => console.error('Failed to fetch Grafana URL:', err));
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

      <section className='dashboard-body-wrapper'>
        <div className='statistics-container'>
          <div className='statistics-header'>
            <h2>Agent Statistics</h2>
            <p>
              Paste the Grafana dashboard URL (Share → Link or Embed) and click
              Save. We'll remember it for next time.
            </p>
          </div>

          <div className='statistics-controls'>
            <input
              type='text'
              value={dashboardUrl}
              onChange={(e) => setDashboardUrl(e.target.value)}
              placeholder={
                grafanaBase
                  ? `${grafanaBase}/d/<uid>/<slug>`
                  : 'Grafana dashboard URL'
              }
            />
            <button onClick={saveUrl}>Save</button>
            {grafanaBase && (
              <a href={grafanaBase} target='_blank' rel='noreferrer'>
                Open Grafana
              </a>
            )}
          </div>

          {embedUrl ? (
            <iframe
              src={embedUrl}
              title='Grafana Dashboard'
              className='statistics-iframe'
            />
          ) : (
            <div className='statistics-loading'>
              Waiting for Grafana base URL…
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
