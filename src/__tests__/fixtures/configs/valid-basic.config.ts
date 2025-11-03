import { defineConfig } from '../../../../types/config.js';

export default defineConfig({
  app: 'test-app',
  region: 'us-east-1',
  s3: {
    bucketName: 'test-bucket',
    buildDir: './dist',
  },
});
