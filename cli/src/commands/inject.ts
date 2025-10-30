import fs from "fs-extra";
import path from "path";
import chalk from "chalk";
import { randomUUID } from "crypto";

/**
 * a2a inject
 * - Creates a local agent-card.json in the current agent folder for the user to edit in VS Code.
 * - Does NOT modify ~/.a2a/agents.json (that happens on `a2a link` after the user edits this file).
 */
export default async function inject() {
  const agentDir = process.cwd();

   if (typeof agentDir !== "string") {
    throw new TypeError(`Expected agentDir to be a string, got ${typeof agentDir}`);
  }
  const cardPath = path.join(agentDir, "agent-card.json");

  // Don't overwrite an existing card unless you later add a --force flag
  if (await fs.pathExists(cardPath)) {
    console.log(chalk.yellow("ℹ️ agent-card.json already exists in this folder — skipping"));
    console.log(chalk.blue("👉 Edit it in VS Code, then run `a2a link` to add/update the global registry."));
    return;
  }

  // Fully local boilerplate; users edit this, then `a2a link` consumes it.
  const boilerplate = {
    id: `agent://uuid/${randomUUID()}`,        // unique, stable per agent
    name: "YourAgent",                         // REQUIRED: change this before linking
    version: "0.1.0",                          // recommended semantic version
    description: "Short description of what this agent does.",
    // Optional: if your agent serves a live card endpoint, put it here.
    // If provided, `a2a link` will try fetching from this URL first.
    url: "",

    // What operations this agent exposes (free-form, used by your dashboard UX)
    methods: [
      // "plan",
      // "execute",
      // "report"
    ],

    // Human/declarative wiring for your relationship graph. Fill names (must match other agents' `name`)
    relationships: [
      // "WorkerAgent",
      // "ReporterAgent"
    ],

    // Optional: endpoints your dashboard/orchestrator might call directly
    endpoints: {
      // "plan": "http://localhost:3001/plan",
      // "execute": "http://localhost:3002/execute",
      // "report": "http://localhost:3003/report",
      // "agentCard": "http://localhost:3001/agent-card"
    },

    // Free-form tags/labels you can filter on in the UI
    labels: {
      // "team": "core",
      // "env": "dev"
    }
  };

  await fs.writeJson(cardPath, boilerplate, { spaces: 2 });
  console.log(chalk.green(`✅ Created agent-card.json in ${agentDir}`));
  console.log(chalk.blue("👉 Open this file in VS Code, update at least `name` (and anything else), then run `a2a link`."));
}
