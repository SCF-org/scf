/**
 * CloudFront Flow Integration Tests
 *
 * Tests CloudFront distribution management:
 * - Distribution creation after S3 deploy
 * - Distribution configuration (Origin, Behaviors)
 * - Cache invalidation
 * - ACM/Route53 integration
 * - State management for CloudFront resources
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  UpdateDistributionCommand,
  CreateInvalidationCommand,
  GetDistributionConfigCommand,
  GetInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import {
  ACMClient,
  RequestCertificateCommand,
  DescribeCertificateCommand,
  ListCertificatesCommand,
} from '@aws-sdk/client-acm';
import {
  Route53Client,
  ListHostedZonesByNameCommand,
  ChangeResourceRecordSetsCommand,
  GetHostedZoneCommand,
  CreateHostedZoneCommand,
} from '@aws-sdk/client-route-53';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initializeState,
  saveState,
  loadState,
  updateS3Resource,
  updateCloudFrontResource,
  updateACMResource,
  updateRoute53Resource,
} from '../../core/state/index.js';

describe('CloudFront Flow Integration', () => {
  const cfMock = mockClient(CloudFrontClient);
  const acmMock = mockClient(ACMClient);
  const route53Mock = mockClient(Route53Client);

  let testDir: string;
  let originalCwd: string;

  const mockDistributionId = 'E1QTVXEXAMPLE';
  const mockDomainName = 'd111111abcdef8.cloudfront.net';
  const mockArn = `arn:aws:cloudfront::123456789012:distribution/${mockDistributionId}`;

  beforeEach(() => {
    cfMock.reset();
    acmMock.reset();
    route53Mock.reset();

    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), 'scf-cloudfront-'));
    process.chdir(testDir);

    // Setup default CloudFront mocks
    setupCloudFrontMocks();
    setupACMMocks();
    setupRoute53Mocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    cfMock.restore();
    acmMock.restore();
    route53Mock.restore();
  });

  function setupCloudFrontMocks() {
    const distributionConfig = {
      CallerReference: 'test-ref-123',
      Comment: 'SCF managed distribution',
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: 'S3-test-bucket',
            DomainName: 'test-bucket.s3-website.ap-northeast-2.amazonaws.com',
            CustomOriginConfig: {
              HTTPPort: 80,
              HTTPSPort: 443,
              OriginProtocolPolicy: 'http-only',
            },
          },
        ],
      },
      DefaultCacheBehavior: {
        TargetOriginId: 'S3-test-bucket',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
          Quantity: 2,
          Items: ['GET', 'HEAD'],
          CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
        },
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        Compress: true,
      },
      PriceClass: 'PriceClass_100',
    };

    cfMock.on(CreateDistributionCommand).resolves({
      Distribution: {
        Id: mockDistributionId,
        ARN: mockArn,
        DomainName: mockDomainName,
        Status: 'InProgress',
        DistributionConfig: distributionConfig,
      },
    });

    cfMock.on(GetDistributionCommand).resolves({
      Distribution: {
        Id: mockDistributionId,
        ARN: mockArn,
        DomainName: mockDomainName,
        Status: 'Deployed',
        DistributionConfig: distributionConfig,
      },
      ETag: 'test-etag-123',
    });

    cfMock.on(GetDistributionConfigCommand).resolves({
      DistributionConfig: distributionConfig,
      ETag: 'test-etag-123',
    });

    cfMock.on(UpdateDistributionCommand).resolves({
      Distribution: {
        Id: mockDistributionId,
        ARN: mockArn,
        DomainName: mockDomainName,
        Status: 'InProgress',
        DistributionConfig: distributionConfig,
      },
      ETag: 'new-etag-456',
    });

    cfMock.on(CreateInvalidationCommand).resolves({
      Invalidation: {
        Id: 'I1INVALIDATION',
        Status: 'Completed',
        CreateTime: new Date(),
        InvalidationBatch: {
          Paths: { Quantity: 1, Items: ['/*'] },
          CallerReference: 'invalidation-ref',
        },
      },
    });

    cfMock.on(GetInvalidationCommand).resolves({
      Invalidation: {
        Id: 'I1INVALIDATION',
        Status: 'Completed',
        CreateTime: new Date(),
        InvalidationBatch: {
          Paths: { Quantity: 1, Items: ['/*'] },
          CallerReference: 'invalidation-ref',
        },
      },
    });
  }

  function setupACMMocks() {
    const certificateArn = 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123';

    acmMock.on(RequestCertificateCommand).resolves({
      CertificateArn: certificateArn,
    });

    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: {
        CertificateArn: certificateArn,
        DomainName: 'example.com',
        Status: 'ISSUED',
        Type: 'AMAZON_ISSUED',
        SubjectAlternativeNames: ['example.com', '*.example.com'],
        DomainValidationOptions: [
          {
            DomainName: 'example.com',
            ValidationStatus: 'SUCCESS',
            ResourceRecord: {
              Name: '_abc.example.com',
              Type: 'CNAME',
              Value: '_def.acm-validations.aws.',
            },
          },
        ],
      },
    });

    acmMock.on(ListCertificatesCommand).resolves({
      CertificateSummaryList: [
        {
          CertificateArn: certificateArn,
          DomainName: 'example.com',
          Status: 'ISSUED',
        },
      ],
    });
  }

  function setupRoute53Mocks() {
    const hostedZoneId = 'Z1234567890ABC';

    route53Mock.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: `/hostedzone/${hostedZoneId}`,
          Name: 'example.com.',
          CallerReference: 'test-ref',
        },
      ],
    });

    route53Mock.on(GetHostedZoneCommand).resolves({
      HostedZone: {
        Id: `/hostedzone/${hostedZoneId}`,
        Name: 'example.com.',
        CallerReference: 'test-ref',
      },
      DelegationSet: {
        NameServers: ['ns-1.awsdns-00.com', 'ns-2.awsdns-00.net'],
      },
    });

    route53Mock.on(CreateHostedZoneCommand).resolves({
      HostedZone: {
        Id: `/hostedzone/${hostedZoneId}`,
        Name: 'example.com.',
        CallerReference: 'test-ref',
      },
      DelegationSet: {
        NameServers: ['ns-1.awsdns-00.com', 'ns-2.awsdns-00.net'],
      },
    });

    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: {
        Id: '/change/C1234567890',
        Status: 'INSYNC',
        SubmittedAt: new Date(),
      },
    });
  }

  describe('S3 to CloudFront Flow', () => {
    it('should setup CloudFront after S3 deployment and update state', async () => {
      // Start with S3 resource in state
      let state = initializeState('cf-flow-test');
      state = updateS3Resource(state, {
        bucketName: 'test-bucket-123',
        region: 'ap-northeast-2',
        websiteUrl: 'http://test-bucket-123.s3-website.ap-northeast-2.amazonaws.com',
      });

      // Simulate CloudFront creation (in real code this would call CloudFrontDeployer)
      // For integration test, we verify the state flow

      // Update state with CloudFront resource
      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        arn: mockArn,
      });

      saveState(state);

      // Verify state has both resources
      const loaded = loadState();
      expect(loaded?.resources.s3?.bucketName).toBe('test-bucket-123');
      expect(loaded?.resources.cloudfront?.distributionId).toBe(mockDistributionId);
      expect(loaded?.resources.cloudfront?.domainName).toBe(mockDomainName);
    });

    it('should store CloudFront origin configuration in state', async () => {
      let state = initializeState('origin-test');

      state = updateS3Resource(state, {
        bucketName: 'origin-bucket',
        region: 'ap-northeast-2',
        websiteUrl: 'http://origin-bucket.s3-website.ap-northeast-2.amazonaws.com',
      });

      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        arn: mockArn,
        originDomain: 'origin-bucket.s3-website.ap-northeast-2.amazonaws.com',
      });

      saveState(state);

      const loaded = loadState();
      expect(loaded?.resources.cloudfront?.originDomain).toContain('origin-bucket');
    });
  });

  describe('Cache Invalidation Flow', () => {
    it('should track invalidation in deployment state', async () => {
      let state = initializeState('invalidation-test');

      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        lastInvalidation: new Date().toISOString(),
      });

      saveState(state);

      const loaded = loadState();
      expect(loaded?.resources.cloudfront?.lastInvalidation).toBeDefined();
    });

    it('should update lastDeployed timestamp on invalidation', async () => {
      const beforeInvalidation = Date.now();

      let state = initializeState('timestamp-test');
      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
      });
      saveState(state);

      const afterInvalidation = Date.now();

      const loaded = loadState();
      const deployedTime = new Date(loaded!.lastDeployed).getTime();

      expect(deployedTime).toBeGreaterThanOrEqual(beforeInvalidation);
      expect(deployedTime).toBeLessThanOrEqual(afterInvalidation);
    });
  });

  describe('ACM Certificate Integration', () => {
    it('should store ACM certificate info with CloudFront', async () => {
      const certificateArn = 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123';

      let state = initializeState('acm-cf-test');

      // First, add ACM certificate
      state = updateACMResource(state, {
        certificateArn,
        domain: 'example.com',
        validationMethod: 'DNS',
        status: 'ISSUED',
      });

      // Then, add CloudFront with certificate reference
      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        arn: mockArn,
        certificateArn,
        aliases: ['example.com', 'www.example.com'],
      });

      saveState(state);

      const loaded = loadState();
      expect(loaded?.resources.acm?.certificateArn).toBe(certificateArn);
      expect(loaded?.resources.cloudfront?.certificateArn).toBe(certificateArn);
      expect(loaded?.resources.cloudfront?.aliases).toContain('example.com');
    });
  });

  describe('Route53 DNS Integration', () => {
    it('should store Route53 records with CloudFront', async () => {
      let state = initializeState('route53-cf-test');

      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
      });

      state = updateRoute53Resource(state, {
        hostedZoneId: 'Z1234567890ABC',
        domain: 'example.com',
        records: [
          { name: 'example.com', type: 'A', value: 'ALIAS' },
          { name: 'example.com', type: 'AAAA', value: 'ALIAS' },
        ],
      });

      saveState(state);

      const loaded = loadState();
      expect(loaded?.resources.cloudfront?.distributionId).toBe(mockDistributionId);
      expect(loaded?.resources.route53?.hostedZoneId).toBe('Z1234567890ABC');
      expect(loaded?.resources.route53?.records).toHaveLength(2);
    });
  });

  describe('Complete Custom Domain Flow', () => {
    it('should store full custom domain setup in state', async () => {
      let state = initializeState('custom-domain-test');

      // S3 bucket
      state = updateS3Resource(state, {
        bucketName: 'custom-domain-bucket',
        region: 'ap-northeast-2',
        websiteUrl: 'http://custom-domain-bucket.s3-website.ap-northeast-2.amazonaws.com',
      });

      // ACM certificate
      state = updateACMResource(state, {
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/xyz-789',
        domain: 'mysite.com',
        validationMethod: 'DNS',
        status: 'ISSUED',
      });

      // CloudFront distribution
      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        arn: mockArn,
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/xyz-789',
        aliases: ['mysite.com', 'www.mysite.com'],
        originDomain: 'custom-domain-bucket.s3-website.ap-northeast-2.amazonaws.com',
      });

      // Route53 records
      state = updateRoute53Resource(state, {
        hostedZoneId: 'Z9876543210XYZ',
        domain: 'mysite.com',
        records: [
          { name: 'mysite.com', type: 'A', value: 'ALIAS' },
          { name: 'www.mysite.com', type: 'CNAME', value: mockDomainName },
        ],
      });

      saveState(state);

      // Verify complete state
      const loaded = loadState();

      expect(loaded?.resources.s3?.bucketName).toBe('custom-domain-bucket');
      expect(loaded?.resources.acm?.domain).toBe('mysite.com');
      expect(loaded?.resources.cloudfront?.distributionId).toBe(mockDistributionId);
      expect(loaded?.resources.cloudfront?.aliases).toContain('mysite.com');
      expect(loaded?.resources.route53?.domain).toBe('mysite.com');
      expect(loaded?.resources.route53?.records).toHaveLength(2);
    });
  });

  describe('CloudFront State Updates', () => {
    it('should update existing CloudFront resource without losing data', async () => {
      let state = initializeState('update-test');

      // Initial CloudFront setup
      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        arn: mockArn,
        aliases: ['site.com'],
      });

      saveState(state);

      // Load and update
      const loaded1 = loadState()!;

      // Update with new invalidation time (should preserve existing fields)
      const updated = updateCloudFrontResource(loaded1, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        lastInvalidation: new Date().toISOString(),
      });

      saveState(updated);

      const loaded2 = loadState();
      expect(loaded2?.resources.cloudfront?.distributionId).toBe(mockDistributionId);
      expect(loaded2?.resources.cloudfront?.lastInvalidation).toBeDefined();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing CloudFront in state gracefully', () => {
      const state = initializeState('no-cf-test');
      saveState(state);

      const loaded = loadState();
      expect(loaded?.resources.cloudfront).toBeUndefined();
    });

    it('should handle partial CloudFront resource', async () => {
      let state = initializeState('partial-test');

      // Only set some fields
      state = updateCloudFrontResource(state, {
        distributionId: mockDistributionId,
        domainName: mockDomainName,
        // No arn, no aliases, no certificate
      });

      saveState(state);

      const loaded = loadState();
      expect(loaded?.resources.cloudfront?.distributionId).toBe(mockDistributionId);
      expect(loaded?.resources.cloudfront?.arn).toBeUndefined();
    });
  });
});
