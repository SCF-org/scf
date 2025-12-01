/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * S3 Deployer - Main deployment orchestrator
 */

import chalk from "chalk";
import ora, { type Ora } from "ora";
import cliProgress from "cli-progress";
import type { SCFConfig } from "../../types/config.js";
import type { DeploymentStats, UploadOptions } from "../../types/deployer.js";
import { createS3Client } from "./client.js";
import { ensureBucket, getBucketWebsiteUrl, tagBucketForRecovery, deleteFilesFromS3 } from "./s3-bucket.js";
import { scanFiles } from "../deployer/file-scanner.js";
import { getBuildDirectory } from "../deployer/build-detector.js";
import {
  uploadFiles,
  calculateTotalSize,
  formatBytes,
} from "../deployer/s3-uploader.js";
import {
  loadState,
  saveState,
  getOrCreateState,
  getFilesToUpload,
  compareFileHashes,
  updateFileHashes,
  updateS3Resource,
  formatFileChanges,
} from "../state/index.js";

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
    throw new Error("S3 configuration is required");
  }

  const {
    bucketName,
    buildDir: providedBuildDir,
    indexDocument = "index.html",
    errorDocument,
    websiteHosting = true,
    gzip = true,
    concurrency = 10,
    exclude = [],
  } = config.s3;

  const {
    showProgress = true,
    dryRun = false,
    environment = "default",
    useIncrementalDeploy = true,
    forceFullDeploy = false,
    saveState: shouldSaveState = true,
    cleanupDeletedFiles = true,
  } = options;

  // Step 1: Detect and validate build directory
  let spinner: Ora | null = null;
  if (showProgress) {
    spinner = ora("Detecting build directory...").start();
  }

  const buildDir = getBuildDirectory(providedBuildDir);

  if (spinner) {
    spinner.succeed(`Build directory detected: ${chalk.cyan(buildDir)}`);
  }

  // Step 2: Scan files (BEFORE creating AWS resources)
  if (showProgress) {
    spinner = ora("Scanning files...").start();
  }

  const files = await scanFiles({
    buildDir,
    exclude,
  });

  const totalSize = calculateTotalSize(files);

  if (spinner) {
    spinner.succeed(
      `Found ${chalk.cyan(files.length)} files (${chalk.cyan(
        formatBytes(totalSize)
      )})`
    );
  }

  // IMPORTANT: Validate files exist before creating AWS resources
  if (files.length === 0) {
    throw new Error(
      `No files found in build directory: ${chalk.cyan(buildDir)}\n\n` +
      `Please build your project first:\n` +
      `  ${chalk.cyan('npm run build')}\n` +
      `  ${chalk.cyan('yarn build')}\n` +
      `  ${chalk.cyan('pnpm build')}`
    );
  }

  // Create S3 client
  const s3Client = createS3Client(config);

  // Step 3: Ensure bucket exists and is configured (AFTER validating files)
  if (showProgress) {
    spinner = ora("Checking S3 bucket...").start();
  }

  let bucketCreated = false;

  try {
    const bucketResult = await ensureBucket(s3Client, bucketName, config.region, {
      websiteHosting,
      indexDocument,
      errorDocument,
      publicRead: true,
    });
    bucketCreated = bucketResult.created;

    // Tag bucket for state recovery
    await tagBucketForRecovery(s3Client, bucketName, config.app, environment);

    if (spinner) {
      spinner.succeed(`S3 bucket ready: ${chalk.cyan(bucketName)}${bucketCreated ? ' (created)' : ''}`);
    }
  } catch (error) {
    if (spinner) {
      spinner.fail("Failed to setup S3 bucket");
    }
    throw error;
  }

  // Step 4: Load state and determine files to upload (incremental deployment)
  let state = loadState({ environment });
  let filesToUpload = files;
  let fileChanges: ReturnType<typeof compareFileHashes> | null = null;

  if (useIncrementalDeploy && !forceFullDeploy && state) {
    if (showProgress) {
      spinner = ora("Analyzing file changes...").start();
    }

    fileChanges = compareFileHashes(files, state.files);

    if (spinner) {
      spinner.succeed("File changes analyzed");
    }

    // Show changes
    console.log();
    console.log(formatFileChanges(fileChanges));
    console.log();

    if (fileChanges.totalChanges === 0) {
      console.log(
        chalk.green("✨ No changes detected. Deployment not needed.")
      );
      return {
        totalFiles: files.length,
        uploaded: 0,
        skipped: files.length,
        failed: 0,
        totalSize,
        compressedSize: totalSize,
        duration: Date.now() - startTime,
        results: files.map((file) => ({
          file,
          success: true,
          status: "skipped" as const,
        })),
        bucketCreated,
      };
    }

    // Get only changed files
    filesToUpload = getFilesToUpload(files, state.files);
    console.log(
      chalk.blue(
        `📤 Uploading ${chalk.cyan(filesToUpload.length)} changed files...\n`
      )
    );
  } else {
    // Full deployment
    if (forceFullDeploy && showProgress) {
      console.log(chalk.yellow("⚠ Force full deployment enabled\n"));
    }
    console.log(chalk.blue("\n📤 Uploading files...\n"));
  }

  // Step 5: Upload files

  let progressBar: cliProgress.SingleBar | null = null;

  if (showProgress && !dryRun) {
    progressBar = new cliProgress.SingleBar(
      {
        format:
          "Progress |" +
          chalk.cyan("{bar}") +
          "| {percentage}% | {value}/{total} files | {current}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );
    progressBar.start(files.length, 0, { current: "" });
  }

  const uploadResults = await uploadFiles(
    s3Client,
    bucketName,
    filesToUpload,
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
  const uploaded = uploadResults.filter((r) => r.status === "uploaded").length;
  const skipped = uploadResults.filter((r) => r.status === "skipped").length;
  const failed = uploadResults.filter((r) => r.status === "failed").length;

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
        `Compressed: ${formatBytes(
          compressedSize
        )} (${savingsPercent}% reduction)`
      )
    );
  }

  const duration = Date.now() - startTime;
  console.log(chalk.gray(`Duration: ${(duration / 1000).toFixed(2)}s`));

  // Show website URL
  const websiteUrl = websiteHosting
    ? getBucketWebsiteUrl(bucketName, config.region)
    : undefined;

  if (websiteHosting && !dryRun) {
    console.log();
    console.log(chalk.green("🌐 Website URL:"), chalk.cyan(websiteUrl));
  }

  // Step 6: Cleanup deleted files from S3
  if (cleanupDeletedFiles && useIncrementalDeploy && !forceFullDeploy && state && !dryRun && fileChanges) {
    if (fileChanges.deleted.length > 0) {
      if (showProgress) {
        spinner = ora(`Cleaning up ${fileChanges.deleted.length} deleted files from S3...`).start();
      }

      try {
        const deletedKeys = fileChanges.deleted.map((f) => f.path);
        const deleteResults = await deleteFilesFromS3(s3Client, bucketName, deletedKeys);

        if (spinner) {
          spinner.succeed(
            `Cleaned up ${deleteResults.deleted} files from S3${
              deleteResults.failed > 0
                ? chalk.yellow(` (${deleteResults.failed} failed)`)
                : ""
            }`
          );
        }

        if (deleteResults.failed > 0 && showProgress) {
          console.log(
            chalk.yellow(`  ⚠ ${deleteResults.failed} files could not be deleted`)
          );
        }
      } catch (_error) {
        if (spinner) {
          spinner.warn("Failed to cleanup some deleted files from S3");
        }
        // Non-critical error, continue with deployment
      }
    }
  }

  // Step 7: Save state
  if (shouldSaveState && !dryRun && uploaded > 0) {
    // Get or create state
    if (!state) {
      state = getOrCreateState(config.app, { environment });
    }

    // Update S3 resource info
    state = updateS3Resource(state, {
      bucketName,
      region: config.region,
      websiteUrl,
    });

    // Update file hashes (all scanned files, not just uploaded)
    state = updateFileHashes(state, files);

    // Save state
    try {
      saveState(state, { environment });
      if (showProgress) {
        console.log();
        console.log(
          chalk.gray(
            `✓ State saved (.deploy/state${
              environment !== "default" ? `.${environment}` : ""
            }.json)`
          )
        );
      }
    } catch (error: any) {
      console.log();
      console.log(chalk.yellow(`⚠ Failed to save state: ${error.message}`));
    }
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
    bucketCreated,
  };
}
