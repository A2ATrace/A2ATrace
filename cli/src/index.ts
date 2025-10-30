#!/usr/bin/env node
import { Command } from "commander";
import init from "./commands/init.js";
import inject from "./commands/inject.js";
import link from "./commands/link.js";
import agents from "./commands/agents.js"
import startDashboard from "./commands/start-dashboard.js";

const program = new Command();

program
  .name("a2a")
  .description("A2A Agent Telemetry CLI")
  .version("0.1.0");

program.command("init")
  .description("Initialize local A2A telemetry environment")
  .action(init);

program.command("link")
  .description("Link current project as an A2A agent (uses agent-card.json)")
  .action(link);

program.command("inject")
  .description("Injecting relevant files for agent linking")
  .action(inject);

program.command("agents")
  .description("Showing current agent registry")
  .action(agents)

program.command("start-dashboard")
  .description("Start local telemetry stack (collector, Prometheus, Loki, Tempo, dashboard)")
  .action(startDashboard);

program.parse();
