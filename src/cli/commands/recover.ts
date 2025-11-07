/**
 * Recover command - Recover lost deployment state from AWS resources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as logger from '../utils/logger.js';
import { loadConfig } from '../../core/config/index.js';
import { getCredentials } from '../../core/aws/index.js';
import {
  saveState,
  stateExists,
  getOrCreateState,
  updateS3Resource,
  updateCloudFrontResource,
} from '../../core/state/index.js';
import { discoverAllResources, discoverAllSCFResources } from '../../core/aws/resource-discovery.js';

interface RecoverOptions {
  env?: string;
  config?: string;
  profile?: string;
  force?: boolean;
  all?: boolean;
}

export function createRecoverCommand(): Command {
  const command = new Command('recover');

  command
    .description('Recover lost deployment state from AWS resources')
    .option('-e, --env <environment>', 'Environment name')
    .option('-c, --config <path>', 'Config file path', 'scf.config.ts')
    .option('-p, --profile <profile>', 'AWS profile name')
    .option('-f, --force', 'Overwrite existing state file')
    .option('-a, --all', 'Show all SCF-managed resources')
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
    all = false,
  } = options;

  // Header
  console.log();
  console.log(chalk.bold.yellow('🔄 SCF State Recovery'));
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
  await getCredentials(config);
  logger.success('Credentials verified');
  console.log();

  // Step 3: Discover resources
  logger.info('Discovering SCF-managed resources...');
  console.log();

  if (all) {
    // Show all SCF resources
    const allResources = await discoverAllSCFResources(config);

    console.log(chalk.bold('All SCF-managed resources:'));
    console.log();

    if (allResources.s3.length > 0) {
      console.log(chalk.bold('S3 Buckets:'));
      for (const s3 of allResources.s3) {
        console.log(
          `  ${chalk.green('✓')} ${chalk.cyan(s3.bucketName)} ` +
            `(app: ${s3.app}, env: ${s3.environment})`
        );
      }
      console.log();
    }

    if (allResources.cloudfront.length > 0) {
      console.log(chalk.bold('CloudFront Distributions:'));
      for (const cf of allResources.cloudfront) {
        console.log(
          `  ${chalk.green('✓')} ${chalk.cyan(cf.distributionId)} ` +
            `(app: ${cf.app}, env: ${cf.environment})`
        );
        console.log(`    ${chalk.gray(`Domain: ${cf.domainName}`)}`);
      }
      console.log();
    }

    if (allResources.acm.length > 0) {
      console.log(chalk.bold('ACM Certificates:'));
      for (const acm of allResources.acm) {
        console.log(
          `  ${chalk.green('✓')} ${chalk.cyan(acm.domainName)} ` +
            `(${acm.app || 'N/A'}, ${acm.environment || 'N/A'})`
        );
        console.log(`    ${chalk.gray(`Status: ${acm.status}`)}`);
      }
      console.log();
    }

    if (allResources.route53.length > 0) {
      console.log(chalk.bold('Route53 Hosted Zones:'));
      for (const r53 of allResources.route53) {
        console.log(
          `  ${chalk.green('✓')} ${chalk.cyan(r53.hostedZoneName)} ` +
            `(${r53.app || 'N/A'}, ${r53.environment || 'N/A'})`
        );
      }
      console.log();
    }

    const totalCount =
      allResources.s3.length +
      allResources.cloudfront.length +
      allResources.acm.length +
      allResources.route53.length;

    if (totalCount === 0) {
      logger.warn('No SCF-managed resources found');
    }

    return;
  }

  // Discover resources for specific app/environment
  const targetEnv = env || 'default';
  const discovered = await discoverAllResources(config, config.app, targetEnv);

  // Display discovered resources
  if (discovered.s3) {
    console.log(
      `${chalk.green('✓')} Found S3 bucket: ${chalk.cyan(discovered.s3.bucketName)}`
    );
    console.log(
      `  ${chalk.gray(`App: ${discovered.s3.app}, Env: ${discovered.s3.environment}`)}`
    );
  }

  if (discovered.cloudfront) {
    console.log(
      `${chalk.green('✓')} Found CloudFront distribution: ${chalk.cyan(discovered.cloudfront.distributionId)}`
    );
    console.log(
      `  ${chalk.gray(`Domain: ${discovered.cloudfront.domainName}`)}`
    );
  }

  if (discovered.acm) {
    console.log(
      `${chalk.green('✓')} Found ACM certificate: ${chalk.cyan(discovered.acm.domainName)}`
    );
    console.log(`  ${chalk.gray(`Status: ${discovered.acm.status}`)}`);
  }

  if (discovered.route53) {
    console.log(
      `${chalk.green('✓')} Found Route53 hosted zone: ${chalk.cyan(discovered.route53.hostedZoneName)}`
    );
  }

  console.log();

  if (!discovered.hasResources) {
    logger.warn(
      `No SCF-managed resources found for app "${config.app}" and environment "${targetEnv}"`
    );
    console.log();
    logger.info(
      'Resources might have been deployed with a different configuration'
    );
    console.log();
    logger.info('Use --all flag to see all SCF-managed resources');
    console.log();
    return;
  }

  // Check if state already exists
  if (!force && stateExists({ environment: env })) {
    logger.warn(
      `State file already exists for environment: ${env || 'default'}`
    );
    console.log();
    logger.info('Use --force to overwrite the existing state file');
    console.log();
    return;
  }

  // Step 4: Confirm recovery
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

  // Step 5: Create state from discovered resources
  let state = getOrCreateState(config.app, { environment: env });

  if (discovered.s3) {
    state = updateS3Resource(state, {
      bucketName: discovered.s3.bucketName,
      region: discovered.s3.region,
      websiteUrl: `http://${discovered.s3.bucketName}.s3-website.${discovered.s3.region}.amazonaws.com`,
    });
  }

  if (discovered.cloudfront) {
    state = updateCloudFrontResource(state, {
      distributionId: discovered.cloudfront.distributionId,
      domainName: discovered.cloudfront.domainName,
      distributionUrl: `https://${discovered.cloudfront.domainName}`,
    });
  }

  // Step 6: Save recovered state
  saveState(state, { environment: env });

  console.log();
  logger.success('State file recovered successfully!');
  console.log();
  logger.info(
    `State saved to: ${chalk.cyan(`.deploy/state${env ? `.${env}` : ''}.json`)}`
  );
  console.log();
  logger.info('You can now use scf-deploy commands normally');
  console.log();
}
