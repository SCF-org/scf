/**
 * Remove command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as logger from '../utils/logger.js';
import { loadConfig } from '../../core/config/index.js';
import { getCredentials, createS3Client, createCloudFrontClient } from '../../core/aws/index.js';
import {
  loadState,
  deleteState,
  getResourceIdentifiers,
  formatResourceSummary,
} from '../../core/state/index.js';
import { DeleteObjectsCommand, ListObjectsV2Command, DeleteBucketCommand } from '@aws-sdk/client-s3';
import {
  GetDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  DeleteDistributionCommand,
  waitUntilDistributionDeployed,
} from '@aws-sdk/client-cloudfront';

/**
 * Remove command options
 */
interface RemoveOptions {
  env?: string;
  config?: string;
  profile?: string;
  force?: boolean;
  keepBucket?: boolean;
  keepDistribution?: boolean;
}

/**
 * Create remove command
 */
export function createRemoveCommand(): Command {
  const command = new Command('remove');

  command
    .description('Remove deployed resources (S3 bucket, CloudFront distribution)')
    .option('-e, --env <environment>', 'Environment name', 'default')
    .option('-c, --config <path>', 'Config file path', 'scf.config.ts')
    .option('-p, --profile <profile>', 'AWS profile name')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--keep-bucket', 'Keep S3 bucket (only delete files)')
    .option('--keep-distribution', 'Keep CloudFront distribution')
    .action(async (options: RemoveOptions) => {
      try {
        await removeCommand(options);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Remove command handler
 */
async function removeCommand(options: RemoveOptions): Promise<void> {
  const {
    env = 'default',
    config: configPath = 'scf.config.ts',
    profile,
    force = false,
    keepBucket = false,
    keepDistribution = false,
  } = options;

  // Header
  console.log();
  console.log(chalk.bold.red('=�  SCF Resource Removal'));
  console.log();

  // Step 1: Load state
  logger.info('Loading deployment state...');

  const state = loadState({ environment: env });

  if (!state) {
    logger.error(`No deployment found for environment: ${env}`);
    logger.info('Nothing to remove');
    return;
  }

  logger.success('Deployment state loaded');
  console.log();
  console.log(formatResourceSummary(state));

  // Step 2: Load config
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

  // Get resource identifiers
  const identifiers = getResourceIdentifiers(state);

  // Step 3: Confirmation prompt
  if (!force) {
    console.log();
    logger.warn('This action will delete the following resources:');

    if (identifiers.distributionId && !keepDistribution) {
      console.log(chalk.red('  - CloudFront Distribution:'), identifiers.distributionId);
    }
    if (identifiers.s3BucketName) {
      if (keepBucket) {
        console.log(chalk.yellow('  - S3 Bucket files:'), identifiers.s3BucketName);
      } else {
        console.log(chalk.red('  - S3 Bucket:'), identifiers.s3BucketName);
      }
    }

    console.log();

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to continue?',
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info('Removal cancelled');
      return;
    }
  }

  // Step 4: Get credentials
  console.log();
  logger.info('Verifying AWS credentials...');
  await getCredentials(config);
  logger.success('Credentials verified');

  // Step 5: Remove CloudFront distribution
  if (identifiers.distributionId && !keepDistribution) {
    console.log();
    logger.info(`Removing CloudFront distribution: ${identifiers.distributionId}`);

    const cfClient = createCloudFrontClient(config);

    try {
      // Get distribution
      const getDistResult = await cfClient.send(
        new GetDistributionCommand({
          Id: identifiers.distributionId,
        })
      );

      if (getDistResult.Distribution?.Status === 'InProgress') {
        logger.warn('Distribution is deploying. Waiting for deployment to complete...');
        await waitUntilDistributionDeployed(
          {
            client: cfClient,
            maxWaitTime: 1200,
            minDelay: 20,
            maxDelay: 60,
          },
          {
            Id: identifiers.distributionId,
          }
        );
      }

      // Disable distribution first
      const configResult = await cfClient.send(
        new GetDistributionConfigCommand({
          Id: identifiers.distributionId,
        })
      );

      if (configResult.DistributionConfig && configResult.ETag) {
        if (configResult.DistributionConfig.Enabled) {
          logger.info('Disabling distribution...');
          configResult.DistributionConfig.Enabled = false;

          await cfClient.send(
            new UpdateDistributionCommand({
              Id: identifiers.distributionId,
              DistributionConfig: configResult.DistributionConfig,
              IfMatch: configResult.ETag,
            })
          );

          logger.info('Waiting for distribution to be disabled...');
          await waitUntilDistributionDeployed(
            {
              client: cfClient,
              maxWaitTime: 1200,
              minDelay: 20,
              maxDelay: 60,
            },
            {
              Id: identifiers.distributionId,
            }
          );
        }

        // Get updated ETag
        const updatedConfigResult = await cfClient.send(
          new GetDistributionConfigCommand({
            Id: identifiers.distributionId,
          })
        );

        // Delete distribution
        if (updatedConfigResult.ETag) {
          logger.info('Deleting distribution...');
          await cfClient.send(
            new DeleteDistributionCommand({
              Id: identifiers.distributionId,
              IfMatch: updatedConfigResult.ETag,
            })
          );

          logger.success('CloudFront distribution deleted');
        }
      }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'NoSuchDistribution'
      ) {
        logger.warn('Distribution not found (may have been already deleted)');
      } else {
        throw error;
      }
    }
  }

  // Step 6: Remove S3 bucket
  if (identifiers.s3BucketName) {
    console.log();
    logger.info(`Removing S3 bucket: ${identifiers.s3BucketName}`);

    const s3Client = createS3Client(config);

    try {
      // List all objects
      logger.info('Listing bucket objects...');
      let objectsDeleted = 0;

      let continuationToken: string | undefined;
      do {
        const listResult = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: identifiers.s3BucketName,
            ContinuationToken: continuationToken,
          })
        );

        if (listResult.Contents && listResult.Contents.length > 0) {
          // Delete objects
          logger.info(`Deleting ${listResult.Contents.length} objects...`);

          await s3Client.send(
            new DeleteObjectsCommand({
              Bucket: identifiers.s3BucketName,
              Delete: {
                Objects: listResult.Contents.map((obj) => ({ Key: obj.Key })),
              },
            })
          );

          objectsDeleted += listResult.Contents.length;
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      logger.success(`Deleted ${objectsDeleted} objects`);

      // Delete bucket
      if (!keepBucket) {
        logger.info('Deleting bucket...');
        await s3Client.send(
          new DeleteBucketCommand({
            Bucket: identifiers.s3BucketName,
          })
        );

        logger.success('S3 bucket deleted');
      } else {
        logger.info('Bucket kept (--keep-bucket flag)');
      }
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'NoSuchBucket'
      ) {
        logger.warn('Bucket not found (may have been already deleted)');
      } else {
        throw error;
      }
    }
  }

  // Step 7: Delete state file
  console.log();
  logger.info('Deleting deployment state...');

  const deleted = deleteState({ environment: env });

  if (deleted) {
    logger.success('Deployment state deleted');
  } else {
    logger.warn('State file not found');
  }

  // Final message
  console.log();
  console.log(chalk.green.bold('( Resources removed successfully!'));
  console.log();
}
