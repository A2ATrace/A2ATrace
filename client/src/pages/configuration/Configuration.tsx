import PageLayout from '../../components/layout/PageLayout';
import './configuration.scss';

const Configuration = () => {
  return (
    <PageLayout>
      <div className='configuration-container'>
        <h1>⚙️ Configuration</h1>
        <div className='coming-soon-card'>
          <h2>Coming Soon</h2>
          <p>The configuration page will allow you to:</p>
          <ul>
            <li>View and edit global telemetry settings</li>
            <li>Manage agent configurations</li>
            <li>Configure data retention policies</li>
            <li>Set alert thresholds</li>
            <li>Customize dashboard preferences</li>
          </ul>
          <p className='note'>
            For now, you can edit configuration files directly:
          </p>
          <ul>
            <li>
              <code>~/.a2a/config.json</code> - Global telemetry configuration
            </li>
            <li>
              <code>.a2a.config.json</code> - Per-agent configuration
            </li>
          </ul>
        </div>
      </div>
    </PageLayout>
  );
};

export default Configuration;
