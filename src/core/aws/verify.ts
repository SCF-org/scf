/**
 * AWS Credentials verification using STS
 */

import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import type { AWSCredentials, AWSAccountInfo } from '../../types/aws.js';

/**
 * Verify AWS credentials by calling STS GetCallerIdentity
 *
 * @param credentials - AWS credentials to verify
 * @param region - AWS region
 * @returns AWS account information
 * @throws Error if credentials are invalid
 */
export async function verifyCredentials(
  credentials: AWSCredentials,
  region: string
): Promise<AWSAccountInfo> {
  const client = new STSClient({
    region,
    credentials,
  });

  try {
    const command = new GetCallerIdentityCommand({});
    const response = await client.send(command);

    if (!response.Account || !response.Arn || !response.UserId) {
      throw new Error('Invalid STS response: missing required fields');
    }

    return {
      accountId: response.Account,
      arn: response.Arn,
      userId: response.UserId,
    };
  } catch (error) {
    if (error instanceof Error) {
      // AWS SDK errors
      if ('Code' in error || '$metadata' in error) {
        throw new Error(
          `AWS credentials verification failed: ${error.message}\n` +
            `Please check your credentials and try again.`
        );
      }
      throw error;
    }
    throw new Error(`Unknown error during credentials verification: ${String(error)}`);
  }
}

/**
 * Format AWS account info for display
 */
export function formatAccountInfo(info: AWSAccountInfo): string {
  return [
    `Account ID: ${info.accountId}`,
    `User ARN: ${info.arn}`,
    `User ID: ${info.userId}`,
  ].join('\n');
}
