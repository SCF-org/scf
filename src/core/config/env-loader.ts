/**
 * Environment variables loader
 * Loads .env files based on environment name with priority
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

/**
 * Load environment variables based on environment name
 *
 * Priority (highest to lowest):
 * 1. .env.{environment}.local  (e.g., .env.prod.local)
 * 2. .env.{environment}         (e.g., .env.prod)
 * 3. .env.local
 * 4. .env
 *
 * @param environment - Environment name (e.g., 'dev', 'prod')
 * @param configDir - Directory containing .env files (defaults to process.cwd())
 *
 * @example
 * ```ts
 * // Load production environment variables
 * loadEnvFiles('prod');
 * // Loads: .env.prod.local > .env.prod > .env.local > .env
 *
 * // Load development environment variables
 * loadEnvFiles('dev');
 * // Loads: .env.dev.local > .env.dev > .env.local > .env
 *
 * // Load default environment variables
 * loadEnvFiles();
 * // Loads: .env.local > .env
 * ```
 */
export function loadEnvFiles(
  environment?: string,
  configDir: string = process.cwd()
): void {
  const envFiles: string[] = [];

  // Build priority list
  if (environment) {
    envFiles.push(`.env.${environment}.local`);
    envFiles.push(`.env.${environment}`);
  }
  envFiles.push('.env.local');
  envFiles.push('.env');

  // Load each file in priority order
  // dotenv will NOT override existing env vars by default
  // So we load from lowest priority to highest
  const filesToLoad = [...envFiles].reverse();
  const loadedFiles: string[] = [];

  for (const file of filesToLoad) {
    const filePath = resolve(configDir, file);

    if (existsSync(filePath)) {
      // Load and override existing vars
      dotenvConfig({ path: filePath, override: true });
      loadedFiles.push(file);
    }
  }

  // Warn if environment-specific .env file is missing
  if (environment) {
    const envFile = `.env.${environment}`;
    const envFilePath = resolve(configDir, envFile);
    const envLocalFile = `.env.${environment}.local`;
    const envLocalFilePath = resolve(configDir, envLocalFile);

    if (!existsSync(envFilePath) && !existsSync(envLocalFilePath)) {
      console.log(
        chalk.yellow(`  ⚠ Warning: ${envFile} file not found. Using default values from scf.config.ts`)
      );
    }
  }

  // Log loaded files in debug mode
  if (process.env.SCF_DEBUG === 'true' && loadedFiles.length > 0) {
    console.log(
      `[SCF] Loaded environment files: ${loadedFiles.reverse().join(', ')}`
    );
  }
}

/**
 * Get the list of .env files that would be loaded for an environment
 * Useful for debugging and documentation
 */
export function getEnvFilePaths(
  environment?: string,
  configDir: string = process.cwd()
): { path: string; exists: boolean; priority: number }[] {
  const envFiles: string[] = [];

  if (environment) {
    envFiles.push(`.env.${environment}.local`);
    envFiles.push(`.env.${environment}`);
  }
  envFiles.push('.env.local');
  envFiles.push('.env');

  return envFiles.map((file, index) => ({
    path: resolve(configDir, file),
    exists: existsSync(resolve(configDir, file)),
    priority: envFiles.length - index, // Higher number = higher priority
  }));
}
