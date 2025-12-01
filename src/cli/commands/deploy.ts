/**
 * Deploy command
 */

import { Command } from "commander";
import chalk from "chalk";
import * as logger from "../utils/logger.js";
import { loadConfig } from "../../core/config/index.js";
import { getCredentials, verifyCredentials } from "../../core/aws/index.js";
import { deployToS3 } from "../../core/aws/s3-deployer.js";
import { deployToCloudFront } from "../../core/aws/cloudfront-deployer.js";
import { autoBuild } from "../../core/deployer/auto-builder.js";
import { ensureDeployInGitignore } from "../../core/utils/gitignore.js";
import { warmCache, normalizePaths } from "../../core/aws/cache-warmer.js";
import { createS3Client } from "../../core/aws/client.js";
import { deleteS3Bucket } from "../../core/aws/s3-bucket.js";

/**
 * Deploy command options
 */
interface DeployOptions {
  env?: string;
  config?: string;
  profile?: string;
  dryRun?: boolean;
  noCloudfront?: boolean;
  force?: boolean;
  skipCache?: boolean;
  skipBuild?: boolean;
  noRollback?: boolean;
  noCleanup?: boolean;
}

/**
 * Create deploy command
 */
export function createDeployCommand(): Command {
  const command = new Command("deploy");

  command
    .description("Deploy static site to S3 and CloudFront")
    .option("-e, --env <environment>", "Environment name (dev, prod, etc.)")
    .option("-c, --config <path>", "Config file path", "scf.config.ts")
    .option("-p, --profile <profile>", "AWS profile name")
    .option("--dry-run", "Preview deployment without uploading")
    .option("--no-cloudfront", "Skip CloudFront deployment")
    .option("--force", "Force full deployment (ignore state)")
    .option("--skip-cache", "Skip CloudFront cache invalidation")
    .option("--skip-build", "Skip automatic build before deployment")
    .option("--no-rollback", "Keep S3 bucket if CloudFront deployment fails")
    .option("--no-cleanup", "Skip deletion of removed files from S3")
    .action(async (options: DeployOptions) => {
      try {
        await deployCommand(options);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Deploy command handler
 */
async function deployCommand(options: DeployOptions): Promise<void> {
  const {
    env,
    config: configPath = "scf.config.ts",
    profile,
    dryRun = false,
    noCloudfront = false,
    force = false,
    skipCache = false,
    skipBuild = false,
    noRollback = false,
    noCleanup = false,
  } = options;

  // Header
  console.log();
  console.log(chalk.bold.blue("=� SCF Deployment"));
  console.log();

  // Step 1: Auto-build project
  await autoBuild({
    showProgress: true,
    skipBuild,
  });

  // Step 2: Load config
  logger.info("Loading configuration...");
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

  logger.success(`Configuration loaded: ${chalk.cyan(config.app)}`);
  logger.keyValue("Environment", env || "base config");
  logger.keyValue("Region", config.region);

  if (dryRun) {
    logger.warn("Dry-run mode enabled - no actual deployment");
  }
  if (force) {
    logger.warn("Force mode enabled - all files will be re-uploaded");
  }

  // Step 3: Verify credentials
  console.log();
  logger.info("Verifying AWS credentials...");

  const { credentials } = await getCredentials(config);
  const accountInfo = await verifyCredentials(credentials, config.region);

  logger.success("Credentials verified");
  logger.keyValue("Account ID", accountInfo.accountId);
  logger.keyValue("User ARN", accountInfo.arn);

  // Step 4: Deploy to S3
  logger.section("S3 Deployment");

  const s3Client = createS3Client(config);
  const bucketName = config.s3?.bucketName || "";

  const s3Stats = await deployToS3(config, {
    environment: env,
    dryRun,
    forceFullDeploy: force,
    showProgress: true,
    cleanupDeletedFiles: !noCleanup,
  });

  // Step 5: Deploy to CloudFront (if enabled)
  if (config.cloudfront?.enabled && !noCloudfront && !dryRun) {
    logger.section("CloudFront Deployment");

    try {
      const cfResult = await deployToCloudFront(config, s3Stats, {
        environment: env,
        invalidateAll: !skipCache && s3Stats.uploaded > 0,
        showProgress: true,
      });

      // Step 6: Cache warming (if enabled)
      if (config.cloudfront?.cacheWarming?.enabled) {
        const cacheWarmingConfig = config.cloudfront.cacheWarming;
        const paths = normalizePaths(cacheWarmingConfig.paths || ["/"]);
        const concurrency = cacheWarmingConfig.concurrency || 3;
        const delay = cacheWarmingConfig.delay || 4000000;

        try {
          await warmCache({
            distributionDomain: cfResult.distributionUrl,
            paths,
            concurrency,
            delay,
          });
        } catch (error) {
          logger.warn("Cache warming failed, but deployment was successful");
          console.log(
            chalk.dim(
              `  Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            )
          );
        }
      }

      // Summary
      logger.section("Deployment Summary");
      logger.keyValue(
        "S3 Files Uploaded",
        `${s3Stats.uploaded}/${s3Stats.totalFiles}`
      );
      logger.keyValue("CloudFront Distribution", cfResult.distributionId);
      logger.keyValue("CloudFront URL", cfResult.distributionUrl);

      if (cfResult.isNewDistribution) {
        logger.info("New CloudFront distribution created");
      }

      console.log();
      console.log(chalk.green.bold("( Deployment completed successfully!"));
    } catch (cfError) {
      // CloudFront deployment failed - consider rollback
      console.log();
      logger.error(
        `CloudFront deployment failed: ${
          cfError instanceof Error ? cfError.message : String(cfError)
        }`
      );

      // Rollback S3 bucket if it was newly created in this deployment and rollback is not disabled
      if (s3Stats.bucketCreated && !noRollback && bucketName) {
        console.log();
        logger.warn("Rolling back S3 bucket (newly created)...");
        try {
          await deleteS3Bucket(s3Client, bucketName, config.region);
          logger.success("Rollback: S3 bucket deleted");
        } catch (rollbackError) {
          logger.warn(
            `Rollback warning: Could not delete S3 bucket: ${
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError)
            }`
          );
        }
      } else if (s3Stats.bucketCreated && noRollback) {
        console.log();
        logger.info(
          "S3 bucket was NOT rolled back (--no-rollback flag used)"
        );
        logger.info(`Bucket name: ${bucketName}`);
      }

      throw cfError;
    }
  } else {
    // S3 only summary
    logger.section("Deployment Summary");
    logger.keyValue(
      "S3 Files Uploaded",
      `${s3Stats.uploaded}/${s3Stats.totalFiles}`
    );

    if (config.s3?.websiteHosting) {
      const websiteUrl = `http://${config.s3.bucketName}.s3-website.${config.region}.amazonaws.com`;
      logger.keyValue("Website URL", websiteUrl);
    }

    console.log();
    console.log(chalk.green.bold("( Deployment completed successfully!"));
  }

  // Ensure .gitignore has .deploy entry (after first deployment)
  ensureDeployInGitignore(undefined, true);

  console.log();
}
