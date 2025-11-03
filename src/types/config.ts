/**
 * Configuration types for SCF
 */

/**
 * Main SCF configuration interface
 */
export interface SCFConfig {
  /** Application name (used for resource naming) */
  app: string;

  /** AWS region */
  region: string;

  /** AWS credentials configuration */
  credentials?: AWSCredentialsConfig;

  /** S3 bucket configuration */
  s3?: S3Config;

  /** CloudFront distribution configuration */
  cloudfront?: CloudFrontConfig;

  /** Environment-specific configurations */
  environments?: Record<string, Partial<SCFConfig>>;
}

/**
 * AWS credentials configuration
 */
export interface AWSCredentialsConfig {
  /** AWS profile name from ~/.aws/credentials */
  profile?: string;

  /** AWS access key ID */
  accessKeyId?: string;

  /** AWS secret access key */
  secretAccessKey?: string;

  /** AWS session token (for temporary credentials) */
  sessionToken?: string;
}

/**
 * S3 bucket configuration
 */
export interface S3Config {
  /** S3 bucket name */
  bucketName: string;

  /** Build directory to upload */
  buildDir: string;

  /** Index document for static website hosting */
  indexDocument?: string;

  /** Error document for static website hosting */
  errorDocument?: string;

  /** Whether to enable static website hosting */
  websiteHosting?: boolean;

  /** Maximum concurrent uploads */
  concurrency?: number;

  /** Whether to enable Gzip compression */
  gzip?: boolean;

  /** File patterns to exclude from upload */
  exclude?: string[];
}

/**
 * CloudFront distribution configuration
 */
export interface CloudFrontConfig {
  /** Whether to enable CloudFront */
  enabled: boolean;

  /** Distribution price class */
  priceClass?: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';

  /** Custom domain configuration */
  customDomain?: {
    /** Domain name (e.g., example.com) */
    domainName: string;

    /** ACM certificate ARN */
    certificateArn: string;

    /** Alternative domain names (CNAMEs) */
    aliases?: string[];
  };

  /** Default TTL in seconds */
  defaultTTL?: number;

  /** Max TTL in seconds */
  maxTTL?: number;

  /** Min TTL in seconds */
  minTTL?: number;

  /** Whether to enable IPv6 */
  ipv6?: boolean;

  /** Custom error responses */
  errorPages?: Array<{
    errorCode: number;
    responseCode?: number;
    responsePath?: string;
    cacheTTL?: number;
  }>;
}

/**
 * Load config options
 */
export interface LoadConfigOptions {
  /** Config file path (default: auto-discover) */
  configPath?: string;

  /** Environment name (e.g., 'dev', 'prod') */
  env?: string;

  /** AWS profile override */
  profile?: string;
}

/**
 * Helper function for defining config with type safety and IntelliSense
 */
export function defineConfig(config: SCFConfig): SCFConfig {
  return config;
}
