import './agentcard.scss';
import { motion } from 'framer-motion';
import type { AgentCard as AgentCardType } from '../../types';

type Props = {
  agent: AgentCardType;
  onClick?: (agent: AgentCardType) => void;
};

const AgentCard = ({ agent, onClick }: Props) => {
  const cardVariants = {
    hidden: { opacity: 0, x: -3 },
    visible: { opacity: 1, x: 0 },
  };

  const methods = agent.methods ?? [];
  const endpointEntries = Object.entries(agent.endpoints ?? {});
  const labelEntries = Object.entries(agent.labels ?? {});

  return (
    <motion.section
      className='agent-card-outer'
      variants={cardVariants}
      transition={{
        duration: 0.6,
      }}
    >
      <motion.div
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.1, ease: 'linear' }} // Hover animation
        className='agent-card-wrapper'
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        onClick={() => onClick?.(agent)}
      >
        <div className='agent-header'>
          <h2>
            {agent.name} : {agent.version}
          </h2>
          <div className='agent-status'>
            <span>Online</span>
            <span className='status-dot online pulse'></span>
          </div>
        </div>

        <div className='agent-body'>
          <p className='card-description'>{agent.description}</p>

          {methods.length > 0 && (
            <div className='card-section'>
              <h3 className='section-title'>Methods</h3>
              <div className='method-badges'>
                {methods.map((method: string, idx: number) => (
                  <span key={idx} className='method-badge'>
                    {method}
                  </span>
                ))}
              </div>
            </div>
          )}

          {labelEntries.length > 0 && (
            <div className='card-section'>
              <h3 className='section-title'>Labels</h3>
              <div className='label-tags'>
                {labelEntries.map(([key, value]) => (
                  <span key={key} className='label-tag'>
                    <span className='label-key'>{key}:</span> {value}
                  </span>
                ))}
              </div>
            </div>
          )}

          {endpointEntries.length > 0 && (
            <div className='card-section endpoints'>
              <h3 className='section-title'>Endpoints</h3>
              <ul className='endpoint-list'>
                {endpointEntries.map(([key, value]) => (
                  <li key={key}>
                    <span className='endpoint-key'>{key}</span>
                    <span className='endpoint-value'>{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    </motion.section>
  );
};

export default AgentCard;
