/**
 * CLI configuration
 */

import { Command } from "commander";
import { createInitCommand } from "./commands/init.js";
import { createDeployCommand } from "./commands/deploy.js";
import { createRemoveCommand } from "./commands/remove.js";
import { createStatusCommand } from "./commands/status.js";

/**
 * Create CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("scf-deploy")
    .description("S3 + CloudFront static deployment automation CLI")
    .version("0.1.0");

  // Add commands
  program.addCommand(createInitCommand());
  program.addCommand(createDeployCommand());
  program.addCommand(createRemoveCommand());
  program.addCommand(createStatusCommand());

  return program;
}
