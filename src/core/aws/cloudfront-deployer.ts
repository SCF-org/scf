/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CloudFront Deployer - Main deployment orchestrator
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { SCFConfig } from "../../types/config.js";
import type { DeploymentStats, UploadOptions } from "../../types/deployer.js";
import { createCloudFrontClient } from "./client.js";
import {
  distributionExists,
  getDistribution,
  createDistribution,
  updateDistribution,
  waitForDistributionDeployed,
  getDistributionUrl,
  tagDistributionForRecovery,
  type CreateDistributionOptions,
} from "./cloudfront-distribution.js";
import { invalidateCache, invalidateAll } from "./cloudfront-invalidation.js";
import {
  loadState,
  saveState,
  getOrCreateState,
  updateCloudFrontResource,
  getCloudFrontResource,
} from "../state/index.js";
import { ACMManager } from "./acm-manager.js";
import { Route53Manager } from "./route53-manager.js";
import { createCredentialProvider } from "./credentials.js";

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
  environment?: string;
  saveState?: boolean;
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
    throw new Error("CloudFront is not enabled in configuration");
  }

  if (!config.s3?.bucketName) {
    throw new Error("S3 bucket name is required for CloudFront deployment");
  }

  const {
    distributionId: existingDistributionId,
    invalidatePaths,
    invalidateAll: shouldInvalidateAll = false,
    waitForDeployment = true,
    waitForInvalidation = true,
    showProgress = true,
    environment = "default",
    saveState: shouldSaveState = true,
  } = options;

  const cloudFrontConfig = config.cloudfront;
  const s3Config = config.s3;

  // Create CloudFront client
  const cfClient = createCloudFrontClient(config);

  // Variables used across steps (including after conditional blocks)
  let cleanZoneIdForError: string | null = null;
  let route53ManagerRef: Route53Manager | null = null;
  let hostedZoneCreated = false;
  let certificateRequestedNew = false;

  // Step 0: Auto-create SSL certificate if customDomain is set but certificateArn is missing
  if (
    cloudFrontConfig.customDomain &&
    !cloudFrontConfig.customDomain.certificateArn
  ) {
    const domainName = cloudFrontConfig.customDomain.domainName;
    const aliases = cloudFrontConfig.customDomain.aliases;

    console.log();
    console.log(
      chalk.bold.cyan("🔐 Custom domain detected without certificate")
    );
    console.log(chalk.gray(`   Domain: ${domainName}`));
    console.log(
      chalk.gray("   Starting automatic SSL certificate creation...")
    );
    console.log();

    // Track hosted zone for better error messaging and for alias creation later

    try {
      // Initialize managers with proper credentials
      const credentials = createCredentialProvider(config);
      const acmManager = new ACMManager({ credentials });
      const route53Manager = new Route53Manager({
        region: config.region,
        credentials,
      });
      route53ManagerRef = route53Manager;

      // Step 0-1: Validate Route53 hosted zone exists
      // Detect whether hosted zone is going to be created
      const existingZone = await route53Manager.findHostedZone(domainName);
      const hostedZoneId = await route53Manager.validateHostedZone(
        domainName,
        config.app,
        environment || 'default'
      );
      const cleanZoneId = route53Manager.extractHostedZoneId(hostedZoneId);
      cleanZoneIdForError = cleanZoneId;
      hostedZoneCreated = !existingZone;
      console.log(
        chalk.green("✓"),
        `Route53 hosted zone found: ${chalk.cyan(cleanZoneId)}`
      );

      // Step 0-2: Check for existing certificate
      const existingCertArn = await acmManager.findExistingCertificate(
        domainName
      );

      let certificateArn: string;

      if (existingCertArn) {
        console.log(
          chalk.green("✓"),
          `Existing certificate found: ${chalk.cyan(
            existingCertArn.split("/").pop()
          )}`
        );
        console.log(chalk.gray("   Reusing existing certificate"));
        certificateArn = existingCertArn;
      } else {
        // Step 0-3: Request new certificate
        console.log(
          chalk.yellow("⚠"),
          "No existing certificate found - creating new one"
        );
        certificateArn = await acmManager.requestCertificate(
          domainName,
          aliases,
          config.app,
          environment || 'default'
        );
        console.log(
          chalk.green("✓"),
          `Certificate requested: ${chalk.cyan(
            certificateArn.split("/").pop()
          )}`
        );
        certificateRequestedNew = true;

        // Step 0-4: Get DNS validation records
        console.log();
        console.log(
          chalk.gray("   Waiting for validation records to be available...")
        );

        // Wait a bit for AWS to generate validation records
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const validationRecords =
          await acmManager.getCertificateValidationRecords(certificateArn);
        console.log(
          chalk.green("✓"),
          `Got ${validationRecords.length} DNS validation record(s)`
        );

        // Step 0-5: Create DNS validation records in Route53
        await route53Manager.createValidationRecords(
          cleanZoneId,
          validationRecords
        );

        // Step 0-6: Wait for certificate validation
        console.log();
        console.log(
          chalk.bold.yellow("⏳ Waiting for certificate validation...")
        );
        console.log(chalk.gray("   This typically takes 5-30 minutes"));
        console.log(chalk.gray("   Please be patient while DNS propagates"));
        console.log(
          chalk.gray(
            "   Note: If your domain is not delegated to Route53 (or the ACM CNAME is not set), this will continue waiting."
          )
        );
        console.log();

        await acmManager.waitForCertificateValidation(certificateArn, 30);

        console.log();
        console.log(
          chalk.green("✓"),
          chalk.bold("Certificate validated successfully!")
        );
      }

      // Update config with certificate ARN
      cloudFrontConfig.customDomain.certificateArn = certificateArn;

      console.log();
      console.log(
        chalk.green("✓"),
        chalk.bold("SSL certificate ready for CloudFront")
      );
      console.log();
    } catch (error) {
      console.log();
      console.log(
        chalk.red("✗"),
        chalk.bold("SSL certificate creation failed")
      );
      console.log();

      if (error instanceof Error) {
        console.error(chalk.red(error.message));
      }

      console.log();
      console.log(chalk.yellow("Next steps:"));
      console.log(
        chalk.gray(
          "  - ACM is handled automatically. You only need to delegate your domain's name servers (NS) to Route53."
        )
      );
      if (cleanZoneIdForError) {
        try {
          const credentials = createCredentialProvider(config);
          const route53Manager = new Route53Manager({
            region: config.region,
            credentials,
          });
          const nameServers = await route53Manager.getNameServers(
            cleanZoneIdForError
          );
          if (nameServers.length > 0) {
            console.log(
              chalk.gray(
                "  - Update your domain registrar to use the following Route53 name servers:"
              )
            );
            nameServers.forEach((ns) => console.log(chalk.gray(`    - ${ns}`)));
          }
        } catch {
          // best-effort: ignore
        }
      }
      console.log(
        chalk.gray(
          "  - After NS delegation propagates, rerun the deployment command."
        )
      );
      console.log();
      console.log(chalk.yellow("Alternative:"));
      console.log(
        chalk.gray(
          "  1) Keep external DNS: add ACM's CNAME validation record to your external DNS manually."
        )
      );
      console.log(
        chalk.gray(
          "  2) Or issue a certificate manually in ACM Console and set certificateArn in scf.config.ts."
        )
      );
      console.log();

      throw error;
    }
  }

  // Load state to get existing distribution ID
  let state = loadState({ environment });
  const stateDistributionId = state
    ? getCloudFrontResource(state)?.distributionId
    : undefined;

  // Priority: explicit option > state > none
  const resolvedDistributionId = existingDistributionId || stateDistributionId;

  let spinner: Ora | null = null;
  let distributionId: string;
  let isNewDistribution = false;
  let distribution;

  // Step 1: Check if distribution exists or create new one
  if (resolvedDistributionId) {
    if (showProgress) {
      spinner = ora("Checking CloudFront distribution...").start();
    }

    const exists = await distributionExists(cfClient, resolvedDistributionId);

    if (exists) {
      distribution = await getDistribution(cfClient, resolvedDistributionId);
      distributionId = resolvedDistributionId;

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
          spinner = ora("Updating CloudFront distribution...").start();
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

        // Sync tags after update
        await tagDistributionForRecovery(
          cfClient,
          distributionId,
          config.app,
          environment || 'default',
          config.region
        );

        if (spinner) {
          spinner.succeed("CloudFront distribution updated");
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
      spinner = ora("Creating CloudFront distribution...").start();
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
      throw new Error(
        "Failed to create CloudFront distribution: No ID returned"
      );
    }
    distributionId = distribution.Id;
    isNewDistribution = true;

    // Tag distribution for state recovery
    await tagDistributionForRecovery(
      cfClient,
      distributionId,
      config.app,
      environment || 'default',
      config.region
    );

    if (spinner) {
      spinner.succeed(
        `CloudFront distribution created: ${chalk.cyan(distributionId)}`
      );
    }
  }

  // Step 2: Wait for distribution to be deployed
  if (waitForDeployment && distribution?.Status === "InProgress") {
    if (showProgress) {
      spinner = ora("Waiting for distribution deployment...").start();
    }

    try {
      await waitForDistributionDeployed(cfClient, distributionId, {
        maxWaitTime: 1200, // 20 minutes
        minDelay: 20,
        maxDelay: 60,
      });

      if (spinner) {
        spinner.succeed("Distribution deployed");
      }
    } catch (_error: unknown) {
      if (spinner) {
        spinner.warn("Distribution deployment is taking longer than expected");
      }
      console.log(
        chalk.yellow(
          "⚠ Distribution is still deploying. You can check status later."
        )
      );
    }
  }

  // Step 3: Invalidate cache
  let invalidationId: string | undefined;

  if (shouldInvalidateAll) {
    if (showProgress) {
      spinner = ora("Invalidating all CloudFront cache...").start();
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
      spinner = ora(`Invalidating ${invalidatePaths.length} paths...`).start();
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
      spinner = ora("Invalidating updated files...").start();
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
    : "";
  const distributionDomain = finalDistribution?.DomainName || "";

  const deploymentTime = Date.now() - startTime;

  // Display final info
  console.log();
  console.log(chalk.green("🌐 CloudFront Deployment Complete"));
  console.log(chalk.gray(`Distribution ID: ${distributionId}`));
  console.log(chalk.gray(`Domain: ${distributionDomain}`));
  console.log(chalk.green("URL:"), chalk.cyan(distributionUrl));

  if (cloudFrontConfig.customDomain) {
    console.log(
      chalk.green("Custom Domain:"),
      chalk.cyan(`https://${cloudFrontConfig.customDomain.domainName}`)
    );

    // Step 5: Ensure DNS records (A/AAAA Alias) point to CloudFront
    // Only possible if we validated/created hosted zone earlier
    try {
      const credentials = createCredentialProvider(config);
      const route53Manager = route53ManagerRef || new Route53Manager({ region: config.region, credentials });

      // Re-validate hosted zone to obtain ID if not retained
      const hostedZoneId = cleanZoneIdForError
        ? cleanZoneIdForError
        : route53Manager.extractHostedZoneId(
            await route53Manager.validateHostedZone(
              cloudFrontConfig.customDomain.domainName,
              config.app,
              environment || 'default'
            )
          );

      // Create alias for primary domain
      await route53Manager.createCloudFrontAliasRecords(
        hostedZoneId,
        cloudFrontConfig.customDomain.domainName,
        distributionDomain
      );

      // Create alias for additional aliases if any
      const aliases = cloudFrontConfig.customDomain.aliases || [];
      for (const alias of aliases) {
        await route53Manager.createCloudFrontAliasRecords(
          hostedZoneId,
          alias,
          distributionDomain
        );
      }

      console.log(
        chalk.green('✓'),
        chalk.gray('DNS A/AAAA alias records created for custom domain(s)')
      );
    } catch (e: any) {
      console.log(
        chalk.yellow('⚠'),
        chalk.gray(`Failed to create A/AAAA alias records automatically: ${e?.message || String(e)}`)
      );
      console.log(
        chalk.gray('  You can create them manually: A and AAAA Alias to the CloudFront domain in Route53.')
      );
    }

    // Step 6: If this was the first setup, show final NS delegation reminder
    if (hostedZoneCreated || certificateRequestedNew) {
      try {
        const credentials = createCredentialProvider(config);
        const route53Manager = route53ManagerRef || new Route53Manager({ region: config.region, credentials });
        const hostedZoneId = cleanZoneIdForError
          ? cleanZoneIdForError
          : route53Manager.extractHostedZoneId(
              await route53Manager.validateHostedZone(
                cloudFrontConfig.customDomain.domainName,
                config.app,
                environment || 'default'
              )
            );
        const ns = await route53Manager.getNameServers(hostedZoneId);
        console.log();
        console.log(chalk.yellow("IMPORTANT:"));
        console.log(
          chalk.gray(
            "  To finish setup, delegate your domain's name servers (NS) to Route53 at your registrar."
          )
        );
        if (ns.length > 0) {
          console.log(chalk.gray("  Use these Route53 name servers:"));
          ns.forEach((n) => console.log(chalk.gray(`    - ${n}`)));
        }
        console.log(
          chalk.gray(
            "  Without NS delegation (or ACM CNAME on external DNS), certificate validation and domain access may not complete."
          )
        );
        console.log();
      } catch {
        // best-effort only
      }
    }
  }

  console.log(
    chalk.gray(`Deployment time: ${(deploymentTime / 1000).toFixed(2)}s`)
  );

  // Step 4: Save state
  if (shouldSaveState) {
    // Get or create state
    if (!state) {
      state = getOrCreateState(config.app, { environment });
    }

    // Update CloudFront resource info
    state = updateCloudFrontResource(state, {
      distributionId,
      domainName: distributionDomain,
      distributionUrl,
      aliases: cloudFrontConfig.customDomain?.aliases,
    });

    // Save state
    try {
      saveState(state, { environment });
      if (showProgress) {
        console.log();
        console.log(
          chalk.gray(
            `✓ State saved (.deploy/state${
              environment !== "default" ? `.${environment}` : ""
            }.json)`
          )
        );
      }
    } catch (error: any) {
      console.log();
      console.log(chalk.yellow(`⚠ Failed to save state: ${error.message}`));
    }
  }

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
  deployToS3: (
    config: SCFConfig,
    options?: UploadOptions
  ) => Promise<DeploymentStats>,
  options: {
    s3Options?: UploadOptions;
    cloudFrontOptions?: CloudFrontDeploymentOptions;
  } = {}
): Promise<{
  s3Stats: DeploymentStats;
  cloudFront: CloudFrontDeploymentResult;
}> {
  const { s3Options = {}, cloudFrontOptions = {} } = options;

  console.log(chalk.blue("🚀 Starting deployment...\n"));

  // Step 1: Deploy to S3
  console.log(chalk.blue("📦 Step 1: S3 Deployment\n"));
  const s3Stats = await deployToS3(config, s3Options);

  // Step 2: Deploy to CloudFront
  if (config.cloudfront?.enabled) {
    console.log(chalk.blue("\n☁️  Step 2: CloudFront Deployment\n"));
    const cloudFront = await deployToCloudFront(
      config,
      s3Stats,
      cloudFrontOptions
    );

    console.log();
    console.log(chalk.green("✨ Deployment completed successfully!"));

    return {
      s3Stats,
      cloudFront,
    };
  }

  console.log();
  console.log(chalk.green("✨ S3 deployment completed!"));

  // Return with empty CloudFront result if not enabled
  return {
    s3Stats,
    cloudFront: {
      distributionId: "",
      distributionDomain: "",
      distributionUrl: "",
      isNewDistribution: false,
      deploymentTime: 0,
    },
  };
}
