/**
 * CloudFront Cache Warming Utility
 *
 * Warms up CloudFront edge locations by making requests to specified paths
 * after deployment. This reduces cold start latency for end users.
 */

import pLimit from 'p-limit';
import chalk from 'chalk';

export interface CacheWarmingOptions {
  /** CloudFront distribution domain name */
  distributionDomain: string;

  /** Paths to warm up */
  paths: string[];

  /** Number of concurrent requests */
  concurrency: number;

  /** Delay between requests in ms */
  delay: number;
}

export interface CacheWarmingResult {
  /** Total paths attempted */
  total: number;

  /** Successfully warmed paths */
  success: number;

  /** Failed paths */
  failed: number;

  /** List of failed paths with errors */
  errors: Array<{
    path: string;
    error: string;
  }>;
}

/**
 * Warm up CloudFront cache by requesting specified paths
 */
export async function warmCache(
  options: CacheWarmingOptions
): Promise<CacheWarmingResult> {
  const { distributionDomain, paths, concurrency, delay } = options;

  console.log(
    chalk.blue(`\n🔥 Warming up CloudFront cache for ${paths.length} path(s)...`)
  );
  console.log(
    chalk.dim(
      '   Note: This downloads files and incurs CloudFront data transfer costs.'
    )
  );

  const result: CacheWarmingResult = {
    total: paths.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  const limit = pLimit(concurrency);

  const warmUpPath = async (path: string): Promise<void> => {
    try {
      // Ensure path starts with /
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      const url = `https://${distributionDomain}${normalizedPath}`;

      console.log(chalk.dim(`  → Warming: ${normalizedPath}`));

      // Use fetch to make HTTP request
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'scf-deploy-cache-warmer/1.0',
        },
      });

      if (response.ok) {
        result.success++;
        console.log(chalk.green(`  ✓ Warmed: ${normalizedPath} (${response.status})`));
      } else {
        result.failed++;
        result.errors.push({
          path: normalizedPath,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
        console.log(
          chalk.yellow(`  ⚠ Failed: ${normalizedPath} (${response.status})`)
        );
      }

      // Add delay between requests to avoid rate limiting
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      result.failed++;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({
        path,
        error: errorMessage,
      });
      console.log(chalk.yellow(`  ⚠ Failed: ${path} (${errorMessage})`));
    }
  };

  // Execute all warmup requests with concurrency limit
  await Promise.all(paths.map((path) => limit(() => warmUpPath(path))));

  // Print summary
  console.log(chalk.blue('\n📊 Cache warming summary:'));
  console.log(chalk.green(`  ✓ Success: ${result.success}/${result.total}`));

  if (result.failed > 0) {
    console.log(chalk.yellow(`  ⚠ Failed: ${result.failed}/${result.total}`));
    if (result.errors.length > 0) {
      console.log(chalk.dim('\n  Failed paths:'));
      result.errors.forEach(({ path, error }) => {
        console.log(chalk.dim(`    - ${path}: ${error}`));
      });
    }
  }

  console.log('');

  return result;
}

/**
 * Generate common paths to warm based on build directory scan
 */
export function generateCommonPaths(_buildDir: string): string[] {
  // Basic paths that are commonly accessed
  const commonPaths = [
    '/',
    '/index.html',
  ];

  // TODO: Could scan build directory for:
  // - Main JS/CSS bundles
  // - Critical assets (favicon, logo, etc.)
  // - Common routes (if SPA)

  return commonPaths;
}

/**
 * Validate and normalize paths for cache warming
 */
export function normalizePaths(paths: string[]): string[] {
  return paths
    .filter((path) => typeof path === 'string' && path.trim().length > 0)
    .map((path) => {
      // Ensure path starts with /
      const normalized = path.trim().startsWith('/') ? path.trim() : `/${path.trim()}`;
      return normalized;
    });
}
