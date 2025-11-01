import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import AgentCard from '../../components/agentcard/AgentCard';
import PageLayout from '../../components/layout/PageLayout';

const Dashboard = () => {
  const [agents, setAgents] = useState<string[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/logs/labels/service_name/values');
        const j = await r.json();
        setAgents((j?.data ?? []).sort());
      } catch {
        setAgents([]);
      } finally {
        setLoadingAgents(false);
      }
    }
    load();
  }, []);

  return (
    <PageLayout>
      <motion.div
        className='agent-wrapper'
        initial='hidden'
        animate='visible'
        variants={{
          visible: { transition: { staggerChildren: 0.2 } },
        }}
      >
        {loadingAgents && (
          <div className='dashboard-loading'>Loading agents…</div>
        )}

        {(agents.length ? agents : []).map((name) => (
          <AgentCard
            key={name}
            serviceName={name}
            lookbackMin={5}
            refreshMs={5000}
          />
        ))}
      </motion.div>
    </PageLayout>
  );
};

export default Dashboard;
