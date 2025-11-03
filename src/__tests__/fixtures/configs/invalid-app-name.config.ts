import { defineConfig } from '../../../../types/config.js';

// Invalid: app name with special characters
export default defineConfig({
  app: 'test_app@invalid!',
  region: 'us-east-1',
  s3: {
    bucketName: 'test-bucket',
    buildDir: './dist',
  },
});
