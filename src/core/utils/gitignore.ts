/**
 * Gitignore utility
 * Automatically manages .gitignore to exclude .deploy directory
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

/**
 * Check if .gitignore contains .deploy entry
 */
function hasDeployEntry(gitignorePath: string): boolean {
  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const lines = content.split("\n");

    // Check for exact match or pattern match
    return lines.some((line) => {
      const trimmed = line.trim();
      return (
        trimmed === ".deploy" ||
        trimmed === ".deploy/" ||
        trimmed === "/.deploy" ||
        trimmed === "/.deploy/"
      );
    });
  } catch {
    return false;
  }
}

/**
 * Ensure .deploy is in .gitignore
 *
 * @param cwd - Current working directory
 * @param silent - Don't show success message
 * @returns true if modified, false if already exists
 */
export function ensureDeployInGitignore(
  cwd: string = process.cwd(),
  silent: boolean = false
): boolean {
  const gitignorePath = join(cwd, ".gitignore");
  const gitDir = join(cwd, ".git");

  // Skip if not a git repository
  if (!existsSync(gitDir)) {
    return false;
  }

  // Create .gitignore if it doesn't exist
  if (!existsSync(gitignorePath)) {
    const content = `# SCF Deploy state (local deployment tracking)\n.deploy/\n`;
    writeFileSync(gitignorePath, content, "utf-8");

    if (!silent) {
      console.log(chalk.green("✓ Created .gitignore and added .deploy/"));
    }
    return true;
  }

  // Check if .deploy is already in .gitignore
  if (hasDeployEntry(gitignorePath)) {
    return false;
  }

  // Add .deploy to .gitignore
  const entry = "\n# SCF Deploy state (local deployment tracking)\n.deploy/\n";
  appendFileSync(gitignorePath, entry, "utf-8");

  if (!silent) {
    console.log(chalk.green("✓ Added .deploy/ to .gitignore"));
  }

  return true;
}

/**
 * Check if .deploy directory should be in .gitignore
 *
 * @param cwd - Current working directory
 * @returns Warning message if .deploy is not in .gitignore, null otherwise
 */
export function checkGitignoreWarning(cwd: string = process.cwd()): string | null {
  const gitignorePath = join(cwd, ".gitignore");
  const gitDir = join(cwd, ".git");
  const deployDir = join(cwd, ".deploy");

  // Skip if not a git repository
  if (!existsSync(gitDir)) {
    return null;
  }

  // Skip if .deploy doesn't exist yet
  if (!existsSync(deployDir)) {
    return null;
  }

  // Check if .gitignore exists and has .deploy entry
  if (!existsSync(gitignorePath) || !hasDeployEntry(gitignorePath)) {
    return (
      `${chalk.yellow("⚠ Warning:")} ${chalk.cyan(".deploy/")} directory is not in ${chalk.cyan(".gitignore")}\n` +
      `\n` +
      `The .deploy directory contains local deployment state and should not be committed.\n` +
      `\n` +
      `To fix this, add the following to your .gitignore:\n` +
      `  ${chalk.cyan(".deploy/")}\n` +
      `\n` +
      `Or run: ${chalk.cyan("npx scf-deploy init")}`
    );
  }

  return null;
}
