#!/usr/bin/env node

/**
 * Post-install script
 * Automatically runs init command if config doesn't exist
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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
  const configFiles = ['scf.config.ts', 'scf.config.js', 'scf.config.mjs', 'scf.config.cjs'];
  return configFiles.some(file => fs.existsSync(path.join(process.cwd(), file)));
}

// Run init command automatically
function runInit() {
  return new Promise((resolve, reject) => {
    console.log('\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
    console.log('\x1b[1m\x1b[36m  scf-deploy installed successfully! 🚀\x1b[0m');
    console.log('\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');
    console.log('\x1b[1mInitializing configuration...\x1b[0m\n');

    // Use the built CLI
    const cliPath = path.join(__dirname, '..', 'dist', 'bin', 'cli.js');

    // Check if CLI is built
    if (!fs.existsSync(cliPath)) {
      console.log('\x1b[33m⚠️  CLI not built yet. Please run:\x1b[0m');
      console.log('   \x1b[36mnpx scf-deploy init\x1b[0m\n');
      resolve();
      return;
    }

    const child = spawn('node', [cliPath, 'init', '-y'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('error', (error) => {
      console.log('\n\x1b[33m⚠️  Could not auto-initialize. Please run:\x1b[0m');
      console.log('   \x1b[36mnpx scf-deploy init\x1b[0m\n');
      resolve(); // Don't fail installation
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.log('\n\x1b[1mNext steps:\x1b[0m\n');
        console.log('  1️⃣  Initialize configuration:');
        console.log('     \x1b[36mnpx scf-deploy init\x1b[0m\n');
      } else {
        console.log('\n\x1b[1mNext steps:\x1b[0m\n');
      }
      console.log('  2️⃣  Build your application:');
      console.log('     \x1b[36mnpm run build\x1b[0m\n');
      console.log('  3️⃣  Deploy to AWS:');
      console.log('     \x1b[36mnpx scf-deploy deploy\x1b[0m\n');
      console.log('\x1b[2mDocumentation: \x1b[4mhttps://www.npmjs.com/package/scf-deploy\x1b[0m\n');
      resolve();
    });
  });
}

// Main
async function main() {
  try {
    // Skip if global install
    if (isGlobalInstall()) {
      process.exit(0);
    }

    // Skip if config already exists
    if (hasConfigFile()) {
      console.log('\n\x1b[32m✓ scf-deploy configuration already exists\x1b[0m\n');
      process.exit(0);
    }

    // Run init automatically
    await runInit();
  } catch (error) {
    // Silently fail - don't break installation
    console.error('\x1b[31mError during post-install:\x1b[0m', error);
  } finally {
    process.exit(0);
  }
}

main();
