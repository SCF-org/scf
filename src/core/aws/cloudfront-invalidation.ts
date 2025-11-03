/**
 * CloudFront cache invalidation
 */

import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  waitUntilInvalidationCompleted,
  type Invalidation,
  type InvalidationBatch,
} from '@aws-sdk/client-cloudfront';

/**
 * Invalidation options
 */
export interface InvalidationOptions {
  paths: string[];
  callerReference?: string;
}

/**
 * Create cache invalidation
 */
export async function createInvalidation(
  client: CloudFrontClient,
  distributionId: string,
  options: InvalidationOptions
): Promise<Invalidation> {
  const { paths, callerReference = `scf-${Date.now()}` } = options;

  const invalidationBatch: InvalidationBatch = {
    Paths: {
      Quantity: paths.length,
      Items: paths,
    },
    CallerReference: callerReference,
  };

  const response = await client.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: invalidationBatch,
    })
  );

  if (!response.Invalidation) {
    throw new Error('Failed to create invalidation: No invalidation returned');
  }

  return response.Invalidation;
}

/**
 * Get invalidation status
 */
export async function getInvalidation(
  client: CloudFrontClient,
  distributionId: string,
  invalidationId: string
): Promise<Invalidation | null> {
  try {
    const response = await client.send(
      new GetInvalidationCommand({
        DistributionId: distributionId,
        Id: invalidationId,
      })
    );

    return response.Invalidation || null;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      ('name' in error && error.name === 'NoSuchInvalidation' ||
       '$metadata' in error &&
       typeof error.$metadata === 'object' &&
       error.$metadata !== null &&
       'httpStatusCode' in error.$metadata &&
       error.$metadata.httpStatusCode === 404)
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Wait for invalidation to complete
 */
export async function waitForInvalidationCompleted(
  client: CloudFrontClient,
  distributionId: string,
  invalidationId: string,
  options: {
    maxWaitTime?: number; // seconds
    minDelay?: number; // seconds
    maxDelay?: number; // seconds
  } = {}
): Promise<void> {
  const { maxWaitTime = 600, minDelay = 20, maxDelay = 60 } = options;

  await waitUntilInvalidationCompleted(
    {
      client,
      maxWaitTime,
      minDelay,
      maxDelay,
    },
    {
      DistributionId: distributionId,
      Id: invalidationId,
    }
  );
}

/**
 * Create and wait for invalidation to complete
 */
export async function invalidateCache(
  client: CloudFrontClient,
  distributionId: string,
  paths: string[],
  options: {
    wait?: boolean;
    maxWaitTime?: number;
    minDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<Invalidation> {
  const { wait = true, maxWaitTime, minDelay, maxDelay } = options;

  // Create invalidation
  const invalidation = await createInvalidation(client, distributionId, { paths });

  // Wait for completion if requested
  if (wait && invalidation.Id) {
    await waitForInvalidationCompleted(client, distributionId, invalidation.Id, {
      maxWaitTime,
      minDelay,
      maxDelay,
    });
  }

  return invalidation;
}

/**
 * Invalidate all files (/* wildcard)
 */
export async function invalidateAll(
  client: CloudFrontClient,
  distributionId: string,
  options: {
    wait?: boolean;
    maxWaitTime?: number;
  } = {}
): Promise<Invalidation> {
  return invalidateCache(client, distributionId, ['/*'], options);
}

/**
 * Check if invalidation is complete
 */
export function isInvalidationComplete(invalidation: Invalidation): boolean {
  return invalidation.Status === 'Completed';
}

/**
 * Get invalidation progress
 */
export function getInvalidationStatus(invalidation: Invalidation): string {
  return invalidation.Status || 'Unknown';
}
