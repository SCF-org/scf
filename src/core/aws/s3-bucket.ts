/**
 * S3 Bucket management
 */

import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  PutBucketTaggingCommand,
  GetBucketTaggingCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3';
import { withRetry, AWS_RETRYABLE_ERRORS } from '../utils/retry.js';

/**
 * Check if bucket exists
 */
export async function bucketExists(
  client: S3Client,
  bucketName: string
): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    return true;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      ('name' in error && error.name === 'NotFound' ||
       '$metadata' in error &&
       typeof error.$metadata === 'object' &&
       error.$metadata !== null &&
       'httpStatusCode' in error.$metadata &&
       error.$metadata.httpStatusCode === 404)
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Create S3 bucket
 */
export async function createBucket(
  client: S3Client,
  bucketName: string,
  region: string
): Promise<{ actuallyCreated: boolean }> {
  try {
    const command = new CreateBucketCommand({
      Bucket: bucketName,
      // CreateBucketConfiguration is only required for regions other than us-east-1
      ...(region !== 'us-east-1' && {
        CreateBucketConfiguration: {
          LocationConstraint: region as BucketLocationConstraint,
        },
      }),
    });

    await client.send(command);
    return { actuallyCreated: true };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'BucketAlreadyOwnedByYou'
    ) {
      // Bucket already exists and owned by us - NOT created by this call
      return { actuallyCreated: false };
    }
    throw error;
  }
}

/**
 * Configure bucket for static website hosting
 */
export async function configureBucketWebsite(
  client: S3Client,
  bucketName: string,
  indexDocument: string = 'index.html',
  errorDocument?: string
): Promise<void> {
  const command = new PutBucketWebsiteCommand({
    Bucket: bucketName,
    WebsiteConfiguration: {
      IndexDocument: {
        Suffix: indexDocument,
      },
      ...(errorDocument && {
        ErrorDocument: {
          Key: errorDocument,
        },
      }),
    },
  });

  await client.send(command);
}

/**
 * Set bucket policy to allow only CloudFront access via OAC
 * This blocks direct S3 access and only allows CloudFront to read objects
 */
export async function setBucketCloudFrontOnlyPolicy(
  client: S3Client,
  bucketName: string,
  cloudFrontDistributionArn: string
): Promise<void> {
  // Set bucket policy for CloudFront OAC access only
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'AllowCloudFrontServicePrincipalReadOnly',
        Effect: 'Allow',
        Principal: {
          Service: 'cloudfront.amazonaws.com',
        },
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/*`,
        Condition: {
          StringEquals: {
            'AWS:SourceArn': cloudFrontDistributionArn,
          },
        },
      },
    ],
  };

  const command = new PutBucketPolicyCommand({
    Bucket: bucketName,
    Policy: JSON.stringify(policy),
  });

  await client.send(command);
}

/**
 * Ensure bucket exists (without public access - CloudFront OAC will be used)
 */
export async function ensureBucket(
  client: S3Client,
  bucketName: string,
  region: string
): Promise<{ created: boolean }> {
  // Check if bucket exists
  const exists = await bucketExists(client, bucketName);
  let created = false;

  if (!exists) {
    // Create bucket - actuallyCreated is false if BucketAlreadyOwnedByYou
    const result = await createBucket(client, bucketName, region);
    created = result.actuallyCreated;
  }

  // Note: No website hosting or public read policy
  // CloudFront OAC will be configured after distribution creation
  // Bucket policy will be set by setBucketCloudFrontOnlyPolicy()

  return { created };
}

/**
 * Tag bucket for state recovery
 */
export async function tagBucketForRecovery(
  client: S3Client,
  bucketName: string,
  app: string,
  environment: string
): Promise<void> {
  try {
    await client.send(
      new PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: {
          TagSet: [
            { Key: 'scf:managed', Value: 'true' },
            { Key: 'scf:app', Value: app },
            { Key: 'scf:environment', Value: environment },
            { Key: 'scf:tool', Value: 'scf-deploy' },
          ],
        },
      })
    );
  } catch {
    // Non-critical error, just log it
    console.warn('Warning: Failed to tag S3 bucket for recovery');
  }
}

/**
 * Get bucket tags
 */
export async function getBucketTags(
  client: S3Client,
  bucketName: string
): Promise<Record<string, string>> {
  try {
    const result = await client.send(
      new GetBucketTaggingCommand({
        Bucket: bucketName,
      })
    );

    const tags: Record<string, string> = {};
    if (result.TagSet) {
      for (const tag of result.TagSet) {
        if (tag.Key && tag.Value) {
          tags[tag.Key] = tag.Value;
        }
      }
    }
    return tags;
  } catch {
    return {};
  }
}

/**
 * Get bucket website URL
 */
export function getBucketWebsiteUrl(bucketName: string, region: string): string {
  if (region === 'us-east-1') {
    return `http://${bucketName}.s3-website-us-east-1.amazonaws.com`;
  }
  return `http://${bucketName}.s3-website.${region}.amazonaws.com`;
}

/**
 * Delete specific files from S3 bucket
 */
export async function deleteFilesFromS3(
  client: S3Client,
  bucketName: string,
  keys: string[]
): Promise<{ deleted: number; failed: number }> {
  if (keys.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  const BATCH_SIZE = 1000; // S3 DeleteObjects limit
  let deleted = 0;
  let failed = 0;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);

    try {
      const result = await withRetry(
        () =>
          client.send(
            new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: {
                Objects: batch.map((key) => ({ Key: key })),
                Quiet: true,
              },
            })
          ),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          retryableErrors: AWS_RETRYABLE_ERRORS.S3,
        }
      );

      deleted += batch.length - (result.Errors?.length || 0);
      failed += result.Errors?.length || 0;
    } catch {
      failed += batch.length;
    }
  }

  return { deleted, failed };
}

/**
 * Delete S3 bucket and all its contents
 */
export async function deleteS3Bucket(
  client: S3Client,
  bucketName: string,
  _region: string
): Promise<void> {
  const ora = (await import('ora')).default;
  const spinner = ora('Deleting S3 bucket...').start();

  try {
    // First, delete all objects in the bucket
    spinner.text = 'Listing bucket objects...';
    let objectsDeleted = 0;

    let continuationToken: string | undefined;
    do {
      // Add retry for list operation
      const listResult = await withRetry(
        () =>
          client.send(
            new ListObjectsV2Command({
              Bucket: bucketName,
              ContinuationToken: continuationToken,
            })
          ),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffMultiplier: 2,
          retryableErrors: AWS_RETRYABLE_ERRORS.S3,
        },
        (attempt) => {
          spinner.text = `Listing objects (retry ${attempt}/3)...`;
        }
      );

      if (listResult.Contents && listResult.Contents.length > 0) {
        spinner.text = `Deleting ${listResult.Contents.length} objects...`;

        // Add retry for delete operation
        await withRetry(
          () =>
            client.send(
              new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: {
                  Objects: (listResult.Contents ?? []).map((obj) => ({ Key: obj.Key })),
                },
              })
            ),
          {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            retryableErrors: AWS_RETRYABLE_ERRORS.S3,
          },
          (attempt) => {
            spinner.text = `Deleting objects (retry ${attempt}/3)...`;
          }
        );

        objectsDeleted += listResult.Contents.length;
        spinner.text = `Deleted ${objectsDeleted} objects...`;
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Delete the bucket itself
    spinner.text = 'Deleting bucket...';
    await withRetry(
      () =>
        client.send(
          new DeleteBucketCommand({
            Bucket: bucketName,
          })
        ),
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableErrors: AWS_RETRYABLE_ERRORS.S3,
      }
    );

    spinner.succeed(`S3 bucket deleted (${objectsDeleted} objects removed)`);
  } catch (error) {
    spinner.fail('Failed to delete S3 bucket');

    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchBucket') {
      throw new Error('Bucket not found (may have been already deleted)');
    }

    throw new Error(
      `S3 bucket deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
