/**
 * Deployer-related type definitions
 */

/**
 * File information for deployment
 */
export interface FileInfo {
  /** Absolute path to file */
  absolutePath: string;

  /** Relative path from build directory */
  relativePath: string;

  /** S3 key (path in bucket) */
  key: string;

  /** File size in bytes */
  size: number;

  /** File hash (SHA-256) */
  hash: string;

  /** Content-Type (MIME type) */
  contentType: string;

  /** Whether file should be gzipped */
  shouldGzip: boolean;
}

/**
 * Upload result for a single file
 */
export interface UploadResult {
  /** File info */
  file: FileInfo;

  /** Whether upload was successful */
  success: boolean;

  /** Upload status */
  status: 'uploaded' | 'skipped' | 'failed';

  /** Error message if failed */
  error?: string;

  /** Upload duration in milliseconds */
  duration?: number;
}

/**
 * Deployment statistics
 */
export interface DeploymentStats {
  /** Total files scanned */
  totalFiles: number;

  /** Files uploaded */
  uploaded: number;

  /** Files skipped (unchanged) */
  skipped: number;

  /** Files failed */
  failed: number;

  /** Total bytes uploaded */
  totalSize: number;

  /** Total bytes uploaded (after compression) */
  compressedSize: number;

  /** Deployment duration in milliseconds */
  duration: number;

  /** Upload results */
  results: UploadResult[];
}

/**
 * Upload options
 */
export interface UploadOptions {
  /** Whether to enable gzip compression */
  gzip?: boolean;

  /** Maximum concurrent uploads */
  concurrency?: number;

  /** Whether to show progress */
  showProgress?: boolean;

  /** Whether to perform dry-run (no actual upload) */
  dryRun?: boolean;
}

/**
 * File scan options
 */
export interface ScanOptions {
  /** Build directory to scan */
  buildDir: string;

  /** File patterns to exclude */
  exclude?: string[];

  /** Whether to follow symlinks */
  followSymlinks?: boolean;
}
