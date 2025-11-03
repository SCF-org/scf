#!/usr/bin/env node

/**
 * Post-install script
 * Shows helpful message after installation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if this is a global installation
function isGlobalInstall() {
  const npmConfigPrefix = process.env.npm_config_prefix;
  const installPath = path.resolve(__dirname, '..');

  if (npmConfigPrefix) {
    return installPath.startsWith(npmConfigPrefix);
  }

  // Fallback: check if node_modules is in current working directory
  return !installPath.includes(process.cwd());
}

// Check if scf.config.ts exists in user's project
function hasConfigFile() {
  const configPath = path.join(process.cwd(), 'scf.config.ts');
  return fs.existsSync(configPath);
}

// Main
try {
  // Skip if global install
  if (isGlobalInstall()) {
    process.exit(0);
  }

  // Skip if config already exists
  if (hasConfigFile()) {
    process.exit(0);
  }

  // Show helpful message
  console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[1m\x1b[36m  scf-deploy installed successfully! 🚀\x1b[0m');
  console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  console.log('\x1b[1mGet started:\x1b[0m\n');
  console.log('  1️⃣  Initialize configuration:');
  console.log('     \x1b[36mnpx scf-deploy init\x1b[0m\n');
  console.log('  2️⃣  Build your application:');
  console.log('     \x1b[36mnpm run build\x1b[0m\n');
  console.log('  3️⃣  Deploy to AWS:');
  console.log('     \x1b[36mnpx scf-deploy deploy\x1b[0m\n');

  console.log('\x1b[2mDocumentation: \x1b[4mhttps://www.npmjs.com/package/scf-deploy\x1b[0m\n');
} catch (error) {
  // Silently fail - don't break installation
  process.exit(0);
}
