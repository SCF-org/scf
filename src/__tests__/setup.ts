/**
 * Jest global setup for E2E tests
 * Loads .env.test file for AWS credentials
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test file if running E2E tests
if (process.env.E2E_TEST === 'true') {
  const envPath = resolve(process.cwd(), '.env.test');
  // Use override: true to ensure .env.test values take precedence
  config({ path: envPath, override: true });

  console.log('✅ Loaded E2E test credentials from .env.test');
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID?.substring(0, 12)}...`);
  console.log(`   AWS_REGION: ${process.env.AWS_REGION}`);
}
