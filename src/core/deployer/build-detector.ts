/**
 * Build directory auto-detection utility
 */

import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";

/**
 * Common build directory names in priority order
 * Note:
 * - 'public' is excluded as it's typically a source directory, not a build output
 * - '.next' is excluded as it requires a Node.js server (SSR), not compatible with S3/CloudFront
 */
const BUILD_DIR_CANDIDATES = [
  "dist", // Vite, Rollup, etc.
  "build", // Create React App, Next.js, etc.
  "out", // Next.js static export
  ".output/public", // Nuxt 3
  "_site", // Jekyll, 11ty
  "output", // Some SSGs
] as const;

/**
 * SSR build directories that require a server and cannot be deployed to S3/CloudFront
 */
const SSR_BUILD_DIRS = [".next", ".nuxt"] as const;

/**
 * Check if directory contains index.html (entry point for web deployment)
 */
function hasIndexHtml(dirPath: string): boolean {
  try {
    const indexPath = join(dirPath, "index.html");
    return existsSync(indexPath) && statSync(indexPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Validate if directory contains deployable web files
 * Checks for index.html and other common web files
 */
function hasDeployableFiles(dirPath: string): boolean {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    // Must have index.html as entry point
    if (!hasIndexHtml(dirPath)) {
      return false;
    }

    // Check if there are actual files (not just directories)
    const hasFiles = entries.some((entry) => entry.isFile());
    if (!hasFiles) {
      return false;
    }

    // Optional: Check for common web file patterns
    const webFileExtensions = [".html", ".js", ".css", ".json"];
    const hasWebFiles = entries.some((entry) => {
      if (entry.isFile()) {
        return webFileExtensions.some((ext) => entry.name.endsWith(ext));
      }
      return false;
    });

    return hasWebFiles;
  } catch {
    return false;
  }
}

/**
 * Detect build directory automatically
 *
 * @param cwd - Current working directory (default: process.cwd())
 * @returns Detected build directory path or null if not found
 */
export function detectBuildDirectory(
  cwd: string = process.cwd()
): string | null {
  for (const candidate of BUILD_DIR_CANDIDATES) {
    const candidatePath = join(cwd, candidate);

    // Check if directory exists and is a directory
    if (existsSync(candidatePath)) {
      const stats = statSync(candidatePath);

      if (stats.isDirectory()) {
        // Check if directory has deployable web files (must include index.html)
        if (hasDeployableFiles(candidatePath)) {
          return candidate; // Return relative path
        }
      }
    }
  }

  return null;
}

/**
 * Check if directory is an SSR build directory
 */
function isSSRBuildDir(buildDir: string): boolean {
  const normalizedPath = buildDir.replace(/^\.\//, "");
  return SSR_BUILD_DIRS.some((ssrDir) => normalizedPath === ssrDir);
}

/**
 * Validate build directory
 *
 * @param buildDir - Build directory path
 * @param cwd - Current working directory
 * @throws Error if directory doesn't exist or is empty
 */
export function validateBuildDirectory(
  buildDir: string,
  cwd: string = process.cwd()
): void {
  const absolutePath = join(cwd, buildDir);

  // Check if it's an SSR build directory
  if (isSSRBuildDir(buildDir)) {
    throw new Error(
      `Cannot deploy ${chalk.cyan(buildDir)} directory to S3/CloudFront.\n\n` +
        `${chalk.yellow("⚠ This is a server-side rendering (SSR) build directory.")}\n\n` +
        `S3/CloudFront only supports static files. To deploy with Next.js:\n\n` +
        `  1. Add ${chalk.cyan("output: 'export'")} to ${chalk.cyan("next.config.ts")}:\n` +
        chalk.gray(`     const nextConfig = {\n`) +
        chalk.gray(`       output: 'export',\n`) +
        chalk.gray(`       images: { unoptimized: true },\n`) +
        chalk.gray(`     };\n\n`) +
        `  2. Rebuild your project:\n` +
        `     ${chalk.cyan("npm run build")}\n\n` +
        `  This will create an ${chalk.cyan("out")} directory with static files.`
    );
  }

  // Check if exists
  if (!existsSync(absolutePath)) {
    throw new Error(
      `Build directory not found: ${chalk.cyan(buildDir)}\n\n` +
        `Please build your project first or specify the correct build directory.`
    );
  }

  // Check if it's a directory
  const stats = statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(`Build path is not a directory: ${chalk.cyan(buildDir)}`);
  }

  // Check if it has deployable files (must include index.html)
  if (!hasDeployableFiles(absolutePath)) {
    const hasIndex = hasIndexHtml(absolutePath);

    if (!hasIndex) {
      throw new Error(
        `Build directory does not contain ${chalk.cyan("index.html")}: ${chalk.cyan(buildDir)}\n\n` +
          `This directory cannot be deployed as a static website.\n` +
          `Please build your project first:\n` +
          `  ${chalk.cyan("npm run build")}`
      );
    } else {
      throw new Error(
        `Build directory does not contain valid web files: ${chalk.cyan(buildDir)}\n\n` +
          `Please build your project first before deploying.`
      );
    }
  }
}

/**
 * Get build directory with auto-detection fallback
 *
 * @param providedBuildDir - User-provided build directory (optional)
 * @param cwd - Current working directory
 * @returns Build directory path
 * @throws Error if no build directory found
 */
export function getBuildDirectory(
  providedBuildDir?: string,
  cwd: string = process.cwd()
): string {
  // Use provided buildDir if available
  if (providedBuildDir) {
    validateBuildDirectory(providedBuildDir, cwd);
    return providedBuildDir;
  }

  // Auto-detect build directory
  const detectedDir = detectBuildDirectory(cwd);

  if (!detectedDir) {
    throw new Error(
      `No build directory found.\n\n` +
        `Searched for: ${BUILD_DIR_CANDIDATES.map((d) => chalk.cyan(d)).join(
          ", "
        )}\n\n` +
        `Please build your project first:\n` +
        `  ${chalk.gray("# For Vite/Rollup projects")}\n` +
        `  ${chalk.cyan("npm run build")}\n\n` +
        `  ${chalk.gray("# For Next.js projects")}\n` +
        `  ${chalk.cyan("npm run build")}\n\n` +
        `Or specify a custom build directory in ${chalk.cyan(
          "scf.config.ts"
        )}:\n` +
        `  ${chalk.gray("s3: { buildDir: './your-build-dir' }")}`
    );
  }

  return detectedDir;
}
