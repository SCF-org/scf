import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { mockClient } from "aws-sdk-client-mock";
import {
  CloudFrontClient,
  GetDistributionCommand,
  CreateDistributionCommand,
  UpdateDistributionCommand,
  GetDistributionConfigCommand,
  TagResourceCommand,
  ListTagsForResourceCommand,
  type Distribution,
} from "@aws-sdk/client-cloudfront";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  distributionExists,
  getDistribution,
  createDistribution,
  updateDistribution,
  getDistributionDomainName,
  getDistributionUrl,
  tagDistributionForRecovery,
  getDistributionTags,
  type CreateDistributionOptions,
} from "../../../core/aws/cloudfront-distribution.js";

describe("CloudFront Distribution Management", () => {
  const cfMock = mockClient(CloudFrontClient);
  const stsMock = mockClient(STSClient);
  let client: CloudFrontClient;

  beforeEach(() => {
    cfMock.reset();
    stsMock.reset();
    client = new CloudFrontClient({ region: "us-east-1" });

    // Mock STS for account ID
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: "123456789012",
    });
  });

  afterEach(() => {
    cfMock.restore();
    stsMock.restore();
  });

  // AWS Managed Cache Policy: CachingOptimized (Free tier compatible)
  const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";

  const mockDistribution: Distribution = {
    Id: "E1234567890ABC",
    ARN: "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC",
    Status: "Deployed",
    DomainName: "d123456.cloudfront.net",
    DistributionConfig: {
      CallerReference: "scf-123456",
      Comment: "Created by SCF",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "S3-my-bucket",
            DomainName: "my-bucket.s3-website-us-east-1.amazonaws.com",
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "S3-my-bucket",
        ViewerProtocolPolicy: "redirect-to-https",
        // Using Cache Policy instead of Legacy ForwardedValues
        CachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
      },
    },
  };

  describe("distributionExists", () => {
    it("should return true when distribution exists", async () => {
      cfMock.on(GetDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const exists = await distributionExists(client, "E1234567890ABC");

      expect(exists).toBe(true);
    });

    it("should return false when distribution does not exist (NoSuchDistribution)", async () => {
      cfMock.on(GetDistributionCommand).rejects({
        name: "NoSuchDistribution",
      });

      const exists = await distributionExists(client, "ENONEXISTENT");

      expect(exists).toBe(false);
    });

    it("should return false when distribution does not exist (404)", async () => {
      cfMock.on(GetDistributionCommand).rejects({
        $metadata: { httpStatusCode: 404 },
      });

      const exists = await distributionExists(client, "ENONEXISTENT");

      expect(exists).toBe(false);
    });

    it("should throw error for other failures", async () => {
      cfMock.on(GetDistributionCommand).rejects(new Error("Access denied"));

      await expect(
        distributionExists(client, "E1234567890ABC")
      ).rejects.toThrow("Access denied");
    });
  });

  describe("getDistribution", () => {
    it("should return distribution details", async () => {
      cfMock.on(GetDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const distribution = await getDistribution(client, "E1234567890ABC");

      expect(distribution).toEqual(mockDistribution);
      expect(distribution?.Id).toBe("E1234567890ABC");
    });

    it("should return null when distribution does not exist", async () => {
      cfMock.on(GetDistributionCommand).rejects({
        name: "NoSuchDistribution",
      });

      const distribution = await getDistribution(client, "ENONEXISTENT");

      expect(distribution).toBeNull();
    });

    it("should throw error for other failures", async () => {
      cfMock
        .on(GetDistributionCommand)
        .rejects(new Error("Service unavailable"));

      await expect(getDistribution(client, "E1234567890ABC")).rejects.toThrow(
        "Service unavailable"
      );
    });
  });

  describe("createDistribution", () => {
    it("should create distribution with basic configuration", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
      };

      const distribution = await createDistribution(client, options);

      expect(distribution).toEqual(mockDistribution);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      expect(calls).toHaveLength(1);

      const config = calls[0].args[0].input.DistributionConfig;
      expect(config?.Enabled).toBe(true);
      expect(config?.Origins?.Items?.[0]?.DomainName).toBe(
        "my-bucket.s3-website-us-east-1.amazonaws.com"
      );
      expect(config?.DefaultRootObject).toBe("index.html");
      expect(config?.PriceClass).toBe("PriceClass_100");
    });

    it("should create distribution for non-us-east-1 region", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "ap-northeast-2",
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      expect(
        calls[0].args[0].input.DistributionConfig?.Origins?.Items?.[0]
          ?.DomainName
      ).toBe("my-bucket.s3-website.ap-northeast-2.amazonaws.com");
    });

    it("should create distribution with custom domain and certificate", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
        customDomain: {
          domainName: "example.com",
          certificateArn:
            "arn:aws:acm:us-east-1:123456789012:certificate/abc123",
        },
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.Aliases?.Items).toEqual(["example.com"]);
      expect(config?.ViewerCertificate?.ACMCertificateArn).toBe(
        "arn:aws:acm:us-east-1:123456789012:certificate/abc123"
      );
      expect(config?.ViewerCertificate?.SSLSupportMethod).toBe("sni-only");
    });

    it("should create distribution with multiple aliases", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
        customDomain: {
          domainName: "example.com",
          certificateArn:
            "arn:aws:acm:us-east-1:123456789012:certificate/abc123",
          aliases: ["example.com", "www.example.com"],
        },
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.Aliases?.Items).toEqual([
        "example.com",
        "www.example.com",
      ]);
      expect(config?.Aliases?.Quantity).toBe(2);
    });

    it("should create distribution with CachingOptimized Cache Policy (Free tier compatible)", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
        priceClass: "PriceClass_All",
        ipv6: false,
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.PriceClass).toBe("PriceClass_All");
      expect(config?.IsIPV6Enabled).toBe(false);

      // Verify Cache Policy is used instead of Legacy ForwardedValues
      expect(config?.DefaultCacheBehavior?.CachePolicyId).toBe(
        CACHING_OPTIMIZED_POLICY_ID
      );

      // Verify Legacy settings are NOT used (required for Free tier pricing plan)
      expect(config?.DefaultCacheBehavior?.ForwardedValues).toBeUndefined();
      expect(config?.DefaultCacheBehavior?.MinTTL).toBeUndefined();
      expect(config?.DefaultCacheBehavior?.DefaultTTL).toBeUndefined();
      expect(config?.DefaultCacheBehavior?.MaxTTL).toBeUndefined();
      expect(config?.DefaultCacheBehavior?.TrustedSigners).toBeUndefined();
    });

    it("should use default CloudFront certificate when custom domain has no certificate", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.ViewerCertificate?.CloudFrontDefaultCertificate).toBe(
        true
      );
    });

    it("should throw error when creation fails", async () => {
      cfMock
        .on(CreateDistributionCommand)
        .rejects(new Error("Invalid configuration"));

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
      };

      await expect(createDistribution(client, options)).rejects.toThrow(
        "Invalid configuration"
      );
    });

    it("should throw error when no distribution is returned", async () => {
      cfMock.on(CreateDistributionCommand).resolves({});

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
      };

      await expect(createDistribution(client, options)).rejects.toThrow(
        "Failed to create distribution: No distribution returned"
      );
    });

    it("should create distribution with custom error responses (SPA mode)", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
        errorPages: [
          {
            errorCode: 403,
            responseCode: 200,
            responsePath: "/index.html",
            cacheTTL: 0,
          },
          {
            errorCode: 404,
            responseCode: 200,
            responsePath: "/index.html",
            cacheTTL: 0,
          },
        ],
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.CustomErrorResponses?.Quantity).toBe(2);
      expect(config?.CustomErrorResponses?.Items?.[0]?.ErrorCode).toBe(403);
      expect(config?.CustomErrorResponses?.Items?.[0]?.ResponseCode).toBe(
        "200"
      );
      expect(config?.CustomErrorResponses?.Items?.[0]?.ResponsePagePath).toBe(
        "/index.html"
      );
      expect(config?.CustomErrorResponses?.Items?.[1]?.ErrorCode).toBe(404);
    });

    it("should create distribution without error responses when not provided", async () => {
      cfMock.on(CreateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const options: CreateDistributionOptions = {
        s3BucketName: "my-bucket",
        s3Region: "us-east-1",
      };

      await createDistribution(client, options);

      const calls = cfMock.commandCalls(CreateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.CustomErrorResponses).toBeUndefined();
    });
  });

  describe("updateDistribution", () => {
    const mockConfig = {
      CallerReference: "scf-123456",
      Comment: "Created by SCF",
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: "S3-my-bucket",
            DomainName: "my-bucket.s3-website-us-east-1.amazonaws.com",
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "S3-my-bucket",
        ViewerProtocolPolicy: "redirect-to-https",
        // Using Cache Policy instead of Legacy ForwardedValues
        CachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
      },
      PriceClass: "PriceClass_100",
      IsIPV6Enabled: true,
    };

    beforeEach(() => {
      cfMock.on(GetDistributionConfigCommand).resolves({
        DistributionConfig: mockConfig,
        ETag: "ETAG123",
      });
    });

    it("should update distribution price class", async () => {
      cfMock.on(UpdateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      const distribution = await updateDistribution(client, "E1234567890ABC", {
        priceClass: "PriceClass_All",
      });

      expect(distribution).toEqual(mockDistribution);

      const calls = cfMock.commandCalls(UpdateDistributionCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.DistributionConfig?.PriceClass).toBe(
        "PriceClass_All"
      );
      expect(calls[0].args[0].input.IfMatch).toBe("ETAG123");
    });

    // Note: TTL settings are now managed by Cache Policy (CachingOptimized)
    // Legacy TTL update tests have been removed as TTL options are no longer supported

    it("should update IPv6 setting", async () => {
      cfMock.on(UpdateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      await updateDistribution(client, "E1234567890ABC", {
        ipv6: false,
      });

      const calls = cfMock.commandCalls(UpdateDistributionCommand);
      expect(calls[0].args[0].input.DistributionConfig?.IsIPV6Enabled).toBe(
        false
      );
    });

    it("should update custom domain and certificate", async () => {
      cfMock.on(UpdateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      await updateDistribution(client, "E1234567890ABC", {
        customDomain: {
          domainName: "new.example.com",
          certificateArn:
            "arn:aws:acm:us-east-1:123456789012:certificate/new123",
        },
      });

      const calls = cfMock.commandCalls(UpdateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.Aliases?.Items).toEqual(["new.example.com"]);
      expect(config?.ViewerCertificate?.ACMCertificateArn).toBe(
        "arn:aws:acm:us-east-1:123456789012:certificate/new123"
      );
    });

    it("should throw error if config is missing", async () => {
      cfMock.on(GetDistributionConfigCommand).resolves({});

      await expect(
        updateDistribution(client, "E1234567890ABC", {
          priceClass: "PriceClass_All",
        })
      ).rejects.toThrow("Failed to get distribution configuration");
    });

    it("should throw error if DefaultCacheBehavior is missing", async () => {
      cfMock.on(GetDistributionConfigCommand).resolves({
        DistributionConfig: {
          ...mockConfig,
          DefaultCacheBehavior: undefined,
        },
        ETag: "ETAG123",
      });

      await expect(
        updateDistribution(client, "E1234567890ABC", { defaultTTL: 3600 })
      ).rejects.toThrow(
        "Distribution configuration missing DefaultCacheBehavior"
      );
    });

    it("should throw error when update fails", async () => {
      cfMock.on(UpdateDistributionCommand).rejects(new Error("Update failed"));

      await expect(
        updateDistribution(client, "E1234567890ABC", {
          priceClass: "PriceClass_All",
        })
      ).rejects.toThrow("Update failed");
    });

    it("should update distribution with custom error responses (SPA mode)", async () => {
      cfMock.on(UpdateDistributionCommand).resolves({
        Distribution: mockDistribution,
      });

      await updateDistribution(client, "E1234567890ABC", {
        errorPages: [
          {
            errorCode: 403,
            responseCode: 200,
            responsePath: "/index.html",
            cacheTTL: 0,
          },
          {
            errorCode: 404,
            responseCode: 200,
            responsePath: "/index.html",
            cacheTTL: 0,
          },
        ],
      });

      const calls = cfMock.commandCalls(UpdateDistributionCommand);
      const config = calls[0].args[0].input.DistributionConfig;

      expect(config?.CustomErrorResponses?.Quantity).toBe(2);
      expect(config?.CustomErrorResponses?.Items?.[0]?.ErrorCode).toBe(403);
      expect(config?.CustomErrorResponses?.Items?.[0]?.ResponseCode).toBe(
        "200"
      );
      expect(config?.CustomErrorResponses?.Items?.[0]?.ResponsePagePath).toBe(
        "/index.html"
      );
      expect(config?.CustomErrorResponses?.Items?.[1]?.ErrorCode).toBe(404);
    });
  });

  describe("getDistributionDomainName", () => {
    it("should return domain name", () => {
      const domainName = getDistributionDomainName(mockDistribution);
      expect(domainName).toBe("d123456.cloudfront.net");
    });

    it("should return empty string if no domain name", () => {
      const distribution = { ...mockDistribution, DomainName: undefined };
      const domainName = getDistributionDomainName(distribution);
      expect(domainName).toBe("");
    });
  });

  describe("getDistributionUrl", () => {
    it("should return HTTPS URL", () => {
      const url = getDistributionUrl(mockDistribution);
      expect(url).toBe("https://d123456.cloudfront.net");
    });

    it("should return empty string if no domain name", () => {
      const distribution = { ...mockDistribution, DomainName: undefined };
      const url = getDistributionUrl(distribution);
      expect(url).toBe("");
    });
  });

  describe("tagDistributionForRecovery", () => {
    it("should tag distribution with SCF metadata", async () => {
      cfMock.on(TagResourceCommand).resolves({});

      await tagDistributionForRecovery(
        client,
        "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC",
        "my-app",
        "production",
        "us-east-1"
      );

      const calls = cfMock.commandCalls(TagResourceCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Tags?.Items).toEqual([
        { Key: "scf:managed", Value: "true" },
        { Key: "scf:app", Value: "my-app" },
        { Key: "scf:environment", Value: "production" },
        { Key: "scf:tool", Value: "scf-deploy" },
      ]);
    });

    it("should handle tagging errors gracefully", async () => {
      cfMock.on(TagResourceCommand).rejects(new Error("Permission denied"));

      // Should not throw, just log warning
      await expect(
        tagDistributionForRecovery(
          client,
          "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC",
          "my-app",
          "production",
          "us-east-1"
        )
      ).resolves.toBeUndefined();
    });
  });

  describe("getDistributionTags", () => {
    it("should return distribution tags as object", async () => {
      cfMock.on(ListTagsForResourceCommand).resolves({
        Tags: {
          Items: [
            { Key: "scf:managed", Value: "true" },
            { Key: "scf:app", Value: "my-app" },
            { Key: "Environment", Value: "production" },
          ],
        },
      });

      const tags = await getDistributionTags(
        client,
        "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC"
      );

      expect(tags).toEqual({
        "scf:managed": "true",
        "scf:app": "my-app",
        Environment: "production",
      });
    });

    it("should return empty object when tagging fails", async () => {
      cfMock.on(ListTagsForResourceCommand).rejects(new Error("Not found"));

      const tags = await getDistributionTags(
        client,
        "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC"
      );

      expect(tags).toEqual({});
    });

    it("should handle empty tags", async () => {
      cfMock.on(ListTagsForResourceCommand).resolves({
        Tags: {
          Items: [],
        },
      });

      const tags = await getDistributionTags(
        client,
        "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC"
      );

      expect(tags).toEqual({});
    });
  });
});
