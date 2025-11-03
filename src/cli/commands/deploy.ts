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
  } = options;

  // Header
  console.log();
  console.log(chalk.bold.blue("=� SCF Deployment"));
  console.log();

  // Step 1: Auto-build project
  try {
    await autoBuild({
      showProgress: true,
      skipBuild,
    });
  } catch (error) {
    throw error;
  }

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

  const s3Stats = await deployToS3(config, {
    environment: env,
    dryRun,
    forceFullDeploy: force,
    showProgress: true,
  });

  // Step 5: Deploy to CloudFront (if enabled)
  if (config.cloudfront?.enabled && !noCloudfront && !dryRun) {
    logger.section("CloudFront Deployment");

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
