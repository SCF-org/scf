/**
 * SCF Deploy Configuration
 *
 * Environment variables are loaded from .env files:
 * - Default: .env
 * - Dev: .env.dev (use with --env dev)
 * - Prod: .env.prod (use with --env prod)
 *
 * Build directory is auto-detected (dist, build, out, etc.)
 * You can override it by adding: s3: { buildDir: './custom-dir' }
 */
import type { SCFConfig } from "scf-deploy";

const config: SCFConfig = {
  app: process.env.APP_NAME || "my-app",
  region: (process.env.AWS_REGION as any) || "us-east-1",

  s3: {
    bucketName: process.env.S3_BUCKET_NAME || "my-app-bucket",
    indexDocument: "index.html",
    errorDocument: "404.html",
  },

  cloudfront: {
    enabled: process.env.CLOUDFRONT_ENABLED === "true" || true,
    priceClass:
      (process.env.CLOUDFRONT_PRICE_CLASS as any) || "PriceClass_100",
    // Cache warming: warm up edge locations after deployment (incurs data transfer costs)
    // cacheWarming: {
    //   enabled: true,
    //   paths: ['/', '/index.html'],        // Essential paths only (avoid large files)
    //   concurrency: 3,                     // Concurrent requests (default: 3, max: 10)
    //   delay: 500,                         // Delay between requests in ms (default: 500ms)
    // },

    // Custom Domain with HTTPS (automatic SSL certificate creation)
    // Uncomment to enable custom domain with automatic SSL:
    customDomain: process.env.CLOUDFRONT_DOMAIN
      ? {
          domainName: process.env.CLOUDFRONT_DOMAIN,
          certificateArn: process.env.ACM_CERTIFICATE_ARN, // Optional - auto-created if not provided
        }
      : undefined,
  },

  // Environment-specific overrides
  // These override base config when using --env flag
  // You can also use environment variables here for more flexibility
  environments: {
    dev: {
      s3: {
        bucketName: process.env.S3_BUCKET_NAME || "my-app-bucket-dev",
      },
      cloudfront: {
        enabled: process.env.CLOUDFRONT_ENABLED === "true" || false,
      },
    },
    staging: {
      s3: {
        bucketName: process.env.S3_BUCKET_NAME || "my-app-bucket-staging",
      },
    },
    prod: {
      s3: {
        bucketName: process.env.S3_BUCKET_NAME || "my-app-bucket-prod",
      },
      cloudfront: {
        enabled: process.env.CLOUDFRONT_ENABLED === "true" || true,
      },
    },
  },
};

export default config;
