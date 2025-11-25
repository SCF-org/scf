/**
 * Jest global setup for E2E tests
 * Loads AWS credentials from:
 * - Local: .env.test file
 * - GitHub Actions: Environment variables from secrets
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load .env.test file if running E2E tests
if (process.env.E2E_TEST === 'true') {
  const envPath = resolve(process.cwd(), '.env.test');

  // Try to load .env.test (for local development)
  if (existsSync(envPath)) {
    config({ path: envPath, override: true });
    console.log('✅ Loaded E2E test credentials from .env.test');
  } else {
    // GitHub Actions or CI environment - credentials from environment variables
    console.log('✅ Using E2E test credentials from environment variables (CI mode)');
  }

  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID?.substring(0, 12)}...`);
  console.log(`   AWS_REGION: ${process.env.AWS_REGION}`);
}
