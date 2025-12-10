/**
 * CloudFront Distribution management
 */

import {
  CloudFrontClient,
  CreateDistributionCommand,
  CreateOriginAccessControlCommand,
  CreateFunctionCommand,
  DeleteDistributionCommand,
  DeleteOriginAccessControlCommand,
  DeleteFunctionCommand,
  DescribeFunctionCommand,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  GetOriginAccessControlCommand,
  ListOriginAccessControlsCommand,
  ListFunctionsCommand,
  ListTagsForResourceCommand,
  PublishFunctionCommand,
  TagResourceCommand,
  UpdateDistributionCommand,
  UpdateFunctionCommand,
  waitUntilDistributionDeployed,
  type CreateDistributionCommandInput,
  type Distribution,
  type DistributionConfig,
  type UpdateDistributionCommandInput,
  type FunctionSummary,
} from "@aws-sdk/client-cloudfront";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

/**
 * Error page configuration for CloudFront Custom Error Responses
 */
export interface ErrorPageConfig {
  errorCode: number;
  responseCode?: number;
  responsePath?: string;
  cacheTTL?: number;
}

/**
 * Distribution creation options
 */
export interface CreateDistributionOptions {
  s3BucketName: string;
  s3Region: string;
  indexDocument?: string;
  customDomain?: {
    domainName: string;
    certificateArn?: string;
    aliases?: string[];
  };
  priceClass?: "PriceClass_100" | "PriceClass_200" | "PriceClass_All";
  ipv6?: boolean;
  /** Custom error responses for SPA routing */
  errorPages?: ErrorPageConfig[];
  /** Origin Access Control ID for S3 access */
  oacId: string;
  /** CloudFront Function ARN for index routing */
  functionArn: string;
}

/**
 * Check if distribution exists
 */
export async function distributionExists(
  client: CloudFrontClient,
  distributionId: string
): Promise<boolean> {
  try {
    await client.send(
      new GetDistributionCommand({
        Id: distributionId,
      })
    );
    return true;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      (("name" in error && error.name === "NoSuchDistribution") ||
        ("$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata &&
          error.$metadata.httpStatusCode === 404))
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Get distribution details
 */
export async function getDistribution(
  client: CloudFrontClient,
  distributionId: string
): Promise<Distribution | null> {
  try {
    const response = await client.send(
      new GetDistributionCommand({
        Id: distributionId,
      })
    );
    return response.Distribution || null;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      (("name" in error && error.name === "NoSuchDistribution") ||
        ("$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata &&
          error.$metadata.httpStatusCode === 404))
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Get S3 REST API origin domain name (not website endpoint)
 * Used with OAC for secure access
 */
function getS3OriginDomain(bucketName: string, region: string): string {
  // Use S3 REST API endpoint for OAC (not website endpoint)
  if (region === "us-east-1") {
    return `${bucketName}.s3.amazonaws.com`;
  }
  return `${bucketName}.s3.${region}.amazonaws.com`;
}

/**
 * CloudFront Function code for index.html routing
 * Handles SPA/MPA routing by appending index.html to directory paths
 */
const INDEX_ROUTING_FUNCTION_CODE = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Handle root path
  if (uri === '/') {
    request.uri = '/index.html';
    return request;
  }

  // If URI ends with /, append index.html
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
    return request;
  }

  // If URI doesn't have an extension, try as directory
  if (!uri.includes('.')) {
    request.uri += '/index.html';
  }

  return request;
}
`.trim();

/**
 * Origin Access Control (OAC) result
 */
export interface OACResult {
  id: string;
  name: string;
}

/**
 * CloudFront Function result
 */
export interface CloudFrontFunctionResult {
  name: string;
  arn: string;
}

/**
 * Create or get existing Origin Access Control
 */
export async function ensureOriginAccessControl(
  client: CloudFrontClient,
  name: string
): Promise<OACResult> {
  // Check if OAC already exists
  const existingOAC = await findOriginAccessControl(client, name);
  if (existingOAC) {
    return existingOAC;
  }

  // Create new OAC
  const response = await client.send(
    new CreateOriginAccessControlCommand({
      OriginAccessControlConfig: {
        Name: name,
        Description: `OAC for SCF deployment: ${name}`,
        SigningProtocol: "sigv4",
        SigningBehavior: "always",
        OriginAccessControlOriginType: "s3",
      },
    })
  );

  if (!response.OriginAccessControl?.Id) {
    throw new Error("Failed to create Origin Access Control");
  }

  return {
    id: response.OriginAccessControl.Id,
    name: name,
  };
}

/**
 * Find existing Origin Access Control by name
 */
async function findOriginAccessControl(
  client: CloudFrontClient,
  name: string
): Promise<OACResult | null> {
  let marker: string | undefined;

  do {
    const response = await client.send(
      new ListOriginAccessControlsCommand({
        Marker: marker,
      })
    );

    const items = response.OriginAccessControlList?.Items || [];
    for (const item of items) {
      if (item.Name === name && item.Id) {
        return {
          id: item.Id,
          name: item.Name,
        };
      }
    }

    marker = response.OriginAccessControlList?.NextMarker;
  } while (marker);

  return null;
}

/**
 * Delete Origin Access Control
 */
export async function deleteOriginAccessControl(
  client: CloudFrontClient,
  oacId: string
): Promise<void> {
  try {
    // Get ETag first
    const getResponse = await client.send(
      new GetOriginAccessControlCommand({
        Id: oacId,
      })
    );

    if (getResponse.ETag) {
      await client.send(
        new DeleteOriginAccessControlCommand({
          Id: oacId,
          IfMatch: getResponse.ETag,
        })
      );
    }
  } catch (error) {
    // Ignore if already deleted
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "NoSuchOriginAccessControl"
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Create or update CloudFront Function for index routing
 */
export async function ensureIndexRoutingFunction(
  client: CloudFrontClient,
  functionName: string
): Promise<CloudFrontFunctionResult> {
  // Check if function already exists
  const existingFunction = await findCloudFrontFunction(client, functionName);

  if (existingFunction) {
    // Update existing function
    return await updateCloudFrontFunction(client, functionName, existingFunction);
  }

  // Create new function
  const createResponse = await client.send(
    new CreateFunctionCommand({
      Name: functionName,
      FunctionConfig: {
        Comment: `Index routing function for SCF: ${functionName}`,
        Runtime: "cloudfront-js-2.0",
      },
      FunctionCode: new TextEncoder().encode(INDEX_ROUTING_FUNCTION_CODE),
    })
  );

  if (!createResponse.FunctionSummary?.FunctionMetadata?.FunctionARN) {
    throw new Error("Failed to create CloudFront Function");
  }

  // Publish the function
  const publishResponse = await client.send(
    new PublishFunctionCommand({
      Name: functionName,
      IfMatch: createResponse.ETag!,
    })
  );

  if (!publishResponse.FunctionSummary?.FunctionMetadata?.FunctionARN) {
    throw new Error("Failed to publish CloudFront Function");
  }

  return {
    name: functionName,
    arn: publishResponse.FunctionSummary.FunctionMetadata.FunctionARN,
  };
}

/**
 * Find existing CloudFront Function by name
 */
async function findCloudFrontFunction(
  client: CloudFrontClient,
  functionName: string
): Promise<FunctionSummary | null> {
  let marker: string | undefined;

  do {
    const response = await client.send(
      new ListFunctionsCommand({
        Marker: marker,
        Stage: "LIVE",
      })
    );

    const items = response.FunctionList?.Items || [];
    for (const item of items) {
      if (item.Name === functionName) {
        return item;
      }
    }

    marker = response.FunctionList?.NextMarker;
  } while (marker);

  return null;
}

/**
 * Update existing CloudFront Function
 */
async function updateCloudFrontFunction(
  client: CloudFrontClient,
  functionName: string,
  _existingFunction: FunctionSummary
): Promise<CloudFrontFunctionResult> {
  // Get current function details to get ETag
  const describeResponse = await client.send(
    new DescribeFunctionCommand({
      Name: functionName,
      Stage: "DEVELOPMENT",
    })
  );

  // Update function code
  const updateResponse = await client.send(
    new UpdateFunctionCommand({
      Name: functionName,
      FunctionConfig: {
        Comment: `Index routing function for SCF: ${functionName}`,
        Runtime: "cloudfront-js-2.0",
      },
      FunctionCode: new TextEncoder().encode(INDEX_ROUTING_FUNCTION_CODE),
      IfMatch: describeResponse.ETag!,
    })
  );

  // Publish the updated function
  const publishResponse = await client.send(
    new PublishFunctionCommand({
      Name: functionName,
      IfMatch: updateResponse.ETag!,
    })
  );

  if (!publishResponse.FunctionSummary?.FunctionMetadata?.FunctionARN) {
    throw new Error("Failed to publish updated CloudFront Function");
  }

  return {
    name: functionName,
    arn: publishResponse.FunctionSummary.FunctionMetadata.FunctionARN,
  };
}

/**
 * Delete CloudFront Function
 */
export async function deleteCloudFrontFunction(
  client: CloudFrontClient,
  functionName: string
): Promise<void> {
  try {
    // Get function ETag
    const describeResponse = await client.send(
      new DescribeFunctionCommand({
        Name: functionName,
        Stage: "LIVE",
      })
    );

    if (describeResponse.ETag) {
      await client.send(
        new DeleteFunctionCommand({
          Name: functionName,
          IfMatch: describeResponse.ETag,
        })
      );
    }
  } catch (error) {
    // Ignore if already deleted
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      (error.name === "NoSuchFunctionExists" ||
        error.name === "FunctionInUse")
    ) {
      return;
    }
    throw error;
  }
}

/**
 * Create CloudFront distribution
 */
export async function createDistribution(
  client: CloudFrontClient,
  options: CreateDistributionOptions
): Promise<Distribution> {
  const {
    s3BucketName,
    s3Region,
    indexDocument = "index.html",
    customDomain,
    priceClass = "PriceClass_100",
    ipv6 = true,
    errorPages,
    oacId,
    functionArn,
  } = options;

  // AWS Managed Cache Policy: CachingOptimized
  // This enables CloudFront Free tier pricing plan compatibility
  const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";

  const originDomain = getS3OriginDomain(s3BucketName, s3Region);
  const callerReference = `scf-${Date.now()}`;

  const distributionConfig: DistributionConfig = {
    CallerReference: callerReference,
    Comment: `Created by SCF for ${s3BucketName}`,
    Enabled: true,
    DefaultRootObject: indexDocument,
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: `S3-${s3BucketName}`,
          DomainName: originDomain,
          // Use S3OriginConfig with OAC for secure access (not CustomOriginConfig)
          S3OriginConfig: {
            OriginAccessIdentity: "", // Empty string required when using OAC
          },
          OriginAccessControlId: oacId,
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: `S3-${s3BucketName}`,
      ViewerProtocolPolicy: "redirect-to-https",
      AllowedMethods: {
        Quantity: 2,
        Items: ["GET", "HEAD"],
        CachedMethods: {
          Quantity: 2,
          Items: ["GET", "HEAD"],
        },
      },
      Compress: true,
      // Use Cache Policy instead of Legacy ForwardedValues
      // This enables CloudFront Free tier pricing plan compatibility
      CachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
      // CloudFront Function for index.html routing
      FunctionAssociations: {
        Quantity: 1,
        Items: [
          {
            EventType: "viewer-request",
            FunctionARN: functionArn,
          },
        ],
      },
    },
    PriceClass: priceClass,
    IsIPV6Enabled: ipv6,
  };

  // Add custom domain configuration
  if (customDomain && customDomain.certificateArn) {
    distributionConfig.Aliases = {
      Quantity: customDomain.aliases?.length || 1,
      Items: customDomain.aliases || [customDomain.domainName],
    };

    distributionConfig.ViewerCertificate = {
      ACMCertificateArn: customDomain.certificateArn,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021",
    };
  } else {
    distributionConfig.ViewerCertificate = {
      CloudFrontDefaultCertificate: true,
    };
  }

  // Add custom error responses (for SPA routing)
  if (errorPages && errorPages.length > 0) {
    distributionConfig.CustomErrorResponses = {
      Quantity: errorPages.length,
      Items: errorPages.map((errorPage) => ({
        ErrorCode: errorPage.errorCode,
        ResponsePagePath: errorPage.responsePath,
        ResponseCode: errorPage.responseCode?.toString(),
        ErrorCachingMinTTL: errorPage.cacheTTL,
      })),
    };
  }

  const command: CreateDistributionCommandInput = {
    DistributionConfig: distributionConfig,
  };

  const response = await client.send(new CreateDistributionCommand(command));

  if (!response.Distribution) {
    throw new Error("Failed to create distribution: No distribution returned");
  }

  return response.Distribution;
}

/**
 * Update existing distribution
 */
export async function updateDistribution(
  client: CloudFrontClient,
  distributionId: string,
  updates: Partial<CreateDistributionOptions>
): Promise<Distribution> {
  // Get current configuration
  const configResponse = await client.send(
    new GetDistributionConfigCommand({
      Id: distributionId,
    })
  );

  const currentConfig = configResponse.DistributionConfig;
  const etag = configResponse.ETag;

  if (!currentConfig || !etag) {
    throw new Error("Failed to get distribution configuration");
  }

  // Apply updates
  if (updates.priceClass) {
    currentConfig.PriceClass = updates.priceClass;
  }

  if (!currentConfig.DefaultCacheBehavior) {
    throw new Error("Distribution configuration missing DefaultCacheBehavior");
  }

  // Note: TTL settings are now managed by Cache Policy (CachingOptimized)
  // Legacy TTL updates (defaultTTL, maxTTL, minTTL) are no longer supported

  if (updates.ipv6 !== undefined) {
    currentConfig.IsIPV6Enabled = updates.ipv6;
  }

  if (updates.customDomain && updates.customDomain.certificateArn) {
    currentConfig.Aliases = {
      Quantity: updates.customDomain.aliases?.length || 1,
      Items: updates.customDomain.aliases || [updates.customDomain.domainName],
    };

    currentConfig.ViewerCertificate = {
      ACMCertificateArn: updates.customDomain.certificateArn,
      SSLSupportMethod: "sni-only",
      MinimumProtocolVersion: "TLSv1.2_2021",
    };
  }

  // Update custom error responses (for SPA routing)
  if (updates.errorPages && updates.errorPages.length > 0) {
    currentConfig.CustomErrorResponses = {
      Quantity: updates.errorPages.length,
      Items: updates.errorPages.map((errorPage) => ({
        ErrorCode: errorPage.errorCode,
        ResponsePagePath: errorPage.responsePath,
        ResponseCode: errorPage.responseCode?.toString(),
        ErrorCachingMinTTL: errorPage.cacheTTL,
      })),
    };
  }

  const command: UpdateDistributionCommandInput = {
    Id: distributionId,
    DistributionConfig: currentConfig,
    IfMatch: etag,
  };

  try {
    const response = await client.send(new UpdateDistributionCommand(command));

    if (!response.Distribution) {
      throw new Error(
        "Failed to update distribution: No distribution returned"
      );
    }

    return response.Distribution;
  } catch (error) {
    // Handle Free pricing plan restriction
    if (
      error instanceof Error &&
      error.message.includes("Free pricing plan") &&
      error.message.includes("Price class")
    ) {
      console.warn(
        "\n⚠️  Free pricing plan detected - skipping priceClass update"
      );
      console.warn(
        "   Free plan distributions use all edge locations (equivalent to PriceClass_All)\n"
      );

      // Retry without priceClass change - restore original priceClass
      const retryConfigResponse = await client.send(
        new GetDistributionConfigCommand({ Id: distributionId })
      );

      if (
        !retryConfigResponse.DistributionConfig ||
        !retryConfigResponse.ETag
      ) {
        throw new Error("Failed to get distribution configuration for retry");
      }

      const retryConfig = retryConfigResponse.DistributionConfig;
      const retryEtag = retryConfigResponse.ETag;

      // Apply updates except priceClass
      if (!retryConfig.DefaultCacheBehavior) {
        throw new Error(
          "Distribution configuration missing DefaultCacheBehavior"
        );
      }

      if (updates.ipv6 !== undefined) {
        retryConfig.IsIPV6Enabled = updates.ipv6;
      }

      if (updates.customDomain && updates.customDomain.certificateArn) {
        retryConfig.Aliases = {
          Quantity: updates.customDomain.aliases?.length || 1,
          Items: updates.customDomain.aliases || [
            updates.customDomain.domainName,
          ],
        };

        retryConfig.ViewerCertificate = {
          ACMCertificateArn: updates.customDomain.certificateArn,
          SSLSupportMethod: "sni-only",
          MinimumProtocolVersion: "TLSv1.2_2021",
        };
      }

      if (updates.errorPages && updates.errorPages.length > 0) {
        retryConfig.CustomErrorResponses = {
          Quantity: updates.errorPages.length,
          Items: updates.errorPages.map((errorPage) => ({
            ErrorCode: errorPage.errorCode,
            ResponsePagePath: errorPage.responsePath,
            ResponseCode: errorPage.responseCode?.toString(),
            ErrorCachingMinTTL: errorPage.cacheTTL,
          })),
        };
      }

      const retryCommand: UpdateDistributionCommandInput = {
        Id: distributionId,
        DistributionConfig: retryConfig,
        IfMatch: retryEtag,
      };

      const retryResponse = await client.send(
        new UpdateDistributionCommand(retryCommand)
      );

      if (!retryResponse.Distribution) {
        throw new Error(
          "Failed to update distribution: No distribution returned"
        );
      }

      return retryResponse.Distribution;
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Wait for distribution to be deployed
 */
export async function waitForDistributionDeployed(
  client: CloudFrontClient,
  distributionId: string,
  options: {
    maxWaitTime?: number; // seconds
    minDelay?: number; // seconds
    maxDelay?: number; // seconds
  } = {}
): Promise<void> {
  const { maxWaitTime = 1200, minDelay = 20, maxDelay = 60 } = options;

  await waitUntilDistributionDeployed(
    {
      client,
      maxWaitTime,
      minDelay,
      maxDelay,
    },
    {
      Id: distributionId,
    }
  );
}

/**
 * Get distribution domain name
 */
export function getDistributionDomainName(distribution: Distribution): string {
  return distribution.DomainName || "";
}

/**
 * Get distribution URL
 */
export function getDistributionUrl(distribution: Distribution): string {
  const domainName = getDistributionDomainName(distribution);
  return domainName ? `https://${domainName}` : "";
}

/**
 * Get AWS account ID from STS
 */
async function getAccountId(region: string): Promise<string> {
  const stsClient = new STSClient({ region });
  const identity = await stsClient.send(new GetCallerIdentityCommand({}));

  if (!identity.Account) {
    throw new Error("Failed to get AWS account ID");
  }

  return identity.Account;
}

/**
 * Get distribution ARN
 */
function getDistributionArn(accountId: string, distributionId: string): string {
  return `arn:aws:cloudfront::${accountId}:distribution/${distributionId}`;
}

/**
 * Tag distribution for state recovery
 */
export async function tagDistributionForRecovery(
  client: CloudFrontClient,
  distributionId: string,
  app: string,
  environment: string,
  region: string = "us-east-1"
): Promise<void> {
  try {
    const accountId = await getAccountId(region);
    const distributionArn = getDistributionArn(accountId, distributionId);

    await client.send(
      new TagResourceCommand({
        Resource: distributionArn,
        Tags: {
          Items: [
            { Key: "scf:managed", Value: "true" },
            { Key: "scf:app", Value: app },
            { Key: "scf:environment", Value: environment },
            { Key: "scf:tool", Value: "scf-deploy" },
          ],
        },
      })
    );
  } catch (error) {
    // Non-critical error, just log it
    console.warn("Warning: Failed to tag CloudFront distribution for recovery");
    if (error instanceof Error) {
      console.warn(`Reason: ${error.message}`);
    }
  }
}

/**
 * Get distribution tags
 */
export async function getDistributionTags(
  client: CloudFrontClient,
  distributionId: string,
  region: string = "us-east-1"
): Promise<Record<string, string>> {
  try {
    const accountId = await getAccountId(region);
    const distributionArn = getDistributionArn(accountId, distributionId);

    const result = await client.send(
      new ListTagsForResourceCommand({
        Resource: distributionArn,
      })
    );

    const tags: Record<string, string> = {};
    if (result.Tags && result.Tags.Items) {
      for (const tag of result.Tags.Items) {
        if (tag.Key && tag.Value) {
          tags[tag.Key] = tag.Value;
        }
      }
    }
    return tags;
  } catch (_error) {
    // Return empty tags if we can't read them
    return {};
  }
}

/**
 * Delete CloudFront distribution
 * This will disable the distribution first, then delete it
 */
export async function deleteCloudFrontDistribution(
  client: CloudFrontClient,
  distributionId: string
): Promise<void> {
  const ora = (await import("ora")).default;
  const chalk = (await import("chalk")).default;
  const spinner = ora("Deleting CloudFront distribution...").start();

  try {
    // Get distribution
    spinner.text = "Getting distribution details...";
    const getDistResult = await client.send(
      new GetDistributionCommand({
        Id: distributionId,
      })
    );

    // Wait if distribution is deploying
    if (getDistResult.Distribution?.Status === "InProgress") {
      spinner.text = "Waiting for distribution deployment to complete...";
      try {
        await waitForDistributionDeployed(client, distributionId, {
          maxWaitTime: 1800, // Extended to 30 minutes
          minDelay: 20,
          maxDelay: 60,
        });
      } catch (_waitError) {
        // Check current status before giving up
        const currentDist = await getDistribution(client, distributionId);
        if (currentDist?.Status === "InProgress") {
          spinner.warn(
            "Distribution deployment is taking longer than expected"
          );
          console.log();
          console.log(chalk.yellow("The distribution is still deploying."));
          console.log(chalk.gray("Options:"));
          console.log(chalk.gray(`  1. Wait and retry: scf remove`));
          console.log(
            chalk.gray(
              `  2. Check status: aws cloudfront get-distribution --id ${distributionId}`
            )
          );
          console.log(chalk.gray("  3. Delete via AWS Console"));
          console.log();
          throw new Error(
            `Distribution ${distributionId} deployment timed out. Please retry later.`
          );
        }
        // Status changed to Deployed, continue
      }
    }

    // Get distribution config
    spinner.text = "Disabling distribution...";
    const configResult = await client.send(
      new GetDistributionConfigCommand({
        Id: distributionId,
      })
    );

    if (configResult.DistributionConfig && configResult.ETag) {
      // Disable distribution if not already disabled
      if (configResult.DistributionConfig.Enabled) {
        configResult.DistributionConfig.Enabled = false;

        await client.send(
          new UpdateDistributionCommand({
            Id: distributionId,
            DistributionConfig: configResult.DistributionConfig,
            IfMatch: configResult.ETag,
          })
        );

        spinner.text = "Waiting for distribution to be disabled...";
        try {
          await waitForDistributionDeployed(client, distributionId, {
            maxWaitTime: 1800, // Extended to 30 minutes
            minDelay: 20,
            maxDelay: 60,
          });
        } catch (_waitError) {
          // Check current status before giving up
          const currentDist = await getDistribution(client, distributionId);
          if (currentDist?.Status === "InProgress") {
            spinner.warn("Distribution disable is taking longer than expected");
            console.log();
            console.log(
              chalk.yellow("The distribution is still being disabled.")
            );
            console.log(chalk.gray("Options:"));
            console.log(chalk.gray(`  1. Wait and retry: scf remove`));
            console.log(
              chalk.gray(
                `  2. Check status: aws cloudfront get-distribution --id ${distributionId}`
              )
            );
            console.log(chalk.gray("  3. Delete via AWS Console"));
            console.log();
            throw new Error(
              `Distribution ${distributionId} disable timed out. Please retry later.`
            );
          }
          // Status changed to Deployed (disabled), continue with deletion
        }
      }

      // Get updated ETag
      const updatedConfigResult = await client.send(
        new GetDistributionConfigCommand({
          Id: distributionId,
        })
      );

      // Delete distribution
      if (updatedConfigResult.ETag) {
        spinner.text = "Deleting distribution...";
        await client.send(
          new DeleteDistributionCommand({
            Id: distributionId,
            IfMatch: updatedConfigResult.ETag,
          })
        );

        spinner.succeed("CloudFront distribution deleted successfully");
      }
    }
  } catch (error) {
    spinner.fail("Failed to delete CloudFront distribution");

    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "NoSuchDistribution"
    ) {
      throw new Error("Distribution not found (may have been already deleted)");
    }

    throw new Error(
      `CloudFront distribution deletion failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Delete distribution without UI (for E2E tests)
 * @param client CloudFront client
 * @param distributionId Distribution ID
 * @param options Options
 * @returns True if deleted, false if already disabled/deleted
 */
export async function deleteDistributionQuiet(
  client: CloudFrontClient,
  distributionId: string,
  options: {
    wait?: boolean;
    maxWaitTime?: number;
  } = {}
): Promise<boolean> {
  const { wait = true, maxWaitTime = 300 } = options;

  try {
    // Get current distribution
    const result = await client.send(
      new GetDistributionCommand({
        Id: distributionId,
      })
    );

    if (!result.Distribution || !result.ETag) {
      return false;
    }

    const dist = result.Distribution;

    // If enabled, disable it first
    if (dist.DistributionConfig?.Enabled) {
      const configResult = await client.send(
        new GetDistributionConfigCommand({
          Id: distributionId,
        })
      );

      if (!configResult.DistributionConfig || !configResult.ETag) {
        throw new Error("Could not get distribution config");
      }

      const updatedConfig: DistributionConfig = {
        ...configResult.DistributionConfig,
        Enabled: false,
      };

      const updateInput: UpdateDistributionCommandInput = {
        Id: distributionId,
        DistributionConfig: updatedConfig,
        IfMatch: configResult.ETag,
      };

      await client.send(new UpdateDistributionCommand(updateInput));

      // Wait for distribution to be deployed (disabled state)
      if (wait) {
        await waitUntilDistributionDeployed(
          { client, maxWaitTime, minDelay: 10, maxDelay: 30 },
          { Id: distributionId }
        );
      }
    }

    // Now delete it
    if (wait) {
      const updatedConfigResult = await client.send(
        new GetDistributionConfigCommand({
          Id: distributionId,
        })
      );

      if (updatedConfigResult.ETag) {
        await client.send(
          new DeleteDistributionCommand({
            Id: distributionId,
            IfMatch: updatedConfigResult.ETag,
          })
        );
      }
    }

    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "NoSuchDistribution"
    ) {
      return false; // Already deleted
    }

    throw new Error(
      `CloudFront distribution deletion failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
