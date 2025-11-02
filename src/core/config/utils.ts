/**
 * Config utility functions
 */

import type { SCFConfig } from '../../types/config.js';

/**
 * Helper function for defining config with type safety
 * This is exported for user config files
 */
export function defineConfig(config: SCFConfig): SCFConfig {
  return config;
}

/**
 * Generate example config file content
 */
export function generateExampleConfig(appName: string = 'my-app'): string {
  return `import { defineConfig } from 'scf';

export default defineConfig({
  app: '${appName}',
  region: 'ap-northeast-2',

  s3: {
    bucketName: '${appName}-bucket',
    buildDir: './dist',
    indexDocument: 'index.html',
    errorDocument: '404.html',
    websiteHosting: true,
    gzip: true,
    concurrency: 10,
  },

  cloudfront: {
    enabled: false,
    priceClass: 'PriceClass_100',
    defaultTTL: 86400,
    ipv6: true,
  },

  // Environment-specific configurations
  environments: {
    dev: {
      s3: {
        bucketName: '${appName}-dev',
      },
    },

    prod: {
      s3: {
        bucketName: '${appName}-prod',
      },
      cloudfront: {
        enabled: true,
        priceClass: 'PriceClass_All',
        // Uncomment to use custom domain
        // customDomain: {
        //   domainName: 'example.com',
        //   certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/...',
        // },
      },
    },
  },
});
`;
}

/**
 * Validate required fields in config
 */
export function validateRequiredFields(config: SCFConfig): void {
  const errors: string[] = [];

  if (!config.app) {
    errors.push('app name is required');
  }

  if (!config.region) {
    errors.push('region is required');
  }

  if (config.s3 && !config.s3.bucketName) {
    errors.push('s3.bucketName is required when s3 is configured');
  }

  if (config.s3 && !config.s3.buildDir) {
    errors.push('s3.buildDir is required when s3 is configured');
  }

  if (
    config.cloudfront?.enabled &&
    config.cloudfront.customDomain &&
    !config.cloudfront.customDomain.certificateArn
  ) {
    errors.push(
      'cloudfront.customDomain.certificateArn is required when using custom domain'
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Config validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}
