import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  DeletePublicAccessBlockCommand,
  PutBucketTaggingCommand,
  GetBucketTaggingCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import {
  bucketExists,
  createBucket,
  configureBucketWebsite,
  setBucketPublicReadPolicy,
  ensureBucket,
  tagBucketForRecovery,
  getBucketTags,
  getBucketWebsiteUrl,
  deleteS3Bucket,
} from '../../../core/aws/s3-bucket.js';

describe('S3 Bucket Management', () => {
  const s3Mock = mockClient(S3Client);
  let client: S3Client;

  beforeEach(() => {
    s3Mock.reset();
    client = new S3Client({ region: 'us-east-1' });
  });

  afterEach(() => {
    s3Mock.restore();
  });

  describe('bucketExists', () => {
    it('should return true when bucket exists', async () => {
      s3Mock.on(HeadBucketCommand).resolves({});

      const exists = await bucketExists(client, 'my-bucket');
      expect(exists).toBe(true);
    });

    it('should return false when bucket does not exist (404)', async () => {
      s3Mock.on(HeadBucketCommand).rejects({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });

      const exists = await bucketExists(client, 'non-existent-bucket');
      expect(exists).toBe(false);
    });

    it('should throw error for other failures', async () => {
      s3Mock.on(HeadBucketCommand).rejects({
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      });

      await expect(bucketExists(client, 'my-bucket')).rejects.toThrow();
    });
  });

  describe('createBucket', () => {
    it('should create bucket in us-east-1 without LocationConstraint', async () => {
      s3Mock.on(CreateBucketCommand).resolves({});

      await createBucket(client, 'my-bucket', 'us-east-1');

      const calls = s3Mock.commandCalls(CreateBucketCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'my-bucket',
      });
    });

    it('should create bucket in other regions with LocationConstraint', async () => {
      s3Mock.on(CreateBucketCommand).resolves({});

      await createBucket(client, 'my-bucket', 'ap-northeast-2');

      const calls = s3Mock.commandCalls(CreateBucketCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'my-bucket',
        CreateBucketConfiguration: {
          LocationConstraint: 'ap-northeast-2',
        },
      });
    });

    it('should handle BucketAlreadyOwnedByYou error gracefully', async () => {
      s3Mock.on(CreateBucketCommand).rejects({
        name: 'BucketAlreadyOwnedByYou',
      });

      const result = await createBucket(client, 'my-bucket', 'us-east-1');
      expect(result).toEqual({ actuallyCreated: false });
    });

    it('should throw other errors', async () => {
      s3Mock.on(CreateBucketCommand).rejects(new Error('Network error'));

      await expect(createBucket(client, 'my-bucket', 'us-east-1')).rejects.toThrow('Network error');
    });
  });

  describe('configureBucketWebsite', () => {
    it('should configure bucket with default index document', async () => {
      s3Mock.on(PutBucketWebsiteCommand).resolves({});

      await configureBucketWebsite(client, 'my-bucket');

      const calls = s3Mock.commandCalls(PutBucketWebsiteCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'my-bucket',
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: 'index.html',
          },
        },
      });
    });

    it('should configure bucket with custom index and error documents', async () => {
      s3Mock.on(PutBucketWebsiteCommand).resolves({});

      await configureBucketWebsite(client, 'my-bucket', 'home.html', '404.html');

      const calls = s3Mock.commandCalls(PutBucketWebsiteCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'my-bucket',
        WebsiteConfiguration: {
          IndexDocument: {
            Suffix: 'home.html',
          },
          ErrorDocument: {
            Key: '404.html',
          },
        },
      });
    });
  });

  describe('setBucketPublicReadPolicy', () => {
    it('should set public read policy', async () => {
      s3Mock.on(DeletePublicAccessBlockCommand).resolves({});
      s3Mock.on(PutBucketPolicyCommand).resolves({});

      await setBucketPublicReadPolicy(client, 'my-bucket');

      const policyCalls = s3Mock.commandCalls(PutBucketPolicyCommand);
      expect(policyCalls).toHaveLength(1);

      const policy = JSON.parse(policyCalls[0].args[0].input.Policy as string);
      expect(policy).toEqual({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: 'arn:aws:s3:::my-bucket/*',
          },
        ],
      });
    });

    it('should continue even if DeletePublicAccessBlock fails', async () => {
      s3Mock.on(DeletePublicAccessBlockCommand).rejects(new Error('Not found'));
      s3Mock.on(PutBucketPolicyCommand).resolves({});

      await expect(setBucketPublicReadPolicy(client, 'my-bucket')).resolves.toBeUndefined();

      const policyCalls = s3Mock.commandCalls(PutBucketPolicyCommand);
      expect(policyCalls).toHaveLength(1);
    });
  });

  describe('ensureBucket', () => {
    it('should create and configure new bucket', async () => {
      s3Mock.on(HeadBucketCommand).rejects({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      s3Mock.on(CreateBucketCommand).resolves({});
      s3Mock.on(PutBucketWebsiteCommand).resolves({});
      s3Mock.on(DeletePublicAccessBlockCommand).resolves({});
      s3Mock.on(PutBucketPolicyCommand).resolves({});

      await ensureBucket(client, 'my-bucket', 'us-east-1');

      expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(PutBucketWebsiteCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(PutBucketPolicyCommand)).toHaveLength(1);
    });

    it('should only configure existing bucket', async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(PutBucketWebsiteCommand).resolves({});
      s3Mock.on(DeletePublicAccessBlockCommand).resolves({});
      s3Mock.on(PutBucketPolicyCommand).resolves({});

      await ensureBucket(client, 'existing-bucket', 'us-east-1');

      expect(s3Mock.commandCalls(CreateBucketCommand)).toHaveLength(0);
      expect(s3Mock.commandCalls(PutBucketWebsiteCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(PutBucketPolicyCommand)).toHaveLength(1);
    });

    it('should skip website hosting if disabled', async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(DeletePublicAccessBlockCommand).resolves({});
      s3Mock.on(PutBucketPolicyCommand).resolves({});

      await ensureBucket(client, 'my-bucket', 'us-east-1', {
        websiteHosting: false,
      });

      expect(s3Mock.commandCalls(PutBucketWebsiteCommand)).toHaveLength(0);
      expect(s3Mock.commandCalls(PutBucketPolicyCommand)).toHaveLength(1);
    });

    it('should skip public read if disabled', async () => {
      s3Mock.on(HeadBucketCommand).resolves({});
      s3Mock.on(PutBucketWebsiteCommand).resolves({});

      await ensureBucket(client, 'my-bucket', 'us-east-1', {
        publicRead: false,
      });

      expect(s3Mock.commandCalls(PutBucketWebsiteCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(PutBucketPolicyCommand)).toHaveLength(0);
    });
  });

  describe('tagBucketForRecovery', () => {
    it('should tag bucket with SCF metadata', async () => {
      s3Mock.on(PutBucketTaggingCommand).resolves({});

      await tagBucketForRecovery(client, 'my-bucket', 'my-app', 'production');

      const calls = s3Mock.commandCalls(PutBucketTaggingCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'my-bucket',
        Tagging: {
          TagSet: [
            { Key: 'scf:managed', Value: 'true' },
            { Key: 'scf:app', Value: 'my-app' },
            { Key: 'scf:environment', Value: 'production' },
            { Key: 'scf:tool', Value: 'scf-deploy' },
          ],
        },
      });
    });

    it('should handle tagging errors gracefully', async () => {
      s3Mock.on(PutBucketTaggingCommand).rejects(new Error('Permission denied'));

      // Should not throw, just log warning
      await expect(
        tagBucketForRecovery(client, 'my-bucket', 'my-app', 'production')
      ).resolves.toBeUndefined();
    });
  });

  describe('getBucketTags', () => {
    it('should return bucket tags as object', async () => {
      s3Mock.on(GetBucketTaggingCommand).resolves({
        TagSet: [
          { Key: 'scf:managed', Value: 'true' },
          { Key: 'scf:app', Value: 'my-app' },
          { Key: 'Environment', Value: 'production' },
        ],
      });

      const tags = await getBucketTags(client, 'my-bucket');

      expect(tags).toEqual({
        'scf:managed': 'true',
        'scf:app': 'my-app',
        Environment: 'production',
      });
    });

    it('should return empty object when tagging fails', async () => {
      s3Mock.on(GetBucketTaggingCommand).rejects(new Error('Not found'));

      const tags = await getBucketTags(client, 'my-bucket');

      expect(tags).toEqual({});
    });

    it('should handle empty TagSet', async () => {
      s3Mock.on(GetBucketTaggingCommand).resolves({
        TagSet: [],
      });

      const tags = await getBucketTags(client, 'my-bucket');

      expect(tags).toEqual({});
    });
  });

  describe('getBucketWebsiteUrl', () => {
    it('should generate correct URL for us-east-1', () => {
      const url = getBucketWebsiteUrl('my-bucket', 'us-east-1');
      expect(url).toBe('http://my-bucket.s3-website-us-east-1.amazonaws.com');
    });

    it('should generate correct URL for other regions', () => {
      const url = getBucketWebsiteUrl('my-bucket', 'ap-northeast-2');
      expect(url).toBe('http://my-bucket.s3-website.ap-northeast-2.amazonaws.com');
    });

    it('should generate correct URL for eu-west-1', () => {
      const url = getBucketWebsiteUrl('my-bucket', 'eu-west-1');
      expect(url).toBe('http://my-bucket.s3-website.eu-west-1.amazonaws.com');
    });
  });

  describe('deleteS3Bucket', () => {
    it('should delete bucket and all objects', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'file1.html' },
          { Key: 'file2.css' },
        ],
      });
      s3Mock.on(DeleteObjectsCommand).resolves({});
      s3Mock.on(DeleteBucketCommand).resolves({});

      await deleteS3Bucket(client, 'my-bucket', 'us-east-1');

      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(DeleteBucketCommand)).toHaveLength(1);
    });

    it('should handle pagination when deleting many objects', async () => {
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: [{ Key: 'file1.html' }],
          NextContinuationToken: 'token1',
        })
        .resolvesOnce({
          Contents: [{ Key: 'file2.css' }],
        });
      s3Mock.on(DeleteObjectsCommand).resolves({});
      s3Mock.on(DeleteBucketCommand).resolves({});

      await deleteS3Bucket(client, 'my-bucket', 'us-east-1');

      expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(2);
      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(2);
      expect(s3Mock.commandCalls(DeleteBucketCommand)).toHaveLength(1);
    });

    it('should handle empty bucket', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [],
      });
      s3Mock.on(DeleteBucketCommand).resolves({});

      await deleteS3Bucket(client, 'my-bucket', 'us-east-1');

      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
      expect(s3Mock.commandCalls(DeleteBucketCommand)).toHaveLength(1);
    });

    it('should throw error when bucket does not exist', async () => {
      s3Mock.on(ListObjectsV2Command).rejects({
        name: 'NoSuchBucket',
      });

      await expect(deleteS3Bucket(client, 'non-existent-bucket', 'us-east-1')).rejects.toThrow(
        'Bucket not found (may have been already deleted)'
      );
    });

    it('should throw error on deletion failure', async () => {
      s3Mock.on(ListObjectsV2Command).rejects(new Error('Network error'));

      await expect(deleteS3Bucket(client, 'my-bucket', 'us-east-1')).rejects.toThrow(
        'S3 bucket deletion failed: Network error'
      );
    });
  });
});
