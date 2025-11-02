/**
 * AWS integration module
 *
 * Provides AWS credentials management and client creation
 */

// Credentials
export {
  getCredentials,
  createCredentialProvider,
} from './credentials.js';

// Verification
export {
  verifyCredentials,
  formatAccountInfo,
} from './verify.js';

// Client creation
export {
  createS3Client,
  createCloudFrontClient,
  createSTSClient,
  createS3ClientWithOptions,
  createCloudFrontClientWithOptions,
  type ClientOptions,
} from './client.js';

// Re-export types
export type {
  AWSCredentials,
  AWSAccountInfo,
  CredentialSource,
  CredentialResolution,
} from '../../types/aws.js';
