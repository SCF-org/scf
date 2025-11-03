/**
 * CLI configuration
 */

import { Command } from "commander";
import { createInitCommand } from "./commands/init.js";
import { createDeployCommand } from "./commands/deploy.js";
import { createRemoveCommand } from "./commands/remove.js";
import { createStatusCommand } from "./commands/status.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get package version
 */
function getVersion(): string {
  try {
    const packageJsonPath = join(__dirname, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Create CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("scf-deploy")
    .description("S3 + CloudFront static deployment automation CLI")
    .version(getVersion());

  // Add commands
  program.addCommand(createInitCommand());
  program.addCommand(createDeployCommand());
  program.addCommand(createRemoveCommand());
  program.addCommand(createStatusCommand());

  return program;
}
