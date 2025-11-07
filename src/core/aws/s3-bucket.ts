/**
 * S3 Bucket management
 */

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
  type BucketLocationConstraint,
} from '@aws-sdk/client-s3';

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
): Promise<void> {
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
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'BucketAlreadyOwnedByYou'
    ) {
      // Bucket already exists and owned by us, continue
      return;
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
 * Set bucket policy for public read access
 */
export async function setBucketPublicReadPolicy(
  client: S3Client,
  bucketName: string
): Promise<void> {
  // First, remove public access block
  try {
    await client.send(
      new DeletePublicAccessBlockCommand({
        Bucket: bucketName,
      })
    );
  } catch (_error) {
    // Ignore if doesn't exist
  }

  // Set bucket policy
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucketName}/*`,
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
 * Ensure bucket exists and is properly configured
 */
export async function ensureBucket(
  client: S3Client,
  bucketName: string,
  region: string,
  options: {
    websiteHosting?: boolean;
    indexDocument?: string;
    errorDocument?: string;
    publicRead?: boolean;
  } = {}
): Promise<void> {
  const {
    websiteHosting = true,
    indexDocument = 'index.html',
    errorDocument,
    publicRead = true,
  } = options;

  // Check if bucket exists
  const exists = await bucketExists(client, bucketName);

  if (!exists) {
    // Create bucket
    await createBucket(client, bucketName, region);
  }

  // Configure website hosting
  if (websiteHosting) {
    await configureBucketWebsite(client, bucketName, indexDocument, errorDocument);
  }

  // Set public read policy
  if (publicRead) {
    await setBucketPublicReadPolicy(client, bucketName);
  }
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
      const listResult = await client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        })
      );

      if (listResult.Contents && listResult.Contents.length > 0) {
        spinner.text = `Deleting ${listResult.Contents.length} objects...`;

        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: listResult.Contents.map((obj) => ({ Key: obj.Key })),
            },
          })
        );

        objectsDeleted += listResult.Contents.length;
        spinner.text = `Deleted ${objectsDeleted} objects...`;
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    // Delete the bucket itself
    spinner.text = 'Deleting bucket...';
    await client.send(
      new DeleteBucketCommand({
        Bucket: bucketName,
      })
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
