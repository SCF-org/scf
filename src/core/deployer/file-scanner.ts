/**
 * File scanner for deployment
 */

import glob from 'fast-glob';
import { hashFile } from 'hasha';
import { lookup as getMimeType } from 'mime-types';
import { stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { FileInfo, ScanOptions } from '../../types/deployer.js';

/**
 * File extensions that should be gzipped
 */
const GZIPPABLE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.xml',
  '.svg',
  '.txt',
  '.md',
  '.csv',
  '.ts',
  '.tsx',
  '.jsx',
]);

/**
 * Check if file should be gzipped based on extension
 */
function shouldGzipFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return GZIPPABLE_EXTENSIONS.has(ext);
}

/**
 * Get Content-Type for file
 */
function getContentType(filePath: string): string {
  const mimeType = getMimeType(filePath);
  return mimeType || 'application/octet-stream';
}

/**
 * Convert file path to S3 key (forward slashes, no leading slash)
 */
function pathToS3Key(relativePath: string): string {
  // Normalize to forward slashes
  return relativePath.split(sep).join('/');
}

/**
 * Scan files in build directory
 */
export async function scanFiles(
  options: ScanOptions
): Promise<FileInfo[]> {
  const { buildDir, exclude = [], followSymlinks = false } = options;

  // Glob patterns
  const patterns = ['**/*'];

  // Find all files
  const files = await glob(patterns, {
    cwd: buildDir,
    absolute: false,
    ignore: exclude,
    onlyFiles: true,
    followSymbolicLinks: followSymlinks,
    dot: true, // Include dotfiles
  });

  // Process each file
  const fileInfos: FileInfo[] = [];

  for (const file of files) {
    const absolutePath = join(buildDir, file);
    const relativePath = file;

    // Get file stats
    const stats = await stat(absolutePath);

    // Calculate hash
    const hash = await hashFile(absolutePath, { algorithm: 'sha256' });

    // Get content type
    const contentType = getContentType(absolutePath);

    // Check if should gzip
    const shouldGzip = shouldGzipFile(absolutePath);

    // Convert to S3 key
    const key = pathToS3Key(relativePath);

    fileInfos.push({
      absolutePath,
      relativePath,
      key,
      size: stats.size,
      hash,
      contentType,
      shouldGzip,
    });
  }

  return fileInfos;
}

/**
 * Calculate hash for a single file
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  return hashFile(filePath, { algorithm: 'sha256' });
}

/**
 * Filter files by hash comparison
 * Returns only files that have changed (different hash)
 */
export function filterChangedFiles(
  files: FileInfo[],
  existingHashes: Record<string, string>
): FileInfo[] {
  return files.filter((file) => {
    const existingHash = existingHashes[file.key];
    return !existingHash || existingHash !== file.hash;
  });
}

/**
 * Group files by whether they should be gzipped
 */
export function groupFilesByCompression(
  files: FileInfo[]
): {
  gzipped: FileInfo[];
  plain: FileInfo[];
} {
  const gzipped: FileInfo[] = [];
  const plain: FileInfo[] = [];

  for (const file of files) {
    if (file.shouldGzip) {
      gzipped.push(file);
    } else {
      plain.push(file);
    }
  }

  return { gzipped, plain };
}
