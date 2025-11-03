/**
 * SCF Deploy Configuration
 *
 * For TypeScript support, you can use:
 * import { defineConfig } from 'scf-deploy';
 * export default defineConfig({ ... });
 */
const config = {
  app: 'my-app',
  region: 'us-east-1',

  s3: {
    bucketName: 'my-app-bucket',
    buildDir: './dist',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },

  cloudfront: {
    enabled: true,
    priceClass: 'PriceClass_100',
  },

  // Environment-specific overrides
  environments: {
    dev: {
      s3: { bucketName: 'my-app-bucket-dev' },
      cloudfront: { enabled: false },
    },
    staging: {
      s3: { bucketName: 'my-app-bucket-staging' },
    },
    prod: {
      s3: { bucketName: 'my-app-bucket-prod' },
      cloudfront: { priceClass: 'PriceClass_All' },
    },
  },
};

export default config;
