import { useMemo, useState } from 'react';
import './statistics.scss';
import PageLayout from '../../components/layout/PageLayout';

type Dashboard = {
  uid: string;
  slug: string;
  title: string;
  path: string;
  panelId?: string;
};

// Use the provisioned dashboard UID/slug from Grafana provisioning (~/.a2a/grafana/provisioning/dashboards/a2a-overview.json)
// Path format:
//  - Full dashboard:   /grafana/d/<uid>/<slug>
//  - Single panel:     /grafana/d-solo/<uid>/<slug>?panelId=<id>
const DASHBOARDS: Dashboard[] = [
  {
    uid: 'a2a-overview',
    slug: 'a2a-overview',
    title: 'A2A Overview',
    path: 'd',
  },
  // Example single-panel embed (uncomment after you know a panelId)
  // { uid: 'a2a-overview', slug: 'a2a-overview', title: 'Spans Received (panel)', path: 'd-solo', panelId: '1' },
];
const GRAFANA_BASE = import.meta.env.VITE_GRAFANA_URL ?? '/grafana';

export default function Statistics() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [from, setFrom] = useState('now-15m'); // Changed from now-6h to show recent demo data
  const [to, setTo] = useState('now');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); // Match Grafana theme
  const [refresh, setRefresh] = useState('5s');
  const [orgId, setOrgId] = useState('1');
  const [agent, setAgent] = useState('');

  const selected = DASHBOARDS[selectedIdx];
  const src = useMemo(() => {
    const params = new URLSearchParams({
      kiosk: '1',
      theme,
      orgId,
      from,
      to,
      refresh,
    });
    if (agent) params.set('var-agent', agent);
    const pathPart = selected.slug
      ? `${selected.path}/${selected.uid}/${selected.slug}`
      : `${selected.path}/${selected.uid}`;
    const base = `${GRAFANA_BASE}/${pathPart}`;
    const panelId = selected.panelId;
    return selected.path === 'd-solo' && panelId
      ? `${base}?${params.toString()}&panelId=${panelId}`
      : `${base}?${params.toString()}`;
  }, [selectedIdx, theme, from, to, refresh, orgId, agent, selected]);

  return (
    <PageLayout>
      <div className='statistics-card'>
        <h1>Agent Statistics</h1>
        <div className='statistics-controls'>
          <label>
            Dashboard:&nbsp;
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
            >
              {DASHBOARDS.map((d, i) => (
                <option key={d.uid} value={i}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            From:&nbsp;
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder='now-6h'
            />
          </label>
          <label>
            To:&nbsp;
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder='now'
            />
          </label>
          <label>
            Refresh:&nbsp;
            <input
              value={refresh}
              onChange={(e) => setRefresh(e.target.value)}
              placeholder='5s'
              className='input-sm'
            />
          </label>
          <label>
            Theme:&nbsp;
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
            >
              <option value='light'>Light</option>
              <option value='dark'>Dark</option>
            </select>
          </label>
          <label>
            OrgId:&nbsp;
            <input
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className='input-xs'
            />
          </label>
          <label>
            Agent (var-agent):&nbsp;
            <input
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              placeholder='planner-agent'
              className='input-md'
            />
          </label>
        </div>
        <div className='statistics-iframe-wrapper'>
          <iframe
            title='Grafana Dashboard'
            src={src}
            frameBorder={0}
            allowFullScreen
          />
        </div>
      </div>
    </PageLayout>
  );
}
