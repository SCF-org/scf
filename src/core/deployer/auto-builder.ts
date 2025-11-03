/**
 * Auto-build utility
 * Automatically detects and runs build scripts before deployment
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import chalk from "chalk";
import ora, { type Ora } from "ora";

/**
 * Package manager types
 */
type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Detect package manager
 */
function detectPackageManager(cwd: string = process.cwd()): PackageManager {
  // Check for lock files
  if (existsSync(join(cwd, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  // Default to npm
  return "npm";
}

/**
 * Check if package.json has build script
 */
function hasBuildScript(cwd: string = process.cwd()): boolean {
  try {
    const packageJsonPath = join(cwd, "package.json");

    if (!existsSync(packageJsonPath)) {
      return false;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    return !!(packageJson.scripts && packageJson.scripts.build);
  } catch {
    return false;
  }
}

/**
 * Run build command
 */
async function runBuild(
  packageManager: PackageManager,
  cwd: string = process.cwd()
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = packageManager;
    const args = ["run", "build"];

    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to start build process: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build process exited with code ${code}`));
      }
    });
  });
}

/**
 * Auto-build options
 */
export interface AutoBuildOptions {
  /** Current working directory */
  cwd?: string;
  /** Show progress spinner */
  showProgress?: boolean;
  /** Skip build even if build script exists */
  skipBuild?: boolean;
}

/**
 * Automatically build project before deployment
 *
 * @param options Auto-build options
 * @returns true if built, false if skipped
 */
export async function autoBuild(
  options: AutoBuildOptions = {}
): Promise<boolean> {
  const { cwd = process.cwd(), showProgress = true, skipBuild = false } = options;

  // Check if build should be skipped
  if (skipBuild) {
    return false;
  }

  // Check if package.json has build script
  if (!hasBuildScript(cwd)) {
    if (showProgress) {
      console.log(chalk.gray("ℹ No build script found in package.json, skipping build..."));
      console.log();
    }
    return false;
  }

  // Detect package manager
  const packageManager = detectPackageManager(cwd);

  let spinner: Ora | null = null;

  if (showProgress) {
    console.log();
    console.log(chalk.bold.cyan("🔨 Building project..."));
    console.log();
    console.log(chalk.gray(`Running: ${chalk.cyan(`${packageManager} run build`)}`));
    console.log();
  }

  try {
    // Run build
    await runBuild(packageManager, cwd);

    if (showProgress) {
      console.log();
      console.log(chalk.green("✓ Build completed successfully!"));
      console.log();
    }

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (showProgress) {
      console.log();
      console.log(chalk.red("✗ Build failed!"));
      console.log();
    }

    throw new Error(
      `Build failed: ${message}\n\n` +
      `Please fix the build errors and try again.`
    );
  }
}

/**
 * Check if project needs to be built
 */
export function needsBuild(cwd: string = process.cwd()): boolean {
  return hasBuildScript(cwd);
}
