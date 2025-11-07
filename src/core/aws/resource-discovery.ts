/**
 * Resource Discovery
 * Discovers SCF-managed AWS resources using tags
 */

import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
  CloudFrontClient,
  ListDistributionsCommand,
} from "@aws-sdk/client-cloudfront";
import {
  ACMClient,
  ListCertificatesCommand,
  CertificateStatus,
} from "@aws-sdk/client-acm";
import {
  Route53Client,
  ListHostedZonesCommand,
  ListTagsForResourceCommand as ListHostedZoneTagsCommand,
} from "@aws-sdk/client-route-53";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import type {
  DiscoveredS3Resource,
  DiscoveredCloudFrontResource,
  DiscoveredACMResource,
  DiscoveredRoute53Resource,
  DiscoveredResources,
} from "../../types/discovery.js";
import { getBucketTags } from "./s3-bucket.js";
import { getDistributionTags } from "./cloudfront-distribution.js";
import type { SCFConfig } from "../../types/config.js";
import { createS3Client, createCloudFrontClient } from "./client.js";

/**
 * Get AWS account ID
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
 * Discover S3 buckets with SCF tags
 */
export async function discoverS3Buckets(
  client: S3Client,
  app?: string,
  environment?: string
): Promise<DiscoveredS3Resource[]> {
  const discovered: DiscoveredS3Resource[] = [];

  try {
    const { Buckets } = await client.send(new ListBucketsCommand({}));

    if (!Buckets || Buckets.length === 0) {
      return discovered;
    }

    for (const bucket of Buckets) {
      if (!bucket.Name) continue;

      try {
        const tags = await getBucketTags(client, bucket.Name);

        // Check if it's SCF-managed
        if (tags["scf:managed"] !== "true") {
          continue;
        }

        // Filter by app and environment if specified
        if (app && tags["scf:app"] !== app) {
          continue;
        }
        if (environment && tags["scf:environment"] !== environment) {
          continue;
        }

        // Get bucket region from location
        const region = tags["scf:region"] || "us-east-1";

        discovered.push({
          bucketName: bucket.Name,
          region,
          app: tags["scf:app"] || "unknown",
          environment: tags["scf:environment"] || "default",
          tags,
        });
      } catch {
        // Skip buckets we can't access
        continue;
      }
    }
  } catch (error) {
    console.warn("Warning: Failed to discover S3 buckets:", error);
  }

  return discovered;
}

/**
 * Discover CloudFront distributions with SCF tags
 */
export async function discoverCloudFrontDistributions(
  client: CloudFrontClient,
  region: string,
  app?: string,
  environment?: string
): Promise<DiscoveredCloudFrontResource[]> {
  const discovered: DiscoveredCloudFrontResource[] = [];

  try {
    const accountId = await getAccountId(region);
    const { DistributionList } = await client.send(
      new ListDistributionsCommand({})
    );

    if (
      !DistributionList ||
      !DistributionList.Items ||
      DistributionList.Items.length === 0
    ) {
      return discovered;
    }

    for (const dist of DistributionList.Items) {
      if (!dist.Id || !dist.DomainName) continue;

      try {
        const tags = await getDistributionTags(client, dist.Id, region);

        // Check if it's SCF-managed
        if (tags["scf:managed"] !== "true") {
          continue;
        }

        // Filter by app and environment if specified
        if (app && tags["scf:app"] !== app) {
          continue;
        }
        if (environment && tags["scf:environment"] !== environment) {
          continue;
        }

        const distributionArn = `arn:aws:cloudfront::${accountId}:distribution/${dist.Id}`;

        discovered.push({
          distributionId: dist.Id,
          distributionArn,
          domainName: dist.DomainName,
          status: dist.Status || "Unknown",
          app: tags["scf:app"] || "unknown",
          environment: tags["scf:environment"] || "default",
          tags,
        });
      } catch {
        // Skip distributions we can't access
        continue;
      }
    }
  } catch (error) {
    console.warn(
      "Warning: Failed to discover CloudFront distributions:",
      error
    );
  }

  return discovered;
}

/**
 * Discover ACM certificates with SCF tags
 */
export async function discoverACMCertificates(
  _region: string,
  app?: string,
  environment?: string
): Promise<DiscoveredACMResource[]> {
  const discovered: DiscoveredACMResource[] = [];

  try {
    // ACM certificates for CloudFront must be in us-east-1
    const acmClient = new ACMClient({ region: "us-east-1" });

    const { CertificateSummaryList } = await acmClient.send(
      new ListCertificatesCommand({
        CertificateStatuses: [
          CertificateStatus.ISSUED,
          CertificateStatus.PENDING_VALIDATION,
        ],
      })
    );

    if (!CertificateSummaryList || CertificateSummaryList.length === 0) {
      return discovered;
    }

    for (const cert of CertificateSummaryList) {
      if (!cert.CertificateArn || !cert.DomainName) continue;

      try {
        // Note: ACM ListTagsForCertificate requires the certificate ARN
        const { Tags } = await acmClient.send(
          new (
            await import("@aws-sdk/client-acm")
          ).ListTagsForCertificateCommand({
            CertificateArn: cert.CertificateArn,
          })
        );

        const tags: Record<string, string> = {};
        if (Tags) {
          for (const tag of Tags) {
            if (tag.Key && tag.Value) {
              tags[tag.Key] = tag.Value;
            }
          }
        }

        // Check if it's SCF-managed
        if (tags["scf:managed"] !== "true") {
          continue;
        }

        // Filter by app and environment if specified
        if (app && tags["scf:app"] && tags["scf:app"] !== app) {
          continue;
        }
        if (
          environment &&
          tags["scf:environment"] &&
          tags["scf:environment"] !== environment
        ) {
          continue;
        }

        discovered.push({
          certificateArn: cert.CertificateArn,
          domainName: cert.DomainName,
          status: cert.Status || "UNKNOWN",
          app: tags["scf:app"],
          environment: tags["scf:environment"],
          tags,
        });
      } catch {
        // Skip certificates we can't access
        continue;
      }
    }
  } catch (error) {
    console.warn("Warning: Failed to discover ACM certificates:", error);
  }

  return discovered;
}

/**
 * Discover Route53 hosted zones with SCF tags
 */
export async function discoverRoute53HostedZones(
  region: string,
  app?: string,
  environment?: string
): Promise<DiscoveredRoute53Resource[]> {
  const discovered: DiscoveredRoute53Resource[] = [];

  try {
    const route53Client = new Route53Client({ region });

    const { HostedZones } = await route53Client.send(
      new ListHostedZonesCommand({})
    );

    if (!HostedZones || HostedZones.length === 0) {
      return discovered;
    }

    for (const zone of HostedZones) {
      if (!zone.Id || !zone.Name) continue;

      try {
        const zoneId = zone.Id.replace("/hostedzone/", "");
        const response = await route53Client.send(
          new ListHostedZoneTagsCommand({
            ResourceType: "hostedzone",
            ResourceId: zoneId,
          })
        );

        const tags: Record<string, string> = {};
        // Response might have Tags or ResourceTagSet
        const tagList =
          (response as unknown as { Tags?: unknown }).Tags ||
          (
            response as unknown as {
              ResourceTagSet?: { Tags?: unknown };
            }
          ).ResourceTagSet?.Tags;
        if (tagList) {
          for (const tag of tagList) {
            if (tag.Key && tag.Value) {
              tags[tag.Key] = tag.Value;
            }
          }
        }

        // Check if it's SCF-managed
        if (tags["scf:managed"] !== "true") {
          continue;
        }

        // Filter by app and environment if specified
        if (app && tags["scf:app"] && tags["scf:app"] !== app) {
          continue;
        }
        if (
          environment &&
          tags["scf:environment"] &&
          tags["scf:environment"] !== environment
        ) {
          continue;
        }

        // Get name servers
        const nameServers: string[] = [];
        if (zone.Config) {
          // Name servers are not in ListHostedZones response
          // We would need GetHostedZone for that
          // For now, we'll leave it empty or fetch separately if needed
        }

        discovered.push({
          hostedZoneId: zone.Id,
          hostedZoneName: zone.Name,
          nameServers,
          app: tags["scf:app"],
          environment: tags["scf:environment"],
          tags,
        });
      } catch {
        // Skip zones we can't access
        continue;
      }
    }
  } catch (error) {
    console.warn("Warning: Failed to discover Route53 hosted zones:", error);
  }

  return discovered;
}

/**
 * Discover all SCF-managed resources for a given app/environment
 */
export async function discoverAllResources(
  config: SCFConfig,
  app?: string,
  environment?: string
): Promise<DiscoveredResources> {
  const targetApp = app || config.app;
  const targetEnv = environment || "default";

  // Create clients
  const s3Client = createS3Client(config);
  const cfClient = createCloudFrontClient(config);

  // Discover resources in parallel
  const [s3Buckets, cfDistributions, acmCertificates, route53Zones] =
    await Promise.all([
      discoverS3Buckets(s3Client, targetApp, targetEnv),
      discoverCloudFrontDistributions(
        cfClient,
        config.region,
        targetApp,
        targetEnv
      ),
      discoverACMCertificates(config.region, targetApp, targetEnv),
      discoverRoute53HostedZones(config.region, targetApp, targetEnv),
    ]);

  const result: DiscoveredResources = {
    s3: s3Buckets.length > 0 ? s3Buckets[0] : undefined,
    cloudfront: cfDistributions.length > 0 ? cfDistributions[0] : undefined,
    acm: acmCertificates.length > 0 ? acmCertificates[0] : undefined,
    route53: route53Zones.length > 0 ? route53Zones[0] : undefined,
    hasResources: false,
  };

  result.hasResources = !!(
    result.s3 ||
    result.cloudfront ||
    result.acm ||
    result.route53
  );

  return result;
}

/**
 * Discover all SCF-managed resources (all apps/environments)
 */
export async function discoverAllSCFResources(config: SCFConfig): Promise<{
  s3: DiscoveredS3Resource[];
  cloudfront: DiscoveredCloudFrontResource[];
  acm: DiscoveredACMResource[];
  route53: DiscoveredRoute53Resource[];
}> {
  // Create clients
  const s3Client = createS3Client(config);
  const cfClient = createCloudFrontClient(config);

  // Discover all resources (no filtering)
  const [s3Buckets, cfDistributions, acmCertificates, route53Zones] =
    await Promise.all([
      discoverS3Buckets(s3Client),
      discoverCloudFrontDistributions(cfClient, config.region),
      discoverACMCertificates(config.region),
      discoverRoute53HostedZones(config.region),
    ]);

  return {
    s3: s3Buckets,
    cloudfront: cfDistributions,
    acm: acmCertificates,
    route53: route53Zones,
  };
}
