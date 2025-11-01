import PageLayout from '../../components/layout/PageLayout';
import './visualizer.scss';

const Visualizer = () => {
  return (
    <PageLayout>
      <div className='visualizer-container'>
        <h1>🔗 Relationship Visualizer</h1>
        <div className='coming-soon-card'>
          <h2>Coming Soon</h2>
          <p>The relationship visualizer will provide:</p>
          <ul>
            <li>Interactive graph of agent connections</li>
            <li>Real-time message flow visualization</li>
            <li>Communication pattern analysis</li>
            <li>Bottleneck detection</li>
            <li>Agent dependency mapping</li>
            <li>Network topology view</li>
          </ul>
          <p className='note'>
            In the meantime, you can explore traces in Grafana to see
            agent-to-agent communication patterns:
          </p>
          <a
            href='/grafana/explore'
            target='_blank'
            rel='noopener noreferrer'
            className='grafana-link'
          >
            Open Grafana Explore →
          </a>
        </div>
      </div>
    </PageLayout>
  );
};

export default Visualizer;
