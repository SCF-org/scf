/**
 * Deployer module
 *
 * File scanning, hashing, and upload utilities
 */

// File scanner
export {
  scanFiles,
  calculateFileHash,
  filterChangedFiles,
  groupFilesByCompression,
} from './file-scanner.js';

// S3 Uploader
export {
  uploadFile,
  uploadFiles,
  calculateTotalSize,
  formatBytes,
} from './s3-uploader.js';

// Re-export types
export type {
  FileInfo,
  UploadResult,
  DeploymentStats,
  UploadOptions,
  ScanOptions,
} from '../../types/deployer.js';
