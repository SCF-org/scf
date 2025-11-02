/**
 * AWS Credentials resolution
 */

import {
  fromEnv,
  fromIni,
  fromInstanceMetadata,
  fromContainerMetadata,
} from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import type { SCFConfig } from '../../types/config.js';
import type {
  CredentialSource,
  CredentialResolution,
} from '../../types/aws.js';

/**
 * Get AWS credentials from config with priority order:
 * 1. Explicit credentials in config (accessKeyId + secretAccessKey)
 * 2. Profile from config
 * 3. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 4. Default credential provider chain (profile → IAM role)
 */
export async function getCredentials(
  config: SCFConfig
): Promise<CredentialResolution> {
  let credentialProvider: AwsCredentialIdentityProvider;
  let source: CredentialSource;
  let profile: string | undefined;

  // Priority 1: Explicit credentials in config
  if (
    config.credentials?.accessKeyId &&
    config.credentials?.secretAccessKey
  ) {
    credentialProvider = async () => ({
      accessKeyId: config.credentials!.accessKeyId!,
      secretAccessKey: config.credentials!.secretAccessKey!,
      sessionToken: config.credentials?.sessionToken,
    });
    source = 'config';
  }
  // Priority 2: Profile from config
  else if (config.credentials?.profile) {
    profile = config.credentials.profile;
    credentialProvider = fromIni({ profile });
    source = 'profile';
  }
  // Priority 3: Environment variables
  else if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    credentialProvider = fromEnv();
    source = 'environment';
  }
  // Priority 4: Default credential chain
  else {
    // Try profile first (default or AWS_PROFILE env)
    const defaultProfile = process.env.AWS_PROFILE || 'default';

    try {
      credentialProvider = fromIni({ profile: defaultProfile });
      source = 'profile';
      profile = defaultProfile;
    } catch {
      // Fall back to instance/container metadata (IAM role)
      try {
        credentialProvider = fromContainerMetadata();
        source = 'instance-metadata';
      } catch {
        credentialProvider = fromInstanceMetadata();
        source = 'instance-metadata';
      }
    }
  }

  // Resolve credentials
  try {
    const credentials = await credentialProvider();
    return {
      credentials,
      source,
      profile,
    };
  } catch (error) {
    throw new Error(
      `Failed to resolve AWS credentials.\n` +
        `Please configure credentials using one of:\n` +
        `  1. Config file (credentials.accessKeyId + secretAccessKey)\n` +
        `  2. Config file (credentials.profile)\n` +
        `  3. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)\n` +
        `  4. AWS profile (~/.aws/credentials)\n` +
        `  5. IAM role (EC2/ECS instance metadata)\n\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create a credential provider for AWS SDK clients
 */
export function createCredentialProvider(
  config: SCFConfig
): AwsCredentialIdentityProvider {
  return async () => {
    const { credentials } = await getCredentials(config);
    return credentials;
  };
}
