/**
 * Config system entry point
 */

import chalk from 'chalk';
import type { SCFConfig, LoadConfigOptions } from '../../types/config.js';
import { discoverAndLoadConfig, loadConfigFile } from './loader.js';
import { mergeEnvironment, applyProfileOverride } from './merger.js';
import { validateConfig } from './schema.js';
import { validateRequiredFields } from './utils.js';
import { loadEnvFiles } from './env-loader.js';

/**
 * Load and validate SCF configuration
 *
 * @param options - Load config options
 * @returns Validated and merged configuration
 *
 * @example
 * ```ts
 * // Load default config
 * const config = await loadConfig();
 *
 * // Load with environment
 * const config = await loadConfig({ env: 'prod' });
 *
 * // Load with custom path
 * const config = await loadConfig({ configPath: './custom.config.ts' });
 * ```
 */
export async function loadConfig(
  options: LoadConfigOptions = {}
): Promise<SCFConfig> {
  const { configPath, env, profile } = options;

  try {
    // Step 0: Load environment variables from .env files
    // This must happen BEFORE loading config file so that
    // scf.config.ts can reference process.env variables
    loadEnvFiles(env);

    // Step 1: Load config file
    let rawConfig: SCFConfig;
    let resolvedConfigPath: string;

    if (configPath) {
      // Load from specified path
      rawConfig = await loadConfigFile(configPath);
      resolvedConfigPath = configPath;
    } else {
      // Auto-discover config file
      const result = await discoverAndLoadConfig();
      rawConfig = result.config;
      resolvedConfigPath = result.configPath;
    }

    // Step 2: Merge environment-specific config
    const mergedConfig = mergeEnvironment(rawConfig, env);

    // Step 3: Apply profile override
    const configWithProfile = applyProfileOverride(mergedConfig, profile);

    // Step 4: Validate config
    const validatedConfig = validateConfig(configWithProfile);

    // Step 5: Additional validation
    validateRequiredFields(validatedConfig);

    // Log loaded config info (only in CLI mode)
    if (process.env.SCF_CLI_MODE === 'true') {
      console.log(chalk.gray(` Loaded config from: ${resolvedConfigPath}`));
      if (env) {
        console.log(chalk.gray(` Environment: ${env}`));
      }
    }

    return validatedConfig;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load configuration:\n${error.message}`);
    }
    throw error;
  }
}

// Re-export utilities for user config files
export { generateExampleConfig } from './utils.js';

// Re-export types
export type { SCFConfig, LoadConfigOptions } from '../../types/config.js';
