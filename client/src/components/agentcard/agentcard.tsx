import './agentcard.scss';
import { motion } from 'framer-motion';

type Agent = {
  name?: string;
  version?: string;
  description?: string;
  methods?: string[];
  endpoints?: Record<string, string>;
  labels?: Record<string, string>;
};

type Props = {
  agent: Agent;
  onClick?: (agent: Agent) => void;
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
          <h2 className='card-description'>{agent.description}</h2>
          <h2>Methods:</h2>
          {methods.map((method: string) => (
            <h2>{method}</h2>
          ))}
          <ul>
            {endpointEntries.map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
          <ul>
            {labelEntries.map(([key, value]) => (
              <li key={key}>
                {key}: {value}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </motion.section>
  );
};

export default AgentCard;
