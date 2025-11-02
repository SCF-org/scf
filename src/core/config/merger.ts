/**
 * Environment configuration merger
 */

import type { SCFConfig } from '../../types/config.js';

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== undefined &&
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== undefined &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      // Both are objects, merge recursively
      result[key] = deepMerge(
        targetValue as Record<string, any>,
        sourceValue as Record<string, any>
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      // Override with source value
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

/**
 * Merge environment-specific configuration
 */
export function mergeEnvironment(
  baseConfig: SCFConfig,
  environment?: string
): SCFConfig {
  // If no environment specified, return base config
  if (!environment || !baseConfig.environments) {
    // Remove environments field from returned config
    const { environments, ...configWithoutEnv } = baseConfig;
    return configWithoutEnv;
  }

  // Get environment-specific config
  const envConfig = baseConfig.environments[environment];

  if (!envConfig) {
    throw new Error(
      `Environment "${environment}" not found in config. Available environments: ${Object.keys(baseConfig.environments).join(', ')}`
    );
  }

  // Remove environments field and merge with env-specific config
  const { environments, ...baseWithoutEnv } = baseConfig;

  // Merge base config with environment config
  const merged = deepMerge(baseWithoutEnv, envConfig);

  return merged;
}

/**
 * Apply profile override to credentials
 */
export function applyProfileOverride(
  config: SCFConfig,
  profileOverride?: string
): SCFConfig {
  if (!profileOverride) {
    return config;
  }

  return {
    ...config,
    credentials: {
      ...config.credentials,
      profile: profileOverride,
    },
  };
}
