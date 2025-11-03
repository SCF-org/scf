/**
 * Config file loader using jiti for TypeScript runtime execution
 */

import jiti from "jiti";
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SCFConfig } from "../../types/config.js";

/**
 * Config file names to search for (in order of priority)
 */
const CONFIG_FILE_NAMES = [
  "scf.config.ts",
  "scf.config.js",
  "scf.config.mjs",
  "scf.config.cjs",
] as const;

/**
 * Find config file in directory and parent directories
 */
export function findConfigFile(
  startDir: string = process.cwd()
): string | null {
  let currentDir = resolve(startDir);
  const root = resolve("/");

  while (currentDir !== root) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = join(currentDir, fileName);
      if (existsSync(configPath)) {
        return configPath;
      }
    }

    // Move up to parent directory
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Load config file using jiti
 */
export async function loadConfigFile(configPath: string): Promise<SCFConfig> {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  try {
    // Get the absolute path of the current file for jiti
    const currentFile = fileURLToPath(import.meta.url);

    // Create jiti instance
    // The first argument must be an absolute file path (not a directory)
    const jitiInstance = jiti(currentFile, {
      interopDefault: true,
      requireCache: false,
      esmResolve: true,
      moduleCache: false
    });

    // Load the config file (must use absolute path)
    const absoluteConfigPath = resolve(configPath);
    const configModule = jitiInstance(absoluteConfigPath) as
      | SCFConfig
      | { default: SCFConfig }
      | (() => SCFConfig)
      | { default: () => SCFConfig };

    // Handle different export formats
    let config: SCFConfig;

    if (typeof configModule === "function") {
      // Config is a function
      config = configModule();
    } else if (
      configModule &&
      typeof configModule === "object" &&
      "default" in configModule
    ) {
      // Config has default export
      const defaultExport = configModule.default;
      if (typeof defaultExport === "function") {
        config = defaultExport();
      } else {
        config = defaultExport;
      }
    } else {
      // Config is a plain object
      config = configModule as SCFConfig;
    }

    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to load config file: ${configPath}\n${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Discover and load config file
 */
export async function discoverAndLoadConfig(
  startDir?: string
): Promise<{ config: SCFConfig; configPath: string }> {
  const configPath = findConfigFile(startDir);

  if (!configPath) {
    throw new Error(
      `Config file not found. Please create one of: ${CONFIG_FILE_NAMES.join(
        ", "
      )}`
    );
  }

  const config = await loadConfigFile(configPath);

  return {
    config,
    configPath,
  };
}
