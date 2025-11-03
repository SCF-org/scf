/**
 * Recover command - Recover lost deployment state from AWS resources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as logger from '../utils/logger.js';
import { loadConfig } from '../../core/config/index.js';
import { getCredentials } from '../../core/aws/index.js';
import { createS3Client, createCloudFrontClient } from '../../core/aws/client.js';
import { getBucketTags } from '../../core/aws/s3-bucket.js';
import {
  saveState,
  stateExists,
  getOrCreateState,
  updateS3Resource,
  updateCloudFrontResource,
} from '../../core/state/index.js';
import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { ListDistributionsCommand } from '@aws-sdk/client-cloudfront';

interface RecoverOptions {
  env?: string;
  config?: string;
  profile?: string;
  force?: boolean;
}

interface RecoveredResource {
  type: 's3' | 'cloudfront';
  id: string;
  app: string;
  environment: string;
}

export function createRecoverCommand(): Command {
  const command = new Command('recover');

  command
    .description('Recover lost deployment state from AWS resources')
    .option('-e, --env <environment>', 'Environment name')
    .option('-c, --config <path>', 'Config file path', 'scf.config.ts')
    .option('-p, --profile <profile>', 'AWS profile name')
    .option('-f, --force', 'Overwrite existing state file')
    .action(async (options: RecoverOptions) => {
      try {
        await recoverCommand(options);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exit(1);
      }
    });

  return command;
}

async function recoverCommand(options: RecoverOptions): Promise<void> {
  const {
    env,
    config: configPath = 'scf.config.ts',
    profile,
    force = false,
  } = options;

  // Header
  console.log();
  console.log(chalk.bold.yellow('🔄 SCF State Recovery'));
  console.log();

  // Check if state already exists
  if (!force && stateExists({ environment: env })) {
    logger.warn(`State file already exists for environment: ${env || 'default'}`);
    console.log();
    logger.info('Use --force to overwrite the existing state file');
    console.log();
    return;
  }

  // Step 1: Load config
  logger.info('Loading configuration...');
  const config = await loadConfig({
    configPath,
    env,
  });

  // Override with CLI profile if provided
  if (profile) {
    if (!config.credentials) {
      config.credentials = {};
    }
    config.credentials.profile = profile;
  }

  logger.success('Configuration loaded');
  console.log();

  // Step 2: Get AWS credentials
  logger.info('Verifying AWS credentials...');
  await getCredentials(config);
  logger.success('Credentials verified');
  console.log();

  // Step 3: Search for SCF-managed resources
  logger.info('Searching for SCF-managed resources...');
  console.log();

  const s3Client = createS3Client(config);
  const cfClient = createCloudFrontClient(config);

  const resources: RecoveredResource[] = [];

  // Search S3 buckets
  try {
    const bucketsResult = await s3Client.send(new ListBucketsCommand({}));

    if (bucketsResult.Buckets) {
      for (const bucket of bucketsResult.Buckets) {
        if (!bucket.Name) continue;

        try {
          const tags = await getBucketTags(s3Client, bucket.Name);

          if (tags['scf:managed'] === 'true') {
            resources.push({
              type: 's3',
              id: bucket.Name,
              app: tags['scf:app'] || 'unknown',
              environment: tags['scf:environment'] || 'default',
            });

            console.log(
              `${chalk.green('✓')} Found S3 bucket: ${chalk.cyan(bucket.Name)}`
            );
            console.log(
              `  ${chalk.gray(`App: ${tags['scf:app'] || 'unknown'}, Env: ${tags['scf:environment'] || 'default'}`)}`
            );
          }
        } catch {
          // Skip buckets we can't access
          continue;
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to list S3 buckets (permission denied or error)');
  }

  // Search CloudFront distributions
  try {
    const distributionsResult = await cfClient.send(
      new ListDistributionsCommand({})
    );

    if (
      distributionsResult.DistributionList &&
      distributionsResult.DistributionList.Items
    ) {
      for (const dist of distributionsResult.DistributionList.Items) {
        if (!dist.Id) continue;

        // Check if distribution origin matches any found S3 bucket
        const s3Origin = dist.Origins?.Items?.[0]?.DomainName;
        if (s3Origin) {
          const matchingBucket = resources.find(
            (r) => r.type === 's3' && s3Origin.includes(r.id)
          );

          if (matchingBucket) {
            resources.push({
              type: 'cloudfront',
              id: dist.Id,
              app: matchingBucket.app,
              environment: matchingBucket.environment,
            });

            console.log(
              `${chalk.green('✓')} Found CloudFront distribution: ${chalk.cyan(dist.Id)}`
            );
            console.log(
              `  ${chalk.gray(`Domain: ${dist.DomainName || 'unknown'}`)}`
            );
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Failed to list CloudFront distributions (permission denied or error)');
  }

  console.log();

  // Step 4: Filter resources for current app and environment
  const targetEnv = env || 'default';
  const matchingResources = resources.filter(
    (r) => r.app === config.app && r.environment === targetEnv
  );

  if (matchingResources.length === 0) {
    logger.warn(`No SCF-managed resources found for app "${config.app}" and environment "${targetEnv}"`);
    console.log();
    logger.info('Resources might have been deployed with a different configuration');
    console.log();

    if (resources.length > 0) {
      console.log(chalk.bold('Found resources for other apps/environments:'));
      for (const res of resources) {
        console.log(
          `  ${res.type === 's3' ? '🪣' : '🌐'} ${chalk.cyan(res.id)} ` +
            `(app: ${res.app}, env: ${res.environment})`
        );
      }
      console.log();
    }

    return;
  }

  // Step 5: Confirm recovery
  console.log(chalk.bold('Found matching resources:'));
  for (const res of matchingResources) {
    console.log(
      `  ${res.type === 's3' ? '🪣' : '🌐'} ${res.type === 's3' ? 'S3 Bucket' : 'CloudFront'}: ${chalk.cyan(res.id)}`
    );
  }
  console.log();

  if (!force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Recover state from these resources?',
        default: true,
      },
    ]);

    if (!confirm) {
      logger.info('Recovery cancelled');
      return;
    }
    console.log();
  }

  // Step 6: Create state from recovered resources
  let state = getOrCreateState(config.app, { environment: env });

  const s3Resource = matchingResources.find((r) => r.type === 's3');
  const cfResource = matchingResources.find((r) => r.type === 'cloudfront');

  if (s3Resource) {
    state = updateS3Resource(state, {
      bucketName: s3Resource.id,
      region: config.region,
      websiteUrl: `http://${s3Resource.id}.s3-website.${config.region}.amazonaws.com`,
    });
  }

  if (cfResource) {
    // Get CloudFront details
    const cfDetails = await cfClient.send(
      new ListDistributionsCommand({})
    );

    const dist = cfDetails.DistributionList?.Items?.find(
      (d) => d.Id === cfResource.id
    );

    if (dist) {
      state = updateCloudFrontResource(state, {
        distributionId: dist.Id!,
        domainName: dist.DomainName!,
        distributionUrl: `https://${dist.DomainName}`,
      });
    }
  }

  // Step 7: Save recovered state
  saveState(state, { environment: env });

  console.log();
  logger.success('State file recovered successfully!');
  console.log();
  logger.info(`State saved to: ${chalk.cyan(`.deploy/state${env ? `.${env}` : ''}.json`)}`);
  console.log();
  logger.info('You can now use scf-deploy commands normally');
  console.log();
}
