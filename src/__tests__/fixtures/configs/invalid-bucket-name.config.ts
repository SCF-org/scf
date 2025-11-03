import { defineConfig } from '../../../../types/config.js';

// Invalid: bucket name with uppercase letters (S3 doesn't allow this)
export default defineConfig({
  app: 'test-app',
  region: 'us-east-1',
  s3: {
    bucketName: 'TestBucket_INVALID',
    buildDir: './dist',
  },
});
