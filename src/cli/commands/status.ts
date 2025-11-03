/**
 * Status command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as logger from '../utils/logger.js';
import {
  loadState,
  listStateFiles,
  getResourceSummary,
  getFileCount,
} from '../../core/state/index.js';

/**
 * Status command options
 */
interface StatusOptions {
  env?: string;
  detailed?: boolean;
  json?: boolean;
}

/**
 * Create status command
 */
export function createStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Show deployment status')
    .option('-e, --env <environment>', 'Environment name')
    .option('-d, --detailed', 'Show detailed information')
    .option('--json', 'Output as JSON')
    .action(async (options: StatusOptions) => {
      try {
        await statusCommand(options);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Status command handler
 */
async function statusCommand(options: StatusOptions): Promise<void> {
  const { env, detailed = false, json = false } = options;

  // Load state
  const state = loadState({ environment: env });

  if (!state) {
    if (json) {
      console.log(JSON.stringify({ error: 'No deployment found', environment: env }, null, 2));
    } else {
      console.log();
      logger.warn(`No deployment found for environment: ${chalk.cyan(env)}`);
      console.log();
      logger.info('Run `scf deploy` to create a deployment');
      console.log();
    }
    return;
  }

  // JSON output
  if (json) {
    const output: Record<string, unknown> = {
      app: state.app,
      environment: state.environment,
      lastDeployed: state.lastDeployed,
      resources: state.resources,
      fileCount: getFileCount(state),
      version: state.version,
    };

    if (detailed) {
      output.files = state.files;
    }

    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Pretty output
  console.log();
  console.log(chalk.bold.blue('=� Deployment Status'));
  console.log();

  // Basic information
  const summary = getResourceSummary(state);

  logger.keyValue('App', chalk.cyan(state.app));
  logger.keyValue('Environment', chalk.cyan(state.environment));
  logger.keyValue('Last Deployed', new Date(state.lastDeployed).toLocaleString());
  logger.keyValue('Files Tracked', getFileCount(state).toString());

  // S3 information
  if (summary.hasS3) {
    console.log();
    console.log(chalk.bold('S3 Bucket:'));
    logger.keyValue('  Name', summary.s3BucketName || 'N/A');
    logger.keyValue('  Region', summary.s3Region || 'N/A');

    const s3 = state.resources.s3;
    if (s3?.websiteUrl) {
      logger.keyValue('  Website URL', chalk.cyan(s3.websiteUrl));
    }
  }

  // CloudFront information
  if (summary.hasCloudFront) {
    console.log();
    console.log(chalk.bold('CloudFront Distribution:'));
    logger.keyValue('  ID', summary.distributionId || 'N/A');
    logger.keyValue('  URL', chalk.cyan(summary.distributionUrl || 'N/A'));

    const cf = state.resources.cloudfront;
    if (cf?.aliases && cf.aliases.length > 0) {
      logger.keyValue('  Aliases', cf.aliases.join(', '));
    }
  }

  // Detailed output
  if (detailed) {
    console.log();
    console.log(chalk.bold('Files:'));
    const fileEntries = Object.entries(state.files);

    if (fileEntries.length === 0) {
      logger.info('  No files tracked');
    } else {
      const maxFiles = 20;
      const filesToShow = fileEntries.slice(0, maxFiles);

      filesToShow.forEach(([path, hash]) => {
        console.log(chalk.gray(`  ${path}: ${hash.substring(0, 16)}...`));
      });

      if (fileEntries.length > maxFiles) {
        console.log(chalk.gray(`  ... and ${fileEntries.length - maxFiles} more files`));
      }
    }
  }

  // List all environments
  const allStateFiles = listStateFiles();
  if (allStateFiles.length > 1) {
    console.log();
    console.log(chalk.bold('Available Environments:'));

    for (const stateFile of allStateFiles) {
      const envName = stateFile.replace('state.', '').replace('.json', '');
      const envState = loadState({ environment: envName });

      if (envState) {
        const isCurrent = envName === env;
        const prefix = isCurrent ? chalk.green('�') : ' ';
        const envDisplay = isCurrent ? chalk.green(envName) : chalk.gray(envName);

        console.log(`  ${prefix} ${envDisplay} (${new Date(envState.lastDeployed).toLocaleDateString()})`);
      }
    }
  }

  console.log();
}
