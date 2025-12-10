/**
 * Configuration types for SCF
 */

/**
 * Environment-specific configuration override
 * Allows partial overrides of nested configurations
 */
export interface EnvironmentConfig {
  /** Application name override */
  app?: string;

  /** AWS region override */
  region?: string;

  /** AWS credentials override */
  credentials?: Partial<AWSCredentialsConfig>;

  /** S3 bucket configuration override */
  s3?: Partial<S3Config>;

  /** CloudFront distribution configuration override */
  cloudfront?: Partial<CloudFrontConfig>;
}

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
  environments?: Record<string, EnvironmentConfig>;
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

  /**
   * Build directory to upload (optional, auto-detected if not provided)
   *
   * If not specified, scf will automatically detect common build directories:
   * - dist (Vite, Rollup)
   * - build (Create React App, Next.js)
   * - out (Next.js static export)
   * - .next (Next.js production)
   * - public (Static sites)
   * - And more...
   */
  buildDir?: string;

  /** Index document (default: index.html) - used by CloudFront Function */
  indexDocument?: string;

  /** Error document - used for CloudFront custom error responses */
  errorDocument?: string;

  /** Maximum concurrent uploads */
  concurrency?: number;

  /** Whether to enable Gzip compression */
  gzip?: boolean;

  /** File patterns to exclude from upload */
  exclude?: string[];
}

/**
 * CloudFront distribution configuration
 * Note: CloudFront is now always enabled for security (OAC restricts S3 access)
 */
export interface CloudFrontConfig {
  /** Distribution price class */
  priceClass?: "PriceClass_100" | "PriceClass_200" | "PriceClass_All";

  /** Custom domain configuration */
  customDomain?: {
    /** Domain name (e.g., example.com) */
    domainName: string;

    /**
     * ACM certificate ARN (optional - will be auto-created if omitted)
     *
     * If not provided, scf will automatically:
     * 1. Check for existing certificate in ACM
     * 2. Create new certificate if needed
     * 3. Create DNS validation records in Route53
     * 4. Wait for certificate validation
     *
     * Note: Requires Route53 hosted zone for the domain
     */
    certificateArn?: string;

    /** Alternative domain names (CNAMEs) */
    aliases?: string[];
  };

  // Note: TTL settings (defaultTTL, maxTTL, minTTL) have been removed.
  // CloudFront now uses the CachingOptimized managed cache policy which enables
  // Free tier pricing plan compatibility and manages TTL automatically.
  // - MinTTL: 1 second
  // - DefaultTTL: 86400 seconds (1 day)
  // - MaxTTL: 31536000 seconds (1 year)

  /** Whether to enable IPv6 */
  ipv6?: boolean;

  /**
   * Enable SPA (Single Page Application) mode
   * When enabled, 403/404 errors are redirected to index.html with 200 status
   * This allows client-side routing (React Router, Vue Router, etc.) to work properly
   * @default true
   */
  spa?: boolean;

  /** Custom error responses */
  errorPages?: Array<{
    errorCode: number;
    responseCode?: number;
    responsePath?: string;
    cacheTTL?: number;
  }>;

  /** Cache warming configuration (warm up CloudFront edge locations after deployment) */
  cacheWarming?: {
    /** Enable cache warming */
    enabled: boolean;

    /** Paths to warm up (default: ['/']) */
    paths?: string[];

    /** Number of concurrent requests (default: 3, max: 10) */
    concurrency?: number;

    /** Delay between requests in ms (default: 500ms, min: 100ms) */
    delay?: number;
  };
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
 * Helper function to define config with type safety
 * Provides autocomplete and type checking in user config files
 */
export function defineConfig(config: SCFConfig): SCFConfig {
  return config;
}
