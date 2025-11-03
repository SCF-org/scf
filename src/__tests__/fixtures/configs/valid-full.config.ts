import { defineConfig } from '../../../../types/config.js';

export default defineConfig({
  app: 'test-app-full',
  region: 'ap-northeast-2',
  s3: {
    bucketName: 'test-bucket-full',
    buildDir: './dist',
    indexDocument: 'index.html',
    errorDocument: '404.html',
  },
  cloudfront: {
    enabled: true,
    priceClass: 'PriceClass_100',
    customDomain: {
      domainName: 'test.example.com',
      certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
    },
  },
  environments: {
    dev: {
      s3: {
        bucketName: 'test-bucket-dev',
      },
    },
    prod: {
      cloudfront: {
        priceClass: 'PriceClass_All',
      },
    },
  },
});
