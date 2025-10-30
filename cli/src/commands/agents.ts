import fs from "fs-extra";
import path from "path";
import os from "os";
import chalk from "chalk";
import Table from "cli-table3"; // npm install cli-table3

const REGISTRY_PATH = path.join(os.homedir(), ".a2a", "agents.json");

export default async function agents() {
  if (!(await fs.pathExists(REGISTRY_PATH))) {
    console.log(chalk.yellow("ℹ️ No agents linked yet. Run `a2a link` inside an agent folder."));
    return;
  }

  const registry = await fs.readJson(REGISTRY_PATH);

  if (!registry.length) {
    console.log(chalk.yellow("ℹ️ No agents found in registry."));
    return;
  }

  const table = new Table({
    head: [
      chalk.cyan("ID"),
      chalk.cyan("Name"),
      chalk.cyan("Version"),
      chalk.cyan("Methods"),
      chalk.cyan("Endpoints")
    ],
    colWidths: [30, 20, 10, 25, 40],
    wordWrap: true
  });

  registry.forEach((agent: any) => {
    table.push([
      agent.id || "—",
      agent.name || "—",
      agent.version || "—",
      (agent.methods || []).join(", "),
      agent.endpoints
        ? Object.entries(agent.endpoints)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")
        : "—"
    ]);
  });

  console.log(chalk.green("📒 Linked Agents:"));
  console.log(table.toString());
}
