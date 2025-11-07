import fs from 'fs-extra';
import chalk from 'chalk';
import Table from 'cli-table3';
import { REGISTRY_PATH } from '../config.js';
import type { AgentCard } from '../types.js';

export default async function agents() {
  if (!(await fs.pathExists(REGISTRY_PATH))) {
    console.log(
      chalk.yellow(
        'ℹ️ No agents linked yet. Run `a2a link` inside an agent folder.'
      )
    );
    return;
  }

  const registry = (await fs.readJson(REGISTRY_PATH)) as AgentCard[];

  if (!registry.length) {
    console.log(chalk.yellow('ℹ️ No agents found in registry.'));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan('ID'),
      chalk.cyan('Name'),
      chalk.cyan('Version'),
      chalk.cyan('Methods'),
      chalk.cyan('Endpoints'),
    ],
    colWidths: [30, 20, 10, 25, 40],
    wordWrap: true,
  });

  registry.forEach((agent: AgentCard) => {
    table.push([
      agent.id || '—',
      agent.name || '—',
      agent.version || '—',
      (agent.methods || []).join(', '),
      agent.endpoints
        ? Object.entries(agent.endpoints)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n')
        : '—',
    ]);
  });

  console.log(chalk.green('📒 Linked Agents:'));
  console.log(table.toString());
}
