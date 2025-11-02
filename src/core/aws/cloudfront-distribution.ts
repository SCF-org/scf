/**
 * CloudFront Distribution management
 */

import {
  CloudFrontClient,
  GetDistributionCommand,
  CreateDistributionCommand,
  UpdateDistributionCommand,
  GetDistributionConfigCommand,
  waitUntilDistributionDeployed,
  type Distribution,
  type DistributionConfig,
  type CreateDistributionCommandInput,
  type UpdateDistributionCommandInput,
} from '@aws-sdk/client-cloudfront';

/**
 * Distribution creation options
 */
export interface CreateDistributionOptions {
  s3BucketName: string;
  s3Region: string;
  indexDocument?: string;
  customDomain?: {
    domainName: string;
    certificateArn: string;
    aliases?: string[];
  };
  priceClass?: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';
  defaultTTL?: number;
  maxTTL?: number;
  minTTL?: number;
  ipv6?: boolean;
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
  } catch (error: any) {
    if (error.name === 'NoSuchDistribution' || error.$metadata?.httpStatusCode === 404) {
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
  } catch (error: any) {
    if (error.name === 'NoSuchDistribution' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get S3 origin domain name
 */
function getS3OriginDomain(bucketName: string, region: string): string {
  // Use S3 website endpoint for proper index document handling
  if (region === 'us-east-1') {
    return `${bucketName}.s3-website-us-east-1.amazonaws.com`;
  }
  return `${bucketName}.s3-website.${region}.amazonaws.com`;
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
    indexDocument = 'index.html',
    customDomain,
    priceClass = 'PriceClass_100',
    defaultTTL = 86400, // 1 day
    maxTTL = 31536000, // 1 year
    minTTL = 0,
    ipv6 = true,
  } = options;

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
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: 'http-only',
            OriginSslProtocols: {
              Quantity: 1,
              Items: ['TLSv1.2'],
            },
          },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: `S3-${s3BucketName}`,
      ViewerProtocolPolicy: 'redirect-to-https',
      AllowedMethods: {
        Quantity: 2,
        Items: ['GET', 'HEAD'],
        CachedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
        },
      },
      Compress: true,
      ForwardedValues: {
        QueryString: false,
        Cookies: {
          Forward: 'none',
        },
        Headers: {
          Quantity: 0,
        },
      },
      MinTTL: minTTL,
      DefaultTTL: defaultTTL,
      MaxTTL: maxTTL,
      TrustedSigners: {
        Enabled: false,
        Quantity: 0,
      },
    },
    PriceClass: priceClass,
    IsIPV6Enabled: ipv6,
  };

  // Add custom domain configuration
  if (customDomain) {
    distributionConfig.Aliases = {
      Quantity: customDomain.aliases?.length || 1,
      Items: customDomain.aliases || [customDomain.domainName],
    };

    distributionConfig.ViewerCertificate = {
      ACMCertificateArn: customDomain.certificateArn,
      SSLSupportMethod: 'sni-only',
      MinimumProtocolVersion: 'TLSv1.2_2021',
    };
  } else {
    distributionConfig.ViewerCertificate = {
      CloudFrontDefaultCertificate: true,
    };
  }

  const command: CreateDistributionCommandInput = {
    DistributionConfig: distributionConfig,
  };

  const response = await client.send(new CreateDistributionCommand(command));

  if (!response.Distribution) {
    throw new Error('Failed to create distribution: No distribution returned');
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
    throw new Error('Failed to get distribution configuration');
  }

  // Apply updates
  if (updates.priceClass) {
    currentConfig.PriceClass = updates.priceClass;
  }

  if (updates.defaultTTL !== undefined) {
    currentConfig.DefaultCacheBehavior!.DefaultTTL = updates.defaultTTL;
  }

  if (updates.maxTTL !== undefined) {
    currentConfig.DefaultCacheBehavior!.MaxTTL = updates.maxTTL;
  }

  if (updates.minTTL !== undefined) {
    currentConfig.DefaultCacheBehavior!.MinTTL = updates.minTTL;
  }

  if (updates.ipv6 !== undefined) {
    currentConfig.IsIPV6Enabled = updates.ipv6;
  }

  if (updates.customDomain) {
    currentConfig.Aliases = {
      Quantity: updates.customDomain.aliases?.length || 1,
      Items: updates.customDomain.aliases || [updates.customDomain.domainName],
    };

    currentConfig.ViewerCertificate = {
      ACMCertificateArn: updates.customDomain.certificateArn,
      SSLSupportMethod: 'sni-only',
      MinimumProtocolVersion: 'TLSv1.2_2021',
    };
  }

  const command: UpdateDistributionCommandInput = {
    Id: distributionId,
    DistributionConfig: currentConfig,
    IfMatch: etag,
  };

  const response = await client.send(new UpdateDistributionCommand(command));

  if (!response.Distribution) {
    throw new Error('Failed to update distribution: No distribution returned');
  }

  return response.Distribution;
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
  return distribution.DomainName || '';
}

/**
 * Get distribution URL
 */
export function getDistributionUrl(distribution: Distribution): string {
  const domainName = getDistributionDomainName(distribution);
  return domainName ? `https://${domainName}` : '';
}
