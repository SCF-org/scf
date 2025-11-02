/**
 * S3 Deployer - Main deployment orchestrator
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import cliProgress from 'cli-progress';
import type { SCFConfig } from '../../types/config.js';
import type { DeploymentStats, UploadOptions } from '../../types/deployer.js';
import { createS3Client } from './client.js';
import { ensureBucket, getBucketWebsiteUrl } from './s3-bucket.js';
import { scanFiles } from '../deployer/file-scanner.js';
import {
  uploadFiles,
  calculateTotalSize,
  formatBytes,
} from '../deployer/s3-uploader.js';

/**
 * Deploy to S3
 */
export async function deployToS3(
  config: SCFConfig,
  options: UploadOptions = {}
): Promise<DeploymentStats> {
  const startTime = Date.now();

  // Validate S3 config
  if (!config.s3) {
    throw new Error('S3 configuration is required');
  }

  const {
    bucketName,
    buildDir,
    indexDocument = 'index.html',
    errorDocument,
    websiteHosting = true,
    gzip = true,
    concurrency = 10,
    exclude = [],
  } = config.s3;

  const { showProgress = true, dryRun = false } = options;

  // Create S3 client
  const s3Client = createS3Client(config);

  // Step 1: Ensure bucket exists and is configured
  let spinner: Ora | null = null;
  if (showProgress) {
    spinner = ora('Checking S3 bucket...').start();
  }

  try {
    await ensureBucket(s3Client, bucketName, config.region, {
      websiteHosting,
      indexDocument,
      errorDocument,
      publicRead: true,
    });

    if (spinner) {
      spinner.succeed(`S3 bucket ready: ${chalk.cyan(bucketName)}`);
    }
  } catch (error) {
    if (spinner) {
      spinner.fail('Failed to setup S3 bucket');
    }
    throw error;
  }

  // Step 2: Scan files
  if (showProgress) {
    spinner = ora('Scanning files...').start();
  }

  const files = await scanFiles({
    buildDir,
    exclude,
  });

  const totalSize = calculateTotalSize(files);

  if (spinner) {
    spinner.succeed(
      `Found ${chalk.cyan(files.length)} files (${chalk.cyan(formatBytes(totalSize))})`
    );
  }

  if (files.length === 0) {
    console.log(chalk.yellow('⚠ No files to deploy'));
    return {
      totalFiles: 0,
      uploaded: 0,
      skipped: 0,
      failed: 0,
      totalSize: 0,
      compressedSize: 0,
      duration: Date.now() - startTime,
      results: [],
    };
  }

  // Step 3: Upload files
  console.log(chalk.blue('\n📤 Uploading files...\n'));

  let progressBar: cliProgress.SingleBar | null = null;

  if (showProgress && !dryRun) {
    progressBar = new cliProgress.SingleBar(
      {
        format:
          'Progress |' +
          chalk.cyan('{bar}') +
          '| {percentage}% | {value}/{total} files | {current}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );
    progressBar.start(files.length, 0, { current: '' });
  }

  const uploadResults = await uploadFiles(
    s3Client,
    bucketName,
    files,
    {
      gzip,
      concurrency,
      dryRun,
    },
    (completed, _total, currentFile) => {
      if (progressBar) {
        progressBar.update(completed, {
          current: currentFile.relativePath,
        });
      }
    }
  );

  if (progressBar) {
    progressBar.stop();
  }

  // Calculate statistics
  const uploaded = uploadResults.filter((r) => r.status === 'uploaded').length;
  const skipped = uploadResults.filter((r) => r.status === 'skipped').length;
  const failed = uploadResults.filter((r) => r.status === 'failed').length;

  const uploadedFiles = uploadResults
    .filter((r) => r.success)
    .map((r) => r.file);
  const compressedSize = calculateTotalSize(uploadedFiles);

  // Display results
  console.log();
  if (uploaded > 0) {
    console.log(chalk.green(`✓ Uploaded: ${uploaded} files`));
  }
  if (skipped > 0) {
    console.log(chalk.gray(`○ Skipped: ${skipped} files (unchanged)`));
  }
  if (failed > 0) {
    console.log(chalk.red(`✗ Failed: ${failed} files`));

    // Show failed files
    uploadResults
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(chalk.red(`  - ${r.file.relativePath}: ${r.error}`));
      });
  }

  console.log();
  console.log(chalk.gray(`Total size: ${formatBytes(totalSize)}`));
  if (gzip) {
    const savings = totalSize - compressedSize;
    const savingsPercent = Math.round((savings / totalSize) * 100);
    console.log(
      chalk.gray(
        `Compressed: ${formatBytes(compressedSize)} (${savingsPercent}% reduction)`
      )
    );
  }

  const duration = Date.now() - startTime;
  console.log(chalk.gray(`Duration: ${(duration / 1000).toFixed(2)}s`));

  // Show website URL
  if (websiteHosting && !dryRun) {
    const websiteUrl = getBucketWebsiteUrl(bucketName, config.region);
    console.log();
    console.log(chalk.green('🌐 Website URL:'), chalk.cyan(websiteUrl));
  }

  return {
    totalFiles: files.length,
    uploaded,
    skipped,
    failed,
    totalSize,
    compressedSize,
    duration,
    results: uploadResults,
  };
}
