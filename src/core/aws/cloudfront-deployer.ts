/**
 * CloudFront Deployer - Main deployment orchestrator
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import type { SCFConfig } from '../../types/config.js';
import type { DeploymentStats, UploadOptions } from '../../types/deployer.js';
import { createCloudFrontClient } from './client.js';
import {
  distributionExists,
  getDistribution,
  createDistribution,
  updateDistribution,
  waitForDistributionDeployed,
  getDistributionUrl,
  type CreateDistributionOptions,
} from './cloudfront-distribution.js';
import {
  invalidateCache,
  invalidateAll,
} from './cloudfront-invalidation.js';

/**
 * CloudFront deployment options
 */
export interface CloudFrontDeploymentOptions {
  distributionId?: string;
  invalidatePaths?: string[];
  invalidateAll?: boolean;
  waitForDeployment?: boolean;
  waitForInvalidation?: boolean;
  showProgress?: boolean;
}

/**
 * CloudFront deployment result
 */
export interface CloudFrontDeploymentResult {
  distributionId: string;
  distributionDomain: string;
  distributionUrl: string;
  invalidationId?: string;
  isNewDistribution: boolean;
  deploymentTime: number;
}

/**
 * Deploy to CloudFront
 */
export async function deployToCloudFront(
  config: SCFConfig,
  s3DeploymentStats: DeploymentStats,
  options: CloudFrontDeploymentOptions = {}
): Promise<CloudFrontDeploymentResult> {
  const startTime = Date.now();

  // Validate CloudFront config
  if (!config.cloudfront?.enabled) {
    throw new Error('CloudFront is not enabled in configuration');
  }

  if (!config.s3?.bucketName) {
    throw new Error('S3 bucket name is required for CloudFront deployment');
  }

  const {
    distributionId: existingDistributionId,
    invalidatePaths,
    invalidateAll: shouldInvalidateAll = false,
    waitForDeployment = true,
    waitForInvalidation = true,
    showProgress = true,
  } = options;

  const cloudFrontConfig = config.cloudfront;
  const s3Config = config.s3;

  // Create CloudFront client
  const cfClient = createCloudFrontClient(config);

  let spinner: Ora | null = null;
  let distributionId: string;
  let isNewDistribution = false;
  let distribution;

  // Step 1: Check if distribution exists or create new one
  if (existingDistributionId) {
    if (showProgress) {
      spinner = ora('Checking CloudFront distribution...').start();
    }

    const exists = await distributionExists(cfClient, existingDistributionId);

    if (exists) {
      distribution = await getDistribution(cfClient, existingDistributionId);
      distributionId = existingDistributionId;

      if (spinner) {
        spinner.succeed(
          `CloudFront distribution found: ${chalk.cyan(distributionId)}`
        );
      }

      // Update distribution if needed
      const hasUpdates =
        cloudFrontConfig.priceClass ||
        cloudFrontConfig.customDomain ||
        cloudFrontConfig.defaultTTL !== undefined;

      if (hasUpdates) {
        if (showProgress) {
          spinner = ora('Updating CloudFront distribution...').start();
        }

        const updateOptions: Partial<CreateDistributionOptions> = {
          priceClass: cloudFrontConfig.priceClass,
          customDomain: cloudFrontConfig.customDomain,
          defaultTTL: cloudFrontConfig.defaultTTL,
          maxTTL: cloudFrontConfig.maxTTL,
          minTTL: cloudFrontConfig.minTTL,
          ipv6: cloudFrontConfig.ipv6,
        };

        distribution = await updateDistribution(
          cfClient,
          distributionId,
          updateOptions
        );

        if (spinner) {
          spinner.succeed('CloudFront distribution updated');
        }
      }
    } else {
      throw new Error(
        `Distribution ${existingDistributionId} not found. Please check the distribution ID.`
      );
    }
  } else {
    // Create new distribution
    if (showProgress) {
      spinner = ora('Creating CloudFront distribution...').start();
    }

    const createOptions: CreateDistributionOptions = {
      s3BucketName: s3Config.bucketName,
      s3Region: config.region,
      indexDocument: s3Config.indexDocument,
      customDomain: cloudFrontConfig.customDomain,
      priceClass: cloudFrontConfig.priceClass,
      defaultTTL: cloudFrontConfig.defaultTTL,
      maxTTL: cloudFrontConfig.maxTTL,
      minTTL: cloudFrontConfig.minTTL,
      ipv6: cloudFrontConfig.ipv6,
    };

    distribution = await createDistribution(cfClient, createOptions);
    if (!distribution.Id) {
      throw new Error('Failed to create CloudFront distribution: No ID returned');
    }
    distributionId = distribution.Id;
    isNewDistribution = true;

    if (spinner) {
      spinner.succeed(
        `CloudFront distribution created: ${chalk.cyan(distributionId)}`
      );
    }
  }

  // Step 2: Wait for distribution to be deployed
  if (waitForDeployment && distribution?.Status === 'InProgress') {
    if (showProgress) {
      spinner = ora('Waiting for distribution deployment...').start();
    }

    try {
      await waitForDistributionDeployed(cfClient, distributionId, {
        maxWaitTime: 1200, // 20 minutes
        minDelay: 20,
        maxDelay: 60,
      });

      if (spinner) {
        spinner.succeed('Distribution deployed');
      }
    } catch (_error: unknown) {
      if (spinner) {
        spinner.warn('Distribution deployment is taking longer than expected');
      }
      console.log(
        chalk.yellow(
          '⚠ Distribution is still deploying. You can check status later.'
        )
      );
    }
  }

  // Step 3: Invalidate cache
  let invalidationId: string | undefined;

  if (shouldInvalidateAll) {
    if (showProgress) {
      spinner = ora('Invalidating all CloudFront cache...').start();
    }

    const invalidation = await invalidateAll(cfClient, distributionId, {
      wait: waitForInvalidation,
    });

    invalidationId = invalidation.Id;

    if (spinner) {
      spinner.succeed(
        `Cache invalidation created: ${chalk.cyan(invalidationId)}`
      );
    }
  } else if (invalidatePaths && invalidatePaths.length > 0) {
    if (showProgress) {
      spinner = ora(
        `Invalidating ${invalidatePaths.length} paths...`
      ).start();
    }

    const invalidation = await invalidateCache(
      cfClient,
      distributionId,
      invalidatePaths,
      {
        wait: waitForInvalidation,
      }
    );

    invalidationId = invalidation.Id;

    if (spinner) {
      spinner.succeed(
        `Cache invalidation created: ${chalk.cyan(invalidationId)}`
      );
    }
  } else if (s3DeploymentStats.uploaded > 0) {
    // Auto-invalidate if files were uploaded
    if (showProgress) {
      spinner = ora('Invalidating updated files...').start();
    }

    // Invalidate all since we don't track individual file paths yet
    const invalidation = await invalidateAll(cfClient, distributionId, {
      wait: waitForInvalidation,
    });

    invalidationId = invalidation.Id;

    if (spinner) {
      spinner.succeed(
        `Cache invalidation created: ${chalk.cyan(invalidationId)}`
      );
    }
  }

  // Get final distribution info
  const finalDistribution = await getDistribution(cfClient, distributionId);
  const distributionUrl = finalDistribution
    ? getDistributionUrl(finalDistribution)
    : '';
  const distributionDomain = finalDistribution?.DomainName || '';

  const deploymentTime = Date.now() - startTime;

  // Display final info
  console.log();
  console.log(chalk.green('🌐 CloudFront Deployment Complete'));
  console.log(chalk.gray(`Distribution ID: ${distributionId}`));
  console.log(chalk.gray(`Domain: ${distributionDomain}`));
  console.log(chalk.green('URL:'), chalk.cyan(distributionUrl));

  if (cloudFrontConfig.customDomain) {
    console.log(
      chalk.green('Custom Domain:'),
      chalk.cyan(`https://${cloudFrontConfig.customDomain.domainName}`)
    );
  }

  console.log(chalk.gray(`Deployment time: ${(deploymentTime / 1000).toFixed(2)}s`));

  return {
    distributionId,
    distributionDomain,
    distributionUrl,
    invalidationId,
    isNewDistribution,
    deploymentTime,
  };
}

/**
 * Combined S3 + CloudFront deployment
 */
export async function deployWithCloudFront(
  config: SCFConfig,
  deployToS3: (config: SCFConfig, options?: UploadOptions) => Promise<DeploymentStats>,
  options: {
    s3Options?: UploadOptions;
    cloudFrontOptions?: CloudFrontDeploymentOptions;
  } = {}
): Promise<{
  s3Stats: DeploymentStats;
  cloudFront: CloudFrontDeploymentResult;
}> {
  const { s3Options = {}, cloudFrontOptions = {} } = options;

  console.log(chalk.blue('🚀 Starting deployment...\n'));

  // Step 1: Deploy to S3
  console.log(chalk.blue('📦 Step 1: S3 Deployment\n'));
  const s3Stats = await deployToS3(config, s3Options);

  // Step 2: Deploy to CloudFront
  if (config.cloudfront?.enabled) {
    console.log(chalk.blue('\n☁️  Step 2: CloudFront Deployment\n'));
    const cloudFront = await deployToCloudFront(config, s3Stats, cloudFrontOptions);

    console.log();
    console.log(chalk.green('✨ Deployment completed successfully!'));

    return {
      s3Stats,
      cloudFront,
    };
  }

  console.log();
  console.log(chalk.green('✨ S3 deployment completed!'));

  // Return with empty CloudFront result if not enabled
  return {
    s3Stats,
    cloudFront: {
      distributionId: '',
      distributionDomain: '',
      distributionUrl: '',
      isNewDistribution: false,
      deploymentTime: 0,
    },
  };
}
