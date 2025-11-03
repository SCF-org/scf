/**
 * AWS-related type definitions
 */

import type { AwsCredentialIdentity } from "@aws-sdk/types";

/**
 * AWS credentials (from AWS SDK)
 */
export type AWSCredentials = AwsCredentialIdentity;

/**
 * AWS account information from STS
 */
export interface AWSAccountInfo {
  /** AWS Account ID */
  accountId: string;

  /** User ARN */
  arn: string;

  /** User ID */
  userId: string;
}

/**
 * Credential source type
 */
export type CredentialSource =
  | "config"
  | "environment"
  | "profile"
  | "instance-metadata"
  | "default-chain";

/**
 * Credential resolution result
 */
export interface CredentialResolution {
  /** Resolved credentials */
  credentials: AWSCredentials;

  /** Source of credentials */
  source: CredentialSource;

  /** Profile name (if using profile) */
  profile?: string;
}
