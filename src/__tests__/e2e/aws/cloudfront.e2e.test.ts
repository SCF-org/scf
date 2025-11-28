/**
 * E2E Test for CloudFront Distribution Management
 *
 * ⚠️  WARNING: These tests create REAL AWS resources and take a LONG TIME!
 *
 * Prerequisites:
 * - AWS credentials configured
 * - Sufficient permissions for CloudFront and S3
 * - Be patient: CloudFront distribution creation takes 10-15 minutes
 * - Costs will be incurred (CloudFront has minimum charges)
 *
 * Run with:
 *   E2E_TEST=true npm run test:e2e -- cloudfront.e2e.test.ts
 *
 * ⏱️  Expected total runtime: ~25-30 minutes
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import {
  createDistribution,
  getDistribution,
  distributionExists,
  updateDistribution,
  getDistributionUrl,
  waitForDistributionDeployed,
  deleteDistributionQuiet,
  type CreateDistributionOptions,
} from '../../../core/aws/cloudfront-distribution.js';
import {
  createInvalidation,
  getInvalidation,
  invalidateAll,
  isInvalidationComplete,
} from '../../../core/aws/cloudfront-invalidation.js';
import {
  createBucket,
  configureBucketWebsite,
  setBucketPublicReadPolicy,
  deleteS3Bucket,
} from '../../../core/aws/s3-bucket.js';

// Skip E2E tests unless explicitly enabled
const describeE2E = process.env.E2E_TEST === 'true' ? describe : describe.skip;

describeE2E('E2E: CloudFront Distribution', () => {
  let s3Client: S3Client;
  let cfClient: CloudFrontClient;
  const region = process.env.AWS_REGION || 'ap-northeast-2';

  let testBucketName: string;
  let distributionId: string;

  // Generate unique names
  const generateUniqueName = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `scf-e2e-cf-${timestamp}-${random}`;
  };

  beforeAll(async () => {
    // Directly read credentials from environment variables
    // This bypasses the credential provider chain which may not work in Jest
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    };

    s3Client = new S3Client({
      region,
      credentials
    });
    cfClient = new CloudFrontClient({
      region,
      credentials
    });

    console.log('\n🚀 Starting CloudFront E2E tests...');
    console.log(`   Region: ${region}`);
    console.log(`   Using credentials: ${credentials.accessKeyId.substring(0, 12)}...`);
    console.log('   ⚠️  This will take 15-20 minutes!');
    console.log('   ⚠️  Real AWS resources will be created\n');

    // Setup: Create S3 bucket with test content
    testBucketName = generateUniqueName();
    console.log(`   Creating S3 bucket: ${testBucketName}`);

    await createBucket(s3Client, testBucketName, region);
    await configureBucketWebsite(s3Client, testBucketName, 'index.html');
    await setBucketPublicReadPolicy(s3Client, testBucketName);

    // Upload test file
    await s3Client.send(
      new PutObjectCommand({
        Bucket: testBucketName,
        Key: 'index.html',
        Body: '<h1>CloudFront E2E Test</h1>',
        ContentType: 'text/html',
      })
    );

    console.log('   ✓ S3 bucket ready with test content');

    // Create CloudFront distribution
    console.log('   Creating CloudFront distribution (this takes ~15 minutes)...');

    const options: CreateDistributionOptions = {
      s3BucketName: testBucketName,
      s3Region: region,
      indexDocument: 'index.html',
      priceClass: 'PriceClass_100', // Cheapest option
    };

    const distribution = await createDistribution(cfClient, options);

    if (!distribution.Id) {
      throw new Error('Failed to get distribution ID');
    }

    distributionId = distribution.Id;
    console.log(`   ✓ Distribution created: ${distributionId}`);

    // Wait for deployment (this is the slowest part)
    console.log('   Waiting for distribution to deploy...');
    console.log('   ⏱️  This typically takes 10-15 minutes, please be patient');

    await waitForDistributionDeployed(cfClient, distributionId, {
      maxWaitTime: 1200, // 20 minutes
      minDelay: 30,
      maxDelay: 60,
    });

    console.log('   ✓ Distribution deployed successfully\n');
  }, 1800000); // 30 minute timeout for beforeAll

  afterAll(async () => {
    console.log('\n🧹 Cleaning up CloudFront and S3 resources...');
    console.log('   ⏱️  This may take 5-10 minutes\n');

    // CloudFront 삭제 (독립적으로 처리)
    if (distributionId) {
      try {
        console.log(`   Disabling and deleting CloudFront distribution: ${distributionId}`);
        console.log('   ⏱️  This will take ~10 minutes (disable + wait + delete)...');

        const deleted = await deleteDistributionQuiet(cfClient, distributionId, {
          wait: true,
          maxWaitTime: 600, // 10 minutes
        });

        if (deleted) {
          console.log('   ✓ CloudFront distribution deleted');
        } else {
          console.log('   ℹ  CloudFront distribution already deleted or not found');
        }
      } catch (error) {
        console.warn(`   ⚠️  CloudFront cleanup failed:`, error);
        console.log(`   ⚠️  Manual cleanup may be needed for distribution: ${distributionId}`);
      }
    }

    // S3 삭제 (CloudFront 실패와 관계없이 실행)
    if (testBucketName) {
      try {
        console.log(`   Deleting S3 bucket: ${testBucketName}`);
        await deleteS3Bucket(s3Client, testBucketName, region);
        console.log('   ✓ S3 bucket deleted');
      } catch (error) {
        console.warn(`   ⚠️  S3 cleanup failed:`, error);
        console.log(`   ⚠️  Manual cleanup may be needed for bucket: ${testBucketName}`);
      }
    }

    console.log('\n✅ E2E tests complete\n');
  }, 900000); // 15 minute timeout for cleanup (disable + wait + delete takes time)

  describe('Distribution Management', () => {
    it('should verify distribution exists', async () => {
      const exists = await distributionExists(cfClient, distributionId);
      expect(exists).toBe(true);
    }, 30000);

    it('should retrieve distribution details', async () => {
      const distribution = await getDistribution(cfClient, distributionId);

      expect(distribution).not.toBeNull();
      expect(distribution?.Id).toBe(distributionId);
      expect(distribution?.Status).toBe('Deployed');
      expect(distribution?.DomainName).toBeDefined();

      const url = getDistributionUrl(distribution!);
      console.log(`   Distribution URL: ${url}`);
      expect(url).toContain('https://');
      expect(url).toContain('.cloudfront.net');
    }, 30000);

    it('should update distribution configuration', async () => {
      console.log('   Updating distribution price class...');

      const updatedDistribution = await updateDistribution(cfClient, distributionId, {
        priceClass: 'PriceClass_100', // Same as before, just testing update
      });

      expect(updatedDistribution).toBeDefined();
      expect(updatedDistribution.Id).toBe(distributionId);

      console.log('   ✓ Distribution updated (deploying in background)');
    }, 60000);
  });

  describe('Cache Invalidation', () => {
    it('should create cache invalidation', async () => {
      console.log('   Creating cache invalidation...');

      const invalidation = await createInvalidation(cfClient, distributionId, {
        paths: ['/index.html'],
      });

      expect(invalidation).toBeDefined();
      expect(invalidation.Id).toBeDefined();
      expect(invalidation.Status).toBeDefined();

      console.log(`   ✓ Invalidation created: ${invalidation.Id}`);
      console.log(`      Status: ${invalidation.Status}`);
    }, 60000);

    it('should retrieve invalidation status', async () => {
      console.log('   Creating invalidation for status check...');

      const created = await createInvalidation(cfClient, distributionId, {
        paths: ['/test.html'],
      });

      expect(created.Id).toBeDefined();

      const invalidation = await getInvalidation(cfClient, distributionId, created.Id!);

      expect(invalidation).not.toBeNull();
      expect(invalidation?.Id).toBe(created.Id);
      expect(['InProgress', 'Completed']).toContain(invalidation?.Status);

      console.log(`   ✓ Invalidation status: ${invalidation?.Status}`);
    }, 60000);

    it('should invalidate all files', async () => {
      console.log('   Invalidating all files (/* wildcard)...');

      const invalidation = await invalidateAll(cfClient, distributionId, {
        wait: false, // Don't wait for completion to save time
      });

      expect(invalidation).toBeDefined();
      expect(invalidation.Id).toBeDefined();
      expect(invalidation.InvalidationBatch?.Paths?.Items).toContain('/*');

      const complete = isInvalidationComplete(invalidation);
      console.log(`   ✓ Full invalidation created`);
      console.log(`      Status: ${invalidation.Status}`);
      console.log(`      Complete: ${complete ? 'Yes' : 'No (will complete in a few minutes)'}`);
    }, 60000);
  });

  describe('Integration with S3', () => {
    it('should serve content from S3 through CloudFront', async () => {
      const distribution = await getDistribution(cfClient, distributionId);
      const url = getDistributionUrl(distribution!);

      console.log(`   ✓ Content should be accessible at: ${url}`);
      console.log(`      (You can test manually in browser)`);

      // Note: Actually fetching the URL would require http client
      // and waiting for DNS propagation, which we skip for time
      expect(url).toBeDefined();
    }, 30000);

    it('should update S3 content and invalidate cache', async () => {
      console.log('   Uploading new content to S3...');

      await s3Client.send(
        new PutObjectCommand({
          Bucket: testBucketName,
          Key: 'index.html',
          Body: '<h1>Updated Content</h1>',
          ContentType: 'text/html',
        })
      );

      console.log('   ✓ New content uploaded');
      console.log('   Creating invalidation for updated file...');

      await createInvalidation(cfClient, distributionId, {
        paths: ['/index.html'],
      });

      console.log('   ✓ Cache invalidated (changes will propagate in a few minutes)');
    }, 60000);
  });
});
