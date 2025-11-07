import './dashboard.scss';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import AgentCard from '../../components/agentcard/agentcard';
import Navbar from '../../components/navbar/navbar';
import TitleNav from '../../components/titlenav/titlenav';
import SpansView from '../../components/metricsview/spansview';
import Modal from '../../components/modal/modal';
import type { AgentCard as AgentCardType } from '../../types';

const Dashboard = () => {
  const [agents, setAgents] = useState<AgentCardType[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentCardType | null>(
    null
  );

  useEffect(() => {
    async function fetchAgents() {
      const res = await fetch('/api/agents');
      const json = await res.json();
      setAgents(json.agents || []);
    }
    fetchAgents();
  }, []);

  return (
    <div className='dashboard-page'>
      <TitleNav />
      <Navbar />

      <section className='dashboard-body-wrapper'>
        <motion.div
          className='agent-wrapper'
          initial='hidden'
          animate='visible'
          variants={{
            visible: {
              transition: {
                staggerChildren: 0.2, // delay between cards
              },
            },
          }}
        >
          {agents.map((agent) => (
            <AgentCard
              key={agent.name}
              agent={agent}
              onClick={setSelectedAgent}
            />
          ))}
        </motion.div>
        {/* Moved signals into a modal per agent */}
        {selectedAgent && (
          <Modal
            title={selectedAgent.name}
            onClose={() => setSelectedAgent(null)}
          >
            <SpansView agentName={selectedAgent.name} />
          </Modal>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
