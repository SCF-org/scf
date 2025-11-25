/**
 * E2E Test for S3 Bucket Management
 *
 * ⚠️  WARNING: These tests create REAL AWS resources!
 *
 * Prerequisites:
 * - AWS credentials configured (environment variables or AWS profile)
 * - Sufficient permissions to create/delete S3 buckets
 * - Be aware that costs may be incurred (though minimal)
 *
 * Run with:
 *   E2E_TEST=true npm run test:e2e -- s3-bucket.e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { S3Client } from '@aws-sdk/client-s3';
import {
  bucketExists,
  createBucket,
  ensureBucket,
  configureBucketWebsite,
  setBucketPublicReadPolicy,
  getBucketWebsiteUrl,
  deleteS3Bucket,
  tagBucketForRecovery,
  getBucketTags,
} from '../../../core/aws/s3-bucket.js';

// Skip E2E tests unless explicitly enabled
const describeE2E = process.env.E2E_TEST === 'true' ? describe : describe.skip;

describeE2E('E2E: S3 Bucket Management', () => {
  let client: S3Client;
  const region = process.env.AWS_REGION || 'ap-northeast-2';
  const testBuckets: string[] = [];

  // Helper to generate unique bucket name
  const generateBucketName = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `scf-e2e-test-${timestamp}-${random}`;
  };

  beforeAll(() => {
    // Directly read credentials from environment variables
    // This bypasses the credential provider chain which may not work in Jest
    const credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    };

    client = new S3Client({
      region,
      credentials
    });

    console.log('\n🚀 Starting S3 E2E tests...');
    console.log(`   Region: ${region}`);
    console.log(`   Using credentials: ${credentials.accessKeyId.substring(0, 12)}...`);
    console.log('   ⚠️  Real AWS resources will be created and deleted\n');
  });

  afterAll(async () => {
    // Cleanup: Delete all test buckets that weren't cleaned up
    console.log('\n🧹 Cleaning up test buckets...');

    for (const bucketName of testBuckets) {
      try {
        const exists = await bucketExists(client, bucketName);
        if (exists) {
          console.log(`   Deleting leftover bucket: ${bucketName}`);
          await deleteS3Bucket(client, bucketName, region);
        }
      } catch (error) {
        console.warn(`   Failed to cleanup bucket ${bucketName}:`, error);
      }
    }

    console.log('✅ Cleanup complete\n');
  });

  describe('Bucket Creation and Deletion', () => {
    it('should create a new S3 bucket in AWS', async () => {
      const bucketName = generateBucketName();
      testBuckets.push(bucketName);

      console.log(`   Creating bucket: ${bucketName}`);

      // Verify bucket doesn't exist
      let exists = await bucketExists(client, bucketName);
      expect(exists).toBe(false);

      // Create bucket
      await createBucket(client, bucketName, region);

      // Verify bucket now exists
      exists = await bucketExists(client, bucketName);
      expect(exists).toBe(true);

      console.log('   ✓ Bucket created successfully');

      // Cleanup
      await deleteS3Bucket(client, bucketName, region);
      testBuckets.splice(testBuckets.indexOf(bucketName), 1);

      // Verify bucket is deleted
      exists = await bucketExists(client, bucketName);
      expect(exists).toBe(false);

      console.log('   ✓ Bucket deleted successfully');
    }, 60000); // 60 second timeout

    it('should handle bucket creation in us-east-1', async () => {
      if (region !== 'us-east-1') {
        console.log('   ⊘ Skipping us-east-1 test (not in us-east-1)');
        return;
      }

      const bucketName = generateBucketName();
      testBuckets.push(bucketName);

      await createBucket(client, bucketName, 'us-east-1');

      const exists = await bucketExists(client, bucketName);
      expect(exists).toBe(true);

      // Cleanup
      await deleteS3Bucket(client, bucketName, 'us-east-1');
      testBuckets.splice(testBuckets.indexOf(bucketName), 1);
    }, 60000);
  });

  describe('Bucket Configuration', () => {
    let bucketName: string;

    beforeAll(async () => {
      bucketName = generateBucketName();
      testBuckets.push(bucketName);

      console.log(`   Setting up test bucket: ${bucketName}`);
      await createBucket(client, bucketName, region);
    });

    afterAll(async () => {
      console.log(`   Tearing down test bucket: ${bucketName}`);
      try {
        await deleteS3Bucket(client, bucketName, region);
        testBuckets.splice(testBuckets.indexOf(bucketName), 1);
      } catch (error) {
        console.warn('   Failed to delete test bucket:', error);
      }
    });

    it('should configure bucket for static website hosting', async () => {
      console.log('   Configuring website hosting...');

      await configureBucketWebsite(client, bucketName, 'index.html', '404.html');

      // Verify by getting the website URL (doesn't throw if configured)
      const websiteUrl = getBucketWebsiteUrl(bucketName, region);
      expect(websiteUrl).toContain(bucketName);
      expect(websiteUrl).toContain('.amazonaws.com');

      console.log(`   ✓ Website hosting configured: ${websiteUrl}`);
    }, 30000);

    it('should set public read policy on bucket', async () => {
      console.log('   Setting public read policy...');

      await setBucketPublicReadPolicy(client, bucketName);

      // If no error thrown, policy was set successfully
      console.log('   ✓ Public read policy set');
    }, 30000);

    it('should tag bucket for recovery', async () => {
      console.log('   Tagging bucket...');

      await tagBucketForRecovery(client, bucketName, 'e2e-test-app', 'test');

      // Verify tags
      const tags = await getBucketTags(client, bucketName);

      expect(tags['scf:managed']).toBe('true');
      expect(tags['scf:app']).toBe('e2e-test-app');
      expect(tags['scf:environment']).toBe('test');
      expect(tags['scf:tool']).toBe('scf-deploy');

      console.log('   ✓ Tags verified:', tags);
    }, 30000);
  });

  describe('ensureBucket (Full Setup)', () => {
    it('should create and fully configure a new bucket', async () => {
      const bucketName = generateBucketName();
      testBuckets.push(bucketName);

      console.log(`   Ensuring bucket: ${bucketName}`);

      // This should create bucket AND configure it
      await ensureBucket(client, bucketName, region, {
        websiteHosting: true,
        indexDocument: 'index.html',
        errorDocument: 'error.html',
        publicRead: true,
      });

      // Verify bucket exists
      const exists = await bucketExists(client, bucketName);
      expect(exists).toBe(true);

      // Verify website URL can be generated
      const websiteUrl = getBucketWebsiteUrl(bucketName, region);
      expect(websiteUrl).toContain(bucketName);

      console.log('   ✓ Bucket fully configured');

      // Cleanup
      await deleteS3Bucket(client, bucketName, region);
      testBuckets.splice(testBuckets.indexOf(bucketName), 1);
    }, 60000);

    it('should be idempotent (no error if bucket already exists)', async () => {
      const bucketName = generateBucketName();
      testBuckets.push(bucketName);

      console.log(`   Creating bucket twice: ${bucketName}`);

      // First call - creates bucket
      await ensureBucket(client, bucketName, region);

      // Second call - should not error
      await ensureBucket(client, bucketName, region);

      const exists = await bucketExists(client, bucketName);
      expect(exists).toBe(true);

      console.log('   ✓ Idempotent operation verified');

      // Cleanup
      await deleteS3Bucket(client, bucketName, region);
      testBuckets.splice(testBuckets.indexOf(bucketName), 1);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle non-existent bucket gracefully', async () => {
      const nonExistentBucket = 'scf-this-bucket-does-not-exist-12345';

      const exists = await bucketExists(client, nonExistentBucket);
      expect(exists).toBe(false);
    });

    it('should handle deletion of non-existent bucket', async () => {
      const nonExistentBucket = 'scf-this-bucket-does-not-exist-12345';

      await expect(
        deleteS3Bucket(client, nonExistentBucket, region)
      ).rejects.toThrow();
    });
  });
});
