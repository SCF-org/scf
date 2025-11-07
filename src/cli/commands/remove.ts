/**
 * Remove command - Delete all deployed AWS resources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as logger from '../utils/logger.js';
import { loadConfig } from '../../core/config/index.js';
import { getCredentials } from '../../core/aws/index.js';
import {
  loadState,
  stateExists,
  deleteState,
} from '../../core/state/index.js';
import {
  discoverAllResources,
} from '../../core/aws/resource-discovery.js';
import { deleteS3Bucket } from '../../core/aws/s3-bucket.js';
import { deleteCloudFrontDistribution } from '../../core/aws/cloudfront-distribution.js';
import { createS3Client, createCloudFrontClient } from '../../core/aws/client.js';
import { ACMManager } from '../../core/aws/acm-manager.js';
import { Route53Manager } from '../../core/aws/route53-manager.js';
import type { DeploymentState } from '../../types/state.js';
import type { DiscoveredResources } from '../../types/discovery.js';

interface RemoveOptions {
  env?: string;
  config?: string;
  profile?: string;
  force?: boolean;
  keepBucket?: boolean;
  keepDistribution?: boolean;
  keepCertificate?: boolean;
  keepHostedZone?: boolean;
}

export function createRemoveCommand(): Command {
  const command = new Command('remove');

  command
    .description('Delete all deployed AWS resources')
    .option('-e, --env <environment>', 'Environment name')
    .option('-c, --config <path>', 'Config file path', 'scf.config.ts')
    .option('-p, --profile <profile>', 'AWS profile name')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--keep-bucket', 'Keep S3 bucket (only delete files)')
    .option('--keep-distribution', 'Keep CloudFront distribution')
    .option('--keep-certificate', 'Keep ACM certificate')
    .option('--keep-hosted-zone', 'Keep Route53 hosted zone')
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

async function removeCommand(options: RemoveOptions): Promise<void> {
  const {
    env,
    config: configPath = 'scf.config.ts',
    profile,
    force = false,
    keepBucket = false,
    keepDistribution = false,
    keepCertificate = false,
    keepHostedZone = false,
  } = options;

  // Header
  console.log();
  console.log(chalk.bold.red('🗑️  SCF Resource Removal'));
  console.log();

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
  const credentials = await getCredentials(config);
  logger.success('Credentials verified');
  console.log();

  // Step 3: Try to load state, or discover resources if state doesn't exist
  let state: DeploymentState | null = null;
  let discovered: DiscoveredResources | null = null;

  const hasState = stateExists({ environment: env });

  if (hasState) {
    logger.info('Loading deployment state...');
    state = loadState({ environment: env });
    logger.success('State file loaded');
  } else {
    logger.warn('State file not found. Discovering resources from AWS...');
    console.log();

    const targetEnv = env || 'default';
    discovered = await discoverAllResources(config, config.app, targetEnv);

    if (!discovered.hasResources) {
      logger.warn(
        `No SCF-managed resources found for app "${config.app}" and environment "${targetEnv}"`
      );
      console.log();
      logger.info('Nothing to remove.');
      console.log();
      return;
    }

    logger.success('Resources discovered from AWS tags');
  }

  console.log();

  // Step 4: Display all resources that will be removed
  console.log(chalk.bold('📋 Resources to be removed:'));
  console.log();

  let hasS3 = false;
  let hasCloudFront = false;
  let hasACM = false;
  let hasRoute53 = false;

  // S3 Bucket
  const s3BucketName = state?.resources.s3?.bucketName || discovered?.s3?.bucketName;
  const s3Region = state?.resources.s3?.region || discovered?.s3?.region;
  if (s3BucketName && !keepBucket) {
    hasS3 = true;
    console.log(chalk.cyan('S3 Bucket:'));
    console.log(`  ${chalk.gray('Bucket Name:')} ${s3BucketName}`);
    console.log(`  ${chalk.gray('Region:')} ${s3Region || 'unknown'}`);
    console.log();
  }

  // CloudFront Distribution
  const cfDistributionId = state?.resources.cloudfront?.distributionId || discovered?.cloudfront?.distributionId;
  const cfDomainName = state?.resources.cloudfront?.domainName || discovered?.cloudfront?.domainName;
  if (cfDistributionId && !keepDistribution) {
    hasCloudFront = true;
    console.log(chalk.cyan('CloudFront Distribution:'));
    console.log(`  ${chalk.gray('Distribution ID:')} ${cfDistributionId}`);
    console.log(`  ${chalk.gray('Domain Name:')} ${cfDomainName || 'unknown'}`);
    console.log();
  }

  // ACM Certificate
  const acmCertificateArn = state?.resources.acm?.certificateArn || discovered?.acm?.certificateArn;
  const acmDomainName = state?.resources.acm?.domainName || discovered?.acm?.domainName;
  if (acmCertificateArn && !keepCertificate) {
    hasACM = true;
    console.log(chalk.cyan('ACM Certificate:'));
    console.log(`  ${chalk.gray('Certificate ARN:')} ${acmCertificateArn}`);
    console.log(`  ${chalk.gray('Domain Name:')} ${acmDomainName || 'unknown'}`);
    console.log();
  }

  // Route53 Hosted Zone
  const route53ZoneId = state?.resources.route53?.hostedZoneId || discovered?.route53?.hostedZoneId;
  const route53ZoneName = state?.resources.route53?.hostedZoneName || discovered?.route53?.hostedZoneName;
  if (route53ZoneId && !keepHostedZone) {
    hasRoute53 = true;
    console.log(chalk.cyan('Route53 Hosted Zone:'));
    console.log(`  ${chalk.gray('Zone ID:')} ${route53ZoneId}`);
    console.log(`  ${chalk.gray('Zone Name:')} ${route53ZoneName || 'unknown'}`);
    console.log();
  }

  // Check if there are any resources to remove
  if (!hasS3 && !hasCloudFront && !hasACM && !hasRoute53) {
    logger.info('No resources to remove (all resources are being kept or not found).');
    console.log();
    return;
  }

  // Step 5: Confirmation
  if (!force) {
    console.log(chalk.yellow('⚠️  Warning: This action cannot be undone!'));
    console.log();

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to delete these resources?',
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info('Removal cancelled');
      return;
    }

    console.log();
  }

  // Step 6: Delete resources in proper order
  // Order: CloudFront → ACM → S3 → Route53
  // (CloudFront must be deleted before ACM certificate can be removed)

  let deletionErrors: string[] = [];

  // 6.1: Delete CloudFront Distribution
  if (hasCloudFront && cfDistributionId) {
    try {
      const cfClient = createCloudFrontClient(config);
      await deleteCloudFrontDistribution(cfClient, cfDistributionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deletionErrors.push(`CloudFront: ${message}`);
      logger.error(`Failed to delete CloudFront distribution: ${message}`);
      console.log();
    }
  }

  // 6.2: Delete ACM Certificate (after CloudFront is deleted)
  if (hasACM && acmCertificateArn) {
    try {
      const acmManager = new ACMManager({ credentials });
      await acmManager.deleteCertificate(acmCertificateArn);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deletionErrors.push(`ACM: ${message}`);
      logger.error(`Failed to delete ACM certificate: ${message}`);
      console.log();
    }
  }

  // 6.3: Delete S3 Bucket
  if (hasS3 && s3BucketName && s3Region) {
    try {
      const s3Client = createS3Client(config);
      await deleteS3Bucket(s3Client, s3BucketName, s3Region);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deletionErrors.push(`S3: ${message}`);
      logger.error(`Failed to delete S3 bucket: ${message}`);
      console.log();
    }
  }

  // 6.4: Delete Route53 Hosted Zone
  if (hasRoute53 && route53ZoneId) {
    try {
      const route53Manager = new Route53Manager({
        region: config.region,
        credentials,
      });
      await route53Manager.deleteHostedZone(route53ZoneId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deletionErrors.push(`Route53: ${message}`);
      logger.error(`Failed to delete Route53 hosted zone: ${message}`);
      console.log();
    }
  }

  // Step 7: Delete state file if all deletions succeeded
  if (deletionErrors.length === 0 && hasState) {
    deleteState({ environment: env });
    console.log();
    logger.success('State file deleted');
  }

  // Step 8: Summary
  console.log();
  if (deletionErrors.length > 0) {
    console.log(chalk.yellow('⚠️  Some resources could not be deleted:'));
    console.log();
    for (const error of deletionErrors) {
      console.log(`  ${chalk.red('✗')} ${error}`);
    }
    console.log();
    logger.warn('Some resources may still exist. Please check AWS console and retry if needed.');
  } else {
    logger.success('All resources removed successfully!');
  }

  console.log();
}
