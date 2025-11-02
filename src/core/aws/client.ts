/**
 * AWS Client creation helpers
 */

import { S3Client } from '@aws-sdk/client-s3';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { STSClient } from '@aws-sdk/client-sts';
import type { SCFConfig } from '../../types/config.js';
import { createCredentialProvider } from './credentials.js';

/**
 * Create S3 client with credentials from config
 */
export function createS3Client(config: SCFConfig): S3Client {
  return new S3Client({
    region: config.region,
    credentials: createCredentialProvider(config),
  });
}

/**
 * Create CloudFront client with credentials from config
 * Note: CloudFront is always in us-east-1 for API calls
 */
export function createCloudFrontClient(config: SCFConfig): CloudFrontClient {
  return new CloudFrontClient({
    region: 'us-east-1', // CloudFront API is only in us-east-1
    credentials: createCredentialProvider(config),
  });
}

/**
 * Create STS client with credentials from config
 */
export function createSTSClient(config: SCFConfig): STSClient {
  return new STSClient({
    region: config.region,
    credentials: createCredentialProvider(config),
  });
}

/**
 * Client configuration options
 */
export interface ClientOptions {
  /** AWS region override */
  region?: string;

  /** Request timeout in milliseconds */
  requestTimeout?: number;

  /** Max retry attempts */
  maxAttempts?: number;
}

/**
 * Create S3 client with custom options
 */
export function createS3ClientWithOptions(
  config: SCFConfig,
  options: ClientOptions = {}
): S3Client {
  return new S3Client({
    region: options.region ?? config.region,
    credentials: createCredentialProvider(config),
    requestHandler: options.requestTimeout
      ? { requestTimeout: options.requestTimeout }
      : undefined,
    maxAttempts: options.maxAttempts,
  });
}

/**
 * Create CloudFront client with custom options
 */
export function createCloudFrontClientWithOptions(
  config: SCFConfig,
  options: ClientOptions = {}
): CloudFrontClient {
  return new CloudFrontClient({
    region: 'us-east-1', // CloudFront API is always in us-east-1
    credentials: createCredentialProvider(config),
    requestHandler: options.requestTimeout
      ? { requestTimeout: options.requestTimeout }
      : undefined,
    maxAttempts: options.maxAttempts,
  });
}
