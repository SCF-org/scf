/**
 * SCF Deploy Configuration
 *
 * Build directory is auto-detected (dist, build, out, etc.)
 * You can override it by adding: s3: { buildDir: './custom-dir' }
 */
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: "my-app",
  region: "us-east-1",

  s3: {
    bucketName: "my-app-bucket",
    indexDocument: "index.html",
    errorDocument: "404.html",
  },

  cloudfront: {
    enabled: true,
    // priceClass: 'PriceClass_100',
    // Cache warming: warm up edge locations after deployment (incurs data transfer costs)
    // cacheWarming: {
    //   enabled: true,
    //   paths: ['/', '/index.html'],        // Essential paths only (avoid large files)
    //   concurrency: 3,                     // Concurrent requests (default: 3, max: 10)
    //   delay: 500,                         // Delay between requests in ms (default: 500ms)
    // },

    // Custom Domain with HTTPS (automatic SSL certificate creation)
    // Uncomment to enable custom domain with automatic SSL:
    customDomain: {
      domainName: "example.com",
      // certificateArn is OPTIONAL - will be auto-created if not provided
      // Requirements for auto-creation:
      //   1. Domain must be registered in Route53
      //   2. DNS validation will take 5-30 minutes
      //   3. Requires ACM and Route53 permissions
      // certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/abc-def', // Optional
    },
  },

  // Environment-specific overrides
  environments: {
    dev: {
      s3: { bucketName: "my-app-bucket-dev" },
      cloudfront: { enabled: false },
    },
    staging: {
      s3: { bucketName: "my-app-bucket-staging" },
    },
    prod: {
      s3: { bucketName: "my-app-bucket-prod" },
    },
  },
};

export default config;
