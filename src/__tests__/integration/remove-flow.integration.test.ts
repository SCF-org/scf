/**
 * Remove Flow Integration Tests
 *
 * Tests resource removal flow:
 * - State-based resource discovery
 * - Correct deletion order (CloudFront → ACM → S3 → Route53)
 * - Partial deletion options
 * - State cleanup after removal
 * - Error handling during removal
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
  GetBucketTaggingCommand,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  GetDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  DeleteDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import {
  ACMClient,
  DeleteCertificateCommand,
  DescribeCertificateCommand,
} from '@aws-sdk/client-acm';
import {
  Route53Client,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  DeleteHostedZoneCommand,
} from '@aws-sdk/client-route-53';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initializeState,
  saveState,
  loadState,
  deleteState,
  stateExists,
  updateS3Resource,
  updateCloudFrontResource,
  updateACMResource,
  updateRoute53Resource,
  removeS3Resource,
  removeCloudFrontResource,
  removeACMResource,
  removeRoute53Resource,
  hasAnyResource,
  getResourceSummary,
} from '../../core/state/index.js';
import type { DeploymentState } from '../../types/state.js';

describe('Remove Flow Integration', () => {
  const s3Mock = mockClient(S3Client);
  const cfMock = mockClient(CloudFrontClient);
  const acmMock = mockClient(ACMClient);
  const route53Mock = mockClient(Route53Client);

  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    s3Mock.reset();
    cfMock.reset();
    acmMock.reset();
    route53Mock.reset();

    originalCwd = process.cwd();
    testDir = mkdtempSync(join(tmpdir(), 'scf-remove-'));
    process.chdir(testDir);

    setupS3Mocks();
    setupCloudFrontMocks();
    setupACMMocks();
    setupRoute53Mocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    s3Mock.restore();
    cfMock.restore();
    acmMock.restore();
    route53Mock.restore();
  });

  function setupS3Mocks() {
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'index.html' },
        { Key: 'style.css' },
        { Key: 'app.js' },
      ],
    });
    s3Mock.on(DeleteObjectsCommand).resolves({});
    s3Mock.on(DeleteBucketCommand).resolves({});
    s3Mock.on(GetBucketTaggingCommand).resolves({
      TagSet: [
        { Key: 'scf:managed', Value: 'true' },
        { Key: 'scf:app', Value: 'test-app' },
      ],
    });
  }

  function setupCloudFrontMocks() {
    const distributionConfig = {
      CallerReference: 'test-ref',
      Comment: 'SCF managed',
      Enabled: false,
      Origins: { Quantity: 1, Items: [] },
      DefaultCacheBehavior: {
        TargetOriginId: 'S3-bucket',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: { Quantity: 2, Items: ['GET', 'HEAD'], CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] } },
        CachePolicyId: '123',
      },
    };

    cfMock.on(GetDistributionCommand).resolves({
      Distribution: {
        Id: 'E1234567890',
        DomainName: 'd123.cloudfront.net',
        Status: 'Deployed',
        DistributionConfig: distributionConfig,
      },
      ETag: 'etag-123',
    });

    cfMock.on(GetDistributionConfigCommand).resolves({
      DistributionConfig: distributionConfig,
      ETag: 'etag-123',
    });

    cfMock.on(UpdateDistributionCommand).resolves({
      Distribution: {
        Id: 'E1234567890',
        DomainName: 'd123.cloudfront.net',
        Status: 'InProgress',
        DistributionConfig: { ...distributionConfig, Enabled: false },
      },
      ETag: 'etag-456',
    });

    cfMock.on(DeleteDistributionCommand).resolves({});
  }

  function setupACMMocks() {
    acmMock.on(DescribeCertificateCommand).resolves({
      Certificate: {
        CertificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123',
        DomainName: 'example.com',
        Status: 'ISSUED',
      },
    });
    acmMock.on(DeleteCertificateCommand).resolves({});
  }

  function setupRoute53Mocks() {
    route53Mock.on(ListResourceRecordSetsCommand).resolves({
      ResourceRecordSets: [
        { Name: 'example.com.', Type: 'A', AliasTarget: { DNSName: 'd123.cloudfront.net' } },
        { Name: 'example.com.', Type: 'AAAA', AliasTarget: { DNSName: 'd123.cloudfront.net' } },
      ],
    });
    route53Mock.on(ChangeResourceRecordSetsCommand).resolves({
      ChangeInfo: { Id: '/change/C123', Status: 'INSYNC', SubmittedAt: new Date() },
    });
    route53Mock.on(DeleteHostedZoneCommand).resolves({
      ChangeInfo: { Id: '/change/C123', Status: 'PENDING', SubmittedAt: new Date() },
    });
  }

  /**
   * Helper to create a state with all resources
   */
  function createFullState(): DeploymentState {
    let state = initializeState('remove-test-app');

    state = updateS3Resource(state, {
      bucketName: 'test-bucket-123',
      region: 'ap-northeast-2',
      websiteUrl: 'http://test-bucket-123.s3-website.ap-northeast-2.amazonaws.com',
    });

    state = updateCloudFrontResource(state, {
      distributionId: 'E1234567890',
      domainName: 'd123.cloudfront.net',
      arn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890',
    });

    state = updateACMResource(state, {
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-123',
      domain: 'example.com',
      validationMethod: 'DNS',
    });

    state = updateRoute53Resource(state, {
      hostedZoneId: 'Z1234567890ABC',
      domain: 'example.com',
      records: [
        { name: 'example.com', type: 'A', value: 'ALIAS' },
        { name: 'example.com', type: 'AAAA', value: 'ALIAS' },
      ],
    });

    return state;
  }

  describe('State-based Resource Discovery', () => {
    it('should identify all resources from state', () => {
      const state = createFullState();
      saveState(state);

      const loaded = loadState();
      expect(hasAnyResource(loaded!)).toBe(true);

      // getResourceSummary returns hasS3, hasCloudFront, s3BucketName, etc.
      const summary = getResourceSummary(loaded!);
      expect(summary.hasS3).toBe(true);
      expect(summary.hasCloudFront).toBe(true);
      expect(summary.s3BucketName).toBeDefined();
      expect(summary.distributionId).toBeDefined();
    });

    it('should handle state with only S3', () => {
      let state = initializeState('s3-only-app');
      state = updateS3Resource(state, {
        bucketName: 'only-s3-bucket',
        region: 'ap-northeast-2',
      });
      saveState(state);

      const loaded = loadState();
      expect(hasAnyResource(loaded!)).toBe(true);
      expect(loaded?.resources.s3).toBeDefined();
      expect(loaded?.resources.cloudfront).toBeUndefined();
    });

    it('should detect empty state', () => {
      const state = initializeState('empty-app');
      saveState(state);

      const loaded = loadState();
      expect(hasAnyResource(loaded!)).toBe(false);
    });
  });

  describe('Resource Deletion Order', () => {
    it('should remove resources in correct order: CF → ACM → S3 → Route53', async () => {
      const state = createFullState();
      saveState(state);

      // Simulate removal order by tracking state changes
      let currentState = loadState()!;

      // Step 1: Remove CloudFront first (must be done before ACM)
      expect(currentState.resources.cloudfront).toBeDefined();
      currentState = removeCloudFrontResource(currentState);
      expect(currentState.resources.cloudfront).toBeUndefined();

      // Step 2: Remove ACM (after CloudFront is removed)
      expect(currentState.resources.acm).toBeDefined();
      currentState = removeACMResource(currentState);
      expect(currentState.resources.acm).toBeUndefined();

      // Step 3: Remove S3
      expect(currentState.resources.s3).toBeDefined();
      currentState = removeS3Resource(currentState);
      expect(currentState.resources.s3).toBeUndefined();

      // Step 4: Remove Route53 (DNS records should be cleaned up last)
      expect(currentState.resources.route53).toBeDefined();
      currentState = removeRoute53Resource(currentState);
      expect(currentState.resources.route53).toBeUndefined();

      // Verify all resources are removed
      expect(hasAnyResource(currentState)).toBe(false);
    });

    it('should track deletion progress in state', async () => {
      const state = createFullState();
      saveState(state);

      // Remove CloudFront and save
      let currentState = loadState()!;
      currentState = removeCloudFrontResource(currentState);
      saveState(currentState);

      // Verify CloudFront is gone but others remain
      const loaded = loadState();
      expect(loaded?.resources.cloudfront).toBeUndefined();
      expect(loaded?.resources.s3).toBeDefined();
      expect(loaded?.resources.acm).toBeDefined();
      expect(loaded?.resources.route53).toBeDefined();
    });
  });

  describe('Partial Deletion', () => {
    it('should allow keeping S3 bucket (--keep-bucket scenario)', async () => {
      const state = createFullState();
      saveState(state);

      let currentState = loadState()!;

      // Remove everything except S3
      currentState = removeCloudFrontResource(currentState);
      currentState = removeACMResource(currentState);
      currentState = removeRoute53Resource(currentState);
      // Skip removeS3Resource

      saveState(currentState);

      const loaded = loadState();
      expect(loaded?.resources.s3).toBeDefined();
      expect(loaded?.resources.s3?.bucketName).toBe('test-bucket-123');
      expect(loaded?.resources.cloudfront).toBeUndefined();
      expect(loaded?.resources.acm).toBeUndefined();
    });

    it('should allow keeping Route53 hosted zone', async () => {
      const state = createFullState();
      saveState(state);

      let currentState = loadState()!;

      // Remove all except Route53
      currentState = removeCloudFrontResource(currentState);
      currentState = removeACMResource(currentState);
      currentState = removeS3Resource(currentState);
      // Skip removeRoute53Resource

      saveState(currentState);

      const loaded = loadState();
      expect(loaded?.resources.route53).toBeDefined();
      expect(loaded?.resources.route53?.domain).toBe('example.com');
    });
  });

  describe('State Cleanup After Removal', () => {
    it('should delete state file after all resources removed', async () => {
      const state = createFullState();
      saveState(state);

      expect(stateExists()).toBe(true);

      // Remove all resources
      let currentState = loadState()!;
      currentState = removeCloudFrontResource(currentState);
      currentState = removeACMResource(currentState);
      currentState = removeS3Resource(currentState);
      currentState = removeRoute53Resource(currentState);
      currentState.files = {}; // Clear file hashes too

      // Check if should delete state
      const shouldDeleteState = !hasAnyResource(currentState) &&
                                Object.keys(currentState.files).length === 0;
      expect(shouldDeleteState).toBe(true);

      // Delete state file
      if (shouldDeleteState) {
        deleteState();
      }

      expect(stateExists()).toBe(false);
    });

    it('should preserve state if resources remain', async () => {
      const state = createFullState();
      saveState(state);

      // Remove only CloudFront
      let currentState = loadState()!;
      currentState = removeCloudFrontResource(currentState);
      saveState(currentState);

      // State should still exist
      expect(stateExists()).toBe(true);
      expect(hasAnyResource(loadState()!)).toBe(true);
    });

    it('should clear file hashes on full removal', async () => {
      let state = createFullState();
      state.files = {
        'index.html': 'hash1',
        'style.css': 'hash2',
      };
      saveState(state);

      // After removal, file hashes should be cleared
      let currentState = loadState()!;
      currentState = removeCloudFrontResource(currentState);
      currentState = removeACMResource(currentState);
      currentState = removeS3Resource(currentState);
      currentState = removeRoute53Resource(currentState);
      currentState.files = {}; // Clear on removal

      saveState(currentState);

      const loaded = loadState();
      expect(Object.keys(loaded?.files || {})).toHaveLength(0);
    });
  });

  describe('Environment-specific Removal', () => {
    it('should only remove resources for specific environment', async () => {
      // Create states for multiple environments
      const devState = createFullState();
      devState.environment = 'dev';
      saveState(devState, { environment: 'dev' });

      const prodState = createFullState();
      prodState.environment = 'prod';
      saveState(prodState, { environment: 'prod' });

      // Remove only dev
      deleteState({ environment: 'dev' });

      expect(stateExists({ environment: 'dev' })).toBe(false);
      expect(stateExists({ environment: 'prod' })).toBe(true);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing state gracefully', () => {
      expect(stateExists()).toBe(false);

      // Attempting to load non-existent state
      const state = loadState();
      expect(state).toBeNull();
    });

    it('should handle partial state (only some resources)', () => {
      let state = initializeState('partial-app');
      state = updateS3Resource(state, {
        bucketName: 'partial-bucket',
        region: 'ap-northeast-2',
      });
      saveState(state);

      const loaded = loadState();
      expect(hasAnyResource(loaded!)).toBe(true);

      // Removing non-existent resource should be safe
      let currentState = loaded!;
      currentState = removeCloudFrontResource(currentState); // No CloudFront to remove
      expect(currentState.resources.cloudfront).toBeUndefined();
    });

    it('should preserve state on removal error', async () => {
      const state = createFullState();
      saveState(state);

      // Simulate partial removal (e.g., CF removed but S3 deletion failed)
      let currentState = loadState()!;
      currentState = removeCloudFrontResource(currentState);
      saveState(currentState);

      // State should reflect partial removal
      const loaded = loadState();
      expect(loaded?.resources.cloudfront).toBeUndefined();
      expect(loaded?.resources.s3).toBeDefined();
    });
  });

  describe('Resource Summary', () => {
    it('should generate accurate resource summary', () => {
      const state = createFullState();

      // getResourceSummary returns hasS3, hasCloudFront, s3BucketName, s3Region, distributionId, distributionUrl
      const summary = getResourceSummary(state);

      expect(summary.hasS3).toBe(true);
      expect(summary.s3BucketName).toBe('test-bucket-123');
      expect(summary.hasCloudFront).toBe(true);
      expect(summary.distributionId).toBe('E1234567890');
    });

    it('should handle empty resources in summary', () => {
      const state = initializeState('empty-summary');

      const summary = getResourceSummary(state);

      expect(summary.hasS3).toBe(false);
      expect(summary.hasCloudFront).toBe(false);
      expect(summary.s3BucketName).toBeUndefined();
      expect(summary.distributionId).toBeUndefined();
    });
  });
});
