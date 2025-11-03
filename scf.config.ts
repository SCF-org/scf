/**
 * SCF Deploy Configuration
 *
 * Build directory is auto-detected (dist, build, out, etc.)
 * You can override it by adding: s3: { buildDir: './custom-dir' }
 */
const config = {
  app: 'my-app',
  region: 'us-east-1',

  s3: {
    bucketName: 'my-app-bucket',
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
